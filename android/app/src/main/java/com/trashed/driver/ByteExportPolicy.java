package com.trashed.driver;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import android.util.Base64;
import java.util.UUID;

final class ByteExportPolicy {
    static final int MAX_CHUNK = 64 * 1024;
    static final long MAX_BYTES = 256L * 1024 * 1024;

    static Long integer(Object value) {
        if (!(value instanceof Number)) return null;
        double number = ((Number) value).doubleValue();
        return !Double.isNaN(number) && !Double.isInfinite(number) && number >= 0 && number <= MAX_BYTES && number == Math.floor(number)
            ? (long) number : null;
    }

    static String metadataError(String filename, String mimeType) {
        String extension = "audio/mpeg".equals(mimeType) ? "mp3" : "audio/wav".equals(mimeType) ? "wav" : null;
        if (extension == null) return "INVALID_MIME";
        if (filename == null || filename.length() > 120 || filename.contains("..")
            || !filename.matches("[A-Za-z0-9][A-Za-z0-9 ._-]*\\." + extension)) return "INVALID_FILENAME";
        return null;
    }

    static byte[] decode(String value) {
        if (value == null || value.isEmpty() || value.length() > ((MAX_CHUNK + 2) / 3) * 4) return null;
        try {
            byte[] bytes = Base64.decode(value, Base64.DEFAULT);
            return bytes.length > 0 && bytes.length <= MAX_CHUNK && Base64.encodeToString(bytes, Base64.NO_WRAP).equals(value)
                ? bytes : null;
        } catch (IllegalArgumentException ignored) { return null; }
    }

    static final class Spool {
        final String id = UUID.randomUUID().toString();
        final File directory, file;
        final String mimeType;
        final Long expectedBytes;
        long offset;
        boolean sealed;
        volatile boolean cancelled;
        boolean committed;
        private FileOutputStream output;

        Spool(File root, String filename, String mimeType, Long expectedBytes) throws IOException {
            String error = metadataError(filename, mimeType);
            if (error != null || (expectedBytes != null && (expectedBytes < 1 || expectedBytes > MAX_BYTES))) {
                throw new IllegalArgumentException(error == null ? "INVALID_OPTIONS" : error);
            }
            this.mimeType = mimeType;
            this.expectedBytes = expectedBytes;
            directory = new File(root, id);
            file = new File(directory, filename);
            if (!directory.mkdirs()) throw new IOException("Staging unavailable");
            try { output = new FileOutputStream(file); }
            catch (IOException failure) { cleanup(); throw failure; }
        }

        void append(long at, byte[] bytes) throws IOException {
            if (sealed || cancelled || at != offset) throw new IllegalArgumentException("INVALID_OFFSET");
            if (bytes == null || bytes.length == 0 || bytes.length > MAX_CHUNK) throw new IllegalArgumentException("INVALID_CHUNK");
            if (offset + bytes.length > MAX_BYTES || (expectedBytes != null && offset + bytes.length > expectedBytes)) {
                throw new IllegalArgumentException("TOO_LARGE");
            }
            output.write(bytes);
            offset += bytes.length;
        }

        void seal() throws IOException {
            if (sealed || cancelled || offset == 0 || (expectedBytes != null && offset != expectedBytes)) {
                throw new IllegalArgumentException("INCOMPLETE");
            }
            output.close();
            output = null;
            sealed = true;
        }

        void cleanup() {
            if (output != null) { try { output.close(); } catch (IOException ignored) {} output = null; }
            file.delete();
            directory.delete();
        }
    }

    static void cleanupStale(File root) {
        File[] directories = root.listFiles();
        if (directories == null) return;
        for (File directory : directories) {
            File[] files = directory.listFiles();
            if (files != null) for (File file : files) file.delete();
            directory.delete();
        }
        root.delete();
    }
}
