package com.trashed.driver;

import static org.junit.Assert.*;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AlertDialog;
import androidx.recyclerview.widget.RecyclerView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.material.textfield.TextInputEditText;
import org.json.*;
import org.junit.Test;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

/** Real native widgets and HTTP loopback transport, synthetic data only. */
public class NativeWorkspaceRegressionTest {
    static Object field(Object object, String name) {
        try { java.lang.reflect.Field f = object.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(object); }
        catch (Exception e) { throw new AssertionError(e); }
    }
    static TextView text(View view, String value) {
        if (view instanceof TextView && value.equals(((TextView)view).getText().toString())) return (TextView)view;
        if (view instanceof ViewGroup) for (int i=0; i<((ViewGroup)view).getChildCount(); i++) {
            TextView found = text(((ViewGroup)view).getChildAt(i), value); if (found != null) return found;
        }
        return null;
    }
    interface Check { boolean ready(NativeWorkspaceTestActivity activity); }
    static void await(ActivityScenario<NativeWorkspaceTestActivity> scenario, Check check) throws Exception {
        long deadline = System.currentTimeMillis()+10000;
        while (System.currentTimeMillis()<deadline) {
            boolean[] ready={false}; scenario.onActivity(a -> ready[0]=check.ready(a));
            if (ready[0]) return; Thread.sleep(50);
        }
        scenario.onActivity(a -> fail("Native UI timeout: " + ((TextView)field(a.workspace,"status")).getText()));
    }
    @Test public void httpProfileSaveReadbackPaginationAndSessionRevocation() throws Exception {
        try (Fixture server = new Fixture()) {
            Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), NativeWorkspaceTestActivity.class).putExtra("origin", server.origin());
            try (ActivityScenario<NativeWorkspaceTestActivity> scenario = ActivityScenario.launch(intent)) {
                await(scenario, a -> text(a.workspace,"Fixture User") != null);
                screenshot("profile-light.png");
                scenario.onActivity(a -> {
                    assertEquals("", NativeWorkspacePolicy.destination(a.origin+"/vendor/profile?view=account",a.origin));
                    assertEquals("", NativeWorkspacePolicy.destination(a.origin+"/driver/profile",a.origin));
                    text(a.workspace,"Edit profile").performClick();
                });
                InstrumentationRegistry.getInstrumentation().waitForIdleSync();
                scenario.onActivity(a -> {
                    TextInputEditText input=(TextInputEditText)field(a.workspace,"nameInput");
                    input.setText("A");
                    ((AlertDialog)field(a.workspace,"editor")).getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                    assertNotNull(input.getError()); assertEquals(0,server.patches.get());
                    input.setText("Updated Fixture");
                    ((AlertDialog)field(a.workspace,"editor")).getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                });
                await(scenario,a -> text(a.workspace,"Profile saved and verified") != null);
                screenshot("profile-saved-light.png");
                assertEquals("Updated Fixture",server.name); assertEquals(1,server.patches.get());
                assertTrue(server.profileReads.get()>=3);
                scenario.onActivity(a -> { text(a.workspace,"Account · Web").performClick(); assertEquals("/vendor/profile?view=account",a.route); a.show("/calls/history"); });
                await(scenario,a -> text(a.workspace,"1 of 2 calls") != null);
                scenario.onActivity(a -> text(a.workspace,"Load more").performClick());
                await(scenario,a -> text(a.workspace,"2 of 2 calls") != null);
                scenario.onActivity(a -> {
                    RecyclerView list=a.workspace.findViewWithTag("native-calls-list");
                    assertEquals(2,list.getAdapter().getItemCount());
                    assertFalse(text(a.workspace,"All pages loaded").isEnabled());
                    a.identity="next-auth.session-token=local-fixture; impersonate-vendor-user-uuid=other";
                });
                await(scenario,a -> text(a.workspace,"Your session changed. Reopen this screen after signing in.") != null);
                scenario.onActivity(a -> assertEquals(0,((RecyclerView)a.workspace.findViewWithTag("native-calls-list")).getAdapter().getItemCount()));
                assertEquals(2,server.callReads.get()); assertNull(server.failure);
            }
        }
    }
    static void screenshot(String name) throws Exception {
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        java.util.concurrent.CountDownLatch drawn = new java.util.concurrent.CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> android.view.Choreographer.getInstance().postFrameCallback(time -> android.view.Choreographer.getInstance().postFrameCallback(next -> drawn.countDown())));
        assertTrue("Two rendered frames",drawn.await(10,java.util.concurrent.TimeUnit.SECONDS));
        android.graphics.Bitmap image = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull("Native screenshot",image);
        File dir = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null),"native-workspace-qa");
        if (!dir.isDirectory()) assertTrue(dir.mkdirs());
        try(OutputStream out=new FileOutputStream(new File(dir,name))) { assertTrue(image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out)); }
        image.recycle();
    }
    @Test public void nativePlaybackSurvivesCollapseAndSeeksInDarkMode() throws Exception {
        try(Fixture server = new Fixture()) {
            Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),NativeWorkspaceTestActivity.class).putExtra("origin",server.origin()).putExtra("dark",true);
            try(ActivityScenario<NativeWorkspaceTestActivity> scenario=ActivityScenario.launch(intent)) {
                await(scenario,a->text(a.workspace,"Fixture User")!=null);
                screenshot("profile-dark.png");
                scenario.onActivity(a->a.show("/calls/history"));
                await(scenario,a->text(a.workspace,"View call")!=null);
                screenshot("calls-dark.png");
                scenario.onActivity(a->text(a.workspace,"View call").performClick());
                await(scenario,a->text(a.workspace,"Play recording")!=null);
                scenario.onActivity(a->text(a.workspace,"Play recording").performClick());
                await(scenario,a->a.workspace.audio.playing() && a.workspace.audio.position()>300);
                screenshot("audio-expanded-dark.png");
                scenario.onActivity(a->{assertTrue(a.workspace.audio.duration()>=19000);text(a.workspace,"Collapse call").performClick();assertTrue(a.workspace.audio.playing());});
                await(scenario,a->text(a.workspace,"Transcript")==null && a.workspace.audio.playing());
                screenshot("audio-collapsed-dark.png");
                scenario.onActivity(a->{text(a.workspace,"Pause").performClick();assertFalse(a.workspace.audio.playing());a.workspace.audio.seek(10000);});
                await(scenario,a->a.workspace.audio.position()>=9500);
                scenario.onActivity(a->{((android.widget.TextView)a.workspace.findViewWithTag("workspace-speed")).performClick();assertEquals(1.5f,a.workspace.audio.speed,0.01f);assertFalse(a.workspace.audio.playing());text(a.workspace,"Play").performClick();});
                await(scenario,a->a.workspace.audio.playing());
                scenario.onActivity(a->{text(a.workspace,"Stop").performClick();assertFalse(a.workspace.audio.prepared);});
                assertEquals(1,server.audioReads.get()); assertNull(server.failure);
            }
        }
    }
    @Test public void failedSaveRetainsDraftThenRetriesAndHttp401ClearsData() throws Exception {
        try(Fixture server = new Fixture()) {
            Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),NativeWorkspaceTestActivity.class).putExtra("origin",server.origin());
            try(ActivityScenario<NativeWorkspaceTestActivity> scenario=ActivityScenario.launch(intent)) {
                await(scenario,a->text(a.workspace,"Fixture User")!=null);
                scenario.onActivity(a->text(a.workspace,"Edit profile").performClick());
                InstrumentationRegistry.getInstrumentation().waitForIdleSync();server.failSave=true;
                scenario.onActivity(a->{((TextInputEditText)field(a.workspace,"nameInput")).setText("Retry Fixture");((AlertDialog)field(a.workspace,"editor")).getButton(AlertDialog.BUTTON_POSITIVE).performClick();});
                await(scenario,a->!(Boolean)field(a.workspace,"saving") && !((TextView)field(a.workspace,"editError")).getText().toString().isEmpty());
                scenario.onActivity(a->assertEquals("Retry Fixture",((TextInputEditText)field(a.workspace,"nameInput")).getText().toString()));
                assertEquals("Fixture User",server.name);assertEquals(0,server.patches.get());screenshot("profile-save-error.png");
                server.failSave=false;scenario.onActivity(a->((AlertDialog)field(a.workspace,"editor")).getButton(AlertDialog.BUTTON_POSITIVE).performClick());
                await(scenario,a->text(a.workspace,"Profile saved and verified")!=null);assertEquals("Retry Fixture",server.name);
                server.expired=true;scenario.onActivity(a->a.workspace.refresh());
                await(scenario,a->text(a.workspace,"Your session expired. Sign in again.")!=null);
                scenario.onActivity(a->assertNull(text(a.workspace,"Retry Fixture")));screenshot("profile-expired.png");
                assertNull(server.failure);
            }
        }
    }
    @Test public void nativeSearchResetsPaginationAndShowsHonestEmptyState() throws Exception {
        try(Fixture server=new Fixture()) {
            Intent intent = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),NativeWorkspaceTestActivity.class).putExtra("origin",server.origin());
            try(ActivityScenario<NativeWorkspaceTestActivity> scenario=ActivityScenario.launch(intent)) {
                await(scenario,a->text(a.workspace,"Fixture User")!=null);scenario.onActivity(a->a.show("/calls/history"));
                await(scenario,a->text(a.workspace,"View call")!=null);
                scenario.onActivity(a->((TextInputEditText)a.workspace.findViewWithTag("workspace-search")).setText("no-matching-fixture"));
                await(scenario,a->text(a.workspace,"No calls match your search.")!=null);
                scenario.onActivity(a->{assertEquals(0,((RecyclerView)a.workspace.findViewWithTag("native-calls-list")).getAdapter().getItemCount());((TextInputEditText)a.workspace.findViewWithTag("workspace-search")).setText("Caller 2");});
                await(scenario,a->text(a.workspace,"Caller 2")!=null && text(a.workspace,"1 of 1 calls")!=null);
                scenario.onActivity(a->{assertNull(text(a.workspace,"Caller 1"));assertFalse(text(a.workspace,"All pages loaded").isEnabled());});
                screenshot("search-results-light.png");assertNull(server.failure);
            }
        }
    }
    @Test public void osCookieStoreScopesPathsAndAppliesRotation() throws Exception {
        // Production initializes WebView/CookieManager before native navigation.
        // Warm the actual OS store here as well, outside the bounded mutation wait.
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> android.webkit.CookieManager.getInstance().setAcceptCookie(true));
        try(Fixture server=new Fixture()) {
            NativeWorkspaceCookieStore cookies=new NativeWorkspaceCookieStore(server.origin());
            try {
                cookies.receive(server.origin()+"/api/user/profile",java.util.Arrays.asList("next-auth.session-token=local-fixture; Path=/; HttpOnly", "fixture-api-only=yes; Path=/api/user"));
                assertTrue(cookies.get(server.origin()+"/api/user/profile").contains("fixture-api-only=yes"));
                assertFalse(cookies.get(server.origin()+"/api/calls").contains("fixture-api-only=yes"));
                assertEquals("",cookies.get("https://example.invalid/api/user/profile"));
                NativeWorkspaceApi api=new NativeWorkspaceApi(server.origin(),cookies);
                assertEquals("Fixture User",api.profile().name);
                cookies.receive(server.origin(),java.util.Collections.singletonList("next-auth.session-token=changed-fixture; Path=/; HttpOnly"));
                try{api.profile();fail("old identity reused after OS cookie rotation");}catch(NativeWorkspaceApi.Failure expected){assertEquals(401,expected.status);}
                assertEquals(1,server.profileReads.get());
            } finally {
                cookies.receive(server.origin(),java.util.Collections.singletonList("next-auth.session-token=; Path=/; Max-Age=0"));
                cookies.receive(server.origin()+"/api/user/profile",java.util.Collections.singletonList("fixture-api-only=; Path=/api/user; Max-Age=0"));
            }
        }
    }
    static final class Fixture implements AutoCloseable {
        final ServerSocket socket; final Thread thread;
        volatile boolean closed, failSave, expired; volatile Throwable failure; volatile String name="Fixture User";
        final AtomicInteger audioReads = new AtomicInteger(), dashboardReads = new AtomicInteger();
        final AtomicInteger patches=new AtomicInteger(), profileReads=new AtomicInteger(), callReads=new AtomicInteger();
        Fixture() throws Exception {
            socket=new ServerSocket(0,20,InetAddress.getByName("127.0.0.1"));
            thread=new Thread(() -> { while(!closed) { try (Socket client=socket.accept()) { handle(client); } catch(Exception e) { if(!closed) failure=e; } } },"workspace-loopback");
            thread.start();
        }
        String origin() { return "http://127.0.0.1:"+socket.getLocalPort(); }
        void handle(Socket client) throws Exception {
            BufferedReader reader=new BufferedReader(new InputStreamReader(client.getInputStream(),StandardCharsets.UTF_8));
            String[] request=reader.readLine().split(" "); int length=0; String cookie="", line;
            while((line=reader.readLine())!=null && !line.isEmpty()) {
                if(line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) length=Integer.parseInt(line.substring(15).trim());
                if(line.toLowerCase(java.util.Locale.ROOT).startsWith("cookie:")) cookie=line.substring(7).trim();
            }
            if(!cookie.contains("next-auth.session-token=local-fixture")) throw new AssertionError("Fixture session was not forwarded");
            char[] data=new char[length]; int offset=0; while(offset<length) { int n=reader.read(data,offset,length-offset); if(n<0) break; offset+=n; }
            if (expired) { respond(client,401,"application/json","{\"error\":\"Expired fixture\"}".getBytes(StandardCharsets.UTF_8)); return; }
            if (request[1].endsWith("/recording")) { audioReads.incrementAndGet(); respond(client,200,"audio/wav",wave()); return; }
            if (request[0].equals("PATCH") && failSave) { respond(client,400,"application/json","{\"error\":\"Fixture save failure\"}".getBytes(StandardCharsets.UTF_8)); return; }
            JSONObject response;
            if(request[1].equals("/api/user/profile")) {
                if(request[0].equals("PATCH")) { name=new JSONObject(new String(data)).getString("name"); patches.incrementAndGet(); response=new JSONObject().put("success",true).put("user",new JSONObject().put("id",1).put("name",name).put("email","fixture@example.invalid").put("phone", "")); }
                else { profileReads.incrementAndGet(); response=new JSONObject().put("user",new JSONObject().put("id",1).put("name",name).put("email","fixture@example.invalid").put("phone","").put("roles",new JSONArray().put("vendor"))
                    .put("vendorPermissions",new JSONObject()).put("vendor",new JSONObject().put("id",2).put("businessName","Loopback only"))).put("capabilities",new JSONObject().put("calls",true)); }
            } else if(request[1].equals("/api/mobile/dashboard")) {
                dashboardReads.incrementAndGet();
                response=new JSONObject(NativeAppearanceActivityTest.DASHBOARD);
            } else if(request[1].startsWith("/api/ai-features/calls?")) {
                callReads.incrementAndGet(); int page=request[1].contains("page=2")?2:1;
                String query=NativeWorkspacePolicy.query(origin()+request[1],"search","");
                int which=query.equals("Caller 2")?2:page;
                JSONArray rows=new JSONArray();
                if(query.isEmpty() || query.equals("Caller 2")) rows.put(new JSONObject().put("id","call-"+which).put("customerName","Caller "+which).put("customerPhone","5550100").put("status","completed").put("timestamp","2026-01-01T12:00:00Z").put("duration",20).put("transcript","Caller: Synthetic local recording.\nTrisha: No real customer data is used.").put("hasRecording",true).put("recordingUrl","/api/calls/call-"+which+"/recording"));
                response=new JSONObject().put("currentPage",page).put("totalPages",query.isEmpty()?2:rows.length()).put("totalCalls",query.isEmpty()?2:rows.length()).put("calls",rows);
            } else throw new AssertionError("Unexpected local route: "+request[1]);
            byte[] bytes=response.toString().getBytes(StandardCharsets.UTF_8);
            respond(client,200,"application/json",bytes);
        }
        static void respond(Socket client,int code,String type,byte[] bytes) throws Exception {
            OutputStream out=client.getOutputStream();out.write(("HTTP/1.1 "+code+" Fixture\r\nContent-Type: "+type+"\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(bytes);out.flush();
        }
        static byte[] wave() {
            int frames=20*8000;
            java.nio.ByteBuffer b=java.nio.ByteBuffer.allocate(44+frames*2).order(java.nio.ByteOrder.LITTLE_ENDIAN);
            b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36+frames*2).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short)1).putShort((short)1).putInt(8000).putInt(16000).putShort((short)2).putShort((short)16).put("data".getBytes(StandardCharsets.US_ASCII)).putInt(frames*2);
            for(int i=0;i<frames;i++)b.putShort((short)(120*Math.sin(2*Math.PI*330*i/8000)));
            return b.array();
        }
        public void close() throws Exception { closed=true; socket.close(); thread.join(2000); }
    }
}
