package com.trashed.driver;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.text.*;
import android.text.style.*;
import android.view.*;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
import androidx.core.view.ViewCompat;
import org.json.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.*;

/** Native widgets only. Stable keyed reconciliation preserves EditText focus, selection and pending drafts. */
final class NativeChatView extends LinearLayout {
    interface Events { void event(String kind, String context, int revision, String id, String value); boolean allowed(); }
    private final Events events;
    private final String origin;
    private NativeChatState state;
    private boolean readOnly;
    private final LinearLayout header, messages, composer, actionRow;
    private final LinearLayout screenToolbar, screenComposer, screenOverlay, screenFooter;
    private final ScrollView overlayScroll;
    private final TextView title, subtitle, status;
    private final ImageView avatar;
    private final ScrollView scroll;
    private final EditText draft;
    private final Button send, stop, history;
    private final Map<String, View> views = new HashMap<>();
    private final Map<String, Typeface> measuredFonts = new HashMap<>();
    private final Map<EditText, Binding> bindings = new HashMap<>();
    private final ExecutorService images = Executors.newFixedThreadPool(2);
    private androidx.appcompat.app.AlertDialog conversationDialog;
    private final Map<String, android.graphics.Bitmap> imageCache = new LinkedHashMap<>();
    private int foreground, muted, surface, background;
    private static final int PRIMARY = Color.rgb(112, 51, 255);
    private static final class Binding { String server = "", local = "", action; boolean updating; final java.util.ArrayDeque<String> pending = new java.util.ArrayDeque<>(); }

