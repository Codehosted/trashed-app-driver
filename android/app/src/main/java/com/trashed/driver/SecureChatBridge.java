package com.trashed.driver;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.MessageHandler;
import java.net.URI;
import java.util.Collections;
import org.json.JSONObject;

/** Keep saved background-plugin callbacks on Capacitor's legacy response transport,
 * but never expose TrashedChat through the frame-blind JavascriptInterface. */
final class SecureChatBridge {
    static final String CHANNEL = "trashedChatBridge";

    public static final class LegacyBridgeGate {
        private final MessageHandler handler;
        LegacyBridgeGate(MessageHandler handler) { this.handler = handler; }
        @JavascriptInterface public void postMessage(String data) {
            try {
                if (!"TrashedChat".equals(new JSONObject(data).optString("pluginId"))) handler.postMessage(data);
            } catch (Exception ignored) { /* Malformed messages fail closed. */ }
        }
    }

    static String origin(String value) {
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme(), host = uri.getHost();
            if (host == null || uri.getRawUserInfo() != null || !("https".equals(scheme) || "http".equals(scheme))) return "";
            int port = uri.getPort();
            if (("https".equals(scheme) && port == 443) || ("http".equals(scheme) && port == 80)) port = -1;
            return new URI(scheme, null, host.toLowerCase(java.util.Locale.ROOT), port, null, null, null).toString();
        } catch (Exception ignored) { return ""; }
    }

    static boolean install(WebView view, MessageHandler handler, String serverUrl) {
        final String allowed = origin(serverUrl);
        if (allowed.isEmpty() || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
            || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false;
        boolean listenerInstalled = false;
        try {
            WebViewCompat.addWebMessageListener(view, CHANNEL, Collections.singleton(allowed),
                (webView, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || !allowed.equals(sourceOrigin.toString())) return;
                    try {
                        String data = message.getData();
                        if ("TrashedChat".equals(new JSONObject(data).optString("pluginId"))) handler.postMessage(data);
                    } catch (Exception ignored) { /* No generic/native fallback for chat. */ }
                });
            listenerInstalled = true;
            // Installed before Capacitor's document-start script. Replace the facade,
            // not the Java object's method (which may be non-writable in WebView).
            WebViewCompat.addDocumentStartJavaScript(view,
                "(() => { if (window !== window.top || location.origin !== " + JSONObject.quote(allowed) + ") return;"
                + "const legacy = window.androidBridge; const chat = window.trashedChatBridge;"
                + "if (!legacy || !chat) return;"
                + "const post = legacy.postMessage.bind(legacy); const secure = chat.postMessage.bind(chat);"
                + "Object.defineProperty(window, 'androidBridge', {configurable:false, writable:false, value:{"
                + "postMessage(data) { const parsed = JSON.parse(data);"
                + "if (parsed.pluginId === 'TrashedChat') secure(data); else post(data); }}}); })();",
                Collections.singleton(allowed));
            return true;
        } catch (Exception ignored) {
            if (listenerInstalled) WebViewCompat.removeWebMessageListener(view, CHANNEL);
            return false;
        }
    }
}
