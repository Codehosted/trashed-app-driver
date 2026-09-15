package com.trashed.driver;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.accessibilityservice.AccessibilityService;
import android.app.Activity;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.SystemClock;
import android.telecom.TelecomManager;
import android.text.TextUtils;
import android.util.Log;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidDialerTest {
    private static final String LOCAL_APP = "http://localhost:3000/app?source=trashed-app";
    private static final String PHONE = "tel:+12025550123";
    private static final String FIXTURE = "http://localhost:3000/__dialer_test_fixture";

    @Test
    public void syntheticWebViewPhoneLinkOpensDialerWithoutCalling() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        // Fail before launching any Activity on hardware or a non-local development build.
        assertEquals("This regression is emulator-only", "ranchu", Build.HARDWARE);
        assertTrue("The intent safety monitor requires API 26+", Build.VERSION.SDK_INT >= 26);
        try (InputStream config = context.getAssets().open("capacitor.config.json")) {
            String json = new String(config.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertEquals(LOCAL_APP, new JSONObject(json).getJSONObject("server").getString("url"));
        }
        AndroidOnboardingTest.prepareLocalState(true);
        PackageInfo installed = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
        assertFalse(Arrays.asList(installed.requestedPermissions).contains(Manifest.permission.CALL_PHONE));
        assertEquals(PackageManager.PERMISSION_DENIED, context.checkSelfPermission(Manifest.permission.CALL_PHONE));

        String dialerPackage = context.getSystemService(TelecomManager.class).getDefaultDialerPackage();
        assertNotNull("The emulator must already have a default phone app", dialerPackage);
        AtomicReference<Intent> safeIntent = new AtomicReference<>();
        AtomicInteger blockedIntents = new AtomicInteger();
        CountDownLatch navigation = new CountDownLatch(1);
        Instrumentation.ActivityMonitor monitor = new Instrumentation.ActivityMonitor() {
            @Override
            public Instrumentation.ActivityResult onStartActivity(Intent intent) {
                boolean safe = Intent.ACTION_VIEW.equals(intent.getAction()) && PHONE.equals(intent.getDataString())
                    && intent.getExtras() == null && intent.getComponent() == null && intent.getSelector() == null
                    && intent.getPackage() == null
                    && safeIntent.compareAndSet(null, new Intent(intent));
                if (!safe) blockedIntents.incrementAndGet();
                navigation.countDown();
                // Fail closed: no ACTION_CALL, privileged call, different number, or second launch can escape.
                return safe ? null : new Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null);
            }
        };
        UiAutomation automation = instrumentation.getUiAutomation();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            // Same emulator wake/lockscreen setup as AndroidReleaseTest; no login or layout manipulation.
            scenario.onActivity(activity -> activity.getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            ));
            onView(withText("Sign in to Trashed")).check(matches(isDisplayed()));
            captureScreenshot(context, automation, "native-login-regression.png");
            Log.i("TrashedDialerTest", "Captured untouched native login before loading any synthetic fixture; origin=" + LOCAL_APP);
            instrumentation.addMonitor(monitor);
            try {
                scenario.onActivity(activity -> {
                    WebView webView = activity.getBridge().getWebView();
                    // In-memory HTML, no customer data or backend route. Keep the real Capacitor WebViewClient.
                    webView.loadDataWithBaseURL(FIXTURE,
                        "<!doctype html><a id='phone' href='" + PHONE + "'>Synthetic phone regression</a>",
                        "text/html", "UTF-8", null);
                });
                assertTrue("Synthetic WebView fixture did not load", waitForFixture(scenario));
                scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
                    "document.getElementById('phone').click()", null));
                assertTrue("WebView did not dispatch the phone navigation", navigation.await(15, TimeUnit.SECONDS));
                assertEquals("Unsafe outbound intent was blocked", 0, blockedIntents.get());
                assertNotNull(safeIntent.get());
                assertEquals(Intent.ACTION_VIEW, safeIntent.get().getAction());
                assertEquals(PHONE, safeIntent.get().getDataString());
                assertTrue("System dialer did not display the synthetic number; no setup or chooser is automated",
                    waitForDialerNumber(automation, dialerPackage));
                captureScreenshot(context, automation, "dialer-regression.png");
                assertEquals("Unexpected outbound intent was blocked", 0, blockedIntents.get());
                Log.i("TrashedDialerTest", "PASS action=" + safeIntent.get().getAction() + " data=" + PHONE
                    + " dialer=" + dialerPackage + " CALL_PHONE=denied blockedIntents=" + blockedIntents.get());
            } finally {
                // Never interact with a dialer control. Back is the only system action used for cleanup.
                for (int attempt = 0; attempt < 2; attempt++) {
                    AccessibilityNodeInfo root = automation.getRootInActiveWindow();
                    if (root == null) break;
                    boolean dialerVisible = TextUtils.equals(dialerPackage, root.getPackageName());
                    root.recycle();
                    if (!dialerVisible) break;
                    automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
                    SystemClock.sleep(300);
                }
                instrumentation.removeMonitor(monitor);
            }
        }
    }

    private boolean waitForFixture(ActivityScenario<MainActivity> scenario) throws InterruptedException {
        long deadline = SystemClock.uptimeMillis() + 20_000;
        while (SystemClock.uptimeMillis() < deadline) {
            AtomicReference<String> ready = new AtomicReference<>();
            CountDownLatch callback = new CountDownLatch(1);
            scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
                "Boolean(document.getElementById('phone') && document.getElementById('phone').getAttribute('href') === '" + PHONE + "')",
                result -> { ready.set(result); callback.countDown(); }));
            if (callback.await(2, TimeUnit.SECONDS) && "true".equals(ready.get())) return true;
            SystemClock.sleep(100);
        }
        return false;
    }

    private void captureScreenshot(Context context, UiAutomation automation, String filename) throws Exception {
        Bitmap screenshot = automation.takeScreenshot();
        assertNotNull("Could not capture " + filename, screenshot);
        try (FileOutputStream output = context.openFileOutput(filename, Context.MODE_PRIVATE)) {
            assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG, 100, output));
        } finally {
            screenshot.recycle();
        }
    }

    private boolean waitForDialerNumber(UiAutomation automation, String dialerPackage) {
        long deadline = SystemClock.uptimeMillis() + 15_000;
        while (SystemClock.uptimeMillis() < deadline) {
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            if (root != null && containsDialerNumber(root, dialerPackage)) return true;
            SystemClock.sleep(100);
        }
        return false;
    }

    private boolean containsDialerNumber(AccessibilityNodeInfo root, String dialerPackage) {
        ArrayDeque<AccessibilityNodeInfo> nodes = new ArrayDeque<>();
        nodes.add(root);
        boolean found = false;
        while (!nodes.isEmpty()) {
            AccessibilityNodeInfo node = nodes.remove();
            CharSequence text = node.getText();
            if (TextUtils.equals(dialerPackage, node.getPackageName()) && text != null
                && "12025550123".equals(text.toString().replaceAll("\\D", ""))) found = true;
            for (int index = 0; index < node.getChildCount(); index++) {
                AccessibilityNodeInfo child = node.getChild(index);
                if (child != null) nodes.add(child);
            }
            node.recycle();
        }
        return found;
    }
}
