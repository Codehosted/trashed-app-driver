package com.trashed.driver;

import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Native HTTP shares the shell's OS cookie store, not a frozen session string. */
final class NativeWorkspaceCookieStore implements NativeWorkspaceApi.CookieSource {
    private final String origin;
    NativeWorkspaceCookieStore(String origin) { this.origin = origin; }
    @Override public String get(String url) {
        if (!NativeWorkspaceHistory.isSameOriginURL(url, origin)) return "";
        String value = CookieManager.getInstance().getCookie(url);
        return value == null ? "" : value;
    }
    @Override public void receive(String url, List<String> values) {
        if (!NativeWorkspaceHistory.isSameOriginURL(url, origin) || values.isEmpty()) return;
        // CookieManager validates domain/path/expiry/secure attributes. Wait for
        // completion off-main so the request's post-response identity check sees revocations.
        if (Looper.myLooper() == Looper.getMainLooper()) throw new IllegalStateException("HTTP cookie writes must not block the UI thread");
        CountDownLatch done = new CountDownLatch(values.size());
        new Handler(Looper.getMainLooper()).post(() -> {
            for (String value : values) CookieManager.getInstance().setCookie(url, value, success -> done.countDown());
        });
        try {
            if (!done.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Cookie update timed out");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("Cookie update interrupted", interrupted);
        }
    }
}
