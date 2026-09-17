package com.trashed.driver;

import static org.junit.Assert.*;
import android.webkit.CookieManager;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Real Android HTTP + OS cookie store. Only synthetic loopback cookies are written. */
public class NativeWorkspaceCookieRaceTest {
    private static final String PROFILE="{\"user\":{\"id\":12,\"name\":\"Fixture\",\"email\":\"fixture@example.test\",\"phone\":\"\",\"roles\":[\"vendor\"]},\"capabilities\":{\"calls\":true}}";
    private static final String SAVED="{\"success\":true,\"reauthenticationRequired\":true,\"user\":{\"id\":12,\"name\":\"Fixture\",\"email\":\"changed@example.test\",\"phone\":\"\"}}";

    @Test public void delayedOldAccountCannotRotateOrDeleteNewLogin() throws Exception {
        for(boolean delete:new boolean[]{false,true}) {
            Reply reply=new Reply(200,PROFILE,delete,true);
            try(Fixture server=new Fixture(reply); Jar jar=new Jar(server.origin)) {
                server.cookieName=jar.name;
                jar.put("account-A");
                NativeWorkspaceApi api=new NativeWorkspaceApi(server.origin,jar.store);
                ExecutorService worker=Executors.newSingleThreadExecutor();
                try {
                    Future<NativeWorkspaceApi.Profile> result=worker.submit(api::profile);
                    assertTrue("A request reached loopback",reply.requested.await(10,TimeUnit.SECONDS));
                    jar.put("account-B");reply.release.countDown();
                    try { result.get(10,TimeUnit.SECONDS);fail("Old account data published"); }
                    catch(ExecutionException expected) {
                        assertTrue(expected.getCause() instanceof NativeWorkspaceApi.Failure);
                        assertEquals(401,((NativeWorkspaceApi.Failure)expected.getCause()).status);
                    }
                    jar.assertValue("account-B");
                    assertTrue("Request carried synthetic A",reply.syntheticCookieReceived);
                    server.verify();
                } finally {
                    reply.release.countDown();api.cancel();worker.shutdownNow();
                    assertTrue(worker.awaitTermination(5,TimeUnit.SECONDS));
                }
            }
        }
    }

    @Test public void getAndAuthenticationErrorsNeverWriteResponseCookies() throws Exception {
        for(int status:new int[]{200,401,403,302}) for(boolean delete:new boolean[]{false,true}) {
            Reply reply=new Reply(status,PROFILE,delete,false);
            try(Fixture server=new Fixture(reply); Jar jar=new Jar(server.origin)) {
                server.cookieName=jar.name;jar.put("account-A");
                NativeWorkspaceApi api=new NativeWorkspaceApi(server.origin,jar.store);
                if(status==200) assertEquals(12,api.profile().id);
                else try {api.profile();fail("HTTP failure accepted");}
                catch(NativeWorkspaceApi.Failure expected){assertEquals(status,expected.status);}
                jar.assertValue("account-A");assertTrue(reply.syntheticCookieReceived);server.verify();
            }
        }
    }

    @Test public void actualPatchPreservesConfirmedEmailChangeDespiteCookieDeletion() throws Exception {
        Reply before=new Reply(200,PROFILE,false,false), saved=new Reply(200,SAVED,true,false);
        try(Fixture server=new Fixture(before,saved); Jar jar=new Jar(server.origin)) {
            server.cookieName=jar.name;jar.put("account-A");
            NativeWorkspaceApi api=new NativeWorkspaceApi(server.origin,jar.store);
            try {api.save(new NativeWorkspaceApi.Profile(new org.json.JSONObject(PROFILE)),"Fixture","changed@example.test","");fail("Missing reauthentication result");}
            catch(NativeWorkspaceApi.EmailChanged expected) {assertEquals("Email saved. Sign in again with your new address.",expected.getMessage());}
            assertEquals("GET",before.method);assertEquals("PATCH",saved.method);
            assertTrue(before.syntheticCookieReceived && saved.syntheticCookieReceived);
            jar.assertValue("account-A");server.verify();
        }
    }

