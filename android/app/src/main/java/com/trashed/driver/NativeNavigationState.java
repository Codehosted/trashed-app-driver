package com.trashed.driver;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Presentation only: IDs are opaque web-owned actions, never URLs or capabilities. */
final class NativeNavigationState {
    static final Set<String> ICONS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
        "manage", "inventory", "pods", "rentals", "customers", "dispatch", "driver", "assistant", "calls",
        "operator", "settings", "profile", "inbox", "support", "appearance", "logout", "delete-account",
        "workspace", "dashboard", "account", "admin", "map", "messages", "more")));
    final String context;
    final int revision;
    final boolean visible;
    final boolean dark;
    final List<Tab> tabs;

    static final class Item {
        final String id, label, icon, detail;
        final boolean selected, destructive;
        Item(Map<?, ?> value, Set<String> ids) {
            keys(value, "id", "label", "icon", "detail", "selected", "destructive");
            id = id(value.get("id"), ids); label = text(value.get("label"), 1, 64); icon = icon(value.get("icon"));
            detail = value.containsKey("detail") ? text(value.get("detail"), 0, 120) : null;
            selected = value.containsKey("selected") && bool(value.get("selected"));
            destructive = value.containsKey("destructive") && bool(value.get("destructive"));
        }
    }
    static final class Tab {
        final String id, label, icon;
        final int badge;
        final boolean selected;
        final List<Item> items;
        Tab(Map<?, ?> value, Set<String> ids) {
            keys(value, "id", "label", "icon", "badge", "selected", "items");
            id = id(value.get("id"), ids); label = text(value.get("label"), 1, 64); icon = icon(value.get("icon"));
            badge = integer(value.get("badge"), 0, 999); selected = bool(value.get("selected"));
            List<?> rawItems = list(value.get("items"), 20);
            List<Item> parsed = new ArrayList<>();
            for (Object item : rawItems) parsed.add(new Item(object(item), ids));
            items = Collections.unmodifiableList(parsed);
        }
    }
    NativeNavigationState(Map<?, ?> value) {
        keys(value, "version", "context", "revision", "visible", "appearance", "tabs");
        integer(value.get("version"), 1, 1);
        context = context(value.get("context")); revision = integer(value.get("revision"), 1, Integer.MAX_VALUE);
        visible = bool(value.get("visible"));
        Object appearance = value.get("appearance");
        if (!"light".equals(appearance) && !"dark".equals(appearance)) throw invalid();
        dark = "dark".equals(appearance);
        List<?> rawTabs = list(value.get("tabs"), 5);
        Set<String> ids = new HashSet<>(); List<Tab> parsed = new ArrayList<>(); int total = 0;
        for (Object rawTab : rawTabs) {
            Tab tab = new Tab(object(rawTab), ids); total += tab.items.size();
            if (total > 60) throw invalid();
            parsed.add(tab);
        }
        tabs = Collections.unmodifiableList(parsed);
    }
    boolean offers(String id) {
        if (!visible) return false;
        for (Tab tab : tabs) {
            if (tab.items.isEmpty() && tab.id.equals(id)) return true;
            for (Item item : tab.items) if (item.id.equals(id)) return true;
        }
        return false;
    }
    static final class Selection {
        final String context, id; final int revision;
        Selection(NativeNavigationState state, String id) { context = state.context; revision = state.revision; this.id = id; }
    }
    static final class Store {
        private NativeNavigationState current;
        private volatile long generation;
        NativeNavigationState current() { return current; }
        long generation() { return generation; }
        void set(NativeNavigationState next) {
            if (current != null && current.context.equals(next.context) && next.revision <= current.revision)
                throw new IllegalArgumentException("STALE_STATE");
            if (current == null || !current.context.equals(next.context)) generation++;
            current = next;
        }
        void clear(String context) { if (current != null && current.context.equals(context)) reset(); }
        void reset() { current = null; generation++; }
        Selection select(String context, long expectedGeneration, String id) {
            return current != null && generation == expectedGeneration && current.context.equals(context) && current.offers(id)
                ? new Selection(current, id) : null;
        }
    }
    static String context(Object value) {
        if (!(value instanceof String) || !((String) value).matches("[A-Za-z0-9_-]{1,80}")) throw invalid();
        return (String) value;
    }
    private static String id(Object value, Set<String> ids) {
        if (!(value instanceof String) || !((String) value).matches("[a-z][a-z0-9_-]{0,47}") || !ids.add((String) value)) throw invalid();
        return (String) value;
    }
    private static String icon(Object value) {
        if (!(value instanceof String) || !ICONS.contains(value)) throw invalid();
        return (String) value;
    }
    private static String text(Object value, int min, int max) {
        if (!(value instanceof String)) throw invalid();
        String text = (String) value;
        int length = text.length(); // Protocol bounds are UTF-16 on both native platforms.
        if (length < min || length > max || (min > 0 && text.trim().isEmpty())) throw invalid();
        for (int i = 0; i < text.length();) {
            int point = text.codePointAt(i), kind = Character.getType(point);
            if (Character.isISOControl(point) || kind == Character.FORMAT || kind == Character.SURROGATE
                || kind == Character.LINE_SEPARATOR || kind == Character.PARAGRAPH_SEPARATOR) throw invalid();
            i += Character.charCount(point);
        }
        return text;
    }
    private static int integer(Object value, int min, int max) {
        if (!(value instanceof Number)) throw invalid();
        double number = ((Number) value).doubleValue();
        if ((Double.isNaN(number) || Double.isInfinite(number)) || number != Math.rint(number) || number < min || number > max) throw invalid();
        return (int) number;
    }
    private static boolean bool(Object value) { if (!(value instanceof Boolean)) throw invalid(); return (Boolean) value; }
    private static List<?> list(Object value, int max) {
        if (!(value instanceof List) || ((List<?>) value).size() > max) throw invalid();
        return (List<?>) value;
    }
    private static Map<?, ?> object(Object value) { if (!(value instanceof Map)) throw invalid(); return (Map<?, ?>) value; }
    private static void keys(Map<?, ?> value, String... allowed) {
        Set<String> keys = new HashSet<>(Arrays.asList(allowed));
        for (Object key : value.keySet()) if (!keys.contains(key)) throw invalid();
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("INVALID_STATE"); }
}