    NativeChatView(Context context, String origin, Events events) {
        super(context); this.origin = origin; this.events = events;
        setOrientation(VERTICAL); setTag("native-chat"); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
        setSaveFromParentEnabled(false); // No Android saved-instance-state copy of private drafts/messages.
        header = column(); header.setPadding(dp(16), dp(12), dp(16), dp(8));
        LinearLayout heading = new LinearLayout(context); heading.setGravity(Gravity.CENTER_VERTICAL);
        avatar = new ImageView(context); avatar.setImageResource(R.drawable.trisha_avatar); avatar.setContentDescription("Trisha"); LayoutParams avatarParams = new LayoutParams(dp(28), dp(28)); avatarParams.setMarginEnd(dp(8)); heading.addView(avatar, avatarParams);
        title = label("", 20); ViewCompat.setAccessibilityHeading(title, true); heading.addView(title, new LayoutParams(0, -2, 1));
        history = button("History", "native-chat-history"); history.setOnClickListener(v -> showHistory()); heading.addView(history);
        header.addView(heading); subtitle = label("", 12); header.addView(subtitle); addView(header);
        screenToolbar = column(); screenToolbar.setPadding(dp(16), dp(8), dp(16), dp(8)); addView(screenToolbar);
        status = label("", 14); status.setPadding(dp(16), dp(8), dp(16), dp(8)); status.setTag("native-chat-status"); status.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE); addView(status);
        scroll = new ScrollView(context); scroll.setFillViewport(true); scroll.setTag("native-chat-transcript"); messages = column(); messages.setPadding(dp(16), dp(8), dp(16), dp(8)); scroll.addView(messages); addView(scroll, new LayoutParams(-1, 0, 1));
        composer = column(); composer.setPadding(dp(12), dp(8), dp(12), dp(8));
        draft = input("native-chat-composer"); draft.setMaxLines(5); draft.setMinLines(1); draft.setImeOptions(EditorInfo.IME_ACTION_SEND | EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        composer.addView(draft, new LayoutParams(-1, -2)); actionRow = new LinearLayout(context); actionRow.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        stop = button("Stop", "native-chat-stop"); send = button("Send", "native-chat-send"); actionRow.addView(stop); actionRow.addView(send); composer.addView(actionRow); addView(composer);
        screenComposer = column(); screenComposer.setPadding(dp(12), dp(8), dp(12), dp(8)); addView(screenComposer);
        screenFooter = column(); screenFooter.setTag("native-chat-footer"); addView(screenFooter);
        screenOverlay = column(); screenOverlay.setPadding(dp(20), dp(12), dp(20), dp(12));
        overlayScroll = new ScrollView(context); overlayScroll.addView(screenOverlay); addView(overlayScroll, new LayoutParams(-1, 0, 1)); overlayScroll.setVisibility(GONE);
        draft.setOnEditorActionListener((v, action, event) -> { if (action == EditorInfo.IME_ACTION_SEND && state != null) { send.performClick(); return true; } return false; });
        send.setOnClickListener(v -> { if (state != null && !draft.getText().toString().trim().isEmpty()) emit("action", state.json.optJSONObject("input").optString("sendActionId"), draft.getText().toString()); });
        stop.setOnClickListener(v -> { if (state != null) emit("action", state.json.optJSONObject("input").optString("stopActionId"), null); });
    }
    void render(NativeChatState next, boolean cached) {
        boolean sameConversation = state != null && state.scopeKey.equals(next.scopeKey) && state.conversationId.equals(next.conversationId);
        boolean bottom = scroll.getChildAt(0).getHeight() - scroll.getScrollY() - scroll.getHeight() < dp(64);
        int oldY = scroll.getScrollY();
        if (!sameConversation) { disposeMaps(); views.clear(); Iterator<EditText> fields = bindings.keySet().iterator(); while (fields.hasNext()) { if (fields.next() != draft) fields.remove(); } messages.removeAllViews(); screenToolbar.removeAllViews(); screenComposer.removeAllViews(); screenOverlay.removeAllViews(); screenFooter.removeAllViews(); Binding b = bindings.get(draft); b.local = b.server = ""; b.pending.clear(); }
        if (state != null && (!state.context.equals(next.context) || state.revision != next.revision)) closeHistoryDialog();
        state = next; readOnly = cached;
        foreground = next.dark ? Color.rgb(242, 237, 249) : Color.rgb(33, 26, 43);
        muted = next.dark ? Color.rgb(191, 184, 204) : Color.rgb(98, 89, 110);
        surface = next.dark ? Color.rgb(31, 26, 38) : Color.WHITE;
        background = next.dark ? Color.rgb(20, 18, 26) : Color.rgb(250, 250, 252);
        // The measured root carries the web canvas color, including the flexible transcript gap.
        JSONObject projectedScreen = next.json.optJSONObject("screen");
        if (projectedScreen != null) {
            outer: for (String slot : Arrays.asList("overlay", "toolbar", "composer", "footer", "accessory")) {
                for (JSONObject root : list(projectedScreen.optJSONArray(slot))) {
                    JSONObject rootStyle = root.optJSONObject("style");
                    if (root.has("box") && rootStyle != null && rootStyle.has("background")) {
                        background = Color.parseColor(rootStyle.optString("background")); break outer;
                    }
                }
            }
        }
        setBackgroundColor(background); header.setBackgroundColor(surface); composer.setBackgroundColor(surface);
        avatar.setImageTintList(null);
        history.setBackgroundTintList(android.content.res.ColorStateList.valueOf(surface));
        title.setText(next.json.optString("title")); title.setTextColor(foreground); subtitle.setText(next.json.optString("subtitle")); subtitle.setTextColor(muted);
        JSONObject notice = next.json.optJSONObject("status"); status.setText(cached ? "Saved conversation · Read only while refreshing" : notice == null ? "" : notice.optString("text"));
        status.setVisibility(status.length() == 0 ? GONE : VISIBLE); status.setTextColor(notice != null && "error".equals(notice.optString("kind")) ? (next.dark ? 0xffffaaaa : 0xffa51e1e) : muted);
        JSONObject input = next.json.optJSONObject("input"); bind(draft, input.optString("value"), null, input.optString("placeholder"), input.optBoolean("disabled"));
        draft.setTextColor(foreground); draft.setHintTextColor(muted); draft.setBackground(fill(background, 14));
        send.setEnabled(!cached && !input.optBoolean("disabled") && next.enabled(input.optString("sendActionId")));
        stop.setEnabled(!cached && next.enabled(input.optString("stopActionId"))); stop.setVisibility(stop.isEnabled() ? VISIBLE : GONE);
        send.setBackgroundTintList(android.content.res.ColorStateList.valueOf(PRIMARY)); send.setTextColor(Color.WHITE); stop.setTextColor(foreground); history.setTextColor(foreground);
        history.setEnabled(!cached && next.json.optJSONArray("conversations").length() > 0);
        List<JSONObject> roots = new ArrayList<>();
        JSONArray messageList = next.json.optJSONArray("messages");
        for (int i = 0; i < messageList.length(); i++) {
            JSONObject message = messageList.optJSONObject(i); String id = message.optString("id"); boolean user = "user".equals(message.optString("role"));
            if ("measured".equals(message.optString("presentation"))) { roots.addAll(list(message.optJSONArray("components"))); continue; }
            JSONObject card = node("m_" + id, "card", null); JSONArray children = new JSONArray();
            children.put(node("role_" + id, "badge", user ? "You" : "Trisha"));
            if (!message.optString("text").isEmpty()) children.put(node("body_" + id, "text", message.optString("text")));
            JSONArray attachments = message.optJSONArray("attachments"); if (attachments != null) for (int a = 0; a < attachments.length(); a++) children.put(node("attachment_" + id + "_" + a, "badge", attachments.optJSONObject(a).optString("label")));
            JSONArray components = message.optJSONArray("components"); if (components != null) for (int c = 0; c < components.length(); c++) children.put(components.optJSONObject(c));
            JSONArray actions = message.optJSONArray("actions"); if (actions != null) for (int a = 0; a < actions.length(); a++) { JSONObject action = actions.optJSONObject(a); children.put(actionNode("ma_" + action.optString("id"), action.optString("label"), action.optString("id"))); }
            if (!message.optString("time").isEmpty()) children.put(node("time_" + id, "badge", message.optString("time")));
            put(card, "children", children); put(card, "style", object("background", user ? "#7033FF" : (next.dark ? "#1F1A26" : "#FFFFFF"), "foreground", user ? "#FFFFFF" : (next.dark ? "#F2EDF9" : "#211A2B"), "radius", 24, "padding", 12, "gap", 8)); roots.add(card);
        }
        if (messageList.length() == 0 && !next.json.has("screen")) roots.add(node("empty", "text", "What can I help you with?"));
        JSONArray suggestions = next.json.optJSONArray("suggestions"); if (messageList.length() == 0) for (int i = 0; i < suggestions.length(); i++) { JSONObject suggestion = suggestions.optJSONObject(i); roots.add(actionNode("suggestion_" + suggestion.optString("id"), (suggestion.optBoolean("starred") ? "★ " : "") + suggestion.optString("title") + "\n" + suggestion.optString("prompt"), suggestion.optString("id"))); }
        if (!next.json.has("screen")) for (JSONObject action : next.actions.values()) if ("reset".equals(action.optString("kind"))) roots.add(actionNode("reset_" + action.optString("id"), action.optString("label"), action.optString("id")));
        JSONObject screen = next.json.optJSONObject("screen");
        boolean overlay = screen != null && screen.optJSONArray("overlay").length() > 0;
        header.setVisibility(screen == null && !overlay ? VISIBLE : GONE); composer.setVisibility(screen == null && !overlay ? VISIBLE : GONE);
        screenToolbar.setVisibility(screen != null && !overlay ? VISIBLE : GONE); screenComposer.setVisibility(screen != null && !overlay ? VISIBLE : GONE);
        screenFooter.setVisibility(screen != null && !overlay ? VISIBLE : GONE);
        scroll.setVisibility(overlay ? GONE : VISIBLE); overlayScroll.setVisibility(overlay ? VISIBLE : GONE);
        if (overlay) status.setVisibility(GONE);
        Set<String> seen = new HashSet<>();
        if (screen != null) {
            roots.addAll(list(screen.optJSONArray("accessory")));
            regionPadding(screenToolbar, list(screen.optJSONArray("toolbar")), 16, 8);
            regionPadding(screenComposer, list(screen.optJSONArray("composer")), 12, 8);
            regionPadding(screenOverlay, list(screen.optJSONArray("overlay")), 20, 12);
            reconcile(screenToolbar, list(screen.optJSONArray("toolbar")), seen, foreground);
            reconcile(screenComposer, list(screen.optJSONArray("composer")), seen, foreground);
            reconcile(screenOverlay, list(screen.optJSONArray("overlay")), seen, foreground);
            reconcile(screenFooter, list(screen.optJSONArray("footer")), seen, foreground);
        }
        regionPadding(messages, roots, 16, 8);
        reconcile(messages, roots, seen, foreground);
        Iterator<Map.Entry<String, View>> iterator = views.entrySet().iterator(); while (iterator.hasNext()) { Map.Entry<String, View> item = iterator.next(); if (!seen.contains(item.getKey())) { if (item.getValue() instanceof EditText) bindings.remove(item.getValue()); if (item.getValue() instanceof NativeChatStreetMap) ((NativeChatStreetMap)item.getValue()).dispose(); iterator.remove(); } }
        scroll.post(() -> { if (state != next) return; if (!sameConversation || bottom) scroll.scrollTo(0, messages.getHeight()); else scroll.scrollTo(0, oldY); });
    }
    private void reconcile(LinearLayout parent, List<JSONObject> children, Set<String> seen, int inheritedForeground) {
        for (int index = 0; index < children.size(); index++) {
            JSONObject node = children.get(index); String key = node.optString("id"); String type = node.optString("type"); seen.add(key);
            if (node.has("box")) { reconcileBox(parent, node, index, seen, inheritedForeground, false); continue; }
            View view = views.get(key); String classKey = type;
            if (view == null || !classKey.equals(view.getTag(com.trashed.driver.R.id.native_chat_type))) {
                if (view != null) { if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view); if (view instanceof EditText) bindings.remove(view); }
                view = create(type, key); view.setTag(com.trashed.driver.R.id.native_chat_type, type); views.put(key, view);
            }
            view.setTag(key);
            if (view.getParent() != parent || parent.indexOfChild(view) != index) {
                if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
                parent.addView(view, index, new LayoutParams(parent.getOrientation() == HORIZONTAL ? 0 : -1, -2, parent.getOrientation() == HORIZONTAL ? 1 : 0));
            }
            update(view, node, key, inheritedForeground);
            if (view instanceof LinearLayout) {
                List<JSONObject> descendants = new ArrayList<>(); JSONArray list = node.optJSONArray("children");
                if (!node.optString("text").isEmpty()) descendants.add(node(key + "_label", "text", node.optString("text")));
                if (list != null) for (int c = 0; c < list.length(); c++) descendants.add(list.optJSONObject(c));
                JSONObject containerStyle = node.optJSONObject("style");
                int childForeground = containerStyle != null && containerStyle.has("foreground") ? Color.parseColor(containerStyle.optString("foreground")) : inheritedForeground;
                reconcile((LinearLayout) view, descendants, seen, childForeground);
            }
        }
        while (parent.getChildCount() > children.size()) parent.removeViewAt(parent.getChildCount() - 1);
    }
    private void regionPadding(View region, List<JSONObject> nodes, int horizontal, int vertical) {
        boolean boxed = false;
        for (JSONObject node : nodes) { if (node.has("box")) { boxed = true; break; } }
        region.setPadding(boxed ? 0 : dp(horizontal), boxed ? 0 : dp(vertical), boxed ? 0 : dp(horizontal), boxed ? 0 : dp(vertical));
    }
    /** A real Button owns interaction; measured graphics are noninteractive native children. */
    private final class BoxButton extends FrameLayout {
        final Button control; final FrameLayout graphics;
        BoxButton() {
            super(NativeChatView.this.getContext()); control = button("", ""); graphics = new FrameLayout(getContext());
            addView(control, new FrameLayout.LayoutParams(-1, -1)); addView(graphics, new FrameLayout.LayoutParams(-1, -1));
            graphics.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        }
        @Override public boolean performClick() { return control.performClick(); }
    }
    private void reconcileBox(ViewGroup parent, JSONObject node, int index, Set<String> seen, int inheritedColor, boolean decoration) {
        String key = node.optString("id"), type = node.optString("type"); seen.add(key);
        List<JSONObject> children = list(node.optJSONArray("children"));
        boolean button = type.equals("button") || type.equals("link");
        boolean container = Arrays.asList("card", "row", "column", "list").contains(type) || (!children.isEmpty() && !button && !type.equals("input"));
        String classKey = "box:" + type + (container ? ":group" : "");
        View view = views.get(key);
        if (view == null || !classKey.equals(view.getTag(R.id.native_chat_type))) {
            if (view != null) { if (view.getParent() instanceof ViewGroup) ((ViewGroup)view.getParent()).removeView(view); bindings.remove(view); if (view instanceof NativeChatStreetMap) ((NativeChatStreetMap)view).dispose(); }
            view = button ? new BoxButton() : container ? new FrameLayout(getContext()) : create(type, key);
            view.setTag(R.id.native_chat_type, classKey); view.setTag(key); view.setSaveFromParentEnabled(false); views.put(key, view);
            if (view instanceof FrameLayout) { ((FrameLayout)view).setClipChildren(false); ((FrameLayout)view).setClipToPadding(false); }
        }
        JSONObject box = node.optJSONObject("box"); if (box == null) box = new JSONObject();
        int width = px(box.optDouble("width")), height = px(box.optDouble("height"));
        ViewGroup.LayoutParams params;
        if (parent instanceof FrameLayout) { FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(width, height); p.leftMargin = px(box.optDouble("x", 0)); p.topMargin = px(box.optDouble("y", 0)); params = p; }
        else { LayoutParams p = new LayoutParams(width, height); p.leftMargin = px(box.optDouble("x", 0)); p.topMargin = px(box.optDouble("y", 0)); params = p; }
        if (view.getParent() != parent || parent.indexOfChild(view) != index) { if (view.getParent() instanceof ViewGroup) ((ViewGroup)view.getParent()).removeView(view); parent.addView(view, index, params); }
        else view.setLayoutParams(params);
        JSONObject style = node.optJSONObject("style"); if (style == null) style = new JSONObject();
        JSONObject props = node.optJSONObject("props"); if (props == null) props = new JSONObject();
        int color = style.has("foreground") ? Color.parseColor(style.optString("foreground")) : inheritedColor;
        String actionId = node.optString("actionId", null);
        boolean enabled = !readOnly && !node.optBoolean("disabled") && (actionId == null || state.enabled(actionId));
        view.setEnabled(enabled); view.setAlpha((float)style.optDouble("opacity", 1)); view.setElevation(0); view.setMinimumWidth(0); view.setMinimumHeight(0);
        GradientDrawable bg = new GradientDrawable(); bg.setColor(style.has("background") ? Color.parseColor(style.optString("background")) : Color.TRANSPARENT);
        bg.setCornerRadius((float)(style.optDouble("radius", 0) * getResources().getDisplayMetrics().density));
        if (style.has("borderColor")) bg.setStroke(px(style.optDouble("borderWidth", 0)), Color.parseColor(style.optString("borderColor")));
        bg.setSize(width, height);
        view.setBackground(bg); view.setPadding(0, 0, 0, 0);
        // ImageView does not clip its bitmap to a rounded background automatically.
        view.setClipToOutline(view instanceof ImageView && style.optDouble("radius", 0) > 0);
        TextView textView = view instanceof BoxButton ? ((BoxButton)view).control : view instanceof TextView ? (TextView)view : null;
        if (view instanceof EditText) {
            // Keep legacy input-type/date/action semantics, then remove platform defaults below.
            update(view, node, key, color); view.setBackground(bg); view.setLayoutParams(params);
        }
        if (textView != null) {
            textView.setBackground(view instanceof BoxButton ? null : bg); textView.setBackgroundTintList(null); textView.setStateListAnimator(null); textView.setElevation(0);
            textView.setMinWidth(0); textView.setMinimumWidth(0); textView.setMinHeight(0); textView.setMinimumHeight(0); textView.setIncludeFontPadding(false);
            double size = style.optDouble("fontSize", 16);
            textView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, (float)(size * getResources().getDisplayMetrics().density)); textView.setTextColor(color);
            String weight = style.optString("fontWeight", "regular"); int fontWeight = weight.equals("bold") ? 700 : weight.equals("semibold") ? 600 : weight.equals("medium") ? 500 : 400;
            if ("jakarta".equals(style.optString("fontFamily"))) {
                String face = weight.equals("bold") ? "Bold" : weight.equals("semibold") ? "SemiBold" : weight.equals("medium") ? "Medium" : "Regular";
                Typeface exact = measuredFonts.get(face);
                if (exact == null) { exact = Typeface.createFromAsset(getContext().getAssets(), "native-chat-fonts/TrashedJakarta-" + face + ".ttf"); measuredFonts.put(face, exact); }
                textView.setTypeface(exact); // Never synthesize weights for the shared bundled family.
            } else {
                Typeface family = Typeface.create(style.optString("fontFamily").equals("mono") ? "monospace" : "sans-serif", Typeface.NORMAL);
                textView.setTypeface(android.os.Build.VERSION.SDK_INT >= 28 ? Typeface.create(family, fontWeight, false) : Typeface.create(family, fontWeight >= 600 ? Typeface.BOLD : Typeface.NORMAL));
            }
            textView.setLetterSpacing((float)(style.optDouble("letterSpacing", 0) / size));
            textView.setLineSpacing(0, 1); if (style.has("lineHeight")) androidx.core.widget.TextViewCompat.setLineHeight(textView, px(style.optDouble("lineHeight")));
            int horizontal = style.optString("textAlign", "left").equals("center") ? Gravity.CENTER_HORIZONTAL : style.optString("textAlign").equals("right") ? Gravity.RIGHT : Gravity.LEFT;
            textView.setGravity(horizontal | (view instanceof BoxButton || !(view instanceof EditText) ? Gravity.CENTER_VERTICAL : Gravity.TOP));
            double padding = style.optDouble("padding", 0);
            textView.setPadding(px(style.optDouble("paddingLeft", padding)), px(style.optDouble("paddingTop", padding)), px(style.optDouble("paddingRight", padding)), px(style.optDouble("paddingBottom", padding)));
            if (!(view instanceof EditText)) textView.setText(children.isEmpty() ? node.optString("text") : "");
            textView.setContentDescription(node.has("accessibilityLabel") ? node.optString("accessibilityLabel") : null);
            textView.setEnabled(enabled);
        } else view.setContentDescription(node.has("accessibilityLabel") ? node.optString("accessibilityLabel") : null);
        if (view instanceof BoxButton) {
            BoxButton wrapper = (BoxButton)view; wrapper.control.setAllCaps(false);
            wrapper.control.setContentDescription(node.optString("accessibilityLabel", node.optString("text")));
            wrapper.control.setOnClickListener(v -> { if (views.get(key) == wrapper && v.isEnabled()) emit("action", actionId, node.has("value") ? node.optString("value") : null); });
        }
        if (view instanceof ImageView) {
            ImageView image = (ImageView)view; image.setAdjustViewBounds(false); image.setScaleType(ImageView.ScaleType.FIT_CENTER);
            if (props.has("raster")) loadRaster(image, props.optJSONObject("raster")); else loadImage(image, props.optString("src"), key);
        }
        if (view instanceof NativeChatStreetMap) {
            final NativeChatStreetMap mapView = (NativeChatStreetMap)view;
            mapView.setData(props, state.dark);
            mapView.setMarkerSelection(marker -> { if (views.get(key) == mapView && !readOnly && actionId != null) emit("action", actionId, marker); });
        }
        FrameLayout descendants = view instanceof BoxButton ? ((BoxButton)view).graphics : view instanceof FrameLayout ? (FrameLayout)view : null;
        if (descendants != null) {
            for (int c = 0; c < children.size(); c++) reconcileBox(descendants, children.get(c), c, seen, color, decoration || button);
            while (descendants.getChildCount() > children.size()) descendants.removeViewAt(descendants.getChildCount() - 1);
        }
        if (decoration) { view.setClickable(false); view.setFocusable(false); view.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS); if (view instanceof TextView) ((TextView)view).setTextIsSelectable(false); }
    }
    private void loadRaster(ImageView view, JSONObject raster) {
        byte[] bytes = NativeChatState.rasterBytes(raster);
        String source;
        try { source = "png:" + android.util.Base64.encodeToString(java.security.MessageDigest.getInstance("SHA-256").digest(bytes), android.util.Base64.NO_WRAP); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
        if (Objects.equals(view.getTag(R.id.native_chat_image_source), source)) return;
        view.setTag(R.id.native_chat_image_source, source);
        Bitmap bitmap = imageCache.get(source);
        if (bitmap == null) { bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length); if (bitmap != null) { if (imageCache.size() >= 64) imageCache.remove(imageCache.keySet().iterator().next()); imageCache.put(source, bitmap); } }
        view.setImageBitmap(bitmap);
    }
    private int px(double value) { return (int)Math.round(value * getResources().getDisplayMetrics().density); }
    private View create(String type, String key) {
        View view;
        switch (type) {
            case "card": case "row": case "column": case "list": LinearLayout layout = column(); layout.setOrientation(type.equals("row") ? HORIZONTAL : VERTICAL); view = layout; break;
            case "button": case "link": view = button("", key); break;
            case "input": view = input(key); break;
            case "image": ImageView image = new ImageView(getContext()); image.setAdjustViewBounds(true); image.setMaxHeight(dp(240)); image.setScaleType(ImageView.ScaleType.FIT_CENTER); view = image; break;
            case "map": view = new NativeChatStreetMap(getContext()); break;
            default: view = label("", type.equals("badge") ? 12 : 16); ((TextView) view).setTextIsSelectable(type.equals("text") || type.equals("inline"));
        }
        view.setContentDescription(""); view.setSaveFromParentEnabled(false); return view;
    }
    private void update(View view, JSONObject node, String key, int inheritedForeground) {
        JSONObject style = node.optJSONObject("style"); if (style == null) style = new JSONObject();
        int color = style.has("foreground") ? Color.parseColor(style.optString("foreground")) : view instanceof EditText || view instanceof Button ? foreground : inheritedForeground;
        int padding = dp(style.optInt("padding", view instanceof Button ? 10 : 0)); view.setPadding(padding, padding, padding, padding);
        if (style.has("background") || node.optString("type").equals("card")) view.setBackground(fill(style.has("background") ? Color.parseColor(style.optString("background")) : surface, style.optInt("radius", 12)));
        else if (!(view instanceof EditText) && !(view instanceof Button)) view.setBackgroundColor(Color.TRANSPARENT);
        if (view.getLayoutParams() instanceof LayoutParams) { LayoutParams p = (LayoutParams) view.getLayoutParams(); p.bottomMargin = dp(style.optInt("gap", 8)); view.setLayoutParams(p); }
        JSONObject props = node.optJSONObject("props"); if (props == null) props = new JSONObject();
        String text = node.optString("text"); String actionId = node.optString("actionId", null);
        if (view instanceof TextView) {
            TextView label = (TextView) view; label.setTextColor(color); label.setTextSize((float) style.optDouble("fontSize", node.optString("type").equals("badge") ? 12 : 16));
            label.setTypeface(Typeface.DEFAULT, Arrays.asList("bold", "semibold", "medium").contains(style.optString("fontWeight")) ? Typeface.BOLD : Typeface.NORMAL);
            if (!(view instanceof EditText)) label.setText("inline".equals(node.optString("type")) ? inline(node) : markdown(text));
        }
        if (view instanceof EditText) {
            EditText field = (EditText) view;
            int inputType = android.text.InputType.TYPE_CLASS_TEXT;
            switch (props.optString("inputType")) {
                case "email": inputType |= android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS; break;
                case "phone": inputType = android.text.InputType.TYPE_CLASS_PHONE; break;
                case "number": inputType = android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL | android.text.InputType.TYPE_NUMBER_FLAG_SIGNED; break;
                case "date": inputType = android.text.InputType.TYPE_CLASS_DATETIME | android.text.InputType.TYPE_DATETIME_VARIATION_DATE; break;
                case "textarea": inputType |= android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE; break;
            }
            if (field.getInputType() != inputType) field.setInputType(inputType);
            // setInputType can reset TextView's line-based minimum; keep a real touch target.
            field.setMinimumHeight(dp(48)); int horizontal = dp(style.optInt("padding", 12)), vertical = dp(style.optInt("padding", 10)); field.setPadding(horizontal, vertical, horizontal, vertical);
            bind(field, node.optString("value"), actionId, props.optString("placeholder", text), node.optBoolean("disabled"));
            field.setHintTextColor(muted); field.setBackground(fill(background, 10));
            boolean date = "date".equals(props.optString("inputType"));
            field.setFocusableInTouchMode(!date); field.setFocusable(!date);
            field.setOnClickListener(date ? clicked -> {
                if (!field.isEnabled()) return;
                java.util.Calendar calendar = java.util.Calendar.getInstance();
                String[] parts = field.getText().toString().split("-");
                try { if (parts.length == 3) calendar.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1])-1, Integer.parseInt(parts[2])); } catch (NumberFormatException ignored) {}
                NativeChatState shown = state;
                android.app.DatePickerDialog picker = new android.app.DatePickerDialog(getContext(), (v, year, month, day) -> {
                    if (state == shown && field.isEnabled() && views.get(key) == field) field.setText(String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", year, month+1, day));
                }, calendar.get(java.util.Calendar.YEAR), calendar.get(java.util.Calendar.MONTH), calendar.get(java.util.Calendar.DAY_OF_MONTH));
                picker.setButton(android.content.DialogInterface.BUTTON_NEUTRAL, "Clear", (dialog, which) -> { if (state == shown && field.isEnabled() && views.get(key) == field) field.setText(""); }); picker.show();
            } : null);
        } else {
            view.setContentDescription(text);
            view.setEnabled(!readOnly && !node.optBoolean("disabled") && (actionId == null || state.enabled(actionId)));
        }
        if (view instanceof Button) {
            view.setBackgroundTintList(android.content.res.ColorStateList.valueOf(style.has("background") ? Color.parseColor(style.optString("background")) : surface));
            view.setOnClickListener(v -> { if (views.get(key) == v && v.isEnabled()) emit("action", actionId, node.has("value") ? node.optString("value") : null); });
        }
        if (view instanceof ImageView) { if (props.has("raster")) loadRaster((ImageView)view, props.optJSONObject("raster")); else loadImage((ImageView) view, props.optString("src"), key); }
        if (view instanceof NativeChatStreetMap) ((NativeChatStreetMap) view).setData(props, state.dark);
    }
    private void bind(EditText field, String value, String action, String placeholder, boolean disabled) {
        Binding binding = bindings.get(field); binding.action = action;
        String previous = binding.server; binding.server = value;
        boolean apply;
        if (binding.pending.contains(value)) {
            while (!binding.pending.isEmpty() && !binding.pending.removeFirst().equals(value)) {}
            apply = binding.pending.isEmpty();
        } else if (!value.equals(previous)) { binding.pending.clear(); apply = true; }
        else apply = binding.pending.isEmpty();
        if (apply) {
            if (!field.getText().toString().equals(value)) { int cursor = field.getSelectionStart(); binding.updating = true; field.setText(value); field.setSelection(Math.max(0, Math.min(cursor < 0 ? value.length() : cursor, value.length()))); binding.updating = false; }
            binding.local = value;
        }
        field.setHint(placeholder); field.setContentDescription(placeholder);
        field.setEnabled(!readOnly && !disabled && (action == null || state.enabled(action)));
    }
    private EditText input(String tag) {
        EditText field = new EditText(getContext()); field.setTag(tag); field.setTextSize(16); field.setMinHeight(dp(48)); field.setFilters(new InputFilter[]{new InputFilter.LengthFilter(4000)});
        field.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE); field.setMinimumHeight(dp(48)); field.setPadding(dp(12), dp(10), dp(12), dp(10)); field.setSaveEnabled(false); if (android.os.Build.VERSION.SDK_INT >= 26) field.setImportantForAutofill(IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        Binding binding = new Binding(); bindings.put(field, binding);
        field.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {} public void onTextChanged(CharSequence s, int start, int before, int count) {}
            public void afterTextChanged(Editable editable) {
                if (binding.updating || state == null || !field.isEnabled() || (field != draft && views.get(field.getTag()) != field)) return;
                binding.local = editable.toString();
                binding.pending.addLast(binding.local); if (binding.pending.size() > 64) binding.pending.removeFirst();
                emit(field == draft ? "draft" : "action", field == draft ? state.json.optJSONObject("input").optString("sendActionId") : binding.action, binding.local);
            }
        }); return field;
    }
    private void emit(String kind, String id, String value) {
        if (state == null || readOnly || !events.allowed() || id == null) return;
        if (!kind.equals("draft") && !state.enabled(id)) return;
        if (kind.equals("draft") && state.json.optJSONObject("input").optBoolean("disabled")) return;
        events.event(kind, state.context, state.revision, id, value);
    }
    private void showHistory() {
        if (state == null || readOnly || !events.allowed()) return;
        NativeChatState shown = state; JSONArray list = state.json.optJSONArray("conversations"); String[] titles = new String[list.length()];
        for (int i = 0; i < titles.length; i++) { JSONObject item = list.optJSONObject(i); titles[i] = (item.optBoolean("selected") ? "✓ " : "") + (item.optBoolean("pinned") ? "★ " : "") + item.optString("title") + "\n" + item.optString("detail"); }
        conversationDialog = new androidx.appcompat.app.AlertDialog.Builder(getContext()).setTitle("Conversations").setItems(titles, (dialog, which) -> { if (state == shown) emit("action", list.optJSONObject(which).optString("id"), null); }).setNegativeButton("Close", null).create(); conversationDialog.show();
    }
    boolean dismissDialog() { if (state != null && state.json.optJSONObject("screen") != null && state.json.optJSONObject("screen").optJSONArray("overlay").length() > 0) { emit("action", "screen-dismiss", null); return true; } return closeHistoryDialog(); }
    private boolean closeHistoryDialog() { if (conversationDialog == null) return false; conversationDialog.dismiss(); conversationDialog = null; return true; }
    private void disposeMaps() { for (View view : views.values()) if (view instanceof NativeChatStreetMap) ((NativeChatStreetMap)view).dispose(); }
    void dispose() { closeHistoryDialog(); disposeMaps(); images.shutdownNow(); imageCache.clear(); state = null; views.clear(); bindings.clear(); }
    private void loadImage(ImageView view, String src, String key) {
        if (Objects.equals(view.getTag(R.id.native_chat_image_source), src)) return;
        view.setTag(R.id.native_chat_image_source, src); view.setImageDrawable(null);
        if (!NativeChatState.safeImage(src, origin)) return;
        Bitmap cached = imageCache.get(src); if (cached != null) { view.setImageBitmap(cached); return; }
        images.execute(() -> {
            Bitmap image = null; HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(src).openConnection(); connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(3000); connection.setReadTimeout(3000); connection.setRequestProperty("Accept", "image/*");
                if (connection.getResponseCode() != 200 || connection.getContentType() == null || !connection.getContentType().startsWith("image/")) return;
                byte[] bytes = NativeChatCache.readBounded(connection.getInputStream(), 2 * 1024 * 1024);
                BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true; BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 12000 || bounds.outHeight > 12000) return;
                bounds.inJustDecodeBounds = false; bounds.inSampleSize = Math.max(1, Math.max(bounds.outWidth, bounds.outHeight) / 640); image = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            } catch (Exception ignored) {} finally { if (connection != null) connection.disconnect(); }
            Bitmap result = image; post(() -> { if (state == null || result == null || views.get(key) != view || !Objects.equals(view.getTag(R.id.native_chat_image_source), src)) return; if (imageCache.size() >= 12) imageCache.remove(imageCache.keySet().iterator().next()); imageCache.put(src, result); view.setImageBitmap(result); });
        });
    }
    private static List<JSONObject> list(JSONArray array) { List<JSONObject> out = new ArrayList<>(); if (array != null) for (int i=0; i<array.length(); i++) out.add(array.optJSONObject(i)); return out; }
    private CharSequence inline(JSONObject node) {
        SpannableStringBuilder text = new SpannableStringBuilder(node.optString("text"));
        for (JSONObject child : list(node.optJSONArray("children"))) text.append(inline(child));
        JSONObject style = node.optJSONObject("style");
        if (style != null && text.length() > 0) {
            if (Arrays.asList("bold", "semibold", "medium").contains(style.optString("fontWeight"))) text.setSpan(new StyleSpan(Typeface.BOLD), 0, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            if (style.has("foreground")) text.setSpan(new ForegroundColorSpan(Color.parseColor(style.optString("foreground"))), 0, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        return text;
    }
    private TextView label(String value, int size) { TextView view = new TextView(getContext()); view.setText(value); view.setTextSize(size); return view; }
    private Button button(String value, String tag) { Button button = new Button(getContext()); button.setText(value); button.setTag(tag); button.setAllCaps(false); button.setMinHeight(dp(48)); button.setMinimumHeight(dp(48)); return button; }
    private LinearLayout column() { LinearLayout column = new LinearLayout(getContext()); column.setOrientation(VERTICAL); return column; }
    private GradientDrawable fill(int color, int radius) { GradientDrawable fill = new GradientDrawable(); fill.setColor(color); fill.setCornerRadius(dp(radius)); return fill; }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private static JSONObject object(Object... values) { JSONObject out = new JSONObject(); for (int i = 0; i < values.length; i += 2) put(out, (String) values[i], values[i + 1]); return out; }
    private static void put(JSONObject out, String key, Object value) { try { out.put(key, value); } catch (JSONException error) { throw new IllegalArgumentException(error); } }
    private static JSONObject node(String id, String type, String text) { JSONObject out = object("id", "__native_" + id, "type", type); if (text != null) put(out, "text", text); return out; }
    private static JSONObject actionNode(String id, String text, String action) { JSONObject out = node(id, "button", text); put(out, "actionId", action); return out; }
    static CharSequence markdown(String source) {
        // Bounded native text spans; never execute links or HTML. Retain unhandled syntax rather than lose content.
        SpannableStringBuilder out = new SpannableStringBuilder();
        Pattern pattern = Pattern.compile("\\*\\*([^*\\n]+)\\*\\*|`([^`\\n]+)`|(?m)^#{1,6} (.+)$"); Matcher matcher = pattern.matcher(source);
        int end = 0;
        while (matcher.find()) {
            out.append(source, end, matcher.start()); int start = out.length();
            out.append(matcher.group(1) != null ? matcher.group(1) : matcher.group(2) != null ? matcher.group(2) : matcher.group(3));
            Object span = matcher.group(2) != null ? new TypefaceSpan("monospace") : new StyleSpan(Typeface.BOLD);
            out.setSpan(span, start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); end = matcher.end();
        }
        out.append(source, end, source.length());
        return out;
    }
    /** Offline native coordinates/route diagram; no third-party tile requests or API key. */
    private final class CoordinateMap extends View {
        JSONObject data = new JSONObject(); final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        CoordinateMap(Context context) { super(context); }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas); canvas.drawColor(surface); List<double[]> all = new ArrayList<>(); JSONArray markers = data.optJSONArray("markers"), lines = data.optJSONArray("lines");
            if (markers != null) for (int i = 0; i < markers.length(); i++) all.add(point(markers.optJSONObject(i)));
            if (lines != null) for (int i = 0; i < lines.length(); i++) { JSONArray points = lines.optJSONObject(i).optJSONArray("points"); for (int p = 0; p < points.length(); p++) all.add(point(points.optJSONObject(p))); }
            if (all.isEmpty()) return; double minX = 180, maxX = -180, minY = 90, maxY = -90;
            for (double[] p : all) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
            double dx = Math.max(.001, maxX - minX), dy = Math.max(.001, maxY - minY); paint.setColor(PRIMARY); paint.setStrokeWidth(dp(3));
            if (lines != null) for (int i = 0; i < lines.length(); i++) { JSONArray points = lines.optJSONObject(i).optJSONArray("points"); for (int p = 1; p < points.length(); p++) { double[] a = point(points.optJSONObject(p - 1)), b = point(points.optJSONObject(p)); canvas.drawLine(x(a[0], minX, dx), y(a[1], minY, dy), x(b[0], minX, dx), y(b[1], minY, dy), paint); } }
            if (markers != null) for (int i = 0; i < markers.length(); i++) { double[] p = point(markers.optJSONObject(i)); canvas.drawCircle(x(p[0], minX, dx), y(p[1], minY, dy), dp(6), paint); }
            paint.setTextSize(dp(12)); paint.setColor(foreground); canvas.drawText("Route overview · no street basemap", dp(12), getHeight() - dp(8), paint);
        }
        private double[] point(JSONObject p) { return new double[]{p.optDouble("longitude"), p.optDouble("latitude")}; }
        private float x(double x, double min, double delta) { return dp(18) + (float) ((x - min) / delta) * (getWidth() - dp(36)); }
        private float y(double y, double min, double delta) { return dp(18) + (float) (1 - (y - min) / delta) * (getHeight() - dp(54)); }
    }
}
