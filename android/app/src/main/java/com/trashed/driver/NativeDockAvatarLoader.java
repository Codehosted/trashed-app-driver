package com.trashed.driver;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;

/** Profile is authenticated; public raster bytes never receive session credentials. */
final class NativeDockAvatarLoader {
    interface Host {
        String origin();
        String identity();
        long document();
        NativeWorkspaceApi.CookieSource cookies();
    }
    interface Target { void show(Bitmap bitmap, String name); }
    private final Host host;
    private final Target target;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private Future<?> pending;
    private volatile NativeWorkspaceApi api;
    private volatile HttpURLConnection imageConnection;
    private long generation, refreshed;
    private String lease = "";
    private String context = "";
    private boolean disposed;
    NativeDockAvatarLoader(Host host, Target target) { this.host = host; this.target = target; }
    private String currentLease() {
        String identity = host.identity();
        return identity.isEmpty() ? "" : host.origin() + "|" + identity + "|" + host.document() + "|" + context;
    }
    void sync(String nextContext) {
        if (disposed) return;
        context = nextContext;
        String next = currentLease();
        if (!next.equals(lease)) { clear(); context = nextContext; lease = next; }
        if (lease.isEmpty() || (pending != null && !pending.isDone()) || SystemClock.uptimeMillis() - refreshed < 30000) return;
        refreshed = SystemClock.uptimeMillis();
        final long ticket = generation;
        final String expected = lease, origin = host.origin();
        NativeWorkspaceApi request = new NativeWorkspaceApi(origin, host.cookies()); api = request;
        pending = executor.submit(() -> {
            try {
                NativeWorkspaceApi.Profile profile = request.profile();
                deliver(ticket, expected, null, profile.name);
                String url = NativeDockAvatarPolicy.imageURL(profile.image, origin);
                if (url != null) {
                    try { deliver(ticket, expected, image(url), profile.name); }
                    catch (Exception ignored) { deliver(ticket, expected, null, profile.name); }
                }
            } catch (Exception ignored) { deliver(ticket, expected, null, ""); }
        });
    }
    private void deliver(long ticket, String expected, Bitmap bitmap, String name) {
        main.post(() -> {
            if (!disposed && ticket == generation && expected.equals(lease) && expected.equals(currentLease())) target.show(bitmap, name);
        });
    }
    void clear() {
        generation++; lease = ""; refreshed = -30000;
        if (api != null) api.cancel(); api = null;
        if (imageConnection != null) imageConnection.disconnect(); imageConnection = null;
        if (pending != null) pending.cancel(true); pending = null;
        main.removeCallbacksAndMessages(null); target.show(null, "");
    }
    void dispose() { clear(); disposed = true; executor.shutdownNow(); }
    private Bitmap image(String value) throws Exception {
        // Fail closed if an implicit process cookie jar is installed. Never replace it globally.
        if (CookieHandler.getDefault() != null || Thread.currentThread().isInterrupted()) throw new IOException("Implicit cookie transport unavailable");
        HttpURLConnection connection = (HttpURLConnection)new URL(value).openConnection(); imageConnection = connection;
        try {
            connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
            connection.setConnectTimeout(5000); connection.setReadTimeout(5000);
            connection.setRequestProperty("Cookie", ""); connection.setRequestProperty("Cookie2", "");
            connection.setRequestProperty("Authorization", ""); connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Accept", "image/png,image/jpeg,image/webp,image/gif");
            if (CookieHandler.getDefault() != null || connection.getResponseCode() != 200) return null;
            String type = connection.getContentType();
            if (type == null || !type.toLowerCase(java.util.Locale.ROOT).startsWith("image/") || connection.getContentLength() > 2 * 1024 * 1024) return null;
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted() || output.size() + count > 2 * 1024 * 1024) throw new IOException("Cancelled or oversized image");
                    output.write(buffer, 0, count);
                }
            }
            byte[] bytes = output.toByteArray();
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (options.outWidth <= 0 || options.outHeight <= 0 || (long)options.outWidth * options.outHeight > 16000000L) return null;
            options.inJustDecodeBounds = false; options.inSampleSize = 1;
            while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 128) options.inSampleSize *= 2;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        } finally { connection.disconnect(); if (imageConnection == connection) imageConnection = null; }
    }
}
