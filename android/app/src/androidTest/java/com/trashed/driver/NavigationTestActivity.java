package com.trashed.driver;

import android.os.Bundle;
import android.view.View;
import android.widget.FrameLayout;
import androidx.appcompat.app.AppCompatActivity;

/** Test APK only. No WebView, session, URL or provider is loaded. */
public class NavigationTestActivity extends AppCompatActivity {
    NativeBottomNavigation navigation;
    boolean allowed = true;
    @Override protected void onCreate(Bundle state) {
        setTheme(com.trashed.driver.R.style.TrashedNavigationLight);
        super.onCreate(state);
        FrameLayout content = new FrameLayout(this);
        View webPlaceholder = new View(this);
        content.addView(webPlaceholder, new FrameLayout.LayoutParams(-1, -1));
        setContentView(content);
        navigation = new NativeBottomNavigation(this, webPlaceholder, () -> allowed);
    }
}
