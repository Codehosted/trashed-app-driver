package com.trashed.driver;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import java.io.InputStream;

/** Untinted native raster avatar. No ConstantState: Material must retain this instance. */
final class NativeDockAvatar extends Drawable implements Runnable {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Context context;
    private Movie movie;
    private Bitmap bitmap;
    private String initials = "?";
    private boolean running;
    private long started;
    private int frameTime;
    NativeDockAvatar(Context context) { this.context = context; }
    static NativeDockAvatar trisha(Context context) {
        NativeDockAvatar avatar = new NativeDockAvatar(context);
        avatar.initials = "T";
        try (InputStream input = context.getAssets().open("brand/trisha-waving.gif")) {
            avatar.movie = Movie.decodeStream(input);
        } catch (Exception ignored) { }
        try (InputStream input = context.getAssets().open("brand/trisha-waving-still.png")) {
            avatar.bitmap = BitmapFactory.decodeStream(input);
        } catch (Exception ignored) { }
        return avatar;
    }
    void image(Bitmap image, String name) {
        bitmap = image; initials = NativeDockAvatarPolicy.initials(name); invalidateSelf();
    }
    void active(boolean active) {
        handler.removeCallbacks(this);
        running = active && movie != null && animationsEnabled();
        started = SystemClock.uptimeMillis(); frameTime = 0;
        invalidateSelf();
        if (running) handler.postDelayed(this, 66);
    }
    private boolean animationsEnabled() {
        if (Build.VERSION.SDK_INT >= 26) return ValueAnimator.areAnimatorsEnabled();
        return Settings.Global.getFloat(context.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f;
    }
    @Override public void run() {
        if (!running) return;
        if (!animationsEnabled()) { active(false); return; }
        frameTime = (int)((SystemClock.uptimeMillis() - started) % Math.max(1, movie.duration()));
        invalidateSelf(); handler.postDelayed(this, 66);
    }
    @Override public void draw(Canvas canvas) {
        Rect bounds = getBounds();
        if (bounds.isEmpty()) return;
        int save = canvas.save();
        float size = Math.min(bounds.width(), bounds.height());
        float left = bounds.exactCenterX() - size / 2, top = bounds.exactCenterY() - size / 2;
        Path clip = new Path(); clip.addCircle(bounds.exactCenterX(), bounds.exactCenterY(), size / 2, Path.Direction.CW); canvas.clipPath(clip);
        if (movie != null && (running || bitmap == null)) {
            canvas.translate(left, top); canvas.scale(size / movie.width(), size / movie.height());
            movie.setTime(frameTime); movie.draw(canvas, 0, 0, paint);
        } else if (bitmap != null) {
            int crop = Math.min(bitmap.getWidth(), bitmap.getHeight());
            int x = (bitmap.getWidth() - crop) / 2, y = (bitmap.getHeight() - crop) / 2;
            canvas.drawBitmap(bitmap, new Rect(x, y, x + crop, y + crop), new RectF(left, top, left + size, top + size), paint);
        } else {
            paint.setColor(0xff7033ff); canvas.drawCircle(bounds.exactCenterX(), bounds.exactCenterY(), size / 2, paint);
            paint.setColor(Color.WHITE); paint.setTypeface(Typeface.DEFAULT_BOLD); paint.setTextAlign(Paint.Align.CENTER); paint.setTextSize(size * .40f);
            canvas.drawText(initials, bounds.exactCenterX(), bounds.exactCenterY() - (paint.ascent() + paint.descent()) / 2, paint);
        }
        canvas.restoreToCount(save);
    }
    @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); invalidateSelf(); }
    @Override public void setColorFilter(ColorFilter filter) { /* Raster colors are never navigation tint. */ }
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    @Override public int getIntrinsicWidth() { return 96; }
    @Override public int getIntrinsicHeight() { return 96; }
    @Override public boolean setVisible(boolean visible, boolean restart) {
        boolean changed = super.setVisible(visible, restart);
        if (!visible) active(false);
        return changed;
    }
    boolean running() { return running; }
    int frameTime() { return frameTime; }
}
