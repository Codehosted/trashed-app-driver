package com.trashed.driver;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.graphics.Rect;
import android.view.View;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidReleaseTest {
    private ActivityScenario<MainActivity> launchActivity() {
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(activity -> activity.getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        ));
        return scenario;
    }

    @Test
    public void nativeLoginLaunchesAndValidatesWithoutNetworkCredentials() {
        try (ActivityScenario<MainActivity> scenario = launchActivity()) {
            onView(withText("Sign in to Trashed")).check(matches(isDisplayed()));
            onView(withText("Continue with Google")).check(matches(isDisplayed()));
            onView(withText("Sign In")).perform(click());
            onView(withText("Enter your email and password.")).check(matches(isDisplayed()));
            scenario.onActivity(activity -> assertEquals(36, activity.getApplicationInfo().targetSdkVersion));
        }
    }

    @Test
    public void webViewStaysInsideSystemBarsAndDisplayCutout() {
        try (ActivityScenario<MainActivity> scenario = launchActivity()) {
            onView(withText("Sign in to Trashed")).check(matches(isDisplayed()));
            scenario.onActivity(activity -> {
                View decor = activity.getWindow().getDecorView();
                WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(decor);
                Insets safeArea = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                Rect bounds = new Rect();
                activity.getBridge().getWebView().getGlobalVisibleRect(bounds);
                assertTrue("WebView overlaps the status bar", bounds.top >= safeArea.top);
                assertTrue("WebView overlaps the navigation bar", bounds.bottom <= decor.getHeight() - safeArea.bottom);
                assertTrue("WebView overlaps the left cutout", bounds.left >= safeArea.left);
                assertTrue("WebView overlaps the right cutout", bounds.right <= decor.getWidth() - safeArea.right);
            });
        }
    }
}
