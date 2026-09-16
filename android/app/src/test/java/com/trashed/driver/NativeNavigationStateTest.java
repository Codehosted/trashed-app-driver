package com.trashed.driver;

import org.junit.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class NativeNavigationStateTest {
    static Map<String, Object> map(Object... pairs) {
        Map<String, Object> map = new HashMap<>();
        for (int i = 0; i < pairs.length; i += 2) map.put((String) pairs[i], pairs[i + 1]);
        return map;
    }
    static Map<String, Object> item(String id) { return map("id", id, "label", "Local Profile", "icon", "profile"); }
    static Map<String, Object> tab(String id, Object... items) {
        return map("id", id, "label", "Local Account", "icon", "account", "badge", 3, "selected", false, "items", new ArrayList<>(Arrays.asList(items)));
    }
    static Map<String, Object> state(String context, int revision) {
        return map("version", 1, "context", context, "revision", revision, "visible", true, "appearance", "light", "tabs", Arrays.asList(tab("account", item("profile")), tab("map")));
    }
    static NativeNavigationState value(String context, int revision) { return new NativeNavigationState(state(context, revision)); }
    static void check(boolean value) { if (!value) throw new AssertionError(); }
    static void invalid(Map<String, Object> value) {
        try { new NativeNavigationState(value); throw new AssertionError("Invalid state accepted"); }
        catch (IllegalArgumentException expected) { check("INVALID_STATE".equals(expected.getMessage())); }
    }
    @Test public void acceptsOnlyOpaqueActionsAndCuratedIcons() {
        NativeNavigationState state = value("local_session-1", 1);
        check(state.offers("profile")); check(state.offers("map")); check(!state.offers("account")); check(!state.offers("missing"));
        for (String icon : NativeNavigationState.ICONS) {
            Map<String, Object> option = item("action"); option.put("icon", icon);
            Map<String, Object> source = state("local", 1); source.put("tabs", Arrays.asList(tab("group", option)));
            new NativeNavigationState(source);
        }
    }
    @Test public void rejectsInvalidTopLevelTypesAndUnknownFields() {
        for (Object version : new Object[]{null, true, "1", 0, 2, 1.1, Double.NaN, Double.POSITIVE_INFINITY}) {
            Map<String, Object> value = state("local", 1); value.put("version", version); invalid(value);
        }
        for (Object revision : new Object[]{null, true, "1", 0, -1, 1.5, 2147483648L}) {
            Map<String, Object> value = state("local", 1); value.put("revision", revision); invalid(value);
        }
        for (String key : new String[]{"version", "context", "revision", "visible", "appearance", "tabs"}) {
            Map<String, Object> value = state("local", 1); value.remove(key); invalid(value);
        }
        for (Object context : new Object[]{null, "", "a".repeat(81), "account/user", "hello world", "a\n", false}) {
            Map<String, Object> value = state("local", 1); value.put("context", context); invalid(value);
        }
        for (Object visible : new Object[]{null, 1, "true"}) {
            Map<String, Object> value = state("local", 1); value.put("visible", visible); invalid(value);
        }
        for (Object appearance : new Object[]{null, true, "system", "DARK"}) {
            Map<String, Object> value = state("local", 1); value.put("appearance", appearance); invalid(value);
        }
        Map<String, Object> extra = state("local", 1); extra.put("url", "https://example.invalid"); invalid(extra);
        Map<String, Object> edge = state("a".repeat(80), Integer.MAX_VALUE); new NativeNavigationState(edge);
    }
    @Test public void rejectsUnknownItemFieldsAndInvalidTextOrIds() {
        for (Object id : new Object[]{null, "", "Profile", "a".repeat(49), "/app", "a.b", "a\n", 1}) {
            Map<String, Object> item = item("profile"); item.put("id", id); invalidItem(item);
        }
        for (Object label : new Object[]{null, "", "  ", "a".repeat(65), "🚚".repeat(33), "a\n", "a\u0000", "a\u007f", "a\u0085", "a\u202e", "a\u2028", "a\ud800", 4}) {
            Map<String, Object> item = item("profile"); item.put("label", label); invalidItem(item);
        }
        for (Object detail : new Object[]{null, "a".repeat(121), "a\t", true}) {
            Map<String, Object> item = item("profile"); item.put("detail", detail); invalidItem(item);
        }
        for (String optional : new String[]{"selected", "destructive"}) {
            Map<String, Object> item = item("profile"); item.put(optional, "true"); invalidItem(item);
        }
        for (String key : new String[]{"href", "url", "onClick", "role"}) {
            Map<String, Object> item = item("profile"); item.put(key, "unexpected"); invalidItem(item);
        }
        Map<String, Object> badIcon = item("profile"); badIcon.put("icon", "https://example.invalid/icon"); invalidItem(badIcon);
        Map<String, Object> valid = item("a".repeat(48)); valid.put("label", "🚚".repeat(32)); valid.put("detail", "a".repeat(120));
        valid.put("selected", true); valid.put("destructive", true);
        Map<String, Object> source = state("local", 1); source.put("tabs", Arrays.asList(tab("group", valid))); new NativeNavigationState(source);
    }
    private static void invalidItem(Map<String, Object> item) {
        Map<String, Object> source = state("local", 1); source.put("tabs", Arrays.asList(tab("group", item))); invalid(source);
    }
    @Test public void rejectsTabFieldsBadgesAndGlobalDuplicateIds() {
        for (Object badge : new Object[]{-1, 1000, true, 1.5, "3", null}) {
            Map<String, Object> tab = tab("group"); tab.put("badge", badge); invalidTab(tab);
        }
        for (String key : new String[]{"id", "label", "icon", "badge", "selected", "items"}) {
            Map<String, Object> tab = tab("group"); tab.remove(key); invalidTab(tab);
        }
        Map<String, Object> selected = tab("group"); selected.put("selected", 1); invalidTab(selected);
        Map<String, Object> extra = tab("group"); extra.put("url", "/driver"); invalidTab(extra);
        invalidTab(tab("profile", item("profile")));
        Map<String, Object> source = state("local", 1); source.put("tabs", Arrays.asList(tab("one", item("profile")), tab("two", item("profile")))); invalid(source);
        source.put("tabs", Arrays.asList(tab("same"), tab("same"))); invalid(source);
    }
    private static void invalidTab(Map<String, Object> tab) {
        Map<String, Object> source = state("local", 1); source.put("tabs", Arrays.asList(tab)); invalid(source);
    }
    @Test public void enforcesAllCollectionBoundsAndImmutableCopies() {
        Map<String, Object> source = state("local", 1); source.put("tabs", new ArrayList<>()); check(new NativeNavigationState(source).tabs.isEmpty());
        List<Object> tabs = new ArrayList<>();
        for (int t = 0; t < 3; t++) {
            List<Object> items = new ArrayList<>(); for (int i = 0; i < 20; i++) items.add(item("item" + t + "_" + i));
            tabs.add(tab("tab" + t, items.toArray()));
        }
        source.put("tabs", tabs); NativeNavigationState full = new NativeNavigationState(source);
        check(full.tabs.size() == 3 && full.tabs.get(0).items.size() == 20);
        tabs.add(tab("extra", item("extra-item"))); invalid(source); // 61 total
        List<Object> tooMany = new ArrayList<>(); for (int i = 0; i < 21; i++) tooMany.add(item("item" + i)); invalidTab(tab("tab", tooMany.toArray()));
        source.put("tabs", Arrays.asList(tab("a"), tab("b"), tab("c"), tab("d"), tab("e"))); new NativeNavigationState(source);
        source.put("tabs", Arrays.asList(tab("a"), tab("b"), tab("c"), tab("d"), tab("e"), tab("f"))); invalid(source);
        tabs.clear(); check(full.tabs.size() == 3);
        try { full.tabs.clear(); throw new AssertionError(); } catch (UnsupportedOperationException expected) { }
    }
    @Test public void revisionsAreStrictAndClearIsContextScoped() {
        NativeNavigationState.Store store = new NativeNavigationState.Store(); store.set(value("one", 2));
        for (int revision : new int[]{1, 2}) {
            try { store.set(value("one", revision)); throw new AssertionError(); }
            catch (IllegalArgumentException expected) { check("STALE_STATE".equals(expected.getMessage())); }
        }
        store.clear("other"); check(store.current().revision == 2);
        store.set(value("one", 3)); store.set(value("two", 1)); check(store.current().context.equals("two"));
        store.clear("one"); check(store.current() != null); store.clear("two"); check(store.current() == null);
    }
    @Test public void selectionUsesCurrentRevisionAndRejectsRemovedHiddenOrWrongContext() {
        NativeNavigationState.Store store = new NativeNavigationState.Store(); store.set(value("one", 1)); long generation = store.generation();
        store.set(value("one", 2)); check(store.select("one", generation, "profile").revision == 2);
        check(store.select("other", generation, "profile") == null); check(store.select("one", generation, "account") == null);
        Map<String, Object> next = state("one", 3); next.put("tabs", Arrays.asList(tab("map"))); store.set(new NativeNavigationState(next));
        check(store.select("one", generation, "profile") == null);
        next = state("one", 4); next.put("visible", false); store.set(new NativeNavigationState(next)); check(store.select("one", generation, "map") == null);
    }
    @Test public void resetsFenceEvenReusedContextAndDelayedSelection() {
        NativeNavigationState.Store store = new NativeNavigationState.Store(); store.set(value("one", 1)); long generation = store.generation();
        store.reset(); store.set(value("one", 1)); check(store.select("one", generation, "map") == null);
        long renewed = store.generation(); store.set(value("two", 1)); check(store.select("one", renewed, "map") == null);
    }
    public static void main(String[] args) throws Exception {
        NativeNavigationStateTest test = new NativeNavigationStateTest(); int count = 0;
        for (java.lang.reflect.Method method : NativeNavigationStateTest.class.getDeclaredMethods()) {
            if (method.getAnnotation(Test.class) != null) { method.invoke(test); count++; }
        }
        check(count == 8); System.out.println("8 compiled navigation policy cases passed");
    }
}
