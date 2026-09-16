package com.trashed.driver;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.EditText;
import android.widget.TextView;
import android.view.View;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeChatScreenIntegrationTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private void main(Runnable action) { instrumentation.runOnMainSync(action); instrumentation.waitForIdleSync(); }
    private static JSONObject node(String id, String type, String text) throws Exception { return new JSONObject().put("id", id).put("type", type).put("text", text); }
    private static JSONObject action(String id, String text) throws Exception { return new JSONObject().put("id", id).put("kind", "component").put("label", text); }
    @Test public void screenChromeInlineModalAndOrderedEchoes() throws Exception {
        NativeChatPreviewActivity activity = (NativeChatPreviewActivity) instrumentation.startActivitySync(new Intent().setClassName(instrumentation.getTargetContext().getPackageName(), NativeChatPreviewActivity.class.getName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        JSONObject raw = NativeChatIntegrationTest.payload();
        raw.getJSONArray("actions").put(action("screen-input", "Draft")).put(action("screen-submit", "Send")).put(action("screen-confirm", "Confirm archive")).put(action("screen-dismiss", "Back"));
        JSONObject screen = new JSONObject().put("toolbar", new JSONArray().put(node("screen-heading", "inline", "").put("children", new JSONArray().put(node("inline-a", "text", "Hello ")).put(node("inline-b", "text", "George").put("style", new JSONObject().put("fontWeight", "bold"))))))
            .put("composer", new JSONArray().put(node("screen-field", "input", "Message Trisha").put("actionId", "screen-input").put("value", "").put("props", new JSONObject().put("inputType", "textarea"))).put(node("screen-send", "button", "Send message").put("actionId", "screen-submit")))
            .put("accessory", new JSONArray().put(node("screen-notice", "text", "ISOLATED SCREEN QA — SYNTHETIC DATA"))).put("overlay", new JSONArray());
        raw.put("screen", screen);
        try {
            main(() -> {
                activity.chat.render(new NativeChatState(raw, NativeChatIntegrationTest.ORIGIN), false);
                assertEquals(View.GONE, activity.chat.findViewWithTag("native-chat-composer").getParent() instanceof View ? ((View) activity.chat.findViewWithTag("native-chat-composer").getParent()).getVisibility() : -1);
                assertEquals("Hello George", ((TextView) activity.chat.findViewWithTag("screen-heading")).getText().toString());
                EditText field = activity.chat.findViewWithTag("screen-field"); field.setText("a"); field.setText("ab"); field.setSelection(2); field.requestFocus();
                try { screen.getJSONArray("composer").getJSONObject(0).put("value", "a"); raw.put("revision", 2); } catch (Exception e) { throw new AssertionError(e); }
                activity.chat.render(new NativeChatState(raw, NativeChatIntegrationTest.ORIGIN), false);
                assertSame(field, activity.chat.findViewWithTag("screen-field")); assertEquals("ab", field.getText().toString()); assertEquals(2, field.getSelectionStart());
                try { screen.getJSONArray("composer").getJSONObject(0).put("value", "ab"); raw.put("revision", 3); } catch (Exception e) { throw new AssertionError(e); }
                activity.chat.render(new NativeChatState(raw, NativeChatIntegrationTest.ORIGIN), false);
                assertEquals("ab", field.getText().toString());
            });
            capture("screen-chrome");
            main(() -> {
                try { screen.put("overlay", new JSONArray().put(node("confirm-title", "text", "Archive this conversation?")).put(node("confirm-button", "button", "Confirm archive").put("actionId", "screen-confirm")).put(node("cancel-button", "button", "Back").put("actionId", "screen-dismiss"))); raw.put("revision", 4); }
                catch (Exception e) { throw new AssertionError(e); }
                int before = activity.events.size(); activity.chat.render(new NativeChatState(raw, NativeChatIntegrationTest.ORIGIN), false);
                assertEquals("Rendering a confirmation must not approve", before, activity.events.size());
                assertFalse(activity.chat.findViewWithTag("screen-field").isShown());
                activity.chat.findViewWithTag("confirm-button").performClick();
                assertTrue(activity.events.stream().anyMatch(e -> "screen-confirm".equals(e.optString("id")) && e.optInt("revision") == 4));
            });
            capture("screen-confirmation");
            main(() -> {
                activity.chat.render(new NativeChatState(raw, NativeChatIntegrationTest.ORIGIN), true);
                assertFalse(activity.chat.findViewWithTag("confirm-button").isEnabled());
                int before = activity.events.size(); activity.chat.findViewWithTag("confirm-button").performClick(); assertEquals(before, activity.events.size());
            });
            JSONObject map = node("street-map", "map", "Synthetic pickup route").put("props", new JSONObject().put("markers", new JSONArray().put(new JSONObject().put("id", "pickup").put("label", "Synthetic pickup").put("latitude", 39.7684).put("longitude", -86.1581))));
            screen.put("overlay", new JSONArray());
            raw.put("messages", new JSONArray().put(new JSONObject().put("id", "map-message").put("role", "assistant").put("text", "Native street map — synthetic location").put("components", new JSONArray().put(map)))).put("revision", 5);
            main(() -> activity.chat.render(new NativeChatState(raw, NativeChatIntegrationTest.ORIGIN), false));
            final int[] tiles = {0}; long deadline = android.os.SystemClock.elapsedRealtime() + 15000;
            while (tiles[0] == 0 && android.os.SystemClock.elapsedRealtime() < deadline) {
                main(() -> { NativeChatStreetMap mapView = activity.chat.findViewWithTag("street-map"); tiles[0] = mapView.visibleTilesReady() ? mapView.loadedTileCount() : 0; });
                if (tiles[0] == 0) android.os.SystemClock.sleep(100);
            }
            assertTrue("Actual OpenStreetMap street tiles must load for basemap proof", tiles[0] > 0);
            capture("screen-street-map");
        } finally { main(activity::finish); }
    }
    @Test public void legacyBridgeFallbackIsRecorded() {
        main(() -> {
            MainActivity.OnboardingWebView view = new MainActivity.OnboardingWebView(instrumentation.getTargetContext());
            assertFalse(view.legacyBridgeInstalled);
            view.addJavascriptInterface(new Object(), "unrelated"); assertFalse(view.legacyBridgeInstalled);
            view.addJavascriptInterface(new Object(), "androidBridge"); assertTrue(view.legacyBridgeInstalled);
            view.destroy();
        });
    }
    @Test public void actualBrowserProjectionRendersWithoutWebView() throws Exception {
        NativeChatPreviewActivity activity = (NativeChatPreviewActivity) instrumentation.startActivitySync(new Intent().setClassName(instrumentation.getTargetContext().getPackageName(), NativeChatPreviewActivity.class.getName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try (InputStream input = instrumentation.getContext().getAssets().open("native-chat-browser.json")) {
            JSONObject raw = new JSONObject(new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            main(() -> {
                activity.chat.render(new NativeChatState(raw, NativeChatIntegrationTest.ORIGIN), false);
                assertEquals("fixture-local-only", raw.optString("conversationId"));
                assertTrue(raw.optJSONObject("screen").optJSONArray("composer").length() > 0);
            });
            capture("actual-web-projection-native");
        } finally { main(activity::finish); }
    }
    private void capture(String name) throws Exception {
        instrumentation.waitForIdleSync();
        Bitmap bitmap = instrumentation.getUiAutomation().takeScreenshot(); assertNotNull(bitmap);
        File directory = new File(instrumentation.getTargetContext().getFilesDir(), "native-chat-fixture"); directory.mkdirs();
        try (FileOutputStream out = new FileOutputStream(new File(directory, name + ".png"))) { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)); }
        bitmap.recycle();
    }
}
