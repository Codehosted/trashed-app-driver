package com.trashed.driver;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import java.io.File;
import java.io.FileInputStream;

/** One player per workspace, independent of recycled/expanded rows. All methods run on main. */
final class NativeWorkspaceAudio {
    final AudioManager manager;
    private final Handler handler = new Handler(android.os.Looper.getMainLooper());
    private final Runnable changed;
    private final AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    private AudioFocusRequest focus;
    private MediaPlayer player;
    private File file;
    String id = "", error = "";
    boolean loading, prepared;
    float speed = 1f;
    private final AudioManager.OnAudioFocusChangeListener focusListener = value -> { if (value < 0) pause(); };
    private final Runnable tick = new Runnable() { @Override public void run() { changed.run(); if (playing()) handler.postDelayed(this, 500); } };
    NativeWorkspaceAudio(Context context, Runnable changed) { this.changed = changed; manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE); }
    void loading(String next) { release(); id = next; loading = true; changed.run(); }
    void open(File audio) {
        file = audio;
        try {
            player = new MediaPlayer(); player.setAudioAttributes(attributes);
            // The platform never receives an authenticated URL or cookies, preventing redirect leaks.
            try (FileInputStream input = new FileInputStream(audio)) { player.setDataSource(input.getFD()); }
            player.setOnPreparedListener(value -> { if (value != player) return; prepared = true; loading = false; play(); });
            player.setOnCompletionListener(value -> { if (value != player) return; abandon(); handler.removeCallbacks(tick); changed.run(); });
            player.setOnErrorListener((value, what, extra) -> { if (value == player) fail("Unable to play this recording. Retry."); return true; });
            player.prepareAsync();
        } catch (Exception failure) { fail("Unable to decode this recording. Retry."); }
    }
    void fail(String message) { String previous = id; release(); id = previous; error = message; changed.run(); }
    void toggle() { if (playing()) pause(); else if (prepared) play(); }
    private void play() {
        if (!prepared || player == null) return;
        int result;
        if (Build.VERSION.SDK_INT >= 26) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener).build();
            result = manager.requestAudioFocus(focus);
        } else result = manager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { error = "Audio is in use. Tap play to retry."; changed.run(); return; }
        try {
            error = ""; if (position() >= duration()) player.seekTo(0);
            player.setPlaybackParams(player.getPlaybackParams().setSpeed(speed)); player.start();
            handler.removeCallbacks(tick); handler.post(tick);
        } catch (RuntimeException failure) { fail("Playback failed. Retry."); }
    }
    void pause() { if (playing()) player.pause(); abandon(); handler.removeCallbacks(tick); changed.run(); }
    void seek(int milliseconds) { if (prepared && player != null) { player.seekTo(Math.max(0, Math.min(milliseconds, duration()))); changed.run(); } }
    void cycleSpeed() {
        speed = speed == 1f ? 1.5f : speed == 1.5f ? 2f : 1f;
        if (prepared && player != null) {
            boolean playing = playing();
            try { player.setPlaybackParams(player.getPlaybackParams().setSpeed(speed)); if (!playing) player.pause(); }
            catch (RuntimeException failure) { speed = 1f; }
        }
        changed.run();
    }
    boolean playing() { try { return prepared && player != null && player.isPlaying(); } catch (RuntimeException failure) { return false; } }
    int position() { try { return prepared && player != null ? player.getCurrentPosition() : 0; } catch (RuntimeException failure) { return 0; } }
    int duration() { try { return prepared && player != null ? player.getDuration() : 0; } catch (RuntimeException failure) { return 0; } }
    void release() {
        handler.removeCallbacks(tick);
        if (player != null) { player.setOnPreparedListener(null); player.setOnCompletionListener(null); player.setOnErrorListener(null); player.release(); player = null; }
        if (file != null) { file.delete(); file = null; }
        abandon(); id = ""; prepared = false; loading = false; error = "";
    }
    private void abandon() {
        if (Build.VERSION.SDK_INT >= 26 && focus != null) { manager.abandonAudioFocusRequest(focus); focus = null; }
        else manager.abandonAudioFocus(focusListener);
    }
}
