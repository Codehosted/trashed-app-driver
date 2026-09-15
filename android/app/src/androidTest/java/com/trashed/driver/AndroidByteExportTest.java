package com.trashed.driver;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.InputStream;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidByteExportTest {
    private static final String FIXTURE = "http://localhost:3000/__byte_export_fixture";
    private static final Uri DESTINATION = Uri.parse("content://com.trashed.driver.test.byteexports/synthetic.wav");
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context context = instrumentation.getTargetContext();

    private ActivityScenario<MainActivity> launch() throws Exception {
        AndroidOnboardingTest.prepareLocalState(true); // Guards ranchu + exact localhost:3000 packaged config before launch.
        ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class);
        CountDownLatch loaded = new CountDownLatch(1);
        com.getcapacitor.WebViewListener ready = new com.getcapacitor.WebViewListener() {
            @Override public void onPageLoaded(android.webkit.WebView view) {
                if (FIXTURE.equals(view.getUrl())) loaded.countDown();
            }
        };
        scenario.onActivity(activity -> {
            assertFalse(activity.getBridge().getConfig().isLoggingEnabled());
            activity.getBridge().addWebViewListener(ready);
            activity.getBridge().getWebView().loadDataWithBaseURL(FIXTURE, "<p>Synthetic byte export</p>", "text/html", "UTF-8", FIXTURE);
        });
        boolean finished;
        try { finished = loaded.await(10, TimeUnit.SECONDS); }
        finally { scenario.onActivity(activity -> activity.getBridge().removeWebViewListener(ready)); }
        if (finished) return scenario;
        scenario.close(); throw new AssertionError("Synthetic local fixture did not finish loading");
    }

    private Call invoke(ActivityScenario<MainActivity> scenario, String method, JSObject options) throws Exception {
        Call call = new Call(method, options);
        scenario.onActivity(activity -> {
            TrashedFileExportPlugin plugin = (TrashedFileExportPlugin) activity.getBridge().getPlugin("TrashedFileExport").getInstance();
            switch (method) {
                case "begin": plugin.begin(call); break;
                case "write": plugin.write(call); break;
                case "finish": plugin.finish(call); break;
                case "cancel": plugin.cancel(call); break;
                case "saveText": plugin.saveText(call); break;
                default: throw new AssertionError(method);
            }
        });
        assertTrue("Native export did not settle: " + method, call.done.await(10, TimeUnit.SECONDS));
        return call;
    }

    private JSObject metadata(Integer expected) {
        JSObject options = new JSObject().put("filename", "synthetic.wav").put("mimeType", "audio/wav");
        if (expected != null) options.put("expectedBytes", expected);
        return options;
    }
    private JSObject id(String id) { return new JSObject().put("exportId", id); }
    private JSObject chunk(String id, long offset, byte[] bytes) {
        return id(id).put("offset", offset).put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
    }
    private void emptySpool() {
        File[] files = new File(context.getCacheDir(), "TrashedByteExports").listFiles();
        assertTrue("Private spool must be removed", files == null || files.length == 0);
    }
    private void assertNavigationListenerCount(ActivityScenario<MainActivity> scenario, int expected) {
        scenario.onActivity(activity -> {
            try {
                TrashedFileExportPlugin plugin = (TrashedFileExportPlugin) activity.getBridge().getPlugin("TrashedFileExport").getInstance();
                java.lang.reflect.Field listener = TrashedFileExportPlugin.class.getDeclaredField("navigationListener");
                java.lang.reflect.Field listeners = com.getcapacitor.Bridge.class.getDeclaredField("webViewListeners");
                listener.setAccessible(true); listeners.setAccessible(true);
                // Inspect the constructed Bridge's real dispatch list, not our registration flag.
                assertEquals(expected, java.util.Collections.frequency((java.util.List<?>) listeners.get(activity.getBridge()), listener.get(plugin)));
            } catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
        });
    }
    private Instrumentation.ActivityMonitor monitor(Uri destination, AtomicInteger count) {
        return new Instrumentation.ActivityMonitor() {
            @Override public Instrumentation.ActivityResult onStartActivity(Intent intent) {
                count.incrementAndGet();
                assertEquals(Intent.ACTION_CREATE_DOCUMENT, intent.getAction());
                assertEquals("audio/wav", intent.getType());
                assertEquals("synthetic.wav", intent.getStringExtra(Intent.EXTRA_TITLE));
                assertEquals(java.util.Collections.singleton(Intent.CATEGORY_OPENABLE), intent.getCategories());
                assertEquals(java.util.Collections.singleton(Intent.EXTRA_TITLE), intent.getExtras().keySet());
                assertNull(intent.getData()); assertNull(intent.getComponent()); assertNull(intent.getPackage()); assertEquals(0, intent.getFlags());
                // Every outbound intent is intercepted. Only this test provider can receive bytes.
                return new Instrumentation.ActivityResult(destination == null ? Activity.RESULT_CANCELED : Activity.RESULT_OK,
                    destination == null ? null : new Intent().setData(destination));
            }
        };
    }

    @Test public void actualChunkBytesSaveToTestProviderAndDestinationFailureCleans() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launch()) {
            byte[] bytes = new byte[ByteExportPolicy.MAX_CHUNK]; for (int n=0;n<bytes.length;n++) bytes[n]=(byte)(n%251);
            byte[] tail = {0, (byte)255, 7};
            Call begun = invoke(scenario, "begin", metadata(bytes.length + tail.length)); assertNull(begun.error);
            String exportId = begun.result.getString("exportId"); assertNotNull(exportId);
            Call first = invoke(scenario, "write", chunk(exportId, 0, bytes)); assertNull(first.error); assertEquals(bytes.length, first.result.getLong("offset"));
            Call last = invoke(scenario, "write", chunk(exportId, bytes.length, tail)); assertNull(last.error); assertEquals(bytes.length+3, last.result.getLong("offset"));
            AtomicInteger count = new AtomicInteger(); Instrumentation.ActivityMonitor monitor = monitor(DESTINATION, count); instrumentation.addMonitor(monitor);
            try { Call saved = invoke(scenario, "finish", id(exportId)); assertNull(saved.error); assertEquals("saved", saved.result.getString("status")); }
            finally { instrumentation.removeMonitor(monitor); }
            assertEquals(1, count.get());
            try (InputStream input = context.getContentResolver().openInputStream(DESTINATION)) {
                assertNotNull(input); byte[] actual = input.readAllBytes(); assertEquals(bytes.length+3, actual.length);
                assertArrayEquals(bytes, Arrays.copyOf(actual, bytes.length)); assertArrayEquals(tail, Arrays.copyOfRange(actual, bytes.length, actual.length));
            }
            context.getContentResolver().delete(DESTINATION, null, null); emptySpool();
            String failedId = invoke(scenario, "begin", metadata(3)).result.getString("exportId");
            assertNull(invoke(scenario, "write", chunk(failedId, 0, tail)).error);
            Instrumentation.ActivityMonitor failure = monitor(Uri.parse("content://com.trashed.driver.test.byteexports/fail"), new AtomicInteger());
            instrumentation.addMonitor(failure);
            try { assertEquals("SAVE_FAILED", invoke(scenario, "finish", id(failedId)).error); }
            finally { instrumentation.removeMonitor(failure); }
            emptySpool();
        }
    }

    @Test public void invalidChunksAndTextConcurrencyAreRejectedAndCancellationIsIdempotent() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launch()) {
            String exportId = invoke(scenario, "begin", metadata(3)).result.getString("exportId");
            assertEquals("BUSY", invoke(scenario, "saveText", new JSObject().put("filename", "synthetic.txt").put("content", "Synthetic only")).error);
            assertEquals("INVALID_OFFSET", invoke(scenario, "write", chunk(exportId, 1, new byte[]{1})).error); emptySpool();
            exportId = invoke(scenario, "begin", metadata(null)).result.getString("exportId");
            assertEquals("INVALID_CHUNK", invoke(scenario, "write", id(exportId).put("offset", 0).put("base64", "YR==")).error); emptySpool();
            exportId = invoke(scenario, "begin", metadata(null)).result.getString("exportId");
            assertNull(invoke(scenario, "cancel", id("not-the-active-id")).error);
            assertNull(invoke(scenario, "cancel", id(exportId)).error);
            assertNull(invoke(scenario, "cancel", id(exportId)).error); emptySpool();
            exportId = invoke(scenario, "begin", metadata(3)).result.getString("exportId");
            assertEquals("INCOMPLETE", invoke(scenario, "finish", id(exportId)).error); emptySpool();
        }
    }

    @Test public void pickerCancellationAndNavigationReleaseStagingWithoutOpeningSystemTarget() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launch()) {
            assertNavigationListenerCount(scenario, 0);
            String exportId = invoke(scenario, "begin", metadata(1)).result.getString("exportId");
            assertNavigationListenerCount(scenario, 1);
            assertNull(invoke(scenario, "write", chunk(exportId, 0, new byte[]{1})).error);
            AtomicInteger count = new AtomicInteger(); Instrumentation.ActivityMonitor monitor = monitor(null, count); instrumentation.addMonitor(monitor);
            try { assertEquals("cancelled", invoke(scenario, "finish", id(exportId)).result.getString("status")); }
            finally { instrumentation.removeMonitor(monitor); }
            assertEquals(1, count.get()); emptySpool();
            exportId = invoke(scenario, "begin", metadata(null)).result.getString("exportId");
            assertNavigationListenerCount(scenario, 1);
            scenario.onActivity(activity -> activity.getBridge().getWebView().loadDataWithBaseURL(FIXTURE+"-next", "<p>Synthetic navigation</p>", "text/html", "UTF-8", FIXTURE+"-next"));
            for (int n=0;n<50;n++) {
                File[] files = new File(context.getCacheDir(), "TrashedByteExports").listFiles();
                if (files == null || files.length == 0) break;
                Thread.sleep(100);
            }
            emptySpool(); assertEquals("INVALID_EXPORT", invoke(scenario, "finish", id(exportId)).error);
        }
    }

    @Test public void explicitCancelKeepsLivePickerLockedAndIdleCallbackRemovesSpool() throws Exception {
        try (ActivityScenario<MainActivity> scenario = launch()) {
            String exportId = invoke(scenario, "begin", metadata(1)).result.getString("exportId");
            assertNull(invoke(scenario, "write", chunk(exportId, 0, new byte[]{1})).error);
            AtomicReference<TrashedFileExportPlugin> plugin = new AtomicReference<>();
            scenario.onActivity(activity -> plugin.set((TrashedFileExportPlugin) activity.getBridge().getPlugin("TrashedFileExport").getInstance()));
            Call cancelled = new Call("cancel", id(exportId)), overlap = new Call("begin", metadata(1));
            Instrumentation.ActivityMonitor monitor = new Instrumentation.ActivityMonitor() {
                @Override public Instrumentation.ActivityResult onStartActivity(Intent intent) {
                    assertEquals(Intent.ACTION_CREATE_DOCUMENT, intent.getAction());
                    plugin.get().cancel(cancelled);
                    plugin.get().begin(overlap);
                    return new Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null);
                }
            };
            instrumentation.addMonitor(monitor);
            try { assertEquals("cancelled", invoke(scenario, "finish", id(exportId)).result.getString("status")); }
            finally { instrumentation.removeMonitor(monitor); }
            assertTrue(cancelled.done.await(5, TimeUnit.SECONDS)); assertNull(cancelled.error);
            assertTrue(overlap.done.await(5, TimeUnit.SECONDS)); assertEquals("BUSY", overlap.error); emptySpool();
            String idleId = invoke(scenario, "begin", metadata(null)).result.getString("exportId");
            scenario.onActivity(activity -> {
                try {
                    // Execute the scheduled production cleanup callback deterministically; no 60-second wall-clock claim.
                    java.lang.reflect.Field field = TrashedFileExportPlugin.class.getDeclaredField("idleTimeout");
                    field.setAccessible(true); ((Runnable) field.get(plugin.get())).run();
                } catch (ReflectiveOperationException failure) { throw new AssertionError(failure); }
            });
            emptySpool(); assertEquals("INVALID_EXPORT", invoke(scenario, "finish", id(idleId)).error);
        }
    }

    private static final class Call extends PluginCall {
        final CountDownLatch done = new CountDownLatch(1);
        JSObject result; String error;
        Call(String method, JSObject options) { super(null, "TrashedFileExport", java.util.UUID.randomUUID().toString(), method, options); }
        @Override public void resolve(JSObject value) { result=value; done.countDown(); }
        @Override public void reject(String message, String code) { error=code; done.countDown(); }
        @Override public void reject(String message) { error="UNEXPECTED_REJECTION"; done.countDown(); }
    }
}
