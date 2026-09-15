package com.trashed.driver;

import static org.junit.Assert.*;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import androidx.activity.OnBackPressedCallback;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.WebViewListener;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidHistoryNavigationTest {
    private static final String ORIGIN = "http://localhost:3000";
    private static final String ROOT = ORIGIN + "/vendor/__native_history_root";
    private static final String DETAIL = ORIGIN + "/vendor/__native_history_detail";
    private final StringBuilder trace = new StringBuilder();
    private final AtomicReference<String> lastVisitedURL = new AtomicReference<>();

    private static Object field(Object owner, String name) throws ReflectiveOperationException {
        java.lang.reflect.Field field = owner.getClass().getDeclaredField(name);
        field.setAccessible(true); return field.get(owner);
    }

    private void recordState(ActivityScenario<MainActivity> scenario, String stage) {
        scenario.onActivity(activity -> {
            try {
                WebView view = activity.getBridge().getWebView();
                android.webkit.WebBackForwardList list = view.copyBackForwardList();
                int index = list.getCurrentIndex(); Object state = field(activity, "workspaceHistory");
                trace.append(stage).append(": url=").append(view.getUrl()).append(" origin=").append(field(field(activity, "authConfig"), "origin"))
                    .append(" index=").append(index).append(" progress=").append(view.getProgress())
                    .append(" backTarget=").append(index > 0 ? list.getItemAtIndex(index - 1).getUrl() : "none")
                    .append(" pending=").append(field(activity, "backCheckPending"))
                    .append(" floor=").append(field(state, "floor")).append(" awaiting=").append(field(state, "awaitingWorkspace"))
                    .append(" ready=").append(field(activity, "onboardingReady"))
                    .append(" login=").append(field(activity, "loginOverlay") != null).append(" intro=").append(field(activity, "onboardingOverlay") != null)
                    .append(" canGoBack=").append(view.canGoBack()).append(" callback=").append(((OnBackPressedCallback) field(activity, "historyBack")).isEnabled()).append(" eligible=").append(backEnabled(activity))
                    .append(" client=").append(activity.getBridge().getWebViewClient().getClass().getName()).append('\n');
            } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
        });
    }

    private static void invoke(MainActivity activity, String name) {
        try {
            java.lang.reflect.Method method = MainActivity.class.getDeclaredMethod(name);
            method.setAccessible(true); method.invoke(activity);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private static boolean backEnabled(MainActivity activity) {
        try {
            return (Boolean) field(activity, "historyBackAvailable");
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private void loadFixture(ActivityScenario<MainActivity> scenario, String url) throws Exception {
        CountDownLatch loaded = new CountDownLatch(1);
        WebViewListener ready = new WebViewListener() {
            @Override public void onPageLoaded(WebView view) { if (url.equals(view.getUrl())) loaded.countDown(); }
        };
        scenario.onActivity(activity -> {
            activity.getBridge().addWebViewListener(ready);
            BridgeWebViewClient actual = activity.getBridge().getWebViewClient();
            // loadDataWithBaseURL stores data: history, not HTTP history. Supply only this fixed
            // local document instead, delegating lifecycle/history to the actual production client.
            activity.getBridge().setWebViewClient(new BridgeWebViewClient(activity.getBridge()) {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    String body = url.equals(request.getUrl().toString())
                        ? "<input id='draft' value='Synthetic local draft'><p>Native history fixture only</p>" : "Blocked by synthetic test";
                    return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
                }
                @Override public void onPageStarted(WebView view, String current, android.graphics.Bitmap favicon) {
                    actual.onPageStarted(view, current, favicon);
                }
                @Override public void onPageFinished(WebView view, String current) { actual.onPageFinished(view, current); }
                @Override public void doUpdateVisitedHistory(WebView view, String current, boolean reload) {
                    lastVisitedURL.set(current);
                    actual.doUpdateVisitedHistory(view, current, reload);
                }
            });
            activity.getBridge().getWebView().loadUrl(url);
        });
        try { assertTrue("Synthetic document must finish loading", loaded.await(10, TimeUnit.SECONDS)); }
        finally { scenario.onActivity(activity -> activity.getBridge().removeWebViewListener(ready)); }
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
    }

    private String javascript(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue(done.await(5, TimeUnit.SECONDS)); return result.get();
    }

    private void awaitHistory(ActivityScenario<MainActivity> scenario, String url, boolean enabled) throws Exception {
        long deadline = android.os.SystemClock.uptimeMillis() + 5000;
        AtomicReference<Boolean> matches = new AtomicReference<>(false);
        do {
            scenario.onActivity(activity -> matches.set(url.equals(activity.getBridge().getWebView().getUrl()) && backEnabled(activity) == enabled));
            if (matches.get()) return;
            Thread.sleep(25); // Bounded condition polling, never evidence of rendering readiness.
        } while (android.os.SystemClock.uptimeMillis() < deadline);
        recordState(scenario, "await failure");
        fail("Native history URL/callback did not reach the expected state\n" + trace);
    }

    private void awaitBackCheck(ActivityScenario<MainActivity> scenario) throws Exception {
        long deadline = android.os.SystemClock.uptimeMillis() + 5000;
        AtomicReference<Boolean> pending = new AtomicReference<>(true);
        do {
            scenario.onActivity(activity -> {
                try { pending.set((Boolean) field(activity, "backCheckPending")); }
                catch (ReflectiveOperationException error) { throw new AssertionError(error); }
            });
            if (!pending.get()) break;
            Thread.sleep(25);
        } while (android.os.SystemClock.uptimeMillis() < deadline);
        assertFalse("Dialog check must settle", pending.get());
    }

    private void assertModalConsumesBack(ActivityScenario<MainActivity> scenario, String url, boolean history, boolean veto) throws Exception {
        assertEquals("true", javascript(scenario, "var modal=document.createElement('div'); modal.id='synthetic-modal';"
            + "modal.setAttribute('role','" + (veto ? "alertdialog" : "dialog") + "'); modal.setAttribute('data-state','open');"
            + "document.body.appendChild(modal); document.addEventListener('keydown', function(event) { if(event.key==='Escape') {"
            + (veto ? "event.preventDefault();" : "modal.remove();") + "} }, {once:true}); true"));
        scenario.onActivity(activity -> activity.getOnBackPressedDispatcher().onBackPressed());
        awaitBackCheck(scenario);
        awaitHistory(scenario, url, history);
        assertEquals(veto ? "true" : "false", javascript(scenario, "Boolean(document.getElementById('synthetic-modal'))"));
        assertEquals("true", javascript(scenario, "document.getElementById('synthetic-modal')?.remove(); true"));
    }

    @Test public void systemBackPopsSameDocumentHistoryAndRetainsDraftWithoutRecreatingBridge() throws Exception {
        AndroidOnboardingTest.prepareLocalState(true); // Exact localhost config and disposable emulator guard; clears any auth.
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebView> original = new AtomicReference<>();
            scenario.onActivity(activity -> {
                assertFalse(backEnabled(activity)); // Native login has priority.
                original.set(activity.getBridge().getWebView());
                invoke(activity, "hideNativeLogin"); // Test-only removal; no authentication or backend request.
            });
            loadFixture(scenario, ROOT); awaitHistory(scenario, ROOT, false);
            recordState(scenario, "root before push");
            assertEquals("push/replaceState must execute: " + trace, "true", javascript(scenario, "document.getElementById('draft').value='Retained synthetic draft'; history.pushState({},'', '/vendor/__native_history_detail'); true"));
            recordState(scenario, "after history change");
            awaitHistory(scenario, DETAIL, true);
            assertModalConsumesBack(scenario, DETAIL, true, false);
            // A same-URL push can happen while the native modal check is pending. Do not retarget Back.
            assertEquals("true", javascript(scenario, "var originalQuery=document.querySelector.bind(document);"
                + "document.querySelector=function(selector){document.querySelector=originalQuery;history.pushState({},'',location.href);return null;}; true"));
            scenario.onActivity(activity -> activity.getOnBackPressedDispatcher().onBackPressed());
            awaitBackCheck(scenario);
            scenario.onActivity(activity -> assertEquals("Changed history must consume the old Back request", 2,
                activity.getBridge().getWebView().copyBackForwardList().getCurrentIndex()));
            awaitHistory(scenario, DETAIL, true);
            // A new user Back is allowed to pop the new duplicate entry, but only that one.
            scenario.onActivity(activity -> activity.getOnBackPressedDispatcher().onBackPressed());
            long popDeadline = android.os.SystemClock.uptimeMillis() + 5000;
            AtomicReference<Integer> currentIndex = new AtomicReference<>(2);
            do {
                scenario.onActivity(activity -> currentIndex.set(activity.getBridge().getWebView().copyBackForwardList().getCurrentIndex()));
                if (currentIndex.get() == 1) break;
                Thread.sleep(25);
            } while (android.os.SystemClock.uptimeMillis() < popDeadline);
            assertEquals(Integer.valueOf(1), currentIndex.get());
            scenario.onActivity(activity -> activity.getOnBackPressedDispatcher().onBackPressed());
            awaitHistory(scenario, ROOT, false);
            assertEquals("\"Retained synthetic draft\"", javascript(scenario, "document.getElementById('draft').value"));
            scenario.onActivity(activity -> assertSame(original.get(), activity.getBridge().getWebView()));
            assertEquals("push/replaceState must execute: " + trace, "true", javascript(scenario, "history.pushState({},'', '/vendor/__native_history_detail'); true"));
            recordState(scenario, "after history change");
            awaitHistory(scenario, DETAIL, true);
            scenario.onActivity(activity -> { invoke(activity, "showNativeLogin"); assertFalse(backEnabled(activity)); });
        }
    }

    @Test public void newVisibleSessionCannotBackToOldAccountAndSessionRootUsesSystemFallback() throws Exception {
        assertTrue("This root-background regression targets Android 12+", android.os.Build.VERSION.SDK_INT >= 31);
        AndroidOnboardingTest.prepareLocalState(true);
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.content.Intent launcher = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull(launcher);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(launcher)) {
            scenario.onActivity(activity -> { assertTrue(activity.isTaskRoot()); invoke(activity, "hideNativeLogin"); });
            loadFixture(scenario, ROOT);
            assertModalConsumesBack(scenario, ROOT, false, false);
            assertModalConsumesBack(scenario, ROOT, false, true); // A nondismissable alert still consumes Back.
            recordState(scenario, "root before push");
            assertEquals("push/replaceState must execute: " + trace, "true", javascript(scenario, "history.pushState({},'', '/vendor/__native_history_detail'); true"));
            recordState(scenario, "after history change");
            awaitHistory(scenario, DETAIL, true);
            // Auth redirects may replace an entry instead of appending it. No real auth request is made.
            assertEquals("push/replaceState must execute: " + trace, "true", javascript(scenario, "history.replaceState({},'', '/app/login'); true"));
            recordState(scenario, "after history change");
            awaitHistory(scenario, ORIGIN + "/app/login", false);
            String accountB = ORIGIN + "/vendor/__native_history_account_b";
            assertEquals("push/replaceState must execute: " + trace, "true", javascript(scenario, "history.replaceState({},'', '/vendor/__native_history_account_b'); true"));
            recordState(scenario, "after history change");
            awaitHistory(scenario, accountB, false);
            recordState(scenario, "account B before root Back");
            scenario.onActivity(activity -> activity.getOnBackPressedDispatcher().onBackPressed());
            long deadline = android.os.SystemClock.uptimeMillis() + 10000;
            while (scenario.getState() != Lifecycle.State.CREATED && scenario.getState() != Lifecycle.State.DESTROYED
                && android.os.SystemClock.uptimeMillis() < deadline) Thread.sleep(25);
            if (scenario.getState() != Lifecycle.State.CREATED && scenario.getState() != Lifecycle.State.DESTROYED) {
                recordState(scenario, "root fallback wait failed at " + scenario.getState());
                fail("Framework fallback stops or finishes the instrumentation-launched root\n" + trace);
            }
            assertEquals("Fallback must not navigate to account A", accountB, lastVisitedURL.get());
            if (scenario.getState() == Lifecycle.State.CREATED) {
                scenario.moveToState(Lifecycle.State.RESUMED);
                awaitHistory(scenario, accountB, false); // Retained root resumes without a history pop.
            }
        }
    }
}
