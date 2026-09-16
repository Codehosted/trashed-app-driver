package com.trashed.driver;

/** Test APK implementation; debug manifest registration only. No production auth overrides. */
public class NativeChatInputActivity extends MainActivity {
    @Override protected void onCreate(android.os.Bundle state) {
        if (!"ranchu".equals(android.os.Build.HARDWARE)) throw new SecurityException("Emulator only");
        // Capacitor feeds serverUrl into WebMessageListener's origin rules. A path
        // makes installation throw and silently enables its legacy fallback.
        config = new com.getcapacitor.CapConfig.Builder(this).setServerUrl("https://input-fixture.invalid")
            .setStartPath("/app").setUseLegacyBridge(false).setLoggingEnabled(false).create();
        // A private preference namespace prevents the real onboarding/session state being touched.
        super.onCreate(state);
        getBridge().getWebView().stopLoading();
        try {
            Class<?> auth = Class.forName("com.trashed.driver.MainActivity$AuthConfig");
            java.lang.reflect.Constructor<?> ctor = auth.getDeclaredConstructors()[0]; ctor.setAccessible(true);
            AndroidNativeChatInputTest.field(this, MainActivity.class, "authConfig", ctor.newInstance(
                "https://input-fixture.invalid", "https://input-fixture.invalid/app", "https://input-fixture.invalid/login", "https://input-fixture.invalid/config", "https://input-fixture.invalid/google"));
            for (String name : new String[]{"onboardingOverlay", "loginOverlay"}) {
                java.lang.reflect.Field f = MainActivity.class.getDeclaredField(name); f.setAccessible(true);
                android.view.View overlay = (android.view.View) f.get(this);
                if (overlay != null && overlay.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup)overlay.getParent()).removeView(overlay);
                f.set(this, null);
            }
            AndroidNativeChatInputTest.field(this, MainActivity.class, "onboardingReady", true);
            ((OnboardingWebView) getBridge().getWebView()).appNavigationEnabled = true;
            ((androidx.activity.OnBackPressedCallback) AndroidNativeChatInputTest.field(this, MainActivity.class, "onboardingBack")).setEnabled(false);
            android.webkit.CookieManager.getInstance().setCookie("https://input-fixture.invalid", "next-auth.session-token=synthetic-input-only; Secure; Path=/");
            getBridge().getWebView().loadDataWithBaseURL("https://input-fixture.invalid/vendor/assistant", "<p>Synthetic native input test — no network or sending</p>", "text/html", "UTF-8", "https://input-fixture.invalid/vendor/assistant");
        } catch (Exception error) { throw new AssertionError(error); }
    }
    @Override public android.content.SharedPreferences getSharedPreferences(String name, int mode) {
        return super.getSharedPreferences(name.equals(ONBOARDING_PREFERENCES) ? "native-input-test-onboarding" : name, mode);
    }
}
