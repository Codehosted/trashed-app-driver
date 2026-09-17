package com.trashed.driver;

import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.*;
import android.webkit.CookieManager;
import android.view.View;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.BridgeWebViewClient;
import com.google.android.material.appbar.MaterialToolbar;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.Test;

/** Actual production Activity/client callbacks, OS cookie jar and loopback HTTP. No release seam. */
public class NativeWorkspaceShellTest {
    static final String COOKIE = "next-auth.session-token.987654321";
    static Object field(Object owner, String name) {
        try { java.lang.reflect.Field f=owner.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(owner); }
        catch(Exception e) { throw new AssertionError(e); }
    }
    static void invoke(MainActivity a, String name) {
        try { java.lang.reflect.Method m=MainActivity.class.getDeclaredMethod(name);m.setAccessible(true);m.invoke(a); }
        catch(Exception e) { throw new AssertionError(e); }
    }
    static NativeWorkspaceView workspace(MainActivity a) { return (NativeWorkspaceView)field(a,"nativeWorkspace"); }
    interface Check { boolean ready(MainActivity a); }
    static void await(ActivityScenario<MainActivity> scenario, String label, Check check) throws Exception {
        long end=android.os.SystemClock.uptimeMillis()+10000;
        while(android.os.SystemClock.uptimeMillis()<end) {
            boolean[] ok={false};scenario.onActivity(a->ok[0]=check.ready(a)); if(ok[0])return;Thread.sleep(40);
        }
        scenario.onActivity(a->fail(label+": url="+a.getBridge().getWebView().getUrl()+" loading="+a.navigationLoading()+" bypass="+field(a,"nativeWorkspaceBypass")+" overlay="+workspace(a)));
    }
    static String js(ActivityScenario<MainActivity> scenario,String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        scenario.onActivity(a->a.getBridge().getWebView().evaluateJavascript(script,v->{value.set(v);done.countDown();}));
        assertTrue(done.await(5,TimeUnit.SECONDS));return value.get();
    }
    static Set<String> cookies(String url) {
        String value=CookieManager.getInstance().getCookie(url);
        return value==null?new TreeSet<>():new TreeSet<>(Arrays.asList(value.split(";\\s*")));
    }
    static void cookie(String origin,String value) throws Exception {
        CountDownLatch done=new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->CookieManager.getInstance().setCookie(origin,value,ok->{assertTrue(ok);done.countDown();}));
        assertTrue(done.await(5,TimeUnit.SECONDS));CookieManager.getInstance().flush();
    }
    @Test public void actualActivityRoutesBackAndExplicitWebFallbackUseLoopbackSession() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences prefs=context.getSharedPreferences(MainActivity.ONBOARDING_PREFERENCES,Context.MODE_PRIVATE);
        boolean had=prefs.contains(MainActivity.ONBOARDING_VERSION_KEY);int original=prefs.getInt(MainActivity.ONBOARDING_VERSION_KEY,0);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->CookieManager.getInstance().setAcceptCookie(true));
        Set<String> production=cookies("https://trashed.app");
        try(ShellServer server=new ShellServer()) {
            Set<String> prior=cookies(server.origin());
            assertTrue("Never overwrite an existing cookie",prior.stream().noneMatch(v->v.startsWith(COOKIE+"=")));
            assertTrue(prefs.edit().putInt(MainActivity.ONBOARDING_VERSION_KEY,0).commit());
            try {
                try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
                    AtomicReference<WebView> originalWeb=new AtomicReference<>();AtomicInteger blocked=new AtomicInteger();
                    scenario.onActivity(a->{
                        assertEquals(MainActivity.class,a.getClass());
                        assertNotNull(field(a,"onboardingOverlay"));
                        MainActivity.OnboardingWebView web=(MainActivity.OnboardingWebView)a.getBridge().getWebView();
                        assertFalse("Intro blocks initial production navigation",web.appNavigationEnabled);assertNull(web.getUrl());originalWeb.set(web);
                        try {
                            Class<?> type=Class.forName("com.trashed.driver.MainActivity$AuthConfig");
                            java.lang.reflect.Constructor<?> ctor=type.getDeclaredConstructor(String.class,String.class,String.class,String.class,String.class);ctor.setAccessible(true);
                            Object config=ctor.newInstance(server.origin(),server.origin()+"/vendor",server.origin()+"/api/auth/mobile/login",server.origin()+"/api/auth/mobile/google/config",server.origin()+"/api/auth/mobile/google");
                            java.lang.reflect.Field f=MainActivity.class.getDeclaredField("authConfig");f.setAccessible(true);f.set(a,config);
                        } catch(Exception e){throw new AssertionError(e);}
                        BridgeWebViewClient actual=a.getBridge().getWebViewClient();
                        a.getBridge().setWebViewClient(new BridgeWebViewClient(a.getBridge()) {
                            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r) {
                                boolean local=NativeWorkspaceHistory.isSameOriginURL(r.getUrl().toString(),server.origin());
                                if(!local)blocked.incrementAndGet();
                                String html=local?"<!doctype html><title>Loopback shell</title><input id='draft' value='retained'><p id='web-only'>Synthetic full web workspace</p>":"Blocked non-loopback request";
                                return new WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
                            }
                            @Override public void onPageStarted(WebView v,String u,android.graphics.Bitmap b){actual.onPageStarted(v,u,b);}
                            @Override public void onPageFinished(WebView v,String u){actual.onPageFinished(v,u);}
                            @Override public void doUpdateVisitedHistory(WebView v,String u,boolean r){actual.doUpdateVisitedHistory(v,u,r);}
                        });
                    });
                    cookie(server.origin(),COOKIE+"=local-shell-fixture; Path=/; HttpOnly; SameSite=Lax");
                    scenario.onActivity(a->a.getWindow().getDecorView().findViewWithTag("native-onboarding-back").performClick());
                    await(scenario,"onboarding resumes synthetic session",a->!a.navigationLoading() && (server.origin()+"/vendor").equals(a.getBridge().getWebView().getUrl()));
                    scenario.onActivity(a->{assertNull(field(a,"loginOverlay"));assertTrue(a.canPresentNavigation());});
                    assertEquals("true",js(scenario,"document.getElementById('draft').value='direct retained draft';true"));
                    AtomicInteger forwarded = new AtomicInteger();
                    NativeNavigationState directState = new NativeNavigationState(Map.of(
                        "version", 1, "context", "direct-fixture", "revision", 1, "visible", true, "appearance", "light",
                        "tabs", Arrays.asList(
                            Map.of("id", "vendor-profile", "label", "Profile", "icon", "profile", "badge", 0, "selected", false, "items", Collections.emptyList()),
                            Map.of("id", "vendor-call-history", "label", "Calls", "icon", "calls", "badge", 0, "selected", false, "items", Collections.emptyList()),
                            Map.of("id", "vendor-orders", "label", "Orders", "icon", "manage", "badge", 0, "selected", false, "items", Collections.emptyList()))));
                    scenario.onActivity(a -> a.setNativeNavigation(directState, new NativeBottomNavigation.Listener() {
                        public void select(NativeNavigationState.Selection selection) { forwarded.incrementAndGet(); }
                        public void reset(String context) { }
                    }));
                    long[] sourceDocument = {0}; int[] sourceHistory = {0};
                    scenario.onActivity(a -> { sourceDocument[0] = a.navigationDocument(); sourceHistory[0] = originalWeb.get().copyBackForwardList().getSize(); });
                    for (String id : new String[]{"vendor-profile", "vendor-call-history"}) {
                        scenario.onActivity(a -> ((NativeBottomNavigation.Listener)field(field(a,"nativeNavigation"),"listener")).select(new NativeNavigationState.Selection(directState,id)));
                        await(scenario,"direct native " + id,a -> workspace(a)!=null);
                        scenario.moveToState(Lifecycle.State.CREATED); scenario.moveToState(Lifecycle.State.RESUMED);
                        scenario.onActivity(a -> {
                            assertNotNull(workspace(a)); assertEquals(server.origin()+"/vendor", originalWeb.get().getUrl());
                            assertEquals(sourceDocument[0],a.navigationDocument()); assertEquals(sourceHistory[0],originalWeb.get().copyBackForwardList().getSize());
                            if (id.equals("vendor-profile")) a.getOnBackPressedDispatcher().onBackPressed();
                            else {
                                MaterialToolbar toolbar = (MaterialToolbar)workspace(a).getChildAt(0);
                                boolean clicked = false;
                                for (int i = 0; i < toolbar.getChildCount(); i++) {
                                    View child = toolbar.getChildAt(i);
                                    if ("Back".contentEquals(child.getContentDescription() == null ? "" : child.getContentDescription())) { child.performClick(); clicked = true; break; }
                                }
                                assertTrue("Actual toolbar Back control",clicked);
                            }
                            assertNull(workspace(a)); assertEquals(server.origin()+"/vendor",originalWeb.get().getUrl());
                            assertEquals(sourceDocument[0],a.navigationDocument()); assertEquals(sourceHistory[0],originalWeb.get().copyBackForwardList().getSize());
                        });
                        assertEquals("\"direct retained draft\"",js(scenario,"document.getElementById('draft').value"));
                        assertEquals("Native selection must not invoke JS fallback",0,forwarded.get());
                    }
                    AtomicReference<NativeBottomNavigation.Listener> retiredListener = new AtomicReference<>();
                    scenario.onActivity(a -> {
                        retiredListener.set((NativeBottomNavigation.Listener)field(field(a,"nativeNavigation"),"listener"));
                        retiredListener.get().select(new NativeNavigationState.Selection(directState,"vendor-profile"));
                        assertNotNull(workspace(a));
                        a.clearNativeNavigation("unrelated-context");
                        assertNotNull("Late clear from unrelated owner must not dismiss",workspace(a));
                        a.clearNativeNavigation(directState.context);
                        assertNull("Clearing current navigation owner must revoke direct screen",workspace(a));
                        retiredListener.get().select(new NativeNavigationState.Selection(directState,"vendor-profile"));
                        assertNull("Retired listener cannot reopen direct screen",workspace(a));
                        NativeNavigationState replacement = new NativeNavigationState(Map.of(
                            "version",1,"context","replacement-fixture","revision",1,"visible",true,"appearance","light",
                            "tabs",Collections.singletonList(Map.of("id","vendor-profile","label","Profile","icon","profile","badge",0,"selected",false,"items",Collections.emptyList()))));
                        a.setNativeNavigation(replacement,new NativeBottomNavigation.Listener(){
                            public void select(NativeNavigationState.Selection s){forwarded.incrementAndGet();}
                            public void reset(String context){}
                        });
                        retiredListener.get().select(new NativeNavigationState.Selection(directState,"vendor-profile"));
                        assertNull("Same session with a new owner rejects stale selection",workspace(a));
                        ((NativeBottomNavigation.Listener)field(field(a,"nativeNavigation"),"listener")).select(new NativeNavigationState.Selection(replacement,"vendor-profile"));
                        assertNotNull(workspace(a));
                        a.setNativeNavigation(directState,new NativeBottomNavigation.Listener(){
                            public void select(NativeNavigationState.Selection s){forwarded.incrementAndGet();}
                            public void reset(String context){}
                        });
                        assertNull("Owner replacement must dismiss existing native screen",workspace(a));
                        assertEquals(sourceDocument[0],a.navigationDocument());
                    });
                    assertEquals("Retired actions never reach fallback",0,forwarded.get());
                    scenario.onActivity(a -> ((NativeBottomNavigation.Listener)field(field(a,"nativeNavigation"),"listener")).select(new NativeNavigationState.Selection(directState,"vendor-orders")));
                    assertEquals("Unconverted action remains functional",1,forwarded.get());
                    scenario.onActivity(a -> ((NativeBottomNavigation.Listener)field(field(a,"nativeNavigation"),"listener")).select(new NativeNavigationState.Selection(directState,"vendor-profile")));
                    await(scenario,"direct profile before cookie revoke",a -> workspace(a)!=null);
                    cookie(server.origin(),COOKIE+"=; Path=/; Max-Age=0");
                    await(scenario,"cookie revocation dismisses direct lease",a -> workspace(a)==null && field(a,"nativeRoute")==null);
                    scenario.onActivity(a -> { assertEquals(sourceDocument[0],a.navigationDocument()); assertEquals(server.origin()+"/vendor",originalWeb.get().getUrl()); });
                    cookie(server.origin(),COOKIE+"=local-shell-fixture; Path=/; HttpOnly; SameSite=Lax");
                    assertEquals("true",js(scenario,"document.getElementById('draft').value='shell draft';history.pushState({},'', '/vendor/profile');true"));
                    await(scenario,"real shell native profile",a->workspace(a)!=null && NativeWorkspaceRegressionTest.text(workspace(a),"Shell Fixture")!=null);
                    scenario.onActivity(a->{assertSame(originalWeb.get().getParent(),workspace(a).getParent());assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS,originalWeb.get().getImportantForAccessibility());});
                    NativeWorkspaceRegressionTest.screenshot("shell-profile.png");
                    scenario.onActivity(a->a.getOnBackPressedDispatcher().onBackPressed());
                    await(scenario,"native back restores web root",a->workspace(a)==null && (server.origin()+"/vendor").equals(originalWeb.get().getUrl()));
                    assertEquals("\"shell draft\"",js(scenario,"document.getElementById('draft').value"));
                    assertEquals("true",js(scenario,"history.pushState({},'', '/calls/history');true"));
                    await(scenario,"real shell native calls",a->workspace(a)!=null && NativeWorkspaceRegressionTest.text(workspace(a),"No calls match your search.")!=null);
                    AtomicReference<NativeWorkspaceView> calls=new AtomicReference<>();scenario.onActivity(a->calls.set(workspace(a)));
                    // Actual toolbar and dialog, not Host.web invocation or a standalone view.
                    scenario.onActivity(a->((MaterialToolbar)workspace(a).getChildAt(0)).showOverflowMenu());
                    onView(withText("More call tools · Web")).perform(click());
                    onView(withText("Full call workspace (favorites & forwarding)")).perform(click());
                    await(scenario,"explicit full-call stays web after document commit",a->!a.navigationLoading() && workspace(a)==null && (server.origin()+"/calls/history").equals(originalWeb.get().getUrl()));
                    int callsRead=server.calls.get();
                    scenario.moveToState(Lifecycle.State.CREATED);scenario.moveToState(Lifecycle.State.RESUMED);
                    scenario.onActivity(a->{assertNull("Resume must not recreate native overlay above explicit web",workspace(a));assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO,originalWeb.get().getImportantForAccessibility());});
                    assertEquals("\"Synthetic full web workspace\"",js(scenario,"document.getElementById('web-only').textContent"));
                    NativeWorkspaceRegressionTest.screenshot("shell-full-call-web.png");
                    assertEquals(callsRead,server.calls.get());
                    scenario.onActivity(a->a.getOnBackPressedDispatcher().onBackPressed());
                    await(scenario,"back from full web returns native calls",a->workspace(a)!=null && "calls".equals(workspace(a).destination));
                    scenario.onActivity(a->{assertNotSame(calls.get(),workspace(a));assertSame(originalWeb.get(),a.getBridge().getWebView());});
                    NativeWorkspaceRegressionTest.screenshot("shell-return-native.png");
                    assertEquals("true",js(scenario,"history.pushState({},'', '/vendor/profile?view=account');true"));
                    await(scenario,"unsupported account stays web",a->workspace(a)==null);
                    assertEquals("true",js(scenario,"history.pushState({},'', '/calls/history');true"));
                    await(scenario,"new route not poisoned by bypass",a->workspace(a)!=null && "calls".equals(workspace(a).destination));
                    assertTrue(server.profiles.get()>0);assertTrue(server.calls.get()>0);assertNull(server.failure);assertEquals(0,blocked.get());
                    android.util.Log.i("NativeWorkspaceShellTest","PASS actual MainActivity / profile back / calls / full-web commit+resume / back native / re-entry; HTTP profiles="+server.profiles+" calls="+server.calls);
                }
            } finally {
                cookie(server.origin(),COOKIE+"=; Path=/; Max-Age=0");
                assertEquals("Loopback cookies restored without clearing jar",prior,cookies(server.origin()));
                assertEquals("Production cookies untouched",production,cookies("https://trashed.app"));
                SharedPreferences.Editor restore=prefs.edit();if(had)restore.putInt(MainActivity.ONBOARDING_VERSION_KEY,original);else restore.remove(MainActivity.ONBOARDING_VERSION_KEY);
                assertTrue(restore.commit());assertEquals(had,prefs.contains(MainActivity.ONBOARDING_VERSION_KEY));assertEquals(original,prefs.getInt(MainActivity.ONBOARDING_VERSION_KEY,0));
            }
        }
    }
    static final class ShellServer implements AutoCloseable {
        final ServerSocket socket=new ServerSocket(0,20,InetAddress.getByName("127.0.0.1"));
        final AtomicInteger profiles=new AtomicInteger(),calls=new AtomicInteger();final Thread thread;volatile boolean closed;volatile Throwable failure;
        ShellServer() throws Exception {
            thread=new Thread(()->{while(!closed)try(Socket s=socket.accept()) {
                s.setSoTimeout(5000);BufferedReader r=new BufferedReader(new InputStreamReader(s.getInputStream(),StandardCharsets.UTF_8));
                String request=r.readLine(),line,cookie="";while((line=r.readLine())!=null&&!line.isEmpty())if(line.toLowerCase(Locale.ROOT).startsWith("cookie:"))cookie=line.substring(7).trim();
                assertTrue("Only synthetic loopback session authorized",cookie.contains(COOKIE+"=local-shell-fixture"));String body;
                if(request.startsWith("GET /api/user/profile ")){profiles.incrementAndGet();body="{\"user\":{\"id\":1,\"name\":\"Shell Fixture\",\"email\":\"shell@example.invalid\",\"roles\":[\"vendor\"],\"vendorPermissions\":{},\"vendor\":{\"id\":2,\"businessName\":\"Loopback only\"}},\"capabilities\":{\"calls\":true}}";}
                else if(request.startsWith("GET /api/ai-features/calls?")){calls.incrementAndGet();body="{\"currentPage\":1,\"totalPages\":0,\"totalCalls\":0,\"calls\":[]}";}
                else throw new AssertionError("Unexpected fixture request "+request);
                NativeWorkspaceRegressionTest.Fixture.respond(s,200,"application/json",body.getBytes(StandardCharsets.UTF_8));
            }catch(Throwable e){if(!closed)failure=e;}},"shell-loopback");thread.start();
        }
        String origin(){return "http://127.0.0.1:"+socket.getLocalPort();}
        public void close() throws Exception {closed=true;socket.close();thread.join(2000);}
    }
}
