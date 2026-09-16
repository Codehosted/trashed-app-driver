package com.trashed.driver;

import org.json.JSONArray;
import org.json.JSONObject;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Versioned, bounded semantic projection. No HTML, script, arbitrary URL or native command dispatch. */
final class NativeChatState {
    static final int MAX_BYTES = 1024 * 1024;
    final JSONObject json;
    final String context, scopeKey, conversationId;
    final int revision;
    final boolean dark;
    final Map<String, JSONObject> actions = new LinkedHashMap<>();
    private final Set<String> nodeIds = new HashSet<>();
    private final List<String> references = new ArrayList<>();
    private int nodes;

    NativeChatState(JSONObject source, String origin) {
        require(source.toString().getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES);
        try { json = new JSONObject(source.toString()); } catch (Exception error) { throw invalid(); }
        keys(json, "version context revision appearance scopeKey conversationId title input messages conversations suggestions actions unsupported", "subtitle status screen");
        require(number(json.opt("version"), 1, 1) == 1);
        context = pattern(json.opt("context"), "[A-Za-z0-9_-]{1,80}");
        revision = integer(json.opt("revision"), 1, Integer.MAX_VALUE);
        scopeKey = pattern(json.opt("scopeKey"), "[a-f0-9]{64}");
        conversationId = text(json.opt("conversationId"), 96, false);
        dark = choice(json.opt("appearance"), "light dark").equals("dark");
        text(json.opt("title"), 100, false); optionalText(json, "subtitle", 120);
        JSONObject input = obj(json.opt("input"));
        keys(input, "value placeholder disabled sendActionId stopActionId", "");
        text(input.opt("value"), 4000, true); text(input.opt("placeholder"), 160, false); bool(input.opt("disabled"));
        references.add(id(input.opt("sendActionId"))); references.add(id(input.opt("stopActionId")));
        if (json.has("status")) {
            JSONObject status = obj(json.opt("status")); keys(status, "kind text", "");
            choice(status.opt("kind"), "loading error notice"); text(status.opt("text"), 300, false);
        }
        JSONArray unsupported = array(json.opt("unsupported"), 16);
        for (int i = 0; i < unsupported.length(); i++) text(unsupported.opt(i), 140, false);
        require(unsupported.length() == 0); // Do not silently take over a screen with missing features.
        JSONArray messages = array(json.opt("messages"), 80);
        Set<String> messagesSeen = new HashSet<>();
        for (int i = 0; i < messages.length(); i++) {
            JSONObject message = obj(messages.opt(i));
            keys(message, "id role text", "time attachments actions components presentation");
            if (message.has("presentation")) choice(message.opt("presentation"), "measured");
            require(messagesSeen.add(id(message.opt("id")))); choice(message.opt("role"), "assistant user");
            text(message.opt("text"), 8000, true); optionalText(message, "time", 64);
            if (message.has("attachments")) {
                JSONArray attachments = array(message.opt("attachments"), 8);
                for (int a = 0; a < attachments.length(); a++) {
                    JSONObject attachment = obj(attachments.opt(a)); keys(attachment, "id filename label", "");
                    id(attachment.opt("id")); text(attachment.opt("filename"), 120, false); text(attachment.opt("label"), 80, false);
                }
            }
            if (message.has("actions")) validateActions(array(message.opt("actions"), 8));
            if (message.has("components")) {
                JSONArray children = array(message.opt("components"), 100);
                for (int c = 0; c < children.length(); c++) node(obj(children.opt(c)), 1, origin);
            }
        }
        validateActions(array(json.opt("actions"), 512));
        if (json.has("screen")) {
            JSONObject screen = obj(json.opt("screen")); keys(screen, "toolbar composer accessory overlay", "footer");
            for (String slot : Arrays.asList("toolbar", "composer", "accessory", "overlay", "footer")) {
                if (!screen.has(slot)) continue;
                JSONArray list = array(screen.opt(slot), 100);
                for (int i = 0; i < list.length(); i++) node(obj(list.opt(i)), 1, origin);
            }
        }
        JSONArray conversations = array(json.opt("conversations"), 50);
        for (int i = 0; i < conversations.length(); i++) {
            JSONObject item = obj(conversations.opt(i)); keys(item, "id title detail selected", "pinned");
            references.add(id(item.opt("id"))); text(item.opt("title"), 100, false); text(item.opt("detail"), 140, true); bool(item.opt("selected")); optionalBool(item, "pinned");
        }
        JSONArray suggestions = array(json.opt("suggestions"), 24);
        for (int i = 0; i < suggestions.length(); i++) {
            JSONObject item = obj(suggestions.opt(i)); keys(item, "id title prompt", "starred");
            references.add(id(item.opt("id"))); text(item.opt("title"), 90, false); text(item.opt("prompt"), 500, false); optionalBool(item, "starred");
        }
        for (String reference : references) require(actions.containsKey(reference));
        require("send".equals(actions.get(input.optString("sendActionId")).optString("kind")));
        require("stop".equals(actions.get(input.optString("stopActionId")).optString("kind")));
    }

