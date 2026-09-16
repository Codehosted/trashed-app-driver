package com.trashed.driver;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.ContextThemeWrapper;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.view.ViewCompat;
import com.google.android.material.button.MaterialButton;

/** Shared named design tokens, flat neutral surfaces and bundled Jakarta. */
final class NativeWorkspaceTokens {
    static final int PRIMARY = Color.rgb(112, 51, 255);
    final Context context;
    final int background, surface, foreground, secondary, divider, accent;
    final Typeface regular, semibold;
    NativeWorkspaceTokens(Context base, boolean dark) {
        context = new ContextThemeWrapper(base, dark ? R.style.TrashedNavigationDark : R.style.TrashedNavigationLight);
        background = dark ? Color.rgb(19, 19, 21) : Color.rgb(250, 250, 251);
        surface = dark ? Color.rgb(29, 29, 32) : Color.WHITE;
        foreground = dark ? Color.rgb(246, 246, 248) : Color.rgb(28, 28, 32);
        secondary = dark ? Color.rgb(182, 182, 190) : Color.rgb(98, 98, 110);
        divider = dark ? Color.rgb(53, 53, 59) : Color.rgb(227, 227, 232);
        accent = dark ? Color.rgb(190, 159, 255) : PRIMARY;
        regular = Typeface.createFromAsset(base.getAssets(), "native-chat-fonts/TrashedJakarta-Regular.ttf");
        semibold = Typeface.createFromAsset(base.getAssets(), "native-chat-fonts/TrashedJakarta-SemiBold.ttf");
    }
    int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
    LinearLayout column() { LinearLayout view = new LinearLayout(context); view.setOrientation(LinearLayout.VERTICAL); return view; }
    TextView text(String value, int size, boolean heading) {
        TextView view = new TextView(context); view.setText(value); view.setTextSize(size); view.setTextColor(foreground);
        view.setTypeface(heading ? semibold : regular); view.setPadding(0, dp(6), 0, dp(6)); view.setLineSpacing(dp(3), 1);
        if (heading) ViewCompat.setAccessibilityHeading(view, true); return view;
    }
    MaterialButton button(String label, boolean primary, Runnable action) {
        MaterialButton view = new MaterialButton(context); view.setText(label); view.setAllCaps(false); view.setTypeface(semibold);
        view.setMinHeight(dp(48)); view.setMinimumHeight(dp(48)); view.setMinWidth(dp(48)); view.setTextSize(14);
        view.setTextColor(primary ? Color.WHITE : accent); view.setBackgroundTintList(ColorStateList.valueOf(primary ? PRIMARY : surface));
        view.setElevation(0); view.setStateListAnimator(null); view.setCornerRadius(dp(10));
        view.setOnClickListener(ignored -> action.run()); return view;
    }
    LinearLayout.LayoutParams row() { return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); }
}
