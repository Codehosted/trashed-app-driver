package com.trashed.driver;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.view.ContextThemeWrapper;
import android.view.Gravity;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.core.graphics.drawable.DrawableCompat;
import androidx.core.view.ViewCompat;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.bottomsheet.BottomSheetBehavior;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.navigation.NavigationBarView;

/** Real Android controls. The web owns destinations, roles and business actions. */
final class NativeBottomNavigation {
    interface Listener {
        void select(NativeNavigationState.Selection selection);
        void reset(String context);
    }
    interface Readiness { boolean allowed(); }
    private final androidx.appcompat.app.AppCompatActivity host;
    private final Readiness readiness;
    private final NativeNavigationState.Store store = new NativeNavigationState.Store();
    private final LinearLayout container;
    private BottomNavigationView bar;
    private BottomSheetDialog sheet;
    private Listener listener;
    private boolean keyboardVisible;
    private String pendingId;

    NativeBottomNavigation(androidx.appcompat.app.AppCompatActivity host, View webView, Readiness readiness) {
        this.host = host; this.readiness = readiness;
        ViewGroup parent = (ViewGroup) webView.getParent();
        int index = parent.indexOfChild(webView);
        ViewGroup.LayoutParams original = webView.getLayoutParams();
        container = new LinearLayout(host);
        container.setOrientation(LinearLayout.VERTICAL);
        parent.removeView(webView);
        container.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        parent.addView(container, index, original);
    }
    void set(NativeNavigationState state, Listener nextListener) {
        store.set(state); listener = nextListener;
        closeSheet(false);
        render();
    }
    NativeNavigationState currentState() { return store.current(); }
    boolean accepts(NativeNavigationState.Selection selection) {
        NativeNavigationState current = store.current();
        return current != null && current.context.equals(selection.context)
            && current.revision == selection.revision && current.offers(selection.id);
    }
    void clear(String context) {
        NativeNavigationState state = store.current();
        if (state == null || !state.context.equals(context)) return;
        store.clear(context); closeSheet(true); listener = null; render();
    }
    void reset() {
        NativeNavigationState state = store.current(); Listener previous = listener;
        store.reset(); closeSheet(true); listener = null; render();
        if (state != null && previous != null) previous.reset(state.context);
    }
    void keyboard(boolean visible) {
        if (keyboardVisible == visible) return;
        keyboardVisible = visible;
        if (visible) closeSheet(true);
        if (bar != null) bar.setVisibility(showBar() ? View.VISIBLE : View.GONE);
    }
    boolean dismissSheet() {
        if (sheet == null || !sheet.isShowing()) return false;
        closeSheet(true); return true;
    }
    private boolean showBar() {
        NativeNavigationState state = store.current();
        return state != null && state.visible && !state.tabs.isEmpty() && !keyboardVisible && readiness.allowed();
    }
    void appearanceChanged() {
        boolean night=NativeSystemAppearance.dark(host);
        if(bar!=null){
            int purple=night?0xffbe9fff:0xff7033ff;
            bar.setBackgroundColor(surface(night));
            ColorStateList tint=new ColorStateList(new int[][]{{android.R.attr.state_checked},{}},new int[]{purple,foreground(night)});
            bar.setItemIconTintList(tint);bar.setItemTextColor(tint);
            for(int i=0;i<bar.getMenu().size();i++){
                com.google.android.material.badge.BadgeDrawable badge=bar.getBadge(bar.getMenu().getItem(i).getItemId());
                if(badge!=null){badge.setBackgroundColor(purple);badge.setBadgeTextColor(night?Color.BLACK:Color.WHITE);}
            }
        }
        if(sheet!=null)NativeSystemAppearance.dialog(sheet);
    }
    private void render() {
        if (bar != null) container.removeView(bar);
        bar = null;
        NativeNavigationState state = store.current();
        if (state == null || !state.visible || state.tabs.isEmpty()) return;
        Context themed = new ContextThemeWrapper(host, NativeSystemAppearance.dark(host) ? R.style.TrashedNavigationDark : R.style.TrashedNavigationLight);
        bar = new BottomNavigationView(themed);
        bar.setTag("native-bottom-navigation");
        bar.setElevation(0); bar.setBackgroundColor(surface(NativeSystemAppearance.dark(host)));
        bar.setLabelVisibilityMode(NavigationBarView.LABEL_VISIBILITY_LABELED);
        bar.setItemHorizontalTranslationEnabled(false); bar.setItemActiveIndicatorEnabled(false);
        int purple = NativeSystemAppearance.dark(host) ? Color.rgb(190, 159, 255) : Color.rgb(112, 51, 255);
        ColorStateList tint = new ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{purple, foreground(NativeSystemAppearance.dark(host))});
        bar.setItemIconTintList(tint); bar.setItemTextColor(tint);
        // The Activity applies system/IME insets once to its content, not again to this bar.
        ViewCompat.setOnApplyWindowInsetsListener(bar, (view, insets) -> insets);
        for (int index = 0; index < state.tabs.size(); index++) {
            NativeNavigationState.Tab tab = state.tabs.get(index);
            MenuItem item = bar.getMenu().add(0, index + 1, index, tab.label).setIcon(icon(tab.icon));
            item.setChecked(tab.selected);
            if (tab.badge > 0) {
                bar.getOrCreateBadge(index + 1).setNumber(tab.badge);
                bar.getOrCreateBadge(index + 1).setBackgroundColor(purple);
                bar.getOrCreateBadge(index + 1).setBadgeTextColor(NativeSystemAppearance.dark(host) ? Color.BLACK : Color.WHITE);
            }
        }
        // Web state owns selection, including no selection. Disable exclusive setters
        // before applying flags: MenuItemImpl otherwise treats setChecked(false) as selection.
        bar.getMenu().setGroupCheckable(0, true, false);
        for (int index = 0; index < state.tabs.size(); index++) bar.getMenu().getItem(index).setChecked(state.tabs.get(index).selected);
        String context = state.context; long generation = store.generation();
        BottomNavigationView renderedBar = bar;
        bar.setOnItemSelectedListener(item -> {
            NativeNavigationState current = store.current();
            if (bar != renderedBar || !showBar() || current == null || !current.context.equals(context) || generation != store.generation()) return false;
            NativeNavigationState.Tab tab = current.tabs.get(item.getItemId() - 1);
            if (tab.items.isEmpty()) emit(context, generation, tab.id);
            else openSheet(tab, current, generation);
            return false; // Selection is owned by the next web state, not optimistic native navigation.
        });
        bar.setVisibility(showBar() ? View.VISIBLE : View.GONE);
        container.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }
    private void openSheet(NativeNavigationState.Tab tab, NativeNavigationState state, long generation) {
        closeSheet(true);
        BottomSheetDialog dialog = new BottomSheetDialog(host, NativeSystemAppearance.dark(host) ? R.style.TrashedNavigationSheetDark : R.style.TrashedNavigationSheetLight);
        sheet = dialog;
        LinearLayout column = new LinearLayout(dialog.getContext()); column.setOrientation(LinearLayout.VERTICAL);
        column.setBackgroundColor(surface(NativeSystemAppearance.dark(host))); column.setPadding(dp(16), dp(8), dp(16), dp(8));
        LinearLayout header = new LinearLayout(dialog.getContext()); header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(dialog.getContext()); title.setText(tab.label); title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD); title.setTextColor(foreground(NativeSystemAppearance.dark(host)));
        ViewCompat.setAccessibilityHeading(title, true);
        header.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button close = row(dialog.getContext(), "Close", NativeSystemAppearance.dark(host), false);
        close.setContentDescription("Close " + tab.label); close.setOnClickListener(view -> closeSheet(true));
        header.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(48)));
        column.addView(header);
        ScrollView scroll = new ScrollView(dialog.getContext()); scroll.setFillViewport(false);
        LinearLayout rows = new LinearLayout(dialog.getContext()); rows.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(rows);
        column.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        for (NativeNavigationState.Item item : tab.items) {
            Button button = row(dialog.getContext(), item.label + (item.detail == null || item.detail.isEmpty() ? "" : "\n" + item.detail), NativeSystemAppearance.dark(host), item.destructive);
            button.setSelected(item.selected);
            if (item.selected && !item.destructive) {
                button.setTextColor(NativeSystemAppearance.dark(host) ? Color.rgb(190, 159, 255) : Color.rgb(112, 51, 255));
                button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            }
            button.setContentDescription(item.label + (item.detail == null ? "" : ", " + item.detail) + (item.selected ? ", selected" : ""));
            Drawable drawable = host.getDrawable(icon(item.icon));
            if (drawable != null) {
                drawable = DrawableCompat.wrap(drawable.mutate()); DrawableCompat.setTint(drawable, button.getCurrentTextColor());
                drawable.setBounds(0, 0, dp(24), dp(24)); button.setCompoundDrawablesRelative(drawable, null, null, null); button.setCompoundDrawablePadding(dp(12));
            }
            button.setOnClickListener(view -> {
                if (sheet != dialog || pendingId != null) return;
                pendingId = item.id; dialog.dismiss();
            });
            rows.addView(button, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        dialog.setContentView(column);
        dialog.setOnDismissListener(ignored -> {
            if (sheet != dialog) return;
            String selected = pendingId; pendingId = null; sheet = null;
            if (selected != null) emit(state.context, generation, selected);
        });
        dialog.setOnShowListener(ignored -> {
            int height = Math.max(dp(120), container.getHeight() - dp(16));
            column.getLayoutParams().height = Math.min(height, dp(72 + tab.items.size() * 72)); column.requestLayout();
            dialog.getBehavior().setState(BottomSheetBehavior.STATE_EXPANDED);
            dialog.getBehavior().setSkipCollapsed(true);
            ViewCompat.setAccessibilityPaneTitle(column, tab.label);
            close.requestFocus();
        });
        // Dialog owns a separate window; Material handles system insets on the sheet.
        dialog.show();
    }
    private void closeSheet(boolean discardSelection) {
        if (discardSelection) pendingId = null;
        if (sheet != null) sheet.dismiss();
    }
    private void emit(String context, long generation, String id) {
        if (!showBar() || listener == null) return;
        NativeNavigationState.Selection selection = store.select(context, generation, id);
        if (selection != null) listener.select(selection);
    }
    private Button row(Context context, String label, boolean dark, boolean destructive) {
        Button button = new Button(context); button.setText(label); button.setAllCaps(false); button.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        button.setTextSize(16); button.setMinHeight(dp(48)); button.setMinimumHeight(dp(48));
        button.setPadding(dp(12), dp(12), dp(12), dp(12)); button.setElevation(0); button.setStateListAnimator(null);
        button.setTextColor(destructive ? (dark ? Color.rgb(255, 160, 160) : Color.rgb(170, 28, 28)) : foreground(dark));
        button.setBackgroundTintList(ColorStateList.valueOf(surface(dark))); return button;
    }
    private static int surface(boolean dark) { return dark ? Color.rgb(31, 26, 38) : Color.WHITE; }
    private static int foreground(boolean dark) { return dark ? Color.rgb(242, 237, 249) : Color.rgb(33, 26, 43); }
    private int dp(int value) { return Math.round(value * host.getResources().getDisplayMetrics().density); }
    private static int icon(String icon) {
        switch (icon) {
            case "calls": case "operator": return android.R.drawable.ic_menu_call;
            case "map": case "dispatch": case "driver": return android.R.drawable.ic_menu_directions;
            case "profile": case "account": case "customers": return android.R.drawable.ic_menu_myplaces;
            case "messages": case "inbox": return android.R.drawable.ic_dialog_email;
            case "support": case "assistant": return android.R.drawable.ic_menu_help;
            case "delete-account": return android.R.drawable.ic_menu_delete;
            case "logout": return android.R.drawable.ic_menu_revert;
            case "inventory": case "pods": case "rentals": return android.R.drawable.ic_menu_agenda;
            case "appearance": return android.R.drawable.ic_menu_day;
            case "dashboard": case "workspace": return android.R.drawable.ic_menu_view;
            case "settings": case "admin": case "manage": default: return android.R.drawable.ic_menu_manage;
        }
    }
}
