package com.trashed.driver;

import static org.junit.Assert.*;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** Real Android widgets in an isolated test-only Activity. No production session/network. */
public class AndroidBottomNavigationTest {
    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> value = new HashMap<>();
        for (int i = 0; i < pairs.length; i += 2) value.put((String) pairs[i], pairs[i + 1]);
        return value;
    }
    private static NativeNavigationState state(String context, int revision, boolean visible) {
        return state(context, revision, visible, false);
    }
    private static NativeNavigationState state(String context, int revision, boolean visible, boolean firstSelected) {
        return new NativeNavigationState(map("version", 1, "context", context, "revision", revision, "visible", visible, "appearance", "dark", "tabs", Arrays.asList(
            map("id", "account", "label", "Local account", "icon", "account", "badge", 2, "selected", firstSelected, "items", Arrays.asList(
                map("id", "profile", "label", "Local profile", "icon", "profile", "selected", true),
                map("id", "logout", "label", "Sign out", "icon", "logout", "destructive", true))),
            map("id", "map", "label", "Local map", "icon", "map", "badge", 0, "selected", !firstSelected, "items", Arrays.asList()))));
    }
    private static class Events implements NativeBottomNavigation.Listener {
        final List<NativeNavigationState.Selection> selected = new ArrayList<>();
        final List<String> resets = new ArrayList<>();
        public void select(NativeNavigationState.Selection selection) { selected.add(selection); }
        public void reset(String context) { resets.add(context); }
    }
    private ActivityScenario<NavigationTestActivity> launch() {
        return ActivityScenario.launch(new Intent(InstrumentationRegistry.getInstrumentation().getContext(), NavigationTestActivity.class));
    }
    private static BottomNavigationView bar(NavigationTestActivity activity) { return activity.findViewById(android.R.id.content).findViewWithTag("native-bottom-navigation"); }
    private static BottomSheetDialog sheet(NavigationTestActivity activity) {
        try {
            java.lang.reflect.Field field = NativeBottomNavigation.class.getDeclaredField("sheet"); field.setAccessible(true);
            return (BottomSheetDialog) field.get(activity.navigation);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    private static Button button(View view, String title) {
        if (view instanceof Button && title.equals(((Button) view).getText().toString())) return (Button) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            Button result = button(((ViewGroup) view).getChildAt(i), title); if (result != null) return result;
        }
        return null;
    }
    private static void idle() { InstrumentationRegistry.getInstrumentation().waitForIdleSync(); }
    @Test public void actualBarHidesWithoutSpaceForImeDialogsAndClearAndDoesNotRetainContext() {
        try (ActivityScenario<NavigationTestActivity> scenario = launch()) {
            Events events = new Events();
            scenario.onActivity(activity -> {
                activity.navigation.set(state("one", 1, true), events);
                assertEquals(View.VISIBLE, bar(activity).getVisibility());
                assertFalse(bar(activity).getMenu().getItem(0).isChecked());
                assertTrue(bar(activity).getMenu().getItem(1).isChecked());
                activity.navigation.keyboard(true); assertEquals(View.GONE, bar(activity).getVisibility());
                activity.navigation.keyboard(false); assertEquals(View.VISIBLE, bar(activity).getVisibility());
                activity.navigation.clear("other"); assertNotNull(bar(activity));
                activity.navigation.set(state("one", 2, false), events); assertNull(bar(activity));
                activity.navigation.set(state("one", 3, true, true), events);
                assertTrue(bar(activity).getMenu().getItem(0).isChecked());
                assertFalse(bar(activity).getMenu().getItem(1).isChecked());
                activity.navigation.reset(); assertNull(bar(activity)); assertEquals(Arrays.asList("one"), events.resets);
                assertTrue(events.selected.isEmpty());
                activity.navigation.set(state("two", 1, true), events); activity.navigation.clear("two"); assertNull(bar(activity));
                assertEquals(1, events.resets.size());
            });
        }
    }
    @Test public void realSheetSelectionDismissesBeforeEventAndSystemBackDoesNotSelect() {
        try (ActivityScenario<NavigationTestActivity> scenario = launch()) {
            Events events = new Events();
            scenario.onActivity(activity -> {
                activity.navigation.set(state("one", 1, true), events);
                bar(activity).getMenu().performIdentifierAction(1, 0);
                assertNotNull(sheet(activity)); assertTrue(sheet(activity).isShowing());
                assertEquals("Close Local account", button(sheet(activity).getWindow().getDecorView(), "Close").getContentDescription());
                button(sheet(activity).getWindow().getDecorView(), "Local profile").performClick();
            });
            idle();
            scenario.onActivity(activity -> {
                assertNull(sheet(activity)); assertEquals(1, events.selected.size());
                assertEquals("profile", events.selected.get(0).id); assertEquals("one", events.selected.get(0).context);
                bar(activity).getMenu().performIdentifierAction(1, 0);
                sheet(activity).getOnBackPressedDispatcher().onBackPressed();
            });
            idle();
            scenario.onActivity(activity -> {
                assertNull(sheet(activity)); assertEquals(1, events.selected.size());
                bar(activity).getMenu().performIdentifierAction(2, 0);
                assertEquals("map", events.selected.get(1).id);
            });
        }
    }
    @Test public void staleBarClicksAndContextReplacementCannotEmitOldActions() {
        try (ActivityScenario<NavigationTestActivity> scenario = launch()) {
            Events events = new Events();
            scenario.onActivity(activity -> {
                activity.navigation.set(state("one", 1, true), events);
                BottomNavigationView oldBar = bar(activity);
                oldBar.getMenu().performIdentifierAction(1, 0); assertTrue(sheet(activity).isShowing());
                activity.navigation.set(state("two", 1, true), events);
                oldBar.getMenu().performIdentifierAction(2, 0);
                activity.allowed = false;
                bar(activity).getMenu().performIdentifierAction(2, 0);
                assertTrue(events.selected.isEmpty());
            });
            idle();
            scenario.onActivity(activity -> assertNull(sheet(activity)));
        }
    }
}
