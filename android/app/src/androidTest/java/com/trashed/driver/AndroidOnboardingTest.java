package com.trashed.driver;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.assertion.ViewAssertions.doesNotExist;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.isCompletelyDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static androidx.test.espresso.matcher.ViewMatchers.withContentDescription;
import static org.junit.Assert.*;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.widget.Button;
import android.widget.ImageView;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.PixelCopy;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.core.view.WindowCompat;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidOnboardingTest {
    static final String LOCAL_APP = "http://localhost:3000/app?source=trashed-app";
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    static void prepareLocalState(boolean completed) throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("Native regression state changes are emulator-only", "ranchu", Build.HARDWARE);
        try (InputStream input = context.getAssets().open("capacitor.config.json")) {
            assertEquals(LOCAL_APP, new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8))
                .getJSONObject("server").getString("url"));
        }
        CountDownLatch cleared = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            CookieManager.getInstance().removeAllCookies(value -> cleared.countDown()));
        assertTrue(cleared.await(5, TimeUnit.SECONDS));
        CookieManager.getInstance().flush();
        assertNull("Do not assume reinstall cleared authentication", CookieManager.getInstance().getCookie(LOCAL_APP));
        assertTrue(context.getSharedPreferences(MainActivity.ONBOARDING_PREFERENCES, Context.MODE_PRIVATE)
            .edit().putInt(MainActivity.ONBOARDING_VERSION_KEY, completed ? 1 : 0).commit());
    }

    @Before public void resetUnauthenticatedLocalState() throws Exception { prepareLocalState(false); }

    private SharedPreferences preferences() {
        return context.getSharedPreferences(MainActivity.ONBOARDING_PREFERENCES, Context.MODE_PRIVATE);
    }

    private void captureIntro(ActivityScenario<MainActivity> scenario, int page) throws Exception {
        onView(withContentDescription("Trashed")).check(matches(isCompletelyDisplayed()));
        onView(withText((page + 1) + " of 3")).check(matches(isCompletelyDisplayed()));
        onView(withText(page == 0 ? "Skip" : "Back")).check(matches(isCompletelyDisplayed()));
        onView(withText(page == MainActivity.ONBOARDING_PAGES.length - 1 ? "Get started" : "Next")).check(matches(isCompletelyDisplayed()));
        CountDownLatch drawn = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            View decor = activity.getWindow().getDecorView();
            View intro = decor.findViewWithTag("native-onboarding");
            boolean dark = (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            assertEquals(dark ? Color.rgb(20, 18, 26) : Color.rgb(250, 250, 252),
                ((ColorDrawable) intro.getBackground()).getColor());
            ImageView symbol = decor.findViewWithTag("native-onboarding-symbol");
            assertNotNull("Approved symbol is beside the wordmark", symbol.getDrawable());
            assertEquals(MainActivity.ONBOARDING_PRIMARY, symbol.getImageTintList().getDefaultColor());
            int symbolSize = Math.round(28 * activity.getResources().getDisplayMetrics().density);
            assertEquals(symbolSize, symbol.getWidth());
            assertEquals(symbolSize, symbol.getHeight());
            assertEquals(Math.round(8 * activity.getResources().getDisplayMetrics().density),
                ((android.widget.LinearLayout.LayoutParams) symbol.getLayoutParams()).getMarginEnd());
            ImageView hero = decor.findViewWithTag("native-onboarding-hero");
            assertNotNull("Each page has a bundled illustration", hero.getDrawable());
            assertTrue("Hero has visible measured area", hero.getWidth() > 0 && hero.getHeight() > 0);
            assertEquals(ImageView.ScaleType.FIT_CENTER, hero.getScaleType());
            assertNull("Illustration is unframed on the canvas", hero.getBackground());
            Button next = decor.findViewWithTag("native-onboarding-next");
            assertEquals(MainActivity.ONBOARDING_PRIMARY, ((GradientDrawable) next.getBackground()).getColor().getDefaultColor());
            assertNull("Action is flat, not a gradient", ((GradientDrawable) next.getBackground()).getColors());
            assertEquals(Color.WHITE, next.getCurrentTextColor());
            assertTrue(next.getHeight() >= 48 * activity.getResources().getDisplayMetrics().density);
            assertTrue(next.getWidth() > intro.getWidth() / 2);
            assertEquals(Color.rgb(2, 6, 23),
                ((ColorDrawable) activity.findViewById(android.R.id.content).getBackground()).getColor());
            assertFalse(WindowCompat.getInsetsController(activity.getWindow(), decor).isAppearanceLightStatusBars());
            assertFalse(WindowCompat.getInsetsController(activity.getWindow(), decor).isAppearanceLightNavigationBars());
            decor.postOnAnimation(() -> decor.postOnAnimation(drawn::countDown));
        });
        assertTrue("Intro must draw before capture", drawn.await(5, TimeUnit.SECONDS));
        InstrumentationRegistry.getInstrumentation().getUiAutomation().waitForIdle(500, 5000);
        CountDownLatch copied = new CountDownLatch(1);
        AtomicReference<Bitmap> windowImage = new AtomicReference<>();
        AtomicReference<Integer> copyResult = new AtomicReference<>();
        scenario.onActivity(activity -> {
            View decor = activity.getWindow().getDecorView();
            Bitmap bitmap = Bitmap.createBitmap(decor.getWidth(), decor.getHeight(), Bitmap.Config.ARGB_8888);
            windowImage.set(bitmap);
            PixelCopy.request(activity.getWindow(), bitmap, result -> {
                copyResult.set(result);
                copied.countDown();
            }, new Handler(Looper.getMainLooper()));
        });
        assertTrue(copied.await(5, TimeUnit.SECONDS));
        assertEquals(Integer.valueOf(PixelCopy.SUCCESS), copyResult.get());
        try (FileOutputStream output = context.openFileOutput("native-intro-window-page-" + (page + 1) + ".png", Context.MODE_PRIVATE)) {
            assertTrue(windowImage.get().compress(Bitmap.CompressFormat.PNG, 100, output));
        } finally {
            windowImage.get().recycle();
        }
        Bitmap image = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(image);
        try (FileOutputStream output = context.openFileOutput("native-intro-page-" + (page + 1) + ".png", Context.MODE_PRIVATE)) {
            assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, output));
        } finally {
            image.recycle();
        }
    }

    private void assertLoginActions() {
        java.util.concurrent.atomic.AtomicInteger width = new java.util.concurrent.atomic.AtomicInteger();
        onView(withText("Continue with Google")).check((view, error) -> {
            if (error != null) throw error;
            Button button = (Button) view;
            width.set(button.getWidth());
            assertEquals(Math.round(50 * button.getResources().getDisplayMetrics().density), button.getHeight());
            assertEquals(0f, button.getElevation(), 0f);
            assertNull(button.getStateListAnimator());
            assertEquals(Math.round(14 * button.getResources().getDisplayMetrics().density),
                ((GradientDrawable) button.getBackground()).getCornerRadius(), 0f);
        });
        onView(withText("Sign In")).check((view, error) -> {
            if (error != null) throw error;
            Button button = (Button) view;
            assertEquals(width.get(), button.getWidth());
            assertEquals(Math.round(50 * button.getResources().getDisplayMetrics().density), button.getHeight());
            assertEquals(0f, button.getElevation(), 0f);
            assertNull(button.getStateListAnimator());
            assertEquals(MainActivity.ONBOARDING_PRIMARY, button.getBackgroundTintList().getDefaultColor());
            assertEquals(Color.WHITE, button.getCurrentTextColor());
        });
    }

    private ActivityScenario<MainActivity> launch() {
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(activity -> activity.getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD));
        return scenario;
    }

    private void assertBootstrapBlocked(ActivityScenario<MainActivity> scenario) {
        onView(withText("Sign in to Trashed")).check(doesNotExist());
        assertEquals(0, preferences().getInt(MainActivity.ONBOARDING_VERSION_KEY, 0));
        scenario.onActivity(activity -> {
            MainActivity.OnboardingWebView webView = (MainActivity.OnboardingWebView) activity.getBridge().getWebView();
            assertFalse(webView.appNavigationEnabled);
            assertNull("Initial remote app URL must never load behind the intro", webView.getUrl());
            assertEquals(0, webView.copyBackForwardList().getSize());
            assertFalse(webView.getSettings().getUserAgentString().contains(MainActivity.ONBOARDING_MARKER));
            webView.loadUrl("http://localhost:3000/__blocked_intro_request");
            webView.loadUrl("http://localhost:3000/__blocked_intro_request", Collections.emptyMap());
            assertNull(webView.getUrl());
        });
    }

    @Test public void freshIntroSupportsBackAndRecreationThenPersistsCompletion() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launch()) {
            onView(withText(MainActivity.ONBOARDING_PAGES[0][0])).check(matches(isDisplayed()));
            assertBootstrapBlocked(scenario);
            captureIntro(scenario, 0);
            onView(withText("Next")).perform(click());
            onView(withText(MainActivity.ONBOARDING_PAGES[1][0])).check(matches(isDisplayed()));
            onView(withText("Back")).perform(click());
            onView(withText("1 of 3")).check(matches(isDisplayed()));
            onView(withText("Next")).perform(click());
            scenario.recreate();
            onView(withText("1 of 3")).check(matches(isDisplayed()));
            assertBootstrapBlocked(scenario);
            AtomicReference<String> original = new AtomicReference<>();
            scenario.onActivity(activity -> {
                WebView webView = activity.getBridge().getWebView();
                original.set(webView.getSettings().getUserAgentString() + " ExistingMarker/7");
                webView.getSettings().setUserAgentString(original.get());
            });
            for (int page = 1; page < MainActivity.ONBOARDING_PAGES.length; page++) {
                onView(withText("Next")).perform(click());
                onView(withText(MainActivity.ONBOARDING_PAGES[page][0])).check(matches(isDisplayed()));
                captureIntro(scenario, page);
            }
            assertEquals(0, preferences().getInt(MainActivity.ONBOARDING_VERSION_KEY, 0));
            onView(withText("Get started")).perform(click());
            onView(withText("Sign in to Trashed")).check(matches(isDisplayed()));
            assertLoginActions();
            assertEquals(1, preferences().getInt(MainActivity.ONBOARDING_VERSION_KEY, 0));
            scenario.onActivity(activity -> assertEquals(original.get() + " " + MainActivity.ONBOARDING_MARKER,
                activity.getBridge().getWebView().getSettings().getUserAgentString()));
            scenario.recreate();
            onView(withText("Sign in to Trashed")).check(matches(isDisplayed()));
            scenario.onActivity(activity -> {
                String ua = activity.getBridge().getWebView().getSettings().getUserAgentString();
                assertEquals(1, ua.split(MainActivity.ONBOARDING_MARKER, -1).length - 1);
                assertTrue(((MainActivity.OnboardingWebView) activity.getBridge().getWebView()).appNavigationEnabled);
            });
        }
    }

    @Test public void skipCompletesWithoutRequestingPermissions() {
        int microphoneBefore = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO);
        int locationBefore = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION);
        int notificationsBefore = context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS);
        try (ActivityScenario<MainActivity> scenario = launch()) {
            assertBootstrapBlocked(scenario);
            onView(withText("Skip")).perform(click());
            onView(withText("Sign in to Trashed")).check(matches(isDisplayed()));
            assertLoginActions();
            assertEquals(1, preferences().getInt(MainActivity.ONBOARDING_VERSION_KEY, 0));
            assertEquals(microphoneBefore, context.checkSelfPermission(Manifest.permission.RECORD_AUDIO));
            assertEquals(locationBefore, context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION));
            assertEquals(notificationsBefore, context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS));
        }
    }

    @Test public void retainedSyntheticSessionCannotBypassIntroThenResumesLocalApp() throws Exception {
        CountDownLatch cookieSet = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            // Capacitor removes session-only cookies at bootstrap; model a retained persistent auth cookie.
            CookieManager.getInstance().setCookie(LOCAL_APP, "next-auth.session-token=synthetic-onboarding-fixture; Path=/; SameSite=Lax; Max-Age=3600",
                value -> cookieSet.countDown()));
        assertTrue(cookieSet.await(5, TimeUnit.SECONDS));
        CookieManager.getInstance().flush();
        assertTrue(CookieManager.getInstance().getCookie(LOCAL_APP).contains("synthetic-onboarding-fixture"));
        try (ActivityScenario<MainActivity> scenario = launch()) {
            onView(withText("1 of 3")).check(matches(isDisplayed()));
            assertBootstrapBlocked(scenario);
            assertTrue("Retained fixture must survive Capacitor initialization",
                CookieManager.getInstance().getCookie(LOCAL_APP).contains("synthetic-onboarding-fixture"));
            CountDownLatch navigation = new CountDownLatch(1);
            AtomicReference<String> observedUrl = new AtomicReference<>();
            onView(withText("Skip")).perform(click());
            scenario.onActivity(activity -> {
                assertTrue(((MainActivity.OnboardingWebView) activity.getBridge().getWebView()).appNavigationEnabled);
                assertTrue(CookieManager.getInstance().getCookie("http://localhost:3000").contains("synthetic-onboarding-fixture"));
            });
            long deadline = SystemClock.uptimeMillis() + 15000;
            while (navigation.getCount() > 0 && SystemClock.uptimeMillis() < deadline) {
                scenario.onActivity(activity -> {
                    observedUrl.set(activity.getBridge().getWebView().getUrl());
                    Uri url = Uri.parse(observedUrl.get() == null ? "" : observedUrl.get());
                    // A synthetic cookie is not authentication: /app may redirect before a document commits.
                    if ("http".equals(url.getScheme()) && "localhost".equals(url.getHost()) && url.getPort() == 3000
                        && ("/app".equals(url.getPath()) || "/app/login".equals(url.getPath()))) navigation.countDown();
                });
                SystemClock.sleep(100);
            }
            boolean resumed = navigation.getCount() == 0;
            assertTrue("Completed retained-session branch did not resume the configured local app: " + observedUrl.get(), resumed);
            assertEquals(1, preferences().getInt(MainActivity.ONBOARDING_VERSION_KEY, 0));
            scenario.onActivity(activity -> assertTrue(activity.getBridge().getWebView().getSettings()
                .getUserAgentString().contains(MainActivity.ONBOARDING_MARKER)));
        }
    }

    @Test public void markerPreservesOtherTokensAndIsAppendedExactlyOnce() {
        String original = "Mozilla/5.0 ExistingMarker/7 Mobile Safari/537.36";
        String completed = original + " " + MainActivity.ONBOARDING_MARKER;
        assertEquals(completed, MainActivity.completedUserAgent(original));
        assertEquals(completed, MainActivity.completedUserAgent(completed));
        assertEquals(completed + "\t", MainActivity.completedUserAgent(completed + "\t"));
    }
}
