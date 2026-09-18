package com.trashed.driver;

import android.content.Context;
import android.content.res.ColorStateList;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.core.view.ViewCompat;
import androidx.recyclerview.widget.DiffUtil;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.ListAdapter;
import androidx.recyclerview.widget.RecyclerView;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;
import org.json.JSONObject;
import java.io.File;
import java.util.*;
import java.util.concurrent.*;

/** API-backed native workspace. No DOM, HTML, JS state projection, disk data cache or offline writes. */
final class NativeWorkspaceView extends LinearLayout {
    interface Host {
        String session();
        String cookies();
        default NativeWorkspaceApi.CookieSource cookieSource() { return url -> cookies(); }
        void web(String path);
        default void back() { web("/vendor"); }
        default void signIn() { web("/app/login"); }
        default void invalidated() { }
    }
    final String destination, origin, session;
    private final Host host;
    private final NativeWorkspaceTokens tokens;
    private final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final Set<NativeWorkspaceApi> requests = new HashSet<>();
    private int generation, audioGeneration;
    private boolean disposed, suspended, loading, loadingMore;
    private NativeWorkspaceApi.Profile profile;
    private NativeDashboard dashboard;
    private NativeDashboardView dashboardView;
    private NativeRentalsMapView rentalsView;
    private long rentalsUserId, rentalsVendorId;
    private TextView status;
    private LinearLayout body, playerStrip;
    private RecyclerView list;
    private CallsAdapter adapter;
    private final LinkedHashMap<String, NativeWorkspaceApi.Call> rows = new LinkedHashMap<>();
    private final Set<String> expanded = new HashSet<>();
    private NativeCallTranscriptView transcriptScreen;
    private final Map<View, Integer> transcriptHiddenViews = new HashMap<>();
    private String search, filter, sort;
    private int page, pages, total;
    private Runnable debounce;
    private com.google.android.material.button.MaterialButton more, playback;
    private TextView playbackPosition;
    private SeekBar seek;
    final NativeWorkspaceAudio audio;
    private AlertDialog editor;
    private final Set<AlertDialog> transientDialogs = new HashSet<>();
    private void showTransient(AlertDialog dialog) {
        transientDialogs.add(dialog);
        dialog.setOnDismissListener(ignored -> transientDialogs.remove(dialog));
        dialog.show(); NativeSystemAppearance.dialog(dialog);
    }
    private void dismissTransient() {
        for (AlertDialog dialog : new ArrayList<>(transientDialogs)) dialog.dismiss();
        transientDialogs.clear();
    }
    private TextInputEditText nameInput, emailInput, phoneInput;
    private TextView editError;
    private boolean saving;
    private final Runnable sessionWatch = new Runnable() {
        @Override public void run() {
            if (disposed || suspended) return;
            if (!session.equals(host.session()) || session.isEmpty()) { invalidate("Your session changed. Reopen this screen after signing in."); return; }
            main.postDelayed(this, 500);
        }
    };
    NativeWorkspaceView(Context context, Host host, String origin, String url, String destination, boolean dark) {
        super(context); this.host = host; this.origin = origin; this.destination = destination; session = host.session();
        tokens = new NativeWorkspaceTokens(context, dark);
        search = NativeWorkspacePolicy.query(url, "search", ""); filter = NativeWorkspacePolicy.query(url, "filter", "all"); sort = NativeWorkspacePolicy.query(url, "sort", "timestamp-desc");
        try { NativeWorkspacePolicy.callsPath(1, search, filter, sort); }
        catch (IllegalArgumentException ignored) { filter = "all"; sort = "timestamp-desc"; }
        setOrientation(VERTICAL); setBackgroundColor(tokens.background); setPadding(tokens.dp(20), tokens.dp(8), tokens.dp(20), tokens.dp(8));
        setTag("native-workspace-" + destination);
        audio = new NativeWorkspaceAudio(context, this::updateAudio);
        ViewCompat.setAccessibilityPaneTitle(this, "rentals".equals(destination) ? "Rentals" : "dashboard".equals(destination) ? "Dashboard" : "profile".equals(destination) ? "Profile" : "Call history");
        build(); refresh(); main.post(sessionWatch);
    }
    private void build() {
        removeAllViews();
        com.google.android.material.appbar.MaterialToolbar header = new com.google.android.material.appbar.MaterialToolbar(tokens.context);
        header.setTitle("rentals".equals(destination) ? "Rentals" : "dashboard".equals(destination) ? "Dashboard" : "profile".equals(destination) ? "Your account" : "Call history");
        header.setTitleTextColor(tokens.foreground);header.setBackgroundColor(tokens.background);header.setElevation(0);
        header.setNavigationIcon(R.drawable.native_workspace_back);header.setNavigationIconTint(tokens.accent);
        header.setNavigationContentDescription("Back");header.setNavigationOnClickListener(view -> confirmLeave(host::back));
        header.getMenu().add("Refresh").setShowAsAction(android.view.MenuItem.SHOW_AS_ACTION_NEVER);
        if ("calls".equals(destination)) header.getMenu().add("More call tools · Web").setShowAsAction(android.view.MenuItem.SHOW_AS_ACTION_NEVER);
        header.setOnMenuItemClickListener(item -> {
            if ("Refresh".contentEquals(item.getTitle())) confirmLeave(this::refresh);
            else showWebCallTools();
            return true;
        });
        addView(header, tokens.row());
        status = tokens.text("Loading…", 13, false); status.setTextColor(tokens.secondary);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); addView(status, tokens.row());
        if ("rentals".equals(destination)) {
            rentalsView = new NativeRentalsMapView(tokens, this::refresh, path -> {
                if (!disposed && !suspended && session.equals(host.session())) host.web(path);
            });
            addView(rentalsView, new LinearLayout.LayoutParams(-1, 0, 1));
        } else if (!"calls".equals(destination)) {
            ScrollView scroll = new ScrollView(tokens.context); body = tokens.column();
            // The host consumes the measured dock and system insets. This is only
            // scrollable footer breathing room, not another dock-height inset.
            if ("dashboard".equals(destination)) body.setPadding(0, 0, 0, tokens.dp(24));
            scroll.addView(body, tokens.row()); addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
            if("dashboard".equals(destination)) scroll.setOnTouchListener(new View.OnTouchListener(){float start=-1;public boolean onTouch(View v,MotionEvent e){if(e.getActionMasked()==MotionEvent.ACTION_DOWN)start=scroll.canScrollVertically(-1)?-1:e.getY();if(e.getActionMasked()==MotionEvent.ACTION_UP && start>=0 && e.getY()-start>tokens.dp(100)){start=-1;refresh();}return false;}});
        } else buildCalls();
    }
    private void buildCalls() {

        TextInputLayout searchBox = new TextInputLayout(tokens.context); searchBox.setHint("Search calls");
        TextInputEditText input = new TextInputEditText(searchBox.getContext()); input.setSingleLine(true); input.setText(search);
        input.setTextColor(tokens.foreground); input.setTypeface(tokens.regular); input.setMinHeight(tokens.dp(48));
        input.setInputType(InputType.TYPE_CLASS_TEXT); input.setContentDescription("Search calls"); input.setTag("workspace-search");
        searchBox.addView(input); addView(searchBox, tokens.row());
        input.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                search = s.toString(); invalidateRequests(); rows.clear(); expanded.clear(); adapter.submitList(new ArrayList<>()); page = 0; pages = 0;
                audioGeneration++; audio.release(); updateAudio(); loading = false; more.setEnabled(false); status.setText("Searching…");
                if (debounce != null) main.removeCallbacks(debounce);
                debounce = () -> loadPage(1); main.postDelayed(debounce, 350);
            }
            @Override public void afterTextChanged(Editable value) { }
        });
        LinearLayout controls = new LinearLayout(tokens.context);
        controls.addView(tokens.button("Filter", false, () -> choices("Call status", new String[]{"All", "Completed", "In progress", "Failed"}, new String[]{"all", "completed", "in-progress", "failed"}, true)), new LinearLayout.LayoutParams(0, -2, 1));
        controls.addView(tokens.button("Sort", false, () -> choices("Sort calls", new String[]{"Newest first", "Oldest first", "Longest first", "Customer name"}, new String[]{"timestamp-desc", "timestamp-asc", "duration-desc", "customerName-asc"}, false)), new LinearLayout.LayoutParams(0, -2, 1));
        addView(controls, tokens.row());
        list = new RecyclerView(tokens.context); list.setTag("native-calls-list"); list.setLayoutManager(new LinearLayoutManager(tokens.context));
        adapter = new CallsAdapter(); list.setAdapter(adapter); list.setItemAnimator(null);
        list.setClipToPadding(false); list.setPadding(0, tokens.dp(4), 0, tokens.dp(12));
        list.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override public void onScrolled(@NonNull RecyclerView recycler, int dx, int dy) {
                if (dy > 0 && !recycler.canScrollVertically(1) && page < pages && !loading) loadPage(page + 1);
            }
        });
        // Native pull-to-refresh without an additional dependency; Refresh remains an accessible alternative.
        list.addOnItemTouchListener(new RecyclerView.SimpleOnItemTouchListener() {
            float start = -1;
            @Override public boolean onInterceptTouchEvent(@NonNull RecyclerView recycler, @NonNull MotionEvent event) {
                if (event.getActionMasked() == MotionEvent.ACTION_DOWN) start = recycler.canScrollVertically(-1) ? -1 : event.getY();
                if (event.getActionMasked() == MotionEvent.ACTION_UP && start >= 0 && event.getY() - start > tokens.dp(100)) { start = -1; refresh(); }
                return false;
            }
        });
        addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
        more = tokens.button("Load more", false, () -> loadPage(page == 0 ? 1 : page + 1)); more.setEnabled(false); addView(more, tokens.row());
        playerStrip = tokens.column(); playerStrip.setBackgroundColor(tokens.surface); playerStrip.setPadding(tokens.dp(8), 0, tokens.dp(8), 0);
        playbackPosition = tokens.text("", 12, false); playerStrip.addView(playbackPosition, tokens.row());
        seek = new SeekBar(tokens.context); seek.setContentDescription("Recording position"); seek.setMinimumHeight(tokens.dp(48)); seek.setProgressTintList(ColorStateList.valueOf(tokens.accent));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar view, int value, boolean user) { if (user) audio.seek(value); }
            @Override public void onStartTrackingTouch(SeekBar view) { }
            @Override public void onStopTrackingTouch(SeekBar view) { }
        });
        playerStrip.addView(seek, tokens.row());
        LinearLayout transport = new LinearLayout(tokens.context);
        playback = tokens.button("Play", true, () -> {
            if (!audio.error.isEmpty() && !audio.prepared) { NativeWorkspaceApi.Call call = rows.get(audio.id); if (call != null) play(call); }
            else audio.toggle();
        });
        transport.addView(playback, new LinearLayout.LayoutParams(0, -2, 1));
        com.google.android.material.button.MaterialButton speed = tokens.button("1×", false, () -> audio.cycleSpeed()); speed.setTag("workspace-speed"); speed.setContentDescription("Playback speed");
        transport.addView(speed, new LinearLayout.LayoutParams(0, -2, 1));
        transport.addView(tokens.button("Stop", false, () -> { audioGeneration++; audio.release(); updateAudio(); }), new LinearLayout.LayoutParams(0, -2, 1));
        playerStrip.addView(transport); addView(playerStrip, tokens.row()); playerStrip.setVisibility(GONE);
    }
    private void showWebCallTools() {
        showTransient(new MaterialAlertDialogBuilder(tokens.context).setTitle("Call tools on the website")
            .setItems(new String[]{"Live call monitor", "Full call workspace (favorites & forwarding)"},
                (dialog, which) -> host.web(new String[]{"/calls/monitor", "/calls/history"}[which]))
            .setNegativeButton("Cancel",null).create());
    }
    private void choices(String title, String[] labels, String[] values, boolean isFilter) {
        showTransient(new MaterialAlertDialogBuilder(tokens.context).setTitle(title).setItems(labels, (dialog, which) -> {
            if (isFilter) filter = values[which]; else sort = values[which]; refresh();
        }).setNegativeButton("Cancel", null).create());
    }
    private NativeWorkspaceApi request() { NativeWorkspaceApi api = new NativeWorkspaceApi(origin, host.cookieSource()); requests.add(api); return api; }
    private interface Work<T> { T run(NativeWorkspaceApi api) throws Exception; }
    private interface Success<T> { void accept(T result); }
    private <T> void run(Work<T> work, Success<T> success, Success<Exception> error) {
        if (disposed || suspended || !session.equals(host.session()) || session.isEmpty()) { invalidate("Sign in to continue."); return; }
        int ticket = generation; NativeWorkspaceApi api = request();
        executor.execute(() -> {
            try { T result = work.run(api); main.post(() -> { requests.remove(api); if (current(ticket)) success.accept(result); else if (result instanceof File) ((File) result).delete(); }); }
            catch (Exception failure) { main.post(() -> { requests.remove(api); if (current(ticket)) error.accept(failure); }); }
        });
    }
    private boolean current(int ticket) { return !disposed && !suspended && ticket == generation && session.equals(host.session()); }
    private void invalidateRequests() { generation++; for (NativeWorkspaceApi api : requests) api.cancel(); requests.clear(); }
    void refresh() {
        dismissTranscript();
        if (disposed || suspended) return;
        if ("rentals".equals(destination)) { refreshRentals(); return; }
        if ("dashboard".equals(destination)) { refreshDashboard(); return; }
        if (debounce != null) main.removeCallbacks(debounce);
        invalidateRequests(); audioGeneration++; audio.release(); updateAudio(); profile = null;
        rows.clear(); expanded.clear(); page = 0; pages = 0; total = 0;
        if (adapter != null) { adapter.submitList(new ArrayList<>()); more.setEnabled(false); }
        else body.removeAllViews();
        loading = true; status.setText("Loading…");
        run(NativeWorkspaceApi::profile, result -> {
            profile = result; loading = false;
            if ("profile".equals(destination)) renderProfile("Up to date");
            else if (!profile.calls) { status.setText("Call history is not available for your role."); more.setEnabled(false); }
            else loadPage(1);
        }, this::failure);
    }
    private void refreshRentals() {
        invalidateRequests(); rentalsView.clear(); loading = true; status.setText("Loading rentals…");
        run(NativeWorkspaceApi::rentalsMap, result -> {
            if (rentalsUserId != 0 && (rentalsUserId != result.userId || rentalsVendorId != result.vendorId)) {
                invalidate("Your account or workspace changed. Reopen Rentals."); return;
            }
            rentalsUserId = result.userId; rentalsVendorId = result.vendorId;
            loading = false; rentalsView.show(result); status.setText("Up to date");
        }, this::failure);
    }
    private void refreshDashboard() {
        invalidateRequests(); loading=true; status.setText(dashboard==null?"Loading dashboard…":"Refreshing · showing previous snapshot");
        run(NativeWorkspaceApi::dashboard, result -> {
            try { result.requireSameScope(dashboard); } catch (Exception error) { dashboard=null; body.removeAllViews(); failure(error); return; }
            dashboard=result; loading=false; body.removeAllViews();
            if(dashboardView==null) dashboardView=new NativeDashboardView(tokens);
            dashboardView.show(result); body.addView(dashboardView,tokens.row()); status.setText("Up to date");
        }, error -> { loading=false;
            if(error instanceof NativeWorkspaceApi.Failure && (((NativeWorkspaceApi.Failure)error).status==401 || ((NativeWorkspaceApi.Failure)error).status==403)){dashboard=null;failure(error);return;}
            status.setText((dashboard==null?"Dashboard unavailable. ":"Refresh failed · showing previous snapshot. ")+"Check your connection and retry.");
            View previous=body.findViewWithTag("dashboard-retry");if(previous!=null)body.removeView(previous);
            View retry=tokens.button("Retry",true,this::refreshDashboard);retry.setTag("dashboard-retry");body.addView(retry,tokens.row());
        });
    }
    void appearanceChanged() {
        tokens.updateAppearance(); NativeSystemAppearance.repaint(this);
        if(editor!=null) NativeSystemAppearance.dialog(editor);
        for(AlertDialog dialog : transientDialogs) NativeSystemAppearance.dialog(dialog);
        if(dashboardView!=null)dashboardView.invalidate();
        if(rentalsView!=null)rentalsView.appearanceChanged();
    }
    private void renderProfile(String message) {
        body.removeAllViews(); status.setText(message);
        String displayName = profile.name.isEmpty() ? "Your account" : profile.name;
        TextView monogram = tokens.text(displayName.substring(0, 1).toUpperCase(Locale.getDefault()), 36, true);
        monogram.setTextColor(tokens.accent); body.addView(monogram);
        body.addView(tokens.text(displayName, 24, true));
        field("Email", profile.email + (profile.emailVerified ? "\nVerified" : "\nNot verified"));
        field("Phone", profile.phone.isEmpty() ? "Not provided" : profile.phone);
        field("Workspace", profile.business.isEmpty() ? "No vendor workspace" : profile.business);
        field("Roles", profile.roles.isEmpty() ? "Member" : profile.roles);
        body.addView(tokens.button("Edit profile", true, this::edit), tokens.row());
        TextView note = tokens.text("Name, email and phone are saved to your Trashed account. Other account settings remain available on the website.", 13, false); note.setTextColor(tokens.secondary); body.addView(note);
        String[] labels = {"Account", "Inbox", "Team", "Access", "Preferences"};
        String[] routes = {"account", "inbox", "team", "access", "preferences"};
        for (int i = 0; i < labels.length; i++) {
            final String route = routes[i];
            body.addView(tokens.button(labels[i] + " · Web", false, () -> host.web(route.equals("preferences") ? "/vendor/profile/preferences" : "/vendor/profile?view=" + route)), tokens.row());
        }
    }
    private void field(String label, String value) {
        TextView title = tokens.text(label, 12, false); title.setTextColor(tokens.secondary); body.addView(title);
        TextView content = tokens.text(value, 16, false); content.setTextIsSelectable(true); body.addView(content);
        View divider = new View(tokens.context); divider.setBackgroundColor(tokens.divider); body.addView(divider, new LinearLayout.LayoutParams(-1, tokens.dp(1)));
    }
    private void loadPage(int requested) {
        if (disposed || suspended || loading || (requested > 1 && (requested > pages || page + 1 != requested))) return;
        if (profile == null) { refresh(); return; }
        if (!profile.calls) return;
        loading = true; loadingMore = requested > 1; more.setEnabled(false); status.setText(loadingMore ? "Loading more calls…" : "Loading calls…");
        final String query = search, statusFilter = filter, order = sort; NativeWorkspaceApi.Profile expected = profile;
        run(api -> api.calls(expected, requested, query, statusFilter, order), result -> {
            loading = false; if (requested == 1) rows.clear();
            for (NativeWorkspaceApi.Call call : result.calls) rows.put(call.id, call);
            page = result.page; pages = result.pages; total = result.total;
            adapter.submitList(new ArrayList<>(rows.values()));
            status.setText(rows.isEmpty() ? "No calls match your search." : rows.size() + " of " + total + " calls");
            more.setText(page < pages ? "Load more" : "All pages loaded"); more.setEnabled(page < pages);
        }, this::failure);
    }
    private void failure(Exception error) {
        loading = false; int code = error instanceof NativeWorkspaceApi.Failure ? ((NativeWorkspaceApi.Failure) error).status : 0;
        if (code == 401 || code == 403) { invalidate(error.getMessage()); return; }
        status.setText(error instanceof NativeWorkspaceApi.Failure ? error.getMessage() : "Unable to connect. Check your connection and retry.");
        if (rentalsView != null) { rentalsView.error(true); }
        else if (more != null) { more.setText("Retry"); more.setEnabled(true); }
        else { body.removeAllViews(); body.addView(tokens.button("Retry", true, this::refresh)); }
    }
    private void invalidate(String message) {
        dismissTransient();
        dismissTranscript();
        invalidateRequests(); audioGeneration++; audio.release(); updateAudio(); profile = null; rows.clear(); expanded.clear();
        if (editor != null) { editor.dismiss(); editor = null; }
        saving = false; loading = false;
        if (rentalsView != null) { rentalsView.clear(); rentalsUserId = rentalsVendorId = 0; }
        else if (adapter != null) { adapter.submitList(new ArrayList<>()); more.setEnabled(false); } else body.removeAllViews();
        status.setText(message); main.removeCallbacks(sessionWatch);
        host.invalidated();
    }
    private void edit() {
        if (profile == null || editor != null) return;
        LinearLayout form = tokens.column(); form.setPadding(tokens.dp(24), tokens.dp(8), tokens.dp(24), 0);
        nameInput = editField(form, "Name", profile.name, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        emailInput = editField(form, "Email", profile.email, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        phoneInput = editField(form, "Phone", profile.phone, InputType.TYPE_CLASS_PHONE);
        editError = tokens.text("", 13, false); editError.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); form.addView(editError);
        ScrollView scroll = new ScrollView(tokens.context); scroll.addView(form);
        editor = new MaterialAlertDialogBuilder(tokens.context).setTitle("Edit profile").setView(scroll).setPositiveButton("Save", null).setNegativeButton("Cancel", null).create();
        editor.setCancelable(false); editor.setCanceledOnTouchOutside(false);
        editor.setOnKeyListener((dialog, key, event) -> {
            if (key == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) { confirmLeave(() -> {}); return true; }
            return false;
        });
        editor.setOnShowListener(ignored -> { editor.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> save()); editor.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(view -> confirmLeave(() -> {})); });
        editor.show(); NativeSystemAppearance.dialog(editor);
    }
    private TextInputEditText editField(LinearLayout form, String label, String value, int type) {
        TextInputLayout wrapper = new TextInputLayout(tokens.context); wrapper.setHint(label);
        TextInputEditText field = new TextInputEditText(wrapper.getContext()); field.setInputType(type); field.setSingleLine(true); field.setText(value); field.setTypeface(tokens.regular);
        field.setTextColor(tokens.foreground); field.setMinHeight(tokens.dp(56)); field.setContentDescription(label);
        field.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(label.equals("Name") ? 100 : label.equals("Email") ? 254 : 40)});
        wrapper.addView(field); form.addView(wrapper, tokens.row()); return field;
    }
    private String value(TextInputEditText input) { return input.getText() == null ? "" : input.getText().toString().trim(); }
    private boolean dirty() { return profile != null && (!value(nameInput).equals(profile.name) || !value(emailInput).equals(profile.email) || !value(phoneInput).equals(profile.phone)); }
    void confirmLeave(Runnable action) {
        if (editor == null) { action.run(); return; }
        if (saving) { editError.setText("Wait for the save to finish."); return; }
        Runnable leave = () -> { editor.dismiss(); editor = null; action.run(); };
        if (!dirty()) { leave.run(); return; }
        showTransient(new MaterialAlertDialogBuilder(tokens.context).setTitle("Discard changes?").setMessage("Your unsaved profile changes will be lost.")
            .setNegativeButton("Keep editing", null).setPositiveButton("Discard", (dialog, which) -> { if (!disposed && editor != null && !saving) leave.run(); }).create());
    }
    boolean back() { if (dismissTranscript()) return true; if (editor == null) return false; confirmLeave(() -> {}); return true; }
    private void save() {
        if (saving || profile == null) return;
        String name = value(nameInput), email = value(emailInput), phone = value(phoneInput);
        if (name.length() < 2) { nameInput.setError("Enter at least 2 characters"); return; }
        if (!NativeWorkspacePolicy.validEmail(email)) { emailInput.setError("Enter a valid email address"); return; }
        if (!phone.isEmpty() && !phone.matches("[+()0-9 .-]{3,40}")) { phoneInput.setError("Enter a valid phone number"); return; }
        saving = true; setEditorEnabled(false); editError.setText("Saving and verifying…"); NativeWorkspaceApi.Profile previous = profile;
        run(api -> api.save(previous, name, email, phone), result -> {
            saving = false; profile = result; if (editor != null) { editor.dismiss(); editor = null; } renderProfile("Profile saved and verified");
        }, error -> {
            saving = false;
            if (error instanceof NativeWorkspaceApi.EmailChanged) {
                invalidate(error.getMessage());
                body.addView(tokens.button("Sign in again",true,host::signIn),tokens.row());
                return;
            }
            if (error instanceof NativeWorkspaceApi.Failure && ((NativeWorkspaceApi.Failure) error).status == 401) { invalidate(error.getMessage()); return; }
            setEditorEnabled(true); editError.setText(error instanceof NativeWorkspaceApi.Failure ? error.getMessage() : "Save could not be verified. Your draft is still here. Refresh or retry when online.");
        });
    }
    private void setEditorEnabled(boolean value) { if (editor != null) { nameInput.setEnabled(value); emailInput.setEnabled(value); phoneInput.setEnabled(value); editor.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(value); } }
    private void play(NativeWorkspaceApi.Call call) {
        if (call.id.equals(audio.id) && audio.prepared) { audio.toggle(); return; }
        int ticket = ++audioGeneration; audio.loading(call.id);
        NativeWorkspaceApi.Profile expected = profile;
        run(api -> {
            NativeWorkspaceApi.Profile current = api.profile();
            if (expected == null || !expected.scope().equals(current.scope())) throw new NativeWorkspaceApi.Failure(401, "Your workspace changed.");
            File file = api.recording(getContext().getCacheDir(), call.recording);
            try {
                if (!expected.scope().equals(api.profile().scope())) throw new NativeWorkspaceApi.Failure(401, "Your workspace changed.");
                return file;
            } catch (Exception failure) { file.delete(); throw failure; }
        }, file -> { if (ticket == audioGeneration) audio.open(file); else file.delete(); }, error -> {
            if (ticket != audioGeneration) return;
            if (error instanceof NativeWorkspaceApi.Failure && (((NativeWorkspaceApi.Failure) error).status == 401 || ((NativeWorkspaceApi.Failure) error).status == 403)) { invalidate(error.getMessage()); return; }
            audio.fail(error instanceof NativeWorkspaceApi.Failure ? error.getMessage() : "Recording unavailable. Check your connection and retry.");
        });
    }
    private void updateAudio() {
        if (playerStrip == null) return;
        playerStrip.setVisibility(audio.id.isEmpty() ? GONE : VISIBLE);
        NativeWorkspaceApi.Call call = rows.get(audio.id);
        playbackPosition.setText((call == null ? "Recording" : call.name) + " · " + (audio.loading ? "Loading recording…" : !audio.error.isEmpty() ? audio.error : NativeWorkspacePolicy.duration(audio.position() / 1000) + " / " + NativeWorkspacePolicy.duration(audio.duration() / 1000)));
        playback.setText(audio.loading ? "Loading…" : !audio.error.isEmpty() ? "Retry" : audio.playing() ? "Pause" : "Play"); playback.setEnabled(!audio.loading);
        seek.setEnabled(audio.prepared); seek.setMax(audio.duration()); seek.setProgress(audio.position());
        ((TextView) playerStrip.findViewWithTag("workspace-speed")).setText(String.format(Locale.ROOT, "%s×", audio.speed));
    }
    void suspend() {
        dismissTranscript();
        if (rentalsView != null) rentalsView.clear();
        suspended = true; invalidateRequests(); audioGeneration++; audio.release(); updateAudio(); main.removeCallbacks(sessionWatch);
        if (debounce != null) main.removeCallbacks(debounce);
        loading = false;
        if (saving) { saving = false; setEditorEnabled(true); editError.setText("Save interrupted. Refresh to verify the server before retrying."); }
    }
    void resume() {
        if (disposed) return; suspended = false;
        if (!session.equals(host.session())) { invalidate("Your session changed. Reopen this screen."); return; }
        main.post(sessionWatch);
        if (editor == null) refresh();
        else {
            NativeWorkspaceApi.Profile previous = profile;
            run(NativeWorkspaceApi::profile, result -> { if (previous == null || !previous.scope().equals(result.scope())) invalidate("Your workspace changed. Reopen your profile."); }, this::failure);
        }
    }
    void dispose() {
        dismissTransient();
        dismissTranscript();
        if (rentalsView != null) { rentalsView.dispose(); rentalsUserId = rentalsVendorId = 0; }
        if (disposed) return; disposed = true; invalidateRequests(); audioGeneration++; audio.release(); executor.shutdownNow(); main.removeCallbacksAndMessages(null);
        if (editor != null) { editor.dismiss(); editor = null; }
        rows.clear(); profile = null; if (adapter != null) adapter.submitList(new ArrayList<>());
    }
    private final class CallsAdapter extends ListAdapter<NativeWorkspaceApi.Call, CallHolder> {
        private final Map<String, Long> stableIds = new HashMap<>(); private long nextId;
        CallsAdapter() { super(new DiffUtil.ItemCallback<NativeWorkspaceApi.Call>() {
            @Override public boolean areItemsTheSame(@NonNull NativeWorkspaceApi.Call a, @NonNull NativeWorkspaceApi.Call b) { return a.id.equals(b.id); }
            @Override public boolean areContentsTheSame(@NonNull NativeWorkspaceApi.Call a, @NonNull NativeWorkspaceApi.Call b) { return a.equals(b); }
        }); setHasStableIds(true); setStateRestorationPolicy(StateRestorationPolicy.PREVENT_WHEN_EMPTY); }
        @Override public long getItemId(int position) { String id = getItem(position).id; Long stable = stableIds.get(id); if (stable == null) { stable = ++nextId; stableIds.put(id, stable); } return stable; }
        @NonNull @Override public CallHolder onCreateViewHolder(@NonNull ViewGroup parent, int type) { return new CallHolder(tokens.column()); }
        @Override public void onBindViewHolder(@NonNull CallHolder holder, int position) { holder.bind(getItem(position)); }
    }
    private final class CallHolder extends RecyclerView.ViewHolder {
        final LinearLayout column;
        CallHolder(LinearLayout column) { super(column); this.column = column; column.setPadding(tokens.dp(14), tokens.dp(8), tokens.dp(14), tokens.dp(12)); column.setBackgroundColor(tokens.surface);
            RecyclerView.LayoutParams params = new RecyclerView.LayoutParams(-1, -2); params.bottomMargin = tokens.dp(10); column.setLayoutParams(params); }
        void bind(NativeWorkspaceApi.Call call) {
            column.removeAllViews(); column.setBackgroundColor(tokens.surface); boolean open = expanded.contains(call.id);
            TextView name = tokens.text(call.name.isEmpty() ? "Unknown customer" : call.name, 18, false); name.setTypeface(tokens.semibold); column.addView(name);
            TextView metadata = tokens.text(date(call.timestamp) + " · " + call.duration + "\n" + call.phone + " · " + call.status, 12, false); metadata.setTextColor(tokens.secondary); column.addView(metadata);
            if (call.satisfaction >= 1 && call.satisfaction <= 10) column.addView(tokens.text("Customer satisfaction " + call.satisfaction + "/10", 12, false));
            com.google.android.material.button.MaterialButton toggle = tokens.button(open ? "Collapse call" : "View call", false, () -> { if (expanded.contains(call.id)) expanded.remove(call.id); else expanded.add(call.id); bind(call); });
            toggle.setContentDescription((open ? "Collapse " : "Expand ") + (call.name.isEmpty() ? "unknown customer" : call.name) + " call");
            ViewCompat.setStateDescription(toggle, open ? "Expanded" : "Collapsed"); column.addView(toggle, tokens.row());
            if (!open) return;
            if (!call.recording.isEmpty()) { column.addView(tokens.text("Recording", 15, true)); column.addView(tokens.button(call.id.equals(audio.id) ? "Play / pause recording" : "Play recording", true, () -> play(call)), tokens.row()); }
            else column.addView(tokens.text("No recording available", 13, false));
            column.addView(tokens.text("Transcript", 15, true));
            List<NativeCallTranscript.Turn> turns = NativeCallTranscript.parse(call.transcript);
            if (turns.isEmpty()) column.addView(tokens.text("Transcript not available yet.", 14, false));
            else {
                for (int i = 0; i < Math.min(2, turns.size()); i++) column.addView(NativeCallTranscriptView.bubble(tokens, turns.get(i), true), tokens.row());
                com.google.android.material.button.MaterialButton openTranscript = tokens.button("Open conversation", false, () -> showTranscript(call));
                openTranscript.setTag("workspace-open-transcript-" + call.id); column.addView(openTranscript, tokens.row());
                column.addView(tokens.text(turns.size() + " speaker turns", 12, false));
            }
        }
    }
    private void showTranscript(NativeWorkspaceApi.Call call) {
        if (disposed || suspended || profile == null || transcriptScreen != null || !session.equals(host.session())) return;
        for (int i = 0; i < getChildCount(); i++) {
            View child = getChildAt(i);
            if (child != playerStrip) { transcriptHiddenViews.put(child, child.getVisibility()); child.setVisibility(GONE); }
        }
        transcriptScreen = new NativeCallTranscriptView(tokens, call.name, call.transcript, !call.recording.isEmpty(), this::dismissTranscript, () -> play(call));
        addView(transcriptScreen, 0, new LinearLayout.LayoutParams(-1, 0, 1));
    }
    boolean dismissTranscript() {
        if (transcriptScreen == null) return false;
        removeView(transcriptScreen); transcriptScreen = null;
        for (Map.Entry<View, Integer> entry : transcriptHiddenViews.entrySet()) entry.getKey().setVisibility(entry.getValue());
        transcriptHiddenViews.clear();
        return true;
    }
    private String date(String raw) {
        try {
            java.text.SimpleDateFormat format = new java.text.SimpleDateFormat(raw.contains(".") ? "yyyy-MM-dd'T'HH:mm:ss.SSSX" : "yyyy-MM-dd'T'HH:mm:ssX", Locale.US);
            Date date = format.parse(raw); if (date != null) return java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT).format(date);
        } catch (Exception ignored) { }
        return "Unknown date";
    }
}
