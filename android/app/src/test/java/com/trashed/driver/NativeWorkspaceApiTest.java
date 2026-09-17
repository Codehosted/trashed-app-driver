package com.trashed.driver;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Executes the production HTTP client against a loopback fixture, never live accounts. */
public class NativeWorkspaceApiTest {
    static JSONObject profile(long id, String name, String email, String phone) throws Exception {
        return new JSONObject().put("user",new JSONObject().put("id",id).put("name",name).put("email",email)
            .put("phone",phone==null?JSONObject.NULL:phone).put("roles",new JSONArray().put("vendor"))
            .put("vendor",new JSONObject().put("id",29).put("businessName","Fixture workspace"))
            .put("vendorPermissions",new JSONObject().put("callCenter",true).put("settings",false)))
            .put("capabilities",new JSONObject().put("calls",true));
    }
    static JSONObject call(String name) throws Exception {
        return new JSONObject().put("id","fixture-call").put("customerName",name).put("customerPhone","+15555550123")
            .put("timestamp","2026-09-16T00:00:00Z").put("status","ended").put("transcript","Fixture transcript")
            .put("duration",60).put("durationFormatted","1:00").put("hasRecording",true).put("recordingUrl","/api/calls/fixture-call/recording");
    }
    static class Reply {
        final int code; final String type, headers; final byte[] body;
        Runnable beforeResponse = () -> {};
        Reply(int code,String type,String body){this(code,type,body,"");}
        Reply(int code,String type,String body,String headers){this.code=code;this.type=type;this.body=body.getBytes(StandardCharsets.UTF_8);this.headers=headers;}
    }
    static class Fixture implements AutoCloseable {
        final ServerSocket socket; final ExecutorService executor=Executors.newSingleThreadExecutor();
        final List<String> requests=Collections.synchronizedList(new ArrayList<>()); final Future<?> task;
        final String origin;
        Fixture(Reply... replies) throws IOException {
            socket=new ServerSocket(0,8,InetAddress.getLoopbackAddress());socket.setSoTimeout(10000);
            origin="http://127.0.0.1:"+socket.getLocalPort();
            task=executor.submit(()->{
                try {for(Reply reply:replies) try(Socket client=socket.accept()) {
                    client.setSoTimeout(5000);
                    InputStream input=client.getInputStream();ByteArrayOutputStream header=new ByteArrayOutputStream();int b;String value="";
                    while((b=input.read())!=-1){header.write(b);value=header.toString("UTF-8");if(value.endsWith("\r\n\r\n"))break;}
                    int length=0;for(String line:value.split("\r\n"))if(line.toLowerCase(Locale.ROOT).startsWith("content-length:"))length=Integer.parseInt(line.split(":",2)[1].trim());
                    byte[] payload=new byte[length];int offset=0;while(offset<length){int count=input.read(payload,offset,length-offset);if(count<0)break;offset+=count;}
                    requests.add(value+new String(payload,StandardCharsets.UTF_8));
                    reply.beforeResponse.run();
                    OutputStream out=client.getOutputStream();out.write(("HTTP/1.1 "+reply.code+" Fixture\r\nContent-Type: "+reply.type+"\r\nContent-Length: "+reply.body.length+"\r\nConnection: close\r\n"+reply.headers+"\r\n").getBytes(StandardCharsets.UTF_8));out.write(reply.body);out.flush();
                }}catch(IOException error){if(!socket.isClosed())throw new RuntimeException(error);}
            });
        }
        NativeWorkspaceApi api(){return new NativeWorkspaceApi(origin,"next-auth.session-token=fixture-session");}
        public void close() throws Exception {socket.close();executor.shutdownNow();executor.awaitTermination(5,TimeUnit.SECONDS);}
    }
    static Reply json(JSONObject value){return new Reply(200,"application/json",value.toString());}
    // JDK HttpURLConnection rejects PATCH; Android has its own implementation.
    // Save semantics use an explicit unit double; emulator tests must prove PATCH on Android.
    static class SaveConnection extends HttpURLConnection {
        final Reply reply; final ByteArrayOutputStream body=new ByteArrayOutputStream();
        SaveConnection(URL url,Reply reply){super(url);this.reply=reply;}
        @Override public void setRequestMethod(String value){method=value;}
        @Override public void connect(){}
        @Override public void disconnect(){}
        @Override public boolean usingProxy(){return false;}
        @Override public OutputStream getOutputStream(){return body;}
        @Override public int getResponseCode(){return reply.code;}
        @Override public String getContentType(){return reply.type;}
        @Override public Map<String,List<String>> getHeaderFields(){
            Map<String,List<String>> headers=new HashMap<>();
            for(String line:reply.headers.split("\r\n")) if(line.contains(":")) {
                String[] pair=line.split(":",2);headers.computeIfAbsent(pair[0],key->new ArrayList<>()).add(pair[1].trim());
            }
            return headers;
        }
        @Override public InputStream getInputStream(){return new ByteArrayInputStream(reply.body);}
    }
    @Test public void strictNumericIdentityIsNotCoerced() throws Exception {
        for(Object id:new Object[]{"12",12.5,0,-1,true}){
            JSONObject value=profile(12,"Fixture","fixture@example.test",null);value.getJSONObject("user").put("id",id);
            try {new NativeWorkspaceApi.Profile(value);fail("accepted identity "+id);}catch(IOException|JSONException expected){}
        }
    }
    @Test public void equalCallContentHasStableValueEquality() throws Exception {
        NativeWorkspaceApi.Call a=new NativeWorkspaceApi.Call(call("Fixture")),b=new NativeWorkspaceApi.Call(call("Fixture"));
        assertEquals(a,b);assertEquals(a.hashCode(),b.hashCode());assertNotEquals(a,new NativeWorkspaceApi.Call(call("Other fixture")));
    }
    @Test public void saveAcceptsServerNormalizationAndVerifiesReadback() throws Exception {
        JSONObject before=profile(12,"Fixture","fixture@example.test",null);
        JSONObject saved=profile(12,"Updated","normalized@example.test","+15555550123");
        JSONObject patch=new JSONObject().put("success",true).put("user",saved.getJSONObject("user"));
        List<SaveConnection> requests=new ArrayList<>();
        Queue<Reply> replies=new ArrayDeque<>(Arrays.asList(json(before),json(patch),json(saved)));
        NativeWorkspaceApi api=new NativeWorkspaceApi("https://trashed.app", url->"next-auth.session-token=fixture-session", url->{SaveConnection c=new SaveConnection(url,replies.remove());requests.add(c);return c;});
        {
            NativeWorkspaceApi.Profile result=api.save(new NativeWorkspaceApi.Profile(before)," Updated ","NORMALIZED@example.test","(555) 555-0123");
            assertEquals("+15555550123",result.phone);assertEquals("Updated",result.name);
            assertEquals(3,requests.size());assertEquals("PATCH",requests.get(1).getRequestMethod());
            assertEquals("https://trashed.app",requests.get(1).getRequestProperty("Origin"));
        }
    }
    @Test public void saveRejectsUnconfirmedServerFields() throws Exception {
        JSONObject before=profile(12,"Fixture","fixture@example.test",null);
        JSONObject changed=profile(12,"Changed","fixture@example.test",null);
        Queue<Reply> replies=new ArrayDeque<>(Arrays.asList(json(before),json(new JSONObject().put("success",true).put("user",changed.getJSONObject("user"))),json(before)));
        NativeWorkspaceApi api=new NativeWorkspaceApi("https://trashed.app",url->"next-auth.session-token=fixture-session",url->new SaveConnection(url,replies.remove()));
        try{api.save(new NativeWorkspaceApi.Profile(before),"Changed","fixture@example.test","");fail();}catch(IOException expected){}
    }
    @Test public void httpErrorsAndRedirectsRemainFailures() throws Exception {
        for(int code:new int[]{401,403,500,302})try(Fixture f=new Fixture(new Reply(code,"application/json","{}",code==302?"Location: https://example.invalid/stolen\r\n":""))){
            try{f.api().profile();fail();}catch(NativeWorkspaceApi.Failure expected){assertEquals(code,expected.status);}
            assertEquals(1,f.requests.size());
        }
    }
    @Test public void cancellationAndChangedIdentityBlockBeforeNetwork() throws Exception {
        final String[] cookies={"next-auth.session-token=fixture-session"};
        final int[] opened={0};
        NativeWorkspaceApi api=new NativeWorkspaceApi("https://trashed.app",url->cookies[0],url->{opened[0]++;throw new IOException("Should never connect");});
        cookies[0]="next-auth.session-token=different";
        try{api.profile();fail();}catch(NativeWorkspaceApi.Failure expected){assertEquals(401,expected.status);}
        assertEquals(0,opened[0]);
        NativeWorkspaceApi cancelled=new NativeWorkspaceApi("https://trashed.app",url->cookies[0],url->{opened[0]++;throw new IOException("Should never connect");});
        cancelled.cancel();try{cancelled.profile();fail();}catch(IOException expected){}
        assertEquals(0,opened[0]);
    }
    static final class MutableCookies implements NativeWorkspaceApi.CookieSource {
        volatile String value="next-auth.session-token=fixture-A";
        final List<String> received=Collections.synchronizedList(new ArrayList<>());
        public String get(String url){return value;}
        public void receive(String url,List<String> values){received.addAll(values);value=values.get(0).split(";",2)[0];}
    }
    static final String ROTATION="Set-Cookie: next-auth.session-token=stale-A; Path=/; HttpOnly\r\n";
    static final String DELETION="Set-Cookie: next-auth.session-token=; Path=/; Max-Age=0\r\n";
    @Test public void sameIdentityGetIgnoresResponseCookieRotation() throws Exception {
        MutableCookies cookies=new MutableCookies();
        try(Fixture f=new Fixture(new Reply(200,"application/json",profile(12,"Fixture","fixture@example.test",null).toString(),ROTATION))){
            assertEquals(12,new NativeWorkspaceApi(f.origin,cookies).profile().id);
            assertEquals("next-auth.session-token=fixture-A",cookies.value);assertTrue(cookies.received.isEmpty());
        }
    }
    @Test public void delayedAccountAResponseCannotOverwriteNewAccountB() throws Exception {
        for(String headers:new String[]{ROTATION,DELETION}) {
            MutableCookies cookies=new MutableCookies();CountDownLatch requested=new CountDownLatch(1),release=new CountDownLatch(1);
            Reply reply=new Reply(200,"application/json",profile(12,"Fixture","fixture@example.test",null).toString(),headers);
            reply.beforeResponse=()->{requested.countDown();try{assertTrue(release.await(5,TimeUnit.SECONDS));}catch(InterruptedException e){Thread.currentThread().interrupt();throw new AssertionError(e);}};
            ExecutorService worker=Executors.newSingleThreadExecutor();
            try(Fixture f=new Fixture(reply)) {
                NativeWorkspaceApi api=new NativeWorkspaceApi(f.origin,cookies);
                Future<NativeWorkspaceApi.Profile> response=worker.submit(api::profile);
                try {
                    assertTrue(requested.await(5,TimeUnit.SECONDS));cookies.value="next-auth.session-token=fixture-B";release.countDown();
                    try{response.get(5,TimeUnit.SECONDS);fail("stale result published");}
                    catch(ExecutionException expected){assertTrue(expected.getCause() instanceof NativeWorkspaceApi.Failure);assertEquals(401,((NativeWorkspaceApi.Failure)expected.getCause()).status);}
                    assertEquals("next-auth.session-token=fixture-B",cookies.value);assertTrue(cookies.received.isEmpty());
                    f.task.get(5,TimeUnit.SECONDS);
                } finally {release.countDown();api.cancel();}
            } finally {worker.shutdownNow();assertTrue(worker.awaitTermination(5,TimeUnit.SECONDS));}
        }
    }
    @Test public void errorsAndRedirectsNeverInstallOrDeleteCookies() throws Exception {
        for(int code:new int[]{401,403,302,500}) for(String header:new String[]{ROTATION,DELETION}) {
            MutableCookies cookies=new MutableCookies();
            try(Fixture f=new Fixture(new Reply(code,"application/json","{}",header+"Location: https://example.invalid/\r\n"))) {
                try{new NativeWorkspaceApi(f.origin,cookies).profile();fail();}catch(NativeWorkspaceApi.Failure expected){assertEquals(code,expected.status);}
                assertEquals("next-auth.session-token=fixture-A",cookies.value);assertTrue(cookies.received.isEmpty());
            }
        }
    }
    @Test public void cancellationAndInterruptionAtHeadersEofCloseAndIdentityNeverPublish() throws Exception {
        for(boolean recording:new boolean[]{false,true}) for(boolean interrupt:new boolean[]{false,true})
            for(String stage:new String[]{"headers","empty-eof","eof","close","identity"}) {
                File cache=new File(System.getProperty("java.io.tmpdir"),"workspace-cancel-"+UUID.randomUUID());assertTrue(cache.mkdir());
                NativeWorkspaceApi[] api={null};boolean[] completed={false};
                Runnable stop=()->{if(interrupt)Thread.currentThread().interrupt();else api[0].cancel();};
                NativeWorkspaceApi.CookieSource cookies=url->{if(completed[0] && stage.equals("identity"))stop.run();return "next-auth.session-token=fixture-A";};
                Reply reply=new Reply(200,recording?"audio/wav":"application/json",stage.equals("empty-eof")?"":recording?"RIFF-fixture":profile(12,"Fixture","fixture@example.test",null).toString());
                api[0]=new NativeWorkspaceApi("https://trashed.app",cookies,url->new SaveConnection(url,reply){
                    @Override public int getResponseCode(){if(stage.equals("headers"))stop.run();return super.getResponseCode();}
                    @Override public InputStream getInputStream(){return new ByteArrayInputStream(reply.body){
                        @Override public synchronized int read(byte[] b,int off,int len){int n=super.read(b,off,len);if(n==-1){completed[0]=true;if(stage.endsWith("eof"))stop.run();}return n;}
                        @Override public void close(){if(stage.equals("close"))stop.run();}
                    };}
                });
                try {
                    try{if(recording)api[0].recording(cache,"/api/calls/fixture/recording");else api[0].profile();fail("published after "+stage);}
                    catch(IOException expected){assertEquals("Cancelled",expected.getMessage());}
                    assertEquals(0,Objects.requireNonNull(cache.list()).length);
                } finally {Thread.interrupted();for(File file:Objects.requireNonNull(cache.listFiles()))assertTrue(file.delete());assertTrue(cache.delete());}
            }
    }
    @Test public void recordingTransportIsReadOnly() throws Exception {
        MutableCookies cookies=new MutableCookies();File cache=new File(System.getProperty("java.io.tmpdir"),"workspace-audio-"+UUID.randomUUID());assertTrue(cache.mkdir());
        try(Fixture f=new Fixture(new Reply(200,"audio/wav","RIFF-fixture",ROTATION))) {
            File audio=new NativeWorkspaceApi(f.origin,cookies).recording(cache,"/api/calls/fixture/recording");assertTrue(audio.delete());
            assertEquals("next-auth.session-token=fixture-A",cookies.value);assertTrue(cookies.received.isEmpty());
        } finally {for(File file:Objects.requireNonNull(cache.listFiles()))file.delete();assertTrue(cache.delete());}
    }
    @Test public void callsUseRealPagingQueryAndRejectChangedWorkspace() throws Exception {
        JSONObject value=profile(12,"Fixture","fixture@example.test",null);
        JSONObject page=new JSONObject().put("calls",new JSONArray().put(call("Fixture"))).put("totalCalls",21).put("totalPages",3).put("currentPage",2);
        try(Fixture f=new Fixture(json(value),json(page),json(value))){
            NativeWorkspaceApi.Page result=f.api().calls(new NativeWorkspaceApi.Profile(value),2,"a&b","ended","timestamp-desc");
            assertEquals(2,result.page);assertEquals(1,result.calls.size());
            assertTrue(f.requests.get(1).startsWith("GET /api/ai-features/calls?page=2&search=a%26b&filter=ended&sort=timestamp-desc"));
        }
        JSONObject changed=profile(13,"Other fixture","other@example.test",null);
        try(Fixture f=new Fixture(json(value),json(page),json(changed))){
            try{f.api().calls(new NativeWorkspaceApi.Profile(value),2,"","all","timestamp-desc");fail();}catch(NativeWorkspaceApi.Failure expected){assertEquals(401,expected.status);}
        }
    }
    @Test public void emailChangeReturnsConfirmedReauthenticationInsteadOfFailingReadback() throws Exception {
        JSONObject before=profile(12,"Fixture","fixture@example.test",null);
        JSONObject saved=profile(12,"Fixture","changed@example.test",null);
        MutableCookies cookies=new MutableCookies();
        Queue<Reply> replies=new ArrayDeque<>(Arrays.asList(json(before),new Reply(200,"application/json",new JSONObject().put("success",true).put("reauthenticationRequired",true).put("user",saved.getJSONObject("user")).toString(),DELETION)));
        NativeWorkspaceApi api=new NativeWorkspaceApi("https://trashed.app",cookies,url->new SaveConnection(url,replies.remove()));
        try { api.save(new NativeWorkspaceApi.Profile(before),"Fixture","changed@example.test",""); fail(); }
        catch(NativeWorkspaceApi.EmailChanged expected){assertEquals("Email saved. Sign in again with your new address.",expected.getMessage());}
        assertTrue(replies.isEmpty());
        assertEquals("next-auth.session-token=fixture-A",cookies.value);assertTrue(cookies.received.isEmpty());
    }
    @Test public void changedRequestCookieCannotMutateTheNewAccount() throws Exception {
        final int[] opened={0};
        NativeWorkspaceApi.CookieSource changing=url->url.contains("/api/") ? "next-auth.session-token=new-account" : "next-auth.session-token=original-account";
        NativeWorkspaceApi api=new NativeWorkspaceApi("https://trashed.app",changing,url->{opened[0]++;throw new IOException("network must not be reached");});
        try{api.profile();fail("new account cookie reached the request");}catch(NativeWorkspaceApi.Failure expected){assertEquals(401,expected.status);}
        assertEquals(0,opened[0]);
    }
    @Test public void jsonMimeTypeIsRequired() throws Exception {
        try(Fixture f=new Fixture(new Reply(200,"text/html",profile(12,"Fixture","fixture@example.test",null).toString()))){
            try{f.api().profile();fail("HTML response accepted");}catch(IOException expected){}
        }
    }
    @Test public void recordingRequiresExactAudioTypeAndCleansUpBadFiles() throws Exception {
        File cache=new File(System.getProperty("java.io.tmpdir"),"workspace-test-"+UUID.randomUUID());assertTrue(cache.mkdir());
        try {
            try(Fixture f=new Fixture(new Reply(200,"application/octet-stream","not audio"))){
                try{f.api().recording(cache,"/api/calls/fixture-call/recording");fail();}catch(IOException expected){}
                assertEquals(0,Objects.requireNonNull(cache.list()).length);
            }
            try(Fixture f=new Fixture(new Reply(200,"audio/wav","RIFF-fixture-bytes"))){
                File file=f.api().recording(cache,"/api/calls/fixture-call/recording");
                assertTrue(file.length()>0);assertTrue(file.delete());
            }
        }finally{for(File file:Objects.requireNonNull(cache.listFiles()))file.delete();cache.delete();}
    }
}
