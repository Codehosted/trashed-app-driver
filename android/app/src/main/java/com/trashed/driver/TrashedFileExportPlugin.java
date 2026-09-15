package com.trashed.driver;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import com.getcapacitor.WebViewListener;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "TrashedFileExport")
public class TrashedFileExportPlugin extends Plugin {
    private PluginCall pendingCall;
    private byte[] pendingContent;
    private ByteExportPolicy.Spool spool;
    private String byteSourceUrl;
    private boolean copying;
    private boolean navigationListenerRegistered;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Runnable idleTimeout;
    private final WebViewListener navigationListener = new WebViewListener() {
        @Override public void onPageStarted(WebView view) { cancelSpool(); }
    };

    @Override public void load() {
        ByteExportPolicy.cleanupStale(exportRoot());
    }

    private File exportRoot() { return new File(getContext().getCacheDir(), "TrashedByteExports"); }


    @PluginMethod
    public void saveText(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!TextExportPolicy.isTrustedOrigin(bridge.getWebView().getUrl(), bridge.getConfig().getServerUrl())) {
                call.reject("Open the Trashed app before exporting.", "UNTRUSTED_ORIGIN");
                return;
            }
            if (pendingCall != null || spool != null) {
                call.reject("Finish the current file export first.", "BUSY");
                return;
            }
            String filename = call.getString("filename"), content = call.getString("content");
            String error = TextExportPolicy.validationError(filename, content);
            if (call.getData().length() != 2 || error != null) {
                call.reject("Use a valid .txt filename and text up to 5 MiB.", error == null ? "INVALID_OPTIONS" : error);
                return;
            }
            pendingContent = content.getBytes(StandardCharsets.UTF_8);
            // Never retain transcript text in Capacitor's restorable call options.
            call.getData().remove("content");
            call.getData().remove("filename");
            pendingCall = call;
            try {
                startActivityForResult(call, createDocumentIntent(filename), "documentCreated");
            } catch (RuntimeException ignored) {
                finish(call, null, "The system file picker is unavailable.");
            }
        });
    }

    static Intent createDocumentIntent(String filename) {
        return new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TITLE, filename);
    }

    @PluginMethod public void begin(PluginCall call) {
        main.post(() -> {
            if (!authorized(call)) return;
            if (pendingCall != null || spool != null) { call.reject("Finish the current export first.", "BUSY"); return; }
            boolean hasExpected = call.getData().has("expectedBytes");
            Long expected = ByteExportPolicy.integer(call.getData().opt("expectedBytes"));
            if (!keys(call, hasExpected ? new String[]{"filename", "mimeType", "expectedBytes"} : new String[]{"filename", "mimeType"})
                || (hasExpected && (expected == null || expected < 1))) {
                call.reject("Invalid export options.", "INVALID_OPTIONS"); return;
            }
            String error = ByteExportPolicy.metadataError(call.getString("filename"), call.getString("mimeType"));
            if (error != null) { call.reject("Use a valid MP3 or WAV filename and media type.", error); return; }
            if (!navigationListenerRegistered) {
                // Builder replaces its listener list after plugin.load(); register only after construction.
                bridge.addWebViewListener(navigationListener);
                navigationListenerRegistered = true;
            }
            try {
                spool = new ByteExportPolicy.Spool(exportRoot(), call.getString("filename"), call.getString("mimeType"), expected);
                byteSourceUrl = bridge.getWebView().getUrl();
                touchSpool();
                call.resolve(new JSObject().put("exportId", spool.id));
            } catch (Exception ignored) { call.reject("The export could not be prepared.", "SAVE_FAILED"); }
        });
    }

    @PluginMethod public void write(PluginCall call) {
        main.post(() -> {
            if (!authorized(call) || !active(call)) return;
            if (pendingCall != null) { call.reject("The file picker is already open.", "BUSY"); return; }
            Long offset = ByteExportPolicy.integer(call.getData().opt("offset"));
            byte[] bytes = ByteExportPolicy.decode(call.getString("base64"));
            call.getData().remove("base64"); // Never retain binary payload in call state.
            if (call.getData().length() != 2 || !keys(call, "exportId", "offset") || offset == null || bytes == null) {
                clearSpool(); call.reject("Invalid export chunk.", "INVALID_CHUNK"); return;
            }
            try {
                spool.append(offset, bytes);
                touchSpool();
                call.resolve(new JSObject().put("offset", spool.offset));
            } catch (IllegalArgumentException error) {
                clearSpool(); call.reject("The export chunk could not be saved.", error.getMessage());
            } catch (Exception ignored) {
                clearSpool(); call.reject("The export chunk could not be saved.", "SAVE_FAILED");
            }
        });
    }

    @PluginMethod public void finish(PluginCall call) {
        main.post(() -> {
            if (!authorized(call) || !active(call)) return;
            if (!keys(call, "exportId")) { call.reject("Invalid export options.", "INVALID_OPTIONS"); return; }
            if (pendingCall != null) { call.reject("The file picker is already open.", "BUSY"); return; }
            try { spool.seal(); }
            catch (IllegalArgumentException error) { clearSpool(); call.reject("The export is incomplete.", error.getMessage()); return; }
            catch (Exception ignored) { clearSpool(); call.reject("The export could not be saved.", "SAVE_FAILED"); return; }
            stopTimeout();
            pendingCall = call;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(spool.mimeType).putExtra(Intent.EXTRA_TITLE, spool.file.getName());
            try { startActivityForResult(call, intent, "documentCreated"); }
            catch (RuntimeException ignored) { finish(call, null, "The system file picker is unavailable."); }
        });
    }

    @PluginMethod public void cancel(PluginCall call) {
        main.post(() -> {
            if (!authorized(call)) return;
            if (!keys(call, "exportId") || call.getString("exportId") == null) { call.reject("Invalid export options.", "INVALID_OPTIONS"); return; }
            if (spool != null && spool.id.equals(call.getString("exportId"))) cancelSpool();
            call.resolve(new JSObject());
        });
    }

    private boolean authorized(PluginCall call) {
        String current = bridge.getWebView().getUrl();
        if (TextExportPolicy.isTrustedOrigin(current, bridge.getConfig().getServerUrl())) {
            if (spool != null && !java.util.Objects.equals(byteSourceUrl, current)) cancelSpool();
            return true;
        }
        call.reject("Open the Trashed app before exporting.", "UNTRUSTED_ORIGIN"); return false;
    }

    private boolean active(PluginCall call) {
        if (spool != null && spool.id.equals(call.getString("exportId"))) return true;
        call.reject("Export is no longer active.", "INVALID_EXPORT"); return false;
    }

    private static boolean keys(PluginCall call, String... expected) {
        if (call.getData().length() != expected.length) return false;
        for (String key : expected) if (!call.getData().has(key)) return false;
        return true;
    }

    private void touchSpool() {
        stopTimeout();
        String id = spool.id;
        idleTimeout = () -> { if (spool != null && spool.id.equals(id) && pendingCall == null) clearSpool(); };
        main.postDelayed(idleTimeout, 60_000);
    }

    private void stopTimeout() {
        if (idleTimeout != null) main.removeCallbacks(idleTimeout);
        idleTimeout = null;
    }

    private void clearSpool() {
        stopTimeout();
        if (spool != null) spool.cleanup();
        spool = null;
        byteSourceUrl = null;
    }

    private void cancelSpool() {
        if (spool == null) return;
        stopTimeout();
        synchronized (spool) {
            if (spool.committed) return; // The destination was already fully written and closed.
            spool.cancelled = true;
        }
        // A live external picker keeps its lock. An active copy owns its file until it exits.
        if (copying) return;
        if (pendingCall != null) spool.cleanup();
        else clearSpool();
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        // Process death deliberately loses the pending export. Never restore its text from a Bundle.
        if (call == null || call != pendingCall || (pendingContent == null && spool == null)) return;
        if (spool != null && spool.cancelled) { finish(call, "cancelled", null); return; }
        if (result.getResultCode() != Activity.RESULT_OK) {
            finish(call, "cancelled", null);
            return;
        }
        Uri destination = result.getData() == null ? null : result.getData().getData();
        if (destination == null || !"content".equals(destination.getScheme())
            || (getContext().getPackageName() + ".fileprovider").equals(destination.getAuthority())) {
            finish(call, null, "The file picker did not provide a writable document.");
            return;
        }
        byte[] content = pendingContent;
        ByteExportPolicy.Spool operation = spool;
        copying = true;
        bridge.execute(() -> {
            String error = null;
            try (OutputStream output = getContext().getContentResolver().openOutputStream(destination, "w")) {
                if (output == null) throw new java.io.IOException();
                if (operation == null) output.write(content);
                else try (FileInputStream input = new FileInputStream(operation.file)) {
                    byte[] buffer = new byte[ByteExportPolicy.MAX_CHUNK];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (operation.cancelled) break;
                        output.write(buffer, 0, count);
                    }
                }
            } catch (Exception ignored) {
                error = "The file could not be saved. Please try again.";
            }
            String failure = error;
            boolean cancelled;
            if (operation == null) cancelled = false;
            else synchronized (operation) {
                cancelled = operation.cancelled;
                operation.committed = !cancelled && failure == null;
            }
            if (cancelled || failure != null) {
                try { android.provider.DocumentsContract.deleteDocument(getContext().getContentResolver(), destination); }
                catch (Exception ignored) { /* External providers may refuse partial-document deletion. */ }
            }
            main.post(() -> {
                copying = false;
                finish(call, cancelled ? "cancelled" : "saved", cancelled ? null : failure);
            });
        });
    }

    private void finish(PluginCall call, String status, String error) {
        if (pendingCall != call) return;
        pendingCall = null;
        pendingContent = null;
        clearSpool();
        if (error == null) call.resolve(new JSObject().put("status", status));
        else call.reject(error, "SAVE_FAILED");
        bridge.releaseCall(call);
    }

    @Override
    protected Bundle saveInstanceState() { return null; }

    @Override
    protected void handleOnDestroy() {
        bridge.removeWebViewListener(navigationListener);
        cancelSpool();
        if (copying) return;
        clearSpool();
        if (pendingCall != null) bridge.releaseCall(pendingCall);
        pendingCall = null;
        pendingContent = null;
    }
}
