package com.trashed.driver;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileNotFoundException;

/** Synthetic regression destination, packaged only in the instrumentation APK. */
public class ByteExportTestProvider extends ContentProvider {
    private File destination(Uri uri) throws FileNotFoundException {
        try {
            int caller = Binder.getCallingUid();
            int target = getContext().getPackageManager().getApplicationInfo("com.trashed.driver", 0).uid;
            if (!"ranchu".equals(Build.HARDWARE) || (caller != target && caller != getContext().getApplicationInfo().uid)
                || !"com.trashed.driver.test.byteexports".equals(uri.getAuthority()) || !"/synthetic.wav".equals(uri.getPath())) {
                throw new FileNotFoundException("Synthetic destination rejected");
            }
            return new File(getContext().getCacheDir(), "synthetic-byte-export.wav");
        } catch (android.content.pm.PackageManager.NameNotFoundException ignored) {
            throw new FileNotFoundException("Synthetic target unavailable");
        }
    }
    @Override public boolean onCreate() { return true; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = destination(uri);
        if ("r".equals(mode)) return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
        if (!"w".equals(mode)) throw new FileNotFoundException("Synthetic mode rejected");
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE | ParcelFileDescriptor.MODE_WRITE_ONLY);
    }
    @Override public int delete(Uri uri, String selection, String[] args) {
        try { return destination(uri).delete() ? 1 : 0; } catch (FileNotFoundException ignored) { return 0; }
    }
    @Override public String getType(Uri uri) { return "audio/wav"; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) { return null; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
