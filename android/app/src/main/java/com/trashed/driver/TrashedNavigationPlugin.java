package com.trashed.driver;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "TrashedNavigation")
public class TrashedNavigationPlugin extends Plugin {
    @PluginMethod public void setState(PluginCall call) {
        MainActivity host = (MainActivity) getActivity();
        long document = host.navigationDocument();
        host.runOnUiThread(() -> {
            if (document != host.navigationDocument() || host.navigationLoading()) {
                call.reject("Wait for the current page to finish loading.", "UNAVAILABLE"); return;
            }
            if (!host.canPresentNavigation()) {
                call.reject("Navigation is unavailable on this page.", "UNTRUSTED_ORIGIN"); return;
            }
            try {
                NativeNavigationState state = new NativeNavigationState(object(call.getData(), 0));
                host.setNativeNavigation(state, new NativeBottomNavigation.Listener() {
                    @Override public void select(NativeNavigationState.Selection selection) {
                        notifyListeners("select", new JSObject().put("context", selection.context)
                            .put("revision", selection.revision).put("id", selection.id));
                    }
                    @Override public void reset(String context) {
                        notifyListeners("reset", new JSObject().put("context", context));
                    }
                });
                call.resolve(new JSObject().put("context", state.context).put("revision", state.revision));
            } catch (IllegalArgumentException error) {
                call.reject("Invalid or stale navigation state.", error.getMessage());
            }
        });
    }
    @PluginMethod public void clear(PluginCall call) {
        MainActivity host = (MainActivity) getActivity();
        long document = host.navigationDocument();
        host.runOnUiThread(() -> {
            if (document != host.navigationDocument() || !host.canPresentNavigation()) {
                call.resolve(new JSObject()); return; // Navigation already reset this document.
            }
            try {
                if (call.getData().length() != 1 || !call.getData().has("context")) throw new IllegalArgumentException("INVALID_STATE");
                String context = NativeNavigationState.context(call.getData().opt("context"));
                if (document == host.navigationDocument()) host.clearNativeNavigation(context);
                call.resolve(new JSObject());
            } catch (IllegalArgumentException error) { call.reject("Invalid navigation context.", "INVALID_STATE"); }
        });
    }
    // Bounded conversion keeps validation independent of Android/Capacitor for compiled tests.
    private static Map<String, Object> object(JSONObject value, int depth) {
        if (depth > 4 || value.length() > 8) throw new IllegalArgumentException("INVALID_STATE");
        Map<String, Object> result = new HashMap<>(); Iterator<String> keys = value.keys();
        while (keys.hasNext()) { String key = keys.next(); result.put(key, plain(value.opt(key), depth + 1)); }
        return result;
    }
    private static Object plain(Object value, int depth) {
        if (value instanceof JSONObject) return object((JSONObject) value, depth);
        if (!(value instanceof JSONArray)) return value;
        JSONArray array = (JSONArray) value;
        if (depth > 4 || array.length() > 20) throw new IllegalArgumentException("INVALID_STATE");
        List<Object> result = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) result.add(plain(array.opt(i), depth + 1));
        return result;
    }
}
