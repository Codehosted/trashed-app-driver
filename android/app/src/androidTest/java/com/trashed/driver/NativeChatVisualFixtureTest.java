package com.trashed.driver;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ScrollView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.*;
import static androidx.test.espresso.action.ViewActions.*;
import static androidx.test.espresso.matcher.ViewMatchers.*;
import static org.hamcrest.Matchers.is;

@RunWith(AndroidJUnit4.class)
public class NativeChatVisualFixtureTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private NativeChatPreviewActivity activity;
    private void main(Runnable action) { instrumentation.runOnMainSync(action); instrumentation.waitForIdleSync(); }
    private void screenshot(String name) throws Exception {
        instrumentation.waitForIdleSync(); SystemClock.sleep(350);
        Bitmap screen = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(screen);
        File dir = new File(instrumentation.getTargetContext().getFilesDir(), "native-chat-fixture");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) { assertTrue(screen.compress(Bitmap.CompressFormat.PNG, 100, out)); }
        screen.recycle();
    }
    private void noWebViews(View view) {
        assertFalse("Fixture must be native widgets", view instanceof android.webkit.WebView);
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) noWebViews(((ViewGroup) view).getChildAt(i));
    }
    private void event(String kind, String id, String value, int revision) {
        assertTrue("Missing event " + kind + "/" + id + "/" + revision,
            activity.events.stream().anyMatch(e -> kind.equals(e.optString("kind")) && id.equals(e.optString("id"))
                && "native_fixture_context".equals(e.optString("context")) && revision == e.optInt("revision")
                && (value == null || value.equals(e.optString("value")))));
    }
    @Test public void nativeFixtureInteractionsAndScreenshots() throws Exception {
        Intent intent = new Intent().setClassName(instrumentation.getTargetContext().getPackageName(), NativeChatPreviewActivity.class.getName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = (NativeChatPreviewActivity) instrumentation.startActivitySync(intent);
        try {
            main(() -> { noWebViews(activity.chat); ((ScrollView) activity.chat.findViewWithTag("native-chat-transcript")).scrollTo(0, 0); });
            screenshot("fixture-light");
            onView(withTagValue(is("fixture-input"))).perform(scrollTo(), click(), replaceText("Local import edited"));
            main(() -> event("action", "component-label", "Local import edited", 1));
            androidx.test.espresso.Espresso.closeSoftKeyboard();
            onView(withTagValue(is("fixture-approve"))).perform(scrollTo(), click());
            main(() -> event("action", "component-approve", null, 1));
            onView(withTagValue(is("native-chat-composer"))).perform(click(), replaceText("Local fixture draft"));
            main(() -> {
                EditText composer = activity.chat.findViewWithTag("native-chat-composer");
                composer.requestFocus();
                ((android.view.inputmethod.InputMethodManager) activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)).showSoftInput(composer, android.view.inputmethod.InputMethodManager.SHOW_FORCED);
            });
            long deadline = SystemClock.uptimeMillis() + 5000;
            while (SystemClock.uptimeMillis() < deadline) {
                androidx.core.view.WindowInsetsCompat insets = androidx.core.view.ViewCompat.getRootWindowInsets(activity.chat);
                if (insets != null && insets.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime())) break;
                SystemClock.sleep(100);
            }
            main(() -> assertTrue("Keyboard must actually be visible for IME proof", androidx.core.view.ViewCompat.getRootWindowInsets(activity.chat).isVisible(androidx.core.view.WindowInsetsCompat.Type.ime())));
            screenshot("fixture-ime");
            final EditText[] original = new EditText[1];
            main(() -> {
                original[0] = activity.chat.findViewWithTag("native-chat-composer");
                original[0].setSelection(5);
                event("draft", "send", "Local fixture draft", 1);
                try { activity.fixture.put("revision", 2); activity.render(false); } catch (Exception e) { throw new AssertionError(e); }
                assertSame(original[0], activity.chat.findViewWithTag("native-chat-composer"));
                assertEquals("Local fixture draft", original[0].getText().toString());
                assertEquals(5, original[0].getSelectionStart()); assertTrue(original[0].hasFocus());
                Rect visible = new Rect(); assertTrue(original[0].getGlobalVisibleRect(visible));
                assertEquals("Composer must not be clipped", original[0].getHeight(), visible.height());
                View send = activity.chat.findViewWithTag("native-chat-send");
                assertTrue(send.getGlobalVisibleRect(visible)); assertEquals("Send must stay above IME", send.getHeight(), visible.height());
            });
            androidx.test.espresso.Espresso.closeSoftKeyboard();
            onView(withTagValue(is("native-chat-send"))).perform(click());
            main(() -> event("action", "send", "Local fixture draft", 2));
            screenshot("fixture-after-interaction");
            main(() -> {
                try { activity.fixture.put("appearance", "dark").put("revision", 3); activity.render(false); }
                catch (Exception e) { throw new AssertionError(e); }
                ((ScrollView) activity.chat.findViewWithTag("native-chat-transcript")).scrollTo(0, 0);
                android.widget.TextView schedule = activity.chat.findViewWithTag("schedule-title");
                assertEquals("Explicit container foreground must inherit in dark mode", android.graphics.Color.parseColor("#201A2A"), schedule.getCurrentTextColor());
                EditText field = activity.chat.findViewWithTag("fixture-input");
                assertTrue("Input touch target >=48dp", field.getMinimumHeight() >= Math.round(48 * field.getResources().getDisplayMetrics().density));
            });
            screenshot("fixture-dark");
            main(() -> {
                try { activity.render(true); } catch (Exception e) { throw new AssertionError(e); }
                assertFalse(activity.chat.findViewWithTag("native-chat-composer").isEnabled());
                assertFalse(activity.chat.findViewWithTag("native-chat-send").isEnabled());
                assertFalse(activity.chat.findViewWithTag("fixture-approve").isEnabled());
                int before = activity.events.size(); activity.chat.findViewWithTag("fixture-approve").performClick();
                assertEquals("Cached UI emits no actions", before, activity.events.size());
            });
            screenshot("fixture-cached");
            File dir = new File(instrumentation.getTargetContext().getFilesDir(), "native-chat-fixture");
            try (FileOutputStream out = new FileOutputStream(new File(dir, "events.json"))) { out.write(new org.json.JSONArray(activity.events).toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
        } finally { main(() -> activity.finish()); }
    }
}
