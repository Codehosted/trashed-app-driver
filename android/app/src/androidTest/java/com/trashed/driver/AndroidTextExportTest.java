package com.trashed.driver;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidTextExportTest {
    private static void assertSaveIntent(Intent intent) {
        assertEquals(Intent.ACTION_CREATE_DOCUMENT, intent.getAction());
        assertEquals("text/plain", intent.getType());
        assertEquals(java.util.Collections.singleton(Intent.CATEGORY_OPENABLE), intent.getCategories());
        assertEquals("synthetic-export.txt", intent.getStringExtra(Intent.EXTRA_TITLE));
        assertEquals(java.util.Collections.singleton(Intent.EXTRA_TITLE), intent.getExtras().keySet());
        assertNull(intent.getData());
        assertNull(intent.getComponent());
        assertNull(intent.getPackage());
        assertEquals(0, intent.getFlags());
    }

    @Test public void intentOnlyOffersUserSelectedTextDocumentAndNeverRestoresContent() {
        assertSaveIntent(TrashedFileExportPlugin.createDocumentIntent("synthetic-export.txt"));
        assertNull(new TrashedFileExportPlugin().saveInstanceState());
    }

    @Test public void localSyntheticExportCancelsAndRejectsConcurrentChooserWithoutWriting() throws Exception {
        AndroidOnboardingTest.prepareLocalState(true); // Emulator + exact localhost:3000 artifact guard.
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        AtomicInteger intents = new AtomicInteger();
        AtomicReference<AssertionError> unsafeIntent = new AtomicReference<>();
        AtomicReference<TrashedFileExportPlugin> activePlugin = new AtomicReference<>();
        TrackingCall first = new TrackingCall("first"), second = new TrackingCall("second");
        Instrumentation.ActivityMonitor monitor = new Instrumentation.ActivityMonitor() {
            @Override public Instrumentation.ActivityResult onStartActivity(Intent intent) {
                try { assertSaveIntent(intent); } catch (AssertionError error) { unsafeIntent.set(error); }
                if (intents.incrementAndGet() == 1) activePlugin.get().saveText(second);
                // No system target opens and no destination is chosen or written in this regression.
                return new Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null);
            }
        };
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                assertFalse("Bridge must not log synthetic or real exports", activity.getBridge().getConfig().isLoggingEnabled());
                activity.getBridge().getWebView().loadDataWithBaseURL("http://localhost:3000/__text_export_fixture",
                    "<!doctype html><p>Synthetic local export regression</p>", "text/html", "UTF-8",
                    "http://localhost:3000/__text_export_fixture");
            });
            CountDownLatch ready = new CountDownLatch(1);
            for (int attempt = 0; attempt < 50 && ready.getCount() > 0; attempt++) {
                scenario.onActivity(activity -> {
                    WebView webView = activity.getBridge().getWebView();
                    if (TextExportPolicy.isTrustedOrigin(webView.getUrl(), AndroidOnboardingTest.LOCAL_APP)) ready.countDown();
                });
                Thread.sleep(100);
            }
            assertEquals("Local fixture did not load", 0, ready.getCount());
            instrumentation.addMonitor(monitor);
            try {
                scenario.onActivity(activity -> {
                    TrashedFileExportPlugin plugin = (TrashedFileExportPlugin) activity.getBridge().getPlugin("TrashedFileExport").getInstance();
                    activePlugin.set(plugin);
                    plugin.saveText(first);
                    assertFalse(first.getData().has("content"));
                    assertNull(plugin.saveInstanceState());
                });
                assertTrue(first.finished.await(5, TimeUnit.SECONDS));
                assertTrue(second.finished.await(5, TimeUnit.SECONDS));
                assertEquals("cancelled", first.status);
                assertNull(first.error);
                assertEquals("BUSY", second.error);
                assertEquals(1, intents.get());
                assertNull("An unexpected intent was blocked", unsafeIntent.get());
            } finally { instrumentation.removeMonitor(monitor); }
        }
    }

    private static final class TrackingCall extends PluginCall {
        final CountDownLatch finished = new CountDownLatch(1);
        String status, error;
        TrackingCall(String id) {
            super(null, "TrashedFileExport", id, "saveText", new JSObject()
                .put("filename", "synthetic-export.txt").put("content", "Synthetic text only — no customer data."));
        }
        @Override public void resolve(JSObject result) { status = result.getString("status"); finished.countDown(); }
        @Override public void reject(String message, String code) { error = code; finished.countDown(); }
        @Override public void reject(String message) { error = "UNEXPECTED_REJECTION"; finished.countDown(); }
    }
}