    /** Never removeAllCookies: ports share a host jar, and real app cookies must survive. */
    static final class Jar implements AutoCloseable {
        final String origin, name="authjs.session-token."+UUID.randomUUID().toString().replaceAll("[^0-9]","");
        final NativeWorkspaceCookieStore store;
        final Map<String,Set<String>> snapshots=new LinkedHashMap<>();
        final CookieManager manager;
        final boolean accepted;
        Jar(String origin) {
            this.origin=origin;
            InstrumentationRegistry.getInstrumentation().runOnMainSync(CookieManager::getInstance);
            manager=CookieManager.getInstance();accepted=manager.acceptCookie();
            for(String url:new String[]{origin,origin+"/api/user/profile","https://trashed.app","https://trashed.app/api/user/profile","https://www.trashed.app"})
                snapshots.put(url,parts(manager.getCookie(url)));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->manager.setAcceptCookie(true));
            store=new NativeWorkspaceCookieStore(origin);
        }
        void put(String value) {
            store.receive(origin,Collections.singletonList(name+"="+value+"; Path=/; HttpOnly"));
            assertValue(value);
        }
        void assertValue(String value) {assertTrue("Synthetic cookie unchanged",parts(store.get(origin)).contains(name+"="+value));}
        public void close() {
            try {
                store.receive(origin,Collections.singletonList(name+"=; Path=/; Max-Age=0; HttpOnly"));
                for(Map.Entry<String,Set<String>> snapshot:snapshots.entrySet())
                    assertTrue("Preexisting cookie jar preserved (values redacted)",snapshot.getValue().equals(parts(manager.getCookie(snapshot.getKey()))));
            } finally {InstrumentationRegistry.getInstrumentation().runOnMainSync(()->manager.setAcceptCookie(accepted));}
        }
        static Set<String> parts(String value) {
            Set<String> result=new TreeSet<>();
            if(value!=null)for(String part:value.split(";"))if(!part.trim().isEmpty())result.add(part.trim());
            return result;
        }
    }
    static final class Reply {
        final int status;final String body;final boolean delete;
        final CountDownLatch requested=new CountDownLatch(1),release;
        volatile boolean syntheticCookieReceived;volatile String method;
        Reply(int status,String body,boolean delete,boolean delayed){this.status=status;this.body=body;this.delete=delete;release=new CountDownLatch(delayed?1:0);}
    }
    static final class Fixture implements AutoCloseable {
        final ServerSocket socket;final ExecutorService executor=Executors.newSingleThreadExecutor();
        final Future<?> task;final String origin;final Reply[] replies;
        volatile String cookieName;
        Fixture(Reply... replies) throws Exception {
            this.replies=replies;socket=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));socket.setSoTimeout(10000);
            origin="http://127.0.0.1:"+socket.getLocalPort();
            task=executor.submit(()->{
                try {
                    for(Reply reply:replies)try(Socket client=socket.accept()) {
                        client.setSoTimeout(10000);
                        BufferedReader reader=new BufferedReader(new InputStreamReader(client.getInputStream(),StandardCharsets.UTF_8));
                        String request=reader.readLine();if(request==null)throw new IOException("No fixture request");
                        reply.method=request.split(" ")[0];int length=0;String line;
                        while((line=reader.readLine())!=null && !line.isEmpty()) {
                            if(line.toLowerCase(Locale.ROOT).startsWith("cookie:"))reply.syntheticCookieReceived=line.contains(cookieName+"=account-A");
                            if(line.toLowerCase(Locale.ROOT).startsWith("content-length:"))length=Integer.parseInt(line.substring(15).trim());
                        }
                        for(int i=0;i<length;i++)if(reader.read()==-1)throw new EOFException();
                        reply.requested.countDown();if(!reply.release.await(10,TimeUnit.SECONDS))throw new IOException("Response gate timed out");
                        byte[] body=reply.body.getBytes(StandardCharsets.UTF_8);
                        String issued=cookieName+(reply.delete?"=; Path=/; Max-Age=0":"=stale-A; Path=/; HttpOnly");
                        String headers="HTTP/1.1 "+reply.status+" Fixture\r\nContent-Type: application/json\r\nContent-Length: "+body.length+"\r\nSet-Cookie: "+issued+"\r\nConnection: close\r\n"+(reply.status==302?"Location: https://example.invalid/\r\n":"")+"\r\n";
                        OutputStream out=client.getOutputStream();out.write(headers.getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();
                    }
                } catch(Exception error) {throw new RuntimeException("Loopback fixture failed",error);}
            });
        }
        void verify() throws Exception {task.get(10,TimeUnit.SECONDS);}
        public void close() throws Exception {
            for(Reply reply:replies)reply.release.countDown();socket.close();executor.shutdownNow();
            assertTrue(executor.awaitTermination(5,TimeUnit.SECONDS));
        }
    }
}
