package com.trashed.driver;

import android.database.*;
import android.os.*;
import android.provider.DocumentsContract.*;
import android.provider.DocumentsProvider;
import java.io.*;

/** Read-only, generated synthetic documents. Never enumerates device/user files. */
public class NativeChatInputDocuments extends DocumentsProvider {
    public static final String AUTHORITY = "com.trashed.driver.test.chatinputs";
    private void guard() { if (!"ranchu".equals(Build.HARDWARE)) throw new SecurityException("Emulator only"); }
    @Override public boolean onCreate() { return true; }
    private final String[] docs = {Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE, Document.COLUMN_FLAGS};
    private long size(String id) throws FileNotFoundException {
        if (id.matches("small[0-8]")) return 23;
        if (id.equals("limit")) return 12L*1024*1024;
        if (id.equals("oversize")) return 12L*1024*1024+1;
        throw new FileNotFoundException("Synthetic document only");
    }
    private void row(MatrixCursor c, String id) throws FileNotFoundException {
        java.util.Map<String, Object> values = new java.util.HashMap<>();
        boolean root = id.equals("root");
        values.put(Document.COLUMN_DOCUMENT_ID, id);
        values.put(Document.COLUMN_DISPLAY_NAME, root ? "Trashed Synthetic Input" : id+".txt");
        values.put(Document.COLUMN_MIME_TYPE, root ? Document.MIME_TYPE_DIR : "text/plain");
        values.put(Document.COLUMN_SIZE, root ? 0 : size(id));
        values.put(Document.COLUMN_FLAGS, 0);
        MatrixCursor.RowBuilder row = c.newRow();
        for (String column : c.getColumnNames()) row.add(values.get(column));
    }
    @Override public Cursor queryRoots(String[] projection) {
        guard(); MatrixCursor c = new MatrixCursor(new String[]{Root.COLUMN_ROOT_ID, Root.COLUMN_DOCUMENT_ID, Root.COLUMN_TITLE, Root.COLUMN_FLAGS, Root.COLUMN_MIME_TYPES});
        c.addRow(new Object[]{"synthetic", "root", "Trashed Synthetic Input", Root.FLAG_SUPPORTS_IS_CHILD, "text/plain"}); return c;
    }
    @Override public Cursor queryDocument(String id, String[] projection) throws FileNotFoundException {
        guard(); MatrixCursor c = new MatrixCursor(projection == null ? docs : projection);
        row(c,id); return c;
    }
    @Override public Cursor queryChildDocuments(String parent, String[] projection, String order) throws FileNotFoundException {
        guard(); if (!parent.equals("root")) throw new FileNotFoundException(); MatrixCursor c = new MatrixCursor(projection == null ? docs : projection);
        for(int n=0;n<9;n++)row(c,"small"+n); row(c,"limit"); row(c,"oversize"); return c;
    }
    @Override public boolean isChildDocument(String parent, String child) { guard(); try { size(child); return parent.equals("root"); } catch(Exception error) { return false; } }
    @Override public ParcelFileDescriptor openDocument(String id, String mode, CancellationSignal signal) throws FileNotFoundException {
        guard(); if (!mode.equals("r")) throw new FileNotFoundException("Read only"); long bytes=size(id);
        try {
            ParcelFileDescriptor[] pipe=ParcelFileDescriptor.createPipe();
            new Thread(()->{try(OutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])) {
                byte[] data = new byte[8192]; java.util.Arrays.fill(data, (byte)'x');
                for(long left=bytes;left>0;) { int count=(int)Math.min(left,data.length); out.write(data,0,count);left-=count; }
            } catch(IOException ignored) {}},"synthetic-input-bytes").start(); return pipe[0];
        } catch(IOException error) { throw new FileNotFoundException(); }
    }
}