    private void validateActions(JSONArray list) {
        for (int i = 0; i < list.length(); i++) {
            JSONObject action = obj(list.opt(i)); keys(action, "id kind label", "disabled destructive");
            String actionId = id(action.opt("id")); require(!actions.containsKey(actionId));
            choice(action.opt("kind"), "send stop reset suggestion conversation approve deny component");
            text(action.opt("label"), 80, false); optionalBool(action, "disabled"); optionalBool(action, "destructive");
            actions.put(actionId, action);
        }
    }
    private void node(JSONObject node, int depth, String origin) {
        require(depth <= 12 && ++nodes <= 1000);
        keys(node, "id type", "text value actionId disabled children props style box accessibilityLabel");
        optionalText(node, "accessibilityLabel", 300);
        if (node.has("box")) {
            JSONObject box = obj(node.opt("box")); keys(box, "x y width height", "");
            number(box.opt("x"), -8192, 8192); number(box.opt("y"), -8192, 8192);
            number(box.opt("width"), 0, 16384); number(box.opt("height"), 0, 16384);
        }
        require(nodeIds.add(id(node.opt("id"))));
        String type = choice(node.opt("type"), "text inline card row column button badge image input list link map");
        optionalText(node, "text", 8000); optionalText(node, "value", 4000); optionalBool(node, "disabled");
        if (node.has("actionId")) references.add(id(node.opt("actionId")));
        if (Arrays.asList("button", "link", "input").contains(type)) require(node.has("actionId"));
        if (node.has("props")) {
            JSONObject props = obj(node.opt("props")); keys(props, "", "src placeholder inputType markers lines raster");
            if (props.has("raster")) { require(type.equals("image")); rasterBytes(obj(props.opt("raster"))); }
            optionalText(props, "placeholder", 160);
            if (props.has("inputType")) choice(props.opt("inputType"), "text email phone date number textarea");
            if (props.has("src")) require(safeImage(text(props.opt("src"), 2048, false), origin));
            if (props.has("markers")) {
                JSONArray markers = array(props.opt("markers"), 250);
                for (int i = 0; i < markers.length(); i++) {
                    JSONObject marker = obj(markers.opt(i)); keys(marker, "id label latitude longitude", "");
                    text(marker.opt("id"), 100, false); text(marker.opt("label"), 300, true); coordinate(marker);
                }
            }
            if (props.has("lines")) {
                JSONArray lines = array(props.opt("lines"), 30);
                for (int i = 0; i < lines.length(); i++) {
                    JSONObject line = obj(lines.opt(i)); keys(line, "points", ""); JSONArray points = array(line.opt("points"), 500);
                    for (int p = 0; p < points.length(); p++) { JSONObject point = obj(points.opt(p)); keys(point, "latitude longitude", ""); coordinate(point); }
                }
            }
        }
        if (type.equals("image")) require(node.optJSONObject("props") != null && (node.optJSONObject("props").has("src") || node.optJSONObject("props").has("raster")));
        if (node.has("style")) {
            JSONObject style = obj(node.opt("style")); keys(style, "", "foreground background fontSize fontWeight radius padding gap lineHeight letterSpacing borderWidth borderColor paddingTop paddingRight paddingBottom paddingLeft textAlign opacity fontFamily");
            for (String color : Arrays.asList("foreground", "background", "borderColor")) if (style.has(color)) pattern(style.opt(color), "#[a-fA-F0-9]{6}");
            if (style.has("lineHeight")) number(style.opt("lineHeight"), 8, 80);
            if (style.has("letterSpacing")) number(style.opt("letterSpacing"), -4, 12);
            if (style.has("borderWidth")) number(style.opt("borderWidth"), 0, 8);
            if (style.has("opacity")) number(style.opt("opacity"), 0, 1);
            for (String side : Arrays.asList("paddingTop", "paddingRight", "paddingBottom", "paddingLeft")) if (style.has(side)) number(style.opt(side), 0, 64);
            if (style.has("textAlign")) choice(style.opt("textAlign"), "left center right");
            if (style.has("fontFamily")) choice(style.opt("fontFamily"), "system arial geist jakarta mono");
            if (style.has("fontWeight")) choice(style.opt("fontWeight"), "regular medium semibold bold");
            if (style.has("fontSize")) number(style.opt("fontSize"), 8, 40);
            if (style.has("radius")) number(style.opt("radius"), 0, 40);
            if (style.has("padding")) number(style.opt("padding"), 0, 32);
            if (style.has("gap")) number(style.opt("gap"), 0, 24);
        }
        if (node.has("children")) {
            JSONArray children = array(node.opt("children"), 100);
            if (type.equals("inline")) for (int i = 0; i < children.length(); i++) require(Arrays.asList("text", "inline").contains(obj(children.opt(i)).optString("type")));
            for (int i = 0; i < children.length(); i++) node(obj(children.opt(i)), depth + 1, origin);
        }
    }
    static byte[] rasterBytes(JSONObject raster) {
        keys(raster, "base64 width height", "");
        int width = integer(raster.opt("width"), 1, 512), height = integer(raster.opt("height"), 1, 512);
        String encoded = text(raster.opt("base64"), 196608, false);
        require(encoded.length() % 4 == 0 && encoded.matches("[A-Za-z0-9+/]+={0,2}"));
        byte[] bytes;
        try { bytes = android.util.Base64.decode(encoded, android.util.Base64.NO_WRAP); } catch (IllegalArgumentException e) { throw invalid(); }
        require(bytes.length >= 33);
        byte[] signature = {(byte)137,80,78,71,13,10,26,10};
        for (int i = 0; i < signature.length; i++) require(bytes[i] == signature[i]);
        java.nio.ByteBuffer header = java.nio.ByteBuffer.wrap(bytes);
        require(header.getInt(8) == 13 && header.getInt(12) == 0x49484452 && header.getInt(16) == width && header.getInt(20) == height);
        android.graphics.BitmapFactory.Options bounds = new android.graphics.BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
        android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        require(bounds.outWidth == width && bounds.outHeight == height && "image/png".equals(bounds.outMimeType));
        return bytes;
    }
    private static void coordinate(JSONObject point) { number(point.opt("latitude"), -90, 90); number(point.opt("longitude"), -180, 180); }
    static boolean safeImage(String value, String origin) {
        try {
            URI uri = new URI(value); URI expected = new URI(origin);
            return "https".equals(uri.getScheme()) && uri.getRawUserInfo() == null && uri.getFragment() == null
                && ((Objects.equals(uri.getHost(), expected.getHost()) && uri.getPort() == expected.getPort() && "https".equals(expected.getScheme()))
                    || ("trashed.app".equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443)));
        } catch (Exception ignored) { return false; }
    }
    boolean enabled(String id) { JSONObject action = actions.get(id); return action != null && !action.optBoolean("disabled"); }
    static JSONObject obj(Object value) { require(value instanceof JSONObject); return (JSONObject) value; }
    static JSONArray array(Object value, int max) { require(value instanceof JSONArray && ((JSONArray) value).length() <= max); return (JSONArray) value; }
    static String id(Object value) { return pattern(value, "[a-z][a-z0-9_-]{0,63}"); }
    static String pattern(Object value, String regex) { require(value instanceof String && ((String) value).matches(regex)); return (String) value; }
    static String text(Object value, int max, boolean empty) {
        require(value instanceof String); String string = (String) value;
        require(string.length() <= max && (empty || !string.trim().isEmpty()));
        for (int i = 0; i < string.length(); i++) { char c = string.charAt(i); require(!(c < 32 && c != '\n' && c != '\r' && c != '\t') && !(c >= 127 && c <= 159)); }
        return string;
    }
    static void optionalText(JSONObject value, String key, int max) { if (value.has(key)) text(value.opt(key), max, true); }
    static void bool(Object value) { require(value instanceof Boolean); }
    static void optionalBool(JSONObject value, String key) { if (value.has(key)) bool(value.opt(key)); }
    static String choice(Object value, String options) { require(value instanceof String && Arrays.asList(options.split(" ")).contains(value)); return (String) value; }
    static double number(Object value, double min, double max) { require(value instanceof Number); double number = ((Number) value).doubleValue(); require(Double.isFinite(number) && number >= min && number <= max); return number; }
    static int integer(Object value, int min, int max) { double n = number(value, min, max); require(n == Math.floor(n)); return (int) n; }
    static void keys(JSONObject value, String required, String optional) {
        Set<String> allowed = new HashSet<>();
        for (String key : (required + " " + optional).split(" ")) if (!key.isEmpty()) allowed.add(key);
        for (String key : required.split(" ")) if (!key.isEmpty()) require(value.has(key));
        Iterator<String> keys = value.keys(); while (keys.hasNext()) require(allowed.contains(keys.next()));
    }
    static void require(boolean valid) { if (!valid) throw invalid(); }
    static IllegalArgumentException invalid() { return new IllegalArgumentException("INVALID_STATE"); }
}
