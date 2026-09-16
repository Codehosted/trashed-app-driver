package com.trashed.driver;

import android.view.View;
import android.view.ViewGroup;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;

/** Declarative native surface; business actions remain in the authenticated web controller. */
@CapacitorPlugin(name = "TrashedChat")
public class TrashedChatPlugin extends Plugin implements NativeChatView.Events {
    private NativeChatState state;
    private NativeChatView view;
    private NativeChatCache cache;
    private String session;
    private String ticketId, ticketContext, inputIdentity, inputSession;
    private int ticketRevision;
    private long ticketExpires, inputDocument;
    private PluginCall inputCall;
    private boolean inputCancelled;
    private final Set<String> retired = new HashSet<>();
    private MainActivity host() { return (MainActivity) getActivity(); }
    @Override public void load() { host().runOnUiThread(() -> host().attachNativeChat(this)); }

    @PluginMethod public void pickFiles(PluginCall call) { host().runOnUiThread(() -> {
        if (!beginInput(call)) return;
        android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(android.content.Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE, true)
            .putExtra(android.content.Intent.EXTRA_MIME_TYPES, new String[]{"text/*", "application/json", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/*"});
        try { startActivityForResult(call, intent, "filesSelected"); }
        catch (RuntimeException error) { finishInput(call, null, "The system file picker is unavailable."); }
    }); }
    @PluginMethod public void dictate(PluginCall call) { host().runOnUiThread(() -> {
        if (!beginInput(call)) return;
        android.content.Intent intent = new android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            .putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Dictate a draft for Trisha. Nothing is sent until you choose Send.")
            .putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try { startActivityForResult(call, intent, "speechRecognized"); }
        catch (RuntimeException error) { finishInput(call, null, "Speech recognition is unavailable. Enable an Android speech provider or use keyboard dictation."); }
    }); }
    private boolean beginInput(PluginCall call) {
        try {
            NativeChatState.keys(call.getData(), "context revision id", "");
            if (inputCall != null || !allowed() || ticketId == null || android.os.SystemClock.elapsedRealtime() > ticketExpires
                || !ticketId.equals(call.getString("id")) || !ticketContext.equals(call.getString("context"))
                || call.getInt("revision", -1) != ticketRevision || !state.context.equals(ticketContext)) throw new IllegalArgumentException();
            inputCancelled = false; inputCall = call; inputIdentity = state.context + ":" + state.scopeKey + ":" + state.conversationId;
            inputSession = session; inputDocument = host().navigationDocument(); ticketId = null;
            return true;
        } catch (IllegalArgumentException error) { call.reject("Tap a current chat input control first.", "STALE_ACTION"); return false; }
    }
    private boolean inputCurrent(PluginCall call) {
        return call == inputCall && !inputCancelled && state != null && host().chatBridgeMainFrameOnly()
            && inputDocument == host().navigationDocument() && inputSession.equals(host().chatSession())
            && MainActivity.isAssistantURL(getBridge().getWebView().getUrl(), host().chatOrigin())
            && inputIdentity.equals(state.context + ":" + state.scopeKey + ":" + state.conversationId);
    }
    @com.getcapacitor.annotation.ActivityCallback private void speechRecognized(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null || call != inputCall) return;
        if (!inputCurrent(call) || result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) { finishInput(call, new JSObject().put("cancelled", true), null); return; }
        java.util.ArrayList<String> results = result.getData().getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
        try { String text = results == null || results.isEmpty() ? "" : results.get(0); NativeChatState.text(text, 4000, true); finishInput(call, new JSObject().put("text", text), null); }
        catch (IllegalArgumentException error) { finishInput(call, null, "The dictated text is too long. Record a shorter message."); }
    }
    @com.getcapacitor.annotation.ActivityCallback private void filesSelected(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null || call != inputCall) return;
        if (!inputCurrent(call) || result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) { finishInput(call, new JSObject().put("cancelled", true), null); return; }
        java.util.LinkedHashSet<android.net.Uri> selected = new java.util.LinkedHashSet<>();
        android.content.Intent data = result.getData();
        if (data.getClipData() != null) for (int i=0; i<data.getClipData().getItemCount(); i++) selected.add(data.getClipData().getItemAt(i).getUri());
        else if (data.getData() != null) selected.add(data.getData());
        if (selected.isEmpty() || selected.size() > 8) { finishInput(call, null, "Select up to eight files at a time."); return; }
        getBridge().execute(() -> {
            org.json.JSONArray files = new org.json.JSONArray(); String failure = null; int total = 0;
            try {
                for (android.net.Uri uri : selected) {
                    if (!"content".equals(uri.getScheme()) || (getContext().getPackageName()+".fileprovider").equals(uri.getAuthority())) throw new java.io.IOException();
                    android.content.ContentResolver resolver = getContext().getContentResolver(); String name = null;
                    try (android.database.Cursor cursor = resolver.query(uri, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) { if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0); }
                    if (name == null || name.length() > 255 || name.matches(".*[\\x00-\\x1f/\\\\].*") || !name.toLowerCase(java.util.Locale.ROOT).matches(".*\\.(csv|txt|json|pdf|docx|png|jpg|jpeg|webp)$")) throw new java.io.IOException();
                    byte[] bytes = NativeChatCache.readBounded(resolver.openInputStream(uri), 12 * 1024 * 1024);
                    total += bytes.length; if (total > 24 * 1024 * 1024) throw new java.io.IOException();
                    String type = resolver.getType(uri);
                    files.put(new org.json.JSONObject().put("name", name).put("type", type == null ? "application/octet-stream" : type).put("base64", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)));
                }
            } catch (Exception error) { failure = "Choose supported files up to 12 MiB each and 24 MiB total."; }
            String error = failure; host().runOnUiThread(() -> finishInput(call, new JSObject().put("files", files), error));
        });
    }
    private void finishInput(PluginCall call, JSObject result, String error) {
        if (inputCall != call) return;
        boolean current = inputCurrent(call), settled = inputCancelled;
        inputCall = null; inputIdentity = null; inputSession = null; inputDocument = 0; inputCancelled = false;
        if (settled) { getBridge().releaseCall(call); return; }
        if (!current) call.resolve(new JSObject().put("cancelled", true));
        else if (error != null) call.reject(error, "INPUT_FAILED"); else call.resolve(result);
        getBridge().releaseCall(call);
    }
    @Override protected android.os.Bundle saveInstanceState() { return null; }

    @PluginMethod public void setState(PluginCall call) {
        MainActivity host = host(); long document = host.navigationDocument();
        host.runOnUiThread(() -> {
            if (document != host.navigationDocument() || !host.canPresentChat()) {
                call.reject("Chat is unavailable on this page.", "UNAVAILABLE"); return;
            }
            try {
                NativeChatState next = new NativeChatState(call.getData(), host.chatOrigin());
                if (retired.contains(next.context) || (state != null && state.context.equals(next.context) && next.revision <= state.revision))
                    throw new IllegalArgumentException("STALE_STATE");
                String currentSession = host.chatSession();
                if (session != null && !session.equals(currentSession)) reset(true, true);
                if (state != null && !state.scopeKey.equals(next.scopeKey)) reset(true, true);
                if (state != null && !state.context.equals(next.context)) {
                    if (retired.size() >= 256) throw new IllegalArgumentException("STALE_STATE");
                    retired.add(state.context);
                }
                session = currentSession;
                if (cache == null) cache = new NativeChatCache(host);
                // scopeKey is the server-generated user/vendor digest from this authenticated document.
                cache.confirm(host.chatOrigin(), next.scopeKey, currentSession);
                if (view == null) {
                    view = new NativeChatView(host, host.chatOrigin(), this);
                    host.showNativeChat(view);
                }
                state = next;
                org.json.JSONObject saved = cache.read(host.chatOrigin(), next.scopeKey, System.currentTimeMillis());
                org.json.JSONObject status = next.json.optJSONObject("status");
                if (saved != null && next.json.optJSONArray("messages").length() == 0 && status != null
                    && "loading".equals(status.optString("kind")) && next.conversationId.equals(saved.optString("conversationId"))) {
                    view.render(new NativeChatState(saved, host.chatOrigin()), true);
                } else {
                    view.render(next, false);
                    cache.write(host.chatOrigin(), next, System.currentTimeMillis());
                }
                call.resolve(new JSObject().put("context", next.context).put("revision", next.revision));
            } catch (IllegalArgumentException error) {
                call.reject("Invalid or stale chat state.", error.getMessage());
            }
        });
    }
    @PluginMethod public void clear(PluginCall call) {
        long document = host().navigationDocument();
        host().runOnUiThread(() -> {
            try {
                NativeChatState.keys(call.getData(), "context", "");
                String context = NativeChatState.pattern(call.getData().opt("context"), "[A-Za-z0-9_-]{1,80}");
                if (document == host().navigationDocument() && state != null && state.context.equals(context)) reset(false, false);
                call.resolve();
            } catch (IllegalArgumentException error) { call.reject("Invalid chat context.", "INVALID_STATE"); }
        });
    }
    @Override public boolean allowed() {
        return state != null && host().canPresentChat() && session != null && session.equals(host().chatSession());
    }
    @Override public void event(String kind, String context, int revision, String id, String value) {
        if (!allowed() || !state.context.equals(context) || state.revision != revision) return;
        if (!("action".equals(kind) || "draft".equals(kind))) return;
        if ("action".equals(kind) && !state.enabled(id)) return;
        if ("draft".equals(kind) && (!id.equals(state.json.optJSONObject("input").optString("sendActionId")) || state.json.optJSONObject("input").optBoolean("disabled"))) return;
        try { if (value != null) NativeChatState.text(value, 4000, true); } catch (IllegalArgumentException ignored) { return; }
        JSObject event = new JSObject().put("context", context).put("revision", revision).put("id", id);
        if (value != null) event.put("value", value);
        if ("action".equals(kind)) { ticketId = id; ticketContext = context; ticketRevision = revision; ticketExpires = android.os.SystemClock.elapsedRealtime() + 3000; }
        notifyListeners(kind, event);
    }
    void reset(boolean notify, boolean purge) {
        ticketId = null;
        // Capacitor keeps one lastPluginCallId across both activity launchers. Retain the
        // cancelled call/lock until its result returns, or an old picker can settle a new call.
        if (inputCall != null && !inputCancelled) { inputCancelled = true; inputCall.resolve(new JSObject().put("cancelled", true)); }
        NativeChatState old = state;
        if (old != null) retired.add(old.context);
        state = null; session = null;
        if (view != null) { view.dispose(); host().hideNativeChat(view); view = null; }
        if (purge) { if (cache == null) cache = new NativeChatCache(host()); cache.purge(); }
        if (notify && old != null) notifyListeners("reset", new JSObject().put("context", old.context));
    }
    void newDocument() { reset(true, !MainActivity.isAssistantURL(getBridge().getWebView().getUrl(), host().chatOrigin())); retired.clear(); }
    boolean dismissDialog() { return view != null && view.dismissDialog(); }
    void pause() { dismissDialog(); if (view != null) view.setVisibility(View.INVISIBLE); }
    void resume() { if (state != null && !allowed()) reset(true, true); else if (view != null) view.setVisibility(View.VISIBLE); }
}
