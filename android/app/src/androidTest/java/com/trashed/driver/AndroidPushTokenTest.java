package com.trashed.driver;

import static org.junit.Assert.*;
import android.content.Context;
import android.os.Build;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.junit.Test;

/** Explicit emulator-only acquisition. No token logging, backend registration, push send, or account changes. */
public class AndroidPushTokenTest {
    @Test public void saveEmulatorTokenToPrivateFileWithoutPrintingIt() throws Exception {
        assertTrue("Only a local emulator may run this diagnostic", Build.FINGERPRINT.contains("generic") || Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"));
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.trashed.driver", target.getPackageName());
        Class<?> app = Class.forName("com.google.firebase.FirebaseApp");
        app.getMethod("initializeApp", Context.class).invoke(null, target);
        Class<?> messaging = Class.forName("com.google.firebase.messaging.FirebaseMessaging");
        Object instance = messaging.getMethod("getInstance").invoke(null);
        Object request = messaging.getMethod("getToken").invoke(instance);
        String token = (String) Tasks.await((Task<?>) request, 45, TimeUnit.SECONDS);
        assertNotNull("FCM did not issue a token", token);
        assertFalse("FCM issued an empty token", token.isEmpty());
        File destination = new File(target.getFilesDir(), "native-push-test.token");
        try (FileOutputStream stream = new FileOutputStream(destination)) { stream.write(token.getBytes(StandardCharsets.UTF_8)); }
        assertTrue(destination.setReadable(false, false)); assertTrue(destination.setReadable(true, true));
        assertTrue(destination.setWritable(false, false)); assertTrue(destination.setWritable(true, true));
        assertTrue(destination.length() > 0);
    }
}
