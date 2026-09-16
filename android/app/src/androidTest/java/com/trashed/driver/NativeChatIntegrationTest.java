package com.trashed.driver;

import android.content.Context;
import android.content.ContextWrapper;
import android.view.ContextThemeWrapper;
import android.widget.EditText;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeChatIntegrationTest {
    static final String ORIGIN = "https://trashed.app";
    static JSONObject payload() throws Exception {
        return new JSONObject("{\"version\":1,\"context\":\"testcontext\",\"revision\":1,\"appearance\":\"light\",\"scopeKey\":\"" + "a".repeat(64) + "\",\"conversationId\":\"test\",\"title\":\"Trisha\",\"input\":{\"value\":\"\",\"placeholder\":\"Ask Trisha\",\"disabled\":false,\"sendActionId\":\"send\",\"stopActionId\":\"stop\"},\"messages\":[],\"conversations\":[],\"suggestions\":[],\"actions\":[{\"id\":\"send\",\"kind\":\"send\",\"label\":\"Send\"},{\"id\":\"stop\",\"kind\":\"stop\",\"label\":\"Stop\",\"disabled\":true}],\"unsupported\":[]}");
    }
    @Test public void textAndActionValidation() throws Exception {
        JSONObject data = payload();
        data.getJSONArray("messages").put(new JSONObject().put("id", "message").put("role", "assistant").put("text", "Hello\n**world** 👩‍💻"));
        NativeChatState state = new NativeChatState(data, ORIGIN);
        assertTrue(state.enabled("send")); assertFalse(state.enabled("stop"));
        data.getJSONArray("actions").getJSONObject(0).put("label", "x".repeat(81));
        assertThrows(IllegalArgumentException.class, () -> new NativeChatState(data, ORIGIN));
    }
    @Test public void boundsAndNoCommands() throws Exception {
        JSONObject data = payload(); data.put("javascript", "alert(1)");
        assertThrows(IllegalArgumentException.class, () -> new NativeChatState(data, ORIGIN));
        data.remove("javascript");
        for (int i = 0; i < 511; i++) data.getJSONArray("actions").put(new JSONObject().put("id", "action" + i).put("kind", "component").put("label", "Action"));
        assertThrows(IllegalArgumentException.class, () -> new NativeChatState(data, ORIGIN));
        assertThrows(IllegalArgumentException.class, () -> NativeChatState.text("\u0001", 10, true));
    }
    @Test public void exactOriginRouteAndImages() {
        assertTrue(MainActivity.isAssistantURL(ORIGIN + "/vendor/assistant?test=1", ORIGIN));
        for (String url : new String[]{"https://evil.test/vendor/assistant", "http://trashed.app/vendor/assistant", "https://trashed.app:444/vendor/assistant", ORIGIN + "/vendor/%61ssistant", ORIGIN + "/app/login", ORIGIN + "/vendor/assistant/extra", "https://evil@trashed.app/vendor/assistant"}) assertFalse(url, MainActivity.isAssistantURL(url, ORIGIN));
        assertTrue(NativeChatState.safeImage(ORIGIN + "/logo.png", ORIGIN));
        assertFalse(NativeChatState.safeImage("javascript:alert(1)", ORIGIN));
        assertFalse(NativeChatState.safeImage("https://evil.test/logo.png", ORIGIN));
    }
    @Test public void encryptedCacheScopeSessionExpiry() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Context isolated = new ContextWrapper(target) { @Override public java.io.File getNoBackupFilesDir() { return new java.io.File(super.getNoBackupFilesDir(), "chat-test-only"); } };
        NativeChatCache cache = new NativeChatCache(isolated); cache.purge();
        NativeChatState state = new NativeChatState(payload(), ORIGIN);
        long now = System.currentTimeMillis();
        assertNull(cache.read(ORIGIN, state.scopeKey, now));
        cache.confirm(ORIGIN, state.scopeKey, "test-session"); cache.write(ORIGIN, state, now);
        assertNotNull(cache.read(ORIGIN, state.scopeKey, now));
        assertNull(cache.read("https://another.test", state.scopeKey, now));
        cache.confirm(ORIGIN, state.scopeKey, "different-session");
        assertNull(cache.read(ORIGIN, state.scopeKey, now));
        cache.write(ORIGIN, state, now);
        assertNull(cache.read(ORIGIN, state.scopeKey, now + NativeChatCache.TTL_MS + 1));
        cache.purge();
    }
    @Test public void composerIdentityAndPendingDraftSurviveRevision() throws Exception {
        NativeChatState initial = new NativeChatState(payload(), ORIGIN);
        JSONObject data = payload().put("revision", 2);
        NativeChatState next = new NativeChatState(data, ORIGIN);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Context themed = new ContextThemeWrapper(InstrumentationRegistry.getInstrumentation().getTargetContext(), androidx.appcompat.R.style.Theme_AppCompat);
            NativeChatView view = new NativeChatView(themed, ORIGIN, new NativeChatView.Events() {
                public boolean allowed() { return true; }
                public void event(String kind, String context, int revision, String id, String value) {}
            });
            view.render(initial, false);
            EditText draft = view.findViewWithTag("native-chat-composer");
            draft.setText("pending draft"); draft.setSelection(4); draft.requestFocus();
            view.render(next, false);
            assertSame(draft, view.findViewWithTag("native-chat-composer"));
            assertEquals("pending draft", draft.getText().toString()); assertEquals(4, draft.getSelectionStart());
            assertTrue(draft.hasFocus()); view.dispose();
        });
    }
}
