package com.trashed.driver;

import android.app.Activity;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** Test APK only. No WebView, session, cache, network, or production actions. */
public final class NativeChatPreviewActivity extends Activity {
    NativeChatView chat;
    JSONObject fixture;
    final List<JSONObject> events = new ArrayList<>();
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        try {
            try (java.io.InputStream stream = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("native-chat.json")) {
                fixture = new JSONObject(new String(stream.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            }
            chat = new NativeChatView(this, "https://trashed.app", new NativeChatView.Events() {
                public boolean allowed() { return true; }
                public void event(String kind, String context, int revision, String id, String value) {
                    try { events.add(new JSONObject().put("kind", kind).put("context", context).put("revision", revision).put("id", id).put("value", value)); }
                    catch (Exception error) { throw new AssertionError(error); }
                }
            });
            setContentView(chat);
            ViewCompat.setOnApplyWindowInsetsListener(chat, (view, insets) -> {
                androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            render(false);
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
    void render(boolean cached) throws Exception {
        chat.render(new NativeChatState(fixture, "https://trashed.app"), cached);
        boolean light = !"dark".equals(fixture.optString("appearance"));
        androidx.core.view.WindowInsetsControllerCompat bars = new androidx.core.view.WindowInsetsControllerCompat(getWindow(), chat);
        bars.setAppearanceLightStatusBars(light); bars.setAppearanceLightNavigationBars(light);
        // Clear the light theme's legacy flags as well on edge-to-edge API 35+.
        getWindow().getDecorView().setSystemUiVisibility(light ? android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
    }
    @Override public void onDestroy() { if (chat != null) chat.dispose(); super.onDestroy(); }
}
