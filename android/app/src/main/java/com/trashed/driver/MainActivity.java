package com.trashed.driver;

import android.graphics.Color;
import android.graphics.Typeface;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ImageView;
import android.graphics.drawable.GradientDrawable;
import android.content.res.Configuration;
import android.content.res.ColorStateList;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.CapacitorWebView;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private static final String DEFAULT_DRIVER_URL = "https://trashed.app/app?source=trashed-app";
    private static final int GOOGLE_SIGN_IN_REQUEST = 6107;
    private static final String SESSION_COOKIE = "next-auth.session-token";
    private static final String SECURE_SESSION_COOKIE = "__Secure-next-auth.session-token";
    static final String ONBOARDING_PREFERENCES = "trashed-native";
    static final String ONBOARDING_VERSION_KEY = "onboarding-version";
    static final String ONBOARDING_MARKER = "TrashedOnboarding/1";
    static final String[][] ONBOARDING_PAGES = {
        { "Your waste service business in your pocket", "Manage orders, customers and your team wherever work takes you." },
        { "Real-time customer chat", "Keep customers in the loop with direct messages and quick replies." },
        { "Hauler and dispatch", "Connect haulers and dispatch with live routes and clear stop details." },
    };
    static final int ONBOARDING_PRIMARY = Color.rgb(112, 51, 255);
    static final int[] ONBOARDING_IMAGES = { R.drawable.onboarding_business, R.drawable.onboarding_chat, R.drawable.onboarding_dispatch };

    private FrameLayout loginOverlay;
    private FrameLayout onboardingOverlay;
    private OnBackPressedCallback onboardingBack;
    private OnBackPressedCallback historyBack;
    private boolean historyBackAvailable;
    private boolean backCheckPending;
    // Radix dialogs handle Escape themselves (including vetoes); never click a destructive action.
    static final String EXACT_HISTORY_BACK = "if (location.href === %s && history.length === %d) history.go(-1);";
    static final String DISMISS_WEB_DIALOG = "(() => {"
        + "if (!document.querySelector('[role=dialog][data-state=open], [role=alertdialog][data-state=open]')) return false;"
        + "document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', code:'Escape', bubbles:true, cancelable:true}));"
        + "return true; })()";
    private final NativeWorkspaceHistory workspaceHistory = new NativeWorkspaceHistory();
    private int onboardingStep;
    private boolean onboardingReady;
    private EditText emailField;
    private EditText passwordField;
    private Button googleButton;
    private Button signInButton;
    private ProgressBar progressBar;
    private TextView errorText;
    private AuthConfig authConfig;
    private GoogleSignInClient googleClient;

    // One-time bootstrap gate only. Once open, retain Capacitor's normal URL policy/client.
    static final class OnboardingWebView extends CapacitorWebView {
        boolean appNavigationEnabled;

        OnboardingWebView(Context context) { super(context, null); }

        @Override
        public void loadUrl(String url) {
            if (appNavigationEnabled) super.loadUrl(url);
        }

        @Override
        public void loadUrl(String url, Map<String, String> headers) {
            if (appNavigationEnabled) super.loadUrl(url, headers);
        }
    }

    @Override
    protected void load() {
        WebView original = findViewById(com.getcapacitor.android.R.id.webview);
        ViewGroup parent = (ViewGroup) original.getParent();
        int index = parent.indexOfChild(original);
        OnboardingWebView gated = new OnboardingWebView(this);
        gated.setId(original.getId());
        ViewGroup.LayoutParams params = original.getLayoutParams();
        parent.removeView(original);
        parent.addView(gated, index, params);
        original.destroy();
        super.load();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TrashedFileExportPlugin.class);
        super.onCreate(savedInstanceState);
        // Android 16 enforces edge-to-edge; keep both native login and WebView inside the safe area.
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.rgb(2, 6, 23));
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightNavigationBars(false);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
        authConfig = readAuthConfig();
        WebView webView = getBridge().getWebView();
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        historyBack = new OnBackPressedCallback(false) {
            @Override public void handleOnBackPressed() {
                if (backCheckPending) return;
                WebView view = getBridge().getWebView();
                String requestedURL = view.getUrl();
                android.webkit.WebBackForwardList requestedHistory = view.copyBackForwardList();
                int requestedIndex = requestedHistory.getCurrentIndex();
                int requestedLength = requestedHistory.getSize();
                String requestedBack = requestedIndex > 0 ? requestedHistory.getItemAtIndex(requestedIndex - 1).getUrl() : null;
                backCheckPending = true;
                view.evaluateJavascript(DISMISS_WEB_DIALOG, result -> {
                    backCheckPending = false;
                    updateWorkspaceHistory(false);
                    // Navigation/auth may change while JavaScript runs. Never pop the next page.
                    android.webkit.WebBackForwardList currentHistory = view.copyBackForwardList();
                    if (!isEnabled() || !java.util.Objects.equals(requestedURL, view.getUrl())
                        || currentHistory.getCurrentIndex() != requestedIndex || currentHistory.getSize() != requestedLength
                        || (requestedIndex > 0 && !java.util.Objects.equals(requestedBack,
                            currentHistory.getItemAtIndex(requestedIndex - 1).getUrl()))) return;
                    if (!"false".equals(result)) return; // An open dialog or failed check consumes Back.
                    if (historyBackAvailable) {
                        // Android WebView's native offset API also skips unactivated entries.
                        // Renderer history.go is exact; recheck the document before executing it.
                        String script = String.format(java.util.Locale.ROOT, EXACT_HISTORY_BACK,
                            JSONObject.quote(requestedURL), requestedLength);
                        view.evaluateJavascript(script, null);
                    } else {
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        updateWorkspaceHistory(false);
                    }
                });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, historyBack);
        // Add history notifications only; inherit all Capacitor URL/intent/plugin navigation behavior.
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                super.doUpdateVisitedHistory(view, url, isReload);
                updateWorkspaceHistory(view.getProgress() == 100);
            }

            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                updateWorkspaceHistory(view.getProgress() == 100);
            }
        });

        onboardingBack = new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (onboardingStep > 0) { onboardingStep--; showNativeOnboarding(null); }
                else finish();
            }
        };
        getOnBackPressedDispatcher().addCallback(this, onboardingBack);
        if (onboardingPreferences().getInt(ONBOARDING_VERSION_KEY, 0) >= 1) resumeAfterOnboarding();
        else showNativeOnboarding(null);
    }

    private SharedPreferences onboardingPreferences() {
        return getSharedPreferences(ONBOARDING_PREFERENCES, MODE_PRIVATE);
    }

    private void updateWorkspaceHistory(boolean committed) {
        WebView webView = getBridge().getWebView();
        android.webkit.WebBackForwardList history = webView.copyBackForwardList();
        int index = history.getCurrentIndex();
        boolean visible = onboardingReady && onboardingOverlay == null && loginOverlay == null;
        boolean workspace = visible && NativeWorkspaceHistory.isWorkspaceURL(webView.getUrl(), authConfig.origin);
        if (NativeWorkspaceHistory.isAuthenticationURL(webView.getUrl())) workspaceHistory.beginSession();
        workspaceHistory.update(index, workspace, committed);
        historyBackAvailable = workspace && workspaceHistory.canGoBack(index) && index > 0
            && NativeWorkspaceHistory.isWorkspaceURL(history.getItemAtIndex(index - 1).getUrl(), authConfig.origin);
        // Public help/legal pages can host the same app drawer; history itself stays workspace-only.
        historyBack.setEnabled(visible && NativeWorkspaceHistory.isSameOriginURL(webView.getUrl(), authConfig.origin)
            && !NativeWorkspaceHistory.isAuthenticationURL(webView.getUrl()));
    }

    static String completedUserAgent(String original) {
        return java.util.Arrays.asList(original.split("\\s+")).contains(ONBOARDING_MARKER)
            ? original : original + " " + ONBOARDING_MARKER;
    }

    private void showNativeOnboarding(String error) {
        workspaceHistory.reset();
        historyBackAvailable = false;
        historyBack.setEnabled(false);
        if (onboardingOverlay != null) ((ViewGroup) onboardingOverlay.getParent()).removeView(onboardingOverlay);
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int foreground = dark ? Color.WHITE : Color.rgb(33, 26, 43);
        int muted = dark ? Color.rgb(191, 184, 204) : Color.rgb(98, 89, 110);
        int surface = dark ? Color.rgb(41, 33, 51) : Color.rgb(240, 235, 250);
        onboardingOverlay = new FrameLayout(this);
        onboardingOverlay.setTag("native-onboarding");
        onboardingOverlay.setBackgroundColor(dark ? Color.rgb(20, 18, 26) : Color.rgb(250, 250, 252));
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(dp(24), dp(20), dp(24), dp(12));
        onboardingOverlay.addView(column, fullFrameParams());
        LinearLayout brand = new LinearLayout(this);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        ImageView symbol = new ImageView(this);
        symbol.setTag("native-onboarding-symbol");
        symbol.setImageResource(R.drawable.onboarding_symbol);
        symbol.setImageTintList(ColorStateList.valueOf(ONBOARDING_PRIMARY));
        symbol.setScaleType(ImageView.ScaleType.FIT_CENTER);
        symbol.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        LinearLayout.LayoutParams symbolParams = new LinearLayout.LayoutParams(dp(28), dp(28));
        symbolParams.setMarginEnd(dp(8));
        brand.addView(symbol, symbolParams);
        ImageView wordmark = new ImageView(this);
        wordmark.setImageResource(R.drawable.onboarding_wordmark);
        wordmark.setColorFilter(foreground);
        wordmark.setScaleType(ImageView.ScaleType.FIT_START);
        wordmark.setContentDescription("Trashed");
        brand.addView(wordmark, new LinearLayout.LayoutParams(dp(120), dp(28)));
        LinearLayout.LayoutParams brandParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(28));
        brandParams.bottomMargin = dp(20);
        column.addView(brand, brandParams);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        column.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(0, 0, 0, dp(20));
        scroll.addView(page, matchWrapParams());
        ImageView hero = new ImageView(this);
        hero.setTag("native-onboarding-hero");
        hero.setImageResource(ONBOARDING_IMAGES[onboardingStep]);
        hero.setScaleType(ImageView.ScaleType.FIT_CENTER);
        hero.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        int heroHeight = Math.max(140, Math.min(300, Math.round(getResources().getConfiguration().screenHeightDp * 0.33f)));
        page.addView(hero, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(heroHeight)));
        String[] copy = ONBOARDING_PAGES[onboardingStep];
        for (int index = 0; index < copy.length; index++) {
            int color = index == 0 ? foreground : muted;
            TextView paragraph = text(copy[index], index == 0 ? 30 : 16,
                color, index == 0 ? Typeface.BOLD : Typeface.NORMAL);
            paragraph.setPadding(0, dp(index == 0 ? 22 : 14), 0, 0);
            if (index == 0) ViewCompat.setAccessibilityHeading(paragraph, true);
            page.addView(paragraph, matchWrapParams());
        }
        LinearLayout progress = new LinearLayout(this);
        progress.setGravity(Gravity.CENTER_VERTICAL);
        Button back = new Button(this);
        back.setText(onboardingStep == 0 ? "Skip" : "Back");
        back.setTag("native-onboarding-back");
        back.setAllCaps(false);
        back.setTextColor(foreground);
        back.setBackgroundColor(Color.TRANSPARENT);
        back.setElevation(0);
        back.setStateListAnimator(null);
        back.setMinHeight(dp(48));
        back.setMinimumHeight(dp(48));
        back.setOnClickListener(view -> {
            if (onboardingStep == 0) completeNativeOnboarding();
            else { onboardingStep--; showNativeOnboarding(null); }
        });
        progress.addView(back, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout dots = new LinearLayout(this);
        dots.setGravity(Gravity.CENTER);
        dots.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        for (int index = 0; index < ONBOARDING_PAGES.length; index++) {
            View dot = new View(this);
            dot.setBackground(onboardingFill(index == onboardingStep ? ONBOARDING_PRIMARY : surface, 4));
            LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dp(index == onboardingStep ? 24 : 8), dp(8));
            dotParams.setMargins(dp(3), 0, dp(3), 0);
            dots.addView(dot, dotParams);
        }
        progress.addView(dots, new LinearLayout.LayoutParams(0, dp(48), 1));
        progress.addView(text((onboardingStep + 1) + " of " + ONBOARDING_PAGES.length, 12, muted, Typeface.NORMAL));
        column.addView(progress, matchWrapParams());
        if (error != null) column.addView(text(error, 14, dark ? Color.rgb(252, 165, 165) : Color.rgb(153, 27, 27), Typeface.NORMAL));
        Button next = new Button(this);
        next.setText(onboardingStep == ONBOARDING_PAGES.length - 1 ? "Get started" : "Next");
        next.setTag("native-onboarding-next");
        next.setAllCaps(false);
        next.setTextColor(Color.WHITE);
        next.setTextSize(17);
        next.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        next.setMinHeight(dp(54));
        next.setMinimumHeight(dp(54));
        next.setBackgroundTintList(null);
        next.setElevation(0);
        next.setStateListAnimator(null);
        next.setBackground(onboardingFill(ONBOARDING_PRIMARY, 14));
        next.setOnClickListener(view -> {
            if (onboardingStep == ONBOARDING_PAGES.length - 1) completeNativeOnboarding();
            else { onboardingStep++; showNativeOnboarding(null); }
        });
        column.addView(next, matchWrapParams());
        addContentView(onboardingOverlay, fullFrameParams());
    }

    private GradientDrawable onboardingFill(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color); // A single flat fill, never a gradient.
        drawable.setCornerRadius(dp(radius));
        return drawable;
    }

    private void completeNativeOnboarding() {
        if (!onboardingPreferences().edit().putInt(ONBOARDING_VERSION_KEY, 1).commit()) {
            showNativeOnboarding("Unable to save your preference. Please try again.");
            return;
        }
        resumeAfterOnboarding();
    }

    private void resumeAfterOnboarding() {
        if (onboardingPreferences().getInt(ONBOARDING_VERSION_KEY, 0) < 1) return;
        OnboardingWebView webView = (OnboardingWebView) getBridge().getWebView();
        String original = webView.getSettings().getUserAgentString();
        if (original == null || original.isEmpty()) {
            showNativeOnboarding("Unable to prepare the app. Please try again.");
            return;
        }
        webView.getSettings().setUserAgentString(completedUserAgent(original));
        onboardingReady = true;
        webView.appNavigationEnabled = true;
        onboardingBack.setEnabled(false);
        if (onboardingOverlay != null) ((ViewGroup) onboardingOverlay.getParent()).removeView(onboardingOverlay);
        onboardingOverlay = null;
        workspaceHistory.beginSession();
        if (hasSessionCookie(CookieManager.getInstance(), authConfig.origin)) webView.loadUrl(authConfig.driverUrl);
        else showNativeLogin();
    }

    private void showNativeLogin() {
        if (!onboardingReady || onboardingOverlay != null) return;
        workspaceHistory.reset();
        historyBackAvailable = false;
        historyBack.setEnabled(false);
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int foreground = dark ? Color.WHITE : Color.rgb(33, 26, 43);
        int muted = dark ? Color.rgb(191, 184, 204) : Color.rgb(98, 89, 110);
        int surface = dark ? Color.rgb(31, 26, 38) : Color.WHITE;
        int border = dark ? Color.rgb(70, 59, 82) : Color.rgb(217, 209, 224);
        int disabled = dark ? Color.rgb(61, 52, 70) : Color.rgb(230, 224, 237);
        loginOverlay = new FrameLayout(this);
        loginOverlay.setBackgroundColor(dark ? Color.rgb(20, 18, 26) : Color.rgb(250, 250, 252));

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        loginOverlay.addView(scrollView, fullFrameParams());

        LinearLayout container = new LinearLayout(this);
        container.setGravity(Gravity.CENTER);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(dp(24), dp(40), dp(24), dp(40));
        scrollView.addView(container, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        TextView logo = text("trashed", 36, foreground, Typeface.BOLD);
        logo.setGravity(Gravity.CENTER);
        container.addView(logo, matchWrapParams());

        TextView subtitle = text("Vendors & Drivers", 12, muted, Typeface.BOLD);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setLetterSpacing(0.18f);
        container.addView(subtitle, matchWrapParams());

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(22), dp(22), dp(22), dp(22));
        card.setBackgroundColor(surface);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardParams.setMargins(0, dp(28), 0, 0);
        container.addView(card, cardParams);

        TextView title = text("Sign in to Trashed", 26, foreground, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        card.addView(title, matchWrapParams());

        TextView body = text("Manage your waste services business on-the-go with AI features", 15, muted, Typeface.NORMAL);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, dp(10), 0, dp(18));
        card.addView(body, matchWrapParams());

        googleButton = new Button(this);
        googleButton.setText(R.string.continue_with_google);
        googleButton.setTextColor(foreground);
        googleButton.setTextSize(17);
        googleButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        googleButton.setAllCaps(false);
        googleButton.setBackgroundTintList(null);
        googleButton.setElevation(0);
        googleButton.setStateListAnimator(null);
        GradientDrawable googleFill = onboardingFill(surface, 14);
        googleFill.setStroke(dp(1), border);
        googleButton.setBackground(googleFill);
        googleButton.setOnClickListener(view -> submitGoogleLogin());
        LinearLayout.LayoutParams googleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        googleParams.setMargins(0, 0, 0, dp(12));
        card.addView(googleButton, googleParams);

        TextView divider = text("OR SIGN IN WITH EMAIL", 12, muted, Typeface.BOLD);
        divider.setGravity(Gravity.CENTER);
        divider.setLetterSpacing(0.12f);
        divider.setPadding(0, 0, 0, dp(8));
        card.addView(divider, matchWrapParams());

        emailField = input("Email address", false, dark);
        card.addView(emailField, fieldParams());

        passwordField = input("Password", true, dark);
        card.addView(passwordField, fieldParams());

        signInButton = new Button(this);
        signInButton.setText(R.string.sign_in);
        signInButton.setTextColor(new ColorStateList(new int[][] { { -android.R.attr.state_enabled }, {} }, new int[] { muted, Color.WHITE }));
        signInButton.setTextSize(17);
        signInButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        signInButton.setAllCaps(false);
        signInButton.setElevation(0);
        signInButton.setStateListAnimator(null);
        signInButton.setBackground(onboardingFill(ONBOARDING_PRIMARY, 14));
        signInButton.setBackgroundTintList(new ColorStateList(new int[][] { { -android.R.attr.state_enabled }, {} }, new int[] { disabled, ONBOARDING_PRIMARY }));
        signInButton.setOnClickListener(view -> submitNativeLogin());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        buttonParams.setMargins(0, dp(12), 0, 0);
        card.addView(signInButton, buttonParams);

        progressBar = new ProgressBar(this);
        progressBar.setIndeterminateTintList(ColorStateList.valueOf(ONBOARDING_PRIMARY));
        progressBar.setVisibility(View.GONE);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(dp(36), dp(36));
        progressParams.gravity = Gravity.CENTER_HORIZONTAL;
        progressParams.setMargins(0, dp(16), 0, 0);
        card.addView(progressBar, progressParams);

        errorText = text("", 13, dark ? Color.rgb(252, 165, 165) : Color.rgb(153, 27, 27), Typeface.BOLD);
        errorText.setGravity(Gravity.CENTER);
        errorText.setVisibility(View.GONE);
        errorText.setPadding(0, dp(14), 0, 0);
        card.addView(errorText, matchWrapParams());

        TextView googleNote = text("Google sign-in uses the native Android account flow so OAuth never bounces out to Chrome.", 12, muted, Typeface.NORMAL);
        googleNote.setGravity(Gravity.CENTER);
        googleNote.setPadding(0, dp(18), 0, 0);
        card.addView(googleNote, matchWrapParams());

        addContentView(loginOverlay, fullFrameParams());
    }

    private void submitNativeLogin() {
        String email = emailField.getText().toString().trim();
        String password = passwordField.getText().toString();

        if (email.isEmpty() || password.isEmpty()) {
            showError("Enter your email and password.");
            return;
        }

        hideKeyboard();
        setSubmitting(true);
        new Thread(() -> signIn(email, password)).start();
    }

    private void submitGoogleLogin() {
        hideKeyboard();
        setSubmitting(true);
        new Thread(this::startGoogleLogin).start();
    }

    private void startGoogleLogin() {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(authConfig.googleConfigUrl).openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");

            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                finishWithError("Google sign-in is not configured for this app build.");
                return;
            }

            JSONObject config = new JSONObject(readStream(connection.getInputStream()));
            String clientId = config.optString("clientId", "");
            if (!config.optBoolean("configured", false) || clientId.isEmpty()) {
                finishWithError("Google sign-in is not configured for this app build.");
                return;
            }

            runOnUiThread(() -> launchGoogleSignIn(clientId));
        } catch (Exception exception) {
            finishWithError(exception.getMessage() == null ? "Google sign-in failed to start." : exception.getMessage());
        }
    }

    private void launchGoogleSignIn(String clientId) {
        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestIdToken(clientId)
            .build();
        googleClient = GoogleSignIn.getClient(this, options);
        googleClient.signOut().addOnCompleteListener(task -> startActivityForResult(googleClient.getSignInIntent(), GOOGLE_SIGN_IN_REQUEST));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == GOOGLE_SIGN_IN_REQUEST) {
            handleGoogleSignInResult(data);
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void handleGoogleSignInResult(Intent data) {
        try {
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
            GoogleSignInAccount account = task.getResult(ApiException.class);
            String idToken = account == null ? null : account.getIdToken();
            if (idToken == null || idToken.isEmpty()) {
                finishWithError("Google sign-in did not return an ID token.");
                return;
            }
            new Thread(() -> exchangeGoogleToken(idToken)).start();
        } catch (Exception exception) {
            finishWithError(googleSignInError(exception));
        }
    }

    private String googleSignInError(Exception exception) {
        if (exception instanceof ApiException) {
            int code = ((ApiException) exception).getStatusCode();
            if (code == 10) {
                return "Google Sign-In is not configured for this Android package and signing certificate.";
            }
            if (code == 12501) {
                return "Google sign-in was cancelled.";
            }
            return "Google sign-in failed (" + code + ").";
        }
        return exception.getMessage() == null ? "Google sign-in failed." : exception.getMessage();
    }

    private void exchangeGoogleToken(String idToken) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(authConfig.googleLoginUrl).openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json");

            JSONObject body = new JSONObject();
            body.put("idToken", idToken);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(payload);
            }

            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                finishWithError(readError(connection, "Google sign-in failed."));
                return;
            }

            installSessionAndLoadDriver(connection);
        } catch (Exception exception) {
            finishWithError(exception.getMessage() == null ? "Google sign-in failed." : exception.getMessage());
        }
    }

    private void signIn(String email, String password) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(authConfig.loginUrl).openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json");

            JSONObject body = new JSONObject();
            body.put("email", email);
            body.put("password", password);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(payload);
            }

            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                finishWithError(readError(connection, "Invalid email or password."));
                return;
            }

            installSessionAndLoadDriver(connection);
        } catch (Exception exception) {
            finishWithError(exception.getMessage() == null ? "Native sign-in failed." : exception.getMessage());
        }
    }

    private void installSessionAndLoadDriver(HttpURLConnection connection) {
        List<String> cookies = setCookieHeaders(connection.getHeaderFields());
        if (cookies.isEmpty()) {
            finishWithError("The sign-in server did not return a mobile session.");
            return;
        }

        CookieManager cookieManager = CookieManager.getInstance();
        for (String cookie : cookies) {
            cookieManager.setCookie(authConfig.origin, cookie);
        }
        cookieManager.flush();

        runOnUiThread(() -> {
            if (!hasSessionCookie(cookieManager, authConfig.origin)) {
                showError("The mobile session cookie was not installed.");
                setSubmitting(false);
                return;
            }
            hideNativeLogin();
            getBridge().getWebView().loadUrl(authConfig.driverUrl);
        });
    }

    private void finishWithError(String message) {
        runOnUiThread(() -> {
            showError(message);
            setSubmitting(false);
        });
    }

    private void hideNativeLogin() {
        if (loginOverlay == null) return;
        ViewGroup parent = (ViewGroup) loginOverlay.getParent();
        if (parent != null) parent.removeView(loginOverlay);
        loginOverlay = null;
        workspaceHistory.beginSession();
    }

    private boolean hasSessionCookie(CookieManager cookieManager, String origin) {
        String cookie = cookieManager.getCookie(origin);
        return cookie != null && (cookie.contains(SESSION_COOKIE) || cookie.contains(SECURE_SESSION_COOKIE));
    }

    private List<String> setCookieHeaders(Map<String, List<String>> headers) {
        for (Map.Entry<String, List<String>> header : headers.entrySet()) {
            if ("Set-Cookie".equalsIgnoreCase(header.getKey())) {
                List<String> cookies = header.getValue();
                return cookies == null ? java.util.Collections.emptyList() : cookies;
            }
        }
        return java.util.Collections.emptyList();
    }

    private String readError(HttpURLConnection connection, String fallback) {
        try {
            InputStream stream = connection.getErrorStream();
            if (stream == null) return fallback;
            JSONObject json = new JSONObject(readStream(stream));
            String error = json.optString("error", "");
            return error.isEmpty() ? fallback : error;
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private AuthConfig readAuthConfig() {
        String driverUrl = DEFAULT_DRIVER_URL;
        try (InputStream stream = getAssets().open("capacitor.config.json")) {
            JSONObject config = new JSONObject(readStream(stream));
            JSONObject server = config.optJSONObject("server");
            if (server != null && !server.optString("url", "").isEmpty()) {
                driverUrl = server.optString("url");
            }
        } catch (Exception ignored) {
            driverUrl = DEFAULT_DRIVER_URL;
        }

        try {
            URL url = new URL(driverUrl);
            String origin = url.getProtocol() + "://" + url.getAuthority();
            return new AuthConfig(
                origin,
                driverUrl,
                origin + "/api/auth/mobile/login",
                origin + "/api/auth/mobile/google/config?platform=android",
                origin + "/api/auth/mobile/google"
            );
        } catch (Exception ignored) {
            return new AuthConfig(
                "https://trashed.app",
                DEFAULT_DRIVER_URL,
                "https://trashed.app/api/auth/mobile/login",
                "https://trashed.app/api/auth/mobile/google/config?platform=android",
                "https://trashed.app/api/auth/mobile/google"
            );
        }
    }

    private String readStream(InputStream stream) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private void setSubmitting(boolean submitting) {
        signInButton.setEnabled(!submitting);
        googleButton.setEnabled(!submitting);
        emailField.setEnabled(!submitting);
        passwordField.setEnabled(!submitting);
        progressBar.setVisibility(submitting ? View.VISIBLE : View.GONE);
        signInButton.setText(submitting ? "Signing in..." : "Sign In");
        googleButton.setText(submitting ? "Signing in..." : "Continue with Google");
    }

    private void showError(String message) {
        errorText.setText(message);
        errorText.setVisibility(View.VISIBLE);
    }

    private void hideKeyboard() {
        InputMethodManager manager = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        View focus = getCurrentFocus();
        if (manager != null && focus != null) manager.hideSoftInputFromWindow(focus.getWindowToken(), 0);
    }

    private EditText input(String hint, boolean password, boolean dark) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setTextColor(dark ? Color.WHITE : Color.rgb(33, 26, 43));
        field.setHintTextColor(dark ? Color.rgb(191, 184, 204) : Color.rgb(98, 89, 110));
        field.setTextSize(16);
        field.setSingleLine(true);
        field.setPadding(dp(14), 0, dp(14), 0);
        GradientDrawable fill = onboardingFill(dark ? Color.rgb(41, 33, 51) : Color.rgb(250, 247, 252), 14);
        fill.setStroke(dp(1), dark ? Color.rgb(70, 59, 82) : Color.rgb(217, 209, 224));
        field.setBackgroundTintList(null);
        field.setBackground(fill);
        field.setInputType(password ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        return field;
    }

    private TextView text(String value, int size, int color, int style) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(color);
        view.setTextSize(size);
        view.setTypeface(Typeface.DEFAULT, style);
        return view;
    }

    private FrameLayout.LayoutParams fullFrameParams() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private LinearLayout.LayoutParams matchWrapParams() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams fieldParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54));
        params.setMargins(0, dp(10), 0, 0);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static class AuthConfig {
        final String origin;
        final String driverUrl;
        final String loginUrl;
        final String googleConfigUrl;
        final String googleLoginUrl;

        AuthConfig(String origin, String driverUrl, String loginUrl, String googleConfigUrl, String googleLoginUrl) {
            this.origin = origin;
            this.driverUrl = driverUrl;
            this.loginUrl = loginUrl;
            this.googleConfigUrl = googleConfigUrl;
            this.googleLoginUrl = googleLoginUrl;
        }
    }
}
