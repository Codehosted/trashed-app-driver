package com.trashed.driver;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

/** Instrumentation APK only: never starts the real shell or production requests. */
public class NativeWorkspaceTestActivity extends AppCompatActivity {
    NativeWorkspaceView workspace;
    String origin, route;
    String identity = "next-auth.session-token=local-fixture";
    @Override protected void onCreate(Bundle state) {
        boolean dark = getIntent().getBooleanExtra("dark", false);
        setTheme(dark ? R.style.TrashedNavigationDark : R.style.TrashedNavigationLight); super.onCreate(state);
        origin = getIntent().getStringExtra("origin");
        if (origin == null || !origin.matches("http://127\\.0\\.0\\.1:[0-9]+")) throw new IllegalArgumentException("Loopback only");
        show("/vendor/profile");
    }
    void show(String path) {
        if (workspace != null) workspace.dispose();
        route = path;
        workspace = new NativeWorkspaceView(this, new NativeWorkspaceView.Host() {
            public String session() { return NativeWorkspacePolicy.identityFingerprint(identity); }
            public String cookies() { return identity; }
            public void web(String next) { route = next; }
        }, origin, origin + path, NativeWorkspacePolicy.destination(origin + path, origin), getIntent().getBooleanExtra("dark", false));
        android.widget.FrameLayout container = new android.widget.FrameLayout(this);
        container.addView(workspace);
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
            androidx.core.graphics.Insets system = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            view.setPadding(system.left, system.top, system.right, system.bottom); return insets;
        });
        setContentView(container);
        androidx.core.view.WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView()).setAppearanceLightStatusBars(!getIntent().getBooleanExtra("dark",false));
        container.post(() -> androidx.core.view.ViewCompat.requestApplyInsets(container));
    }
    @Override protected void onDestroy() { if (workspace != null) workspace.dispose(); super.onDestroy(); }
}
