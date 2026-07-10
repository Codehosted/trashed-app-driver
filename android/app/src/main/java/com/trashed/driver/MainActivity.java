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
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;
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
    private static final String DEFAULT_DRIVER_URL = "https://trashed.app/driver?source=trashed-driver-app";
    private static final int GOOGLE_SIGN_IN_REQUEST = 6107;
    private static final String SESSION_COOKIE = "next-auth.session-token";
    private static final String SECURE_SESSION_COOKIE = "__Secure-next-auth.session-token";

    private FrameLayout loginOverlay;
    private EditText emailField;
    private EditText passwordField;
    private Button googleButton;
    private Button signInButton;
    private ProgressBar progressBar;
    private TextView errorText;
    private AuthConfig authConfig;
    private GoogleSignInClient googleClient;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        authConfig = readAuthConfig();
        WebView webView = getBridge().getWebView();
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        if (!hasSessionCookie(cookieManager, authConfig.origin)) {
            webView.stopLoading();
            showNativeLogin();
        }
    }

    private void showNativeLogin() {
        loginOverlay = new FrameLayout(this);
        loginOverlay.setBackgroundColor(Color.rgb(2, 6, 23));

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        loginOverlay.addView(scrollView, fullFrameParams());

        LinearLayout container = new LinearLayout(this);
        container.setGravity(Gravity.CENTER);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(dp(24), dp(40), dp(24), dp(40));
        scrollView.addView(container, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        TextView logo = text("trashed", 36, Color.WHITE, Typeface.BOLD);
        logo.setGravity(Gravity.CENTER);
        container.addView(logo, matchWrapParams());

        TextView subtitle = text("Driver Portal", 12, Color.rgb(148, 163, 184), Typeface.BOLD);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setLetterSpacing(0.18f);
        container.addView(subtitle, matchWrapParams());

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(22), dp(22), dp(22), dp(22));
        card.setBackgroundColor(Color.rgb(15, 23, 42));
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardParams.setMargins(0, dp(28), 0, 0);
        container.addView(card, cardParams);

        TextView title = text("Driver Sign In", 26, Color.WHITE, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        card.addView(title, matchWrapParams());

        TextView body = text("Sign in to open routes, dispatch, and vendor tools without leaving the app.", 15, Color.rgb(203, 213, 225), Typeface.NORMAL);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, dp(10), 0, dp(18));
        card.addView(body, matchWrapParams());

        googleButton = new Button(this);
        googleButton.setText("Continue with Google");
        googleButton.setTextColor(Color.rgb(15, 23, 42));
        googleButton.setTextSize(16);
        googleButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        googleButton.setAllCaps(false);
        googleButton.setBackgroundColor(Color.WHITE);
        googleButton.setOnClickListener(view -> submitGoogleLogin());
        LinearLayout.LayoutParams googleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54));
        googleParams.setMargins(0, 0, 0, dp(12));
        card.addView(googleButton, googleParams);

        TextView divider = text("OR SIGN IN WITH EMAIL", 12, Color.rgb(148, 163, 184), Typeface.BOLD);
        divider.setGravity(Gravity.CENTER);
        divider.setLetterSpacing(0.12f);
        divider.setPadding(0, 0, 0, dp(8));
        card.addView(divider, matchWrapParams());

        emailField = input("Email address", false);
        card.addView(emailField, fieldParams());

        passwordField = input("Password", true);
        card.addView(passwordField, fieldParams());

        signInButton = new Button(this);
        signInButton.setText("Sign In");
        signInButton.setTextColor(Color.WHITE);
        signInButton.setTextSize(16);
        signInButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        signInButton.setAllCaps(false);
        signInButton.setBackgroundColor(Color.rgb(79, 70, 229));
        signInButton.setOnClickListener(view -> submitNativeLogin());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54));
        buttonParams.setMargins(0, dp(12), 0, 0);
        card.addView(signInButton, buttonParams);

        progressBar = new ProgressBar(this);
        progressBar.setVisibility(View.GONE);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(dp(36), dp(36));
        progressParams.gravity = Gravity.CENTER_HORIZONTAL;
        progressParams.setMargins(0, dp(16), 0, 0);
        card.addView(progressBar, progressParams);

        errorText = text("", 13, Color.rgb(252, 165, 165), Typeface.BOLD);
        errorText.setGravity(Gravity.CENTER);
        errorText.setVisibility(View.GONE);
        errorText.setPadding(0, dp(14), 0, 0);
        card.addView(errorText, matchWrapParams());

        TextView googleNote = text("Google sign-in uses the native Android account flow so OAuth never bounces out to Chrome.", 12, Color.rgb(148, 163, 184), Typeface.NORMAL);
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

    private EditText input(String hint, boolean password) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setTextColor(Color.WHITE);
        field.setHintTextColor(Color.rgb(100, 116, 139));
        field.setTextSize(16);
        field.setSingleLine(true);
        field.setPadding(dp(14), 0, dp(14), 0);
        field.setBackgroundColor(Color.rgb(30, 41, 59));
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
