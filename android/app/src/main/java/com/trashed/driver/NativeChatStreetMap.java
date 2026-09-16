package com.trashed.driver;

import android.content.Context;
import android.graphics.*;
import android.view.*;
import org.json.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

/** Native Canvas street map with standard OpenStreetMap tiles.
 * No location permission, WebView, payload URL, cookies, credentials or paid API key.
 * Raster basemap is a bounded read-only asset; markers/routes remain memory-only.
 */
final class NativeChatStreetMap extends View {
    interface MarkerSelection { void select(String id); }
    private MarkerSelection selection;
    void setMarkerSelection(MarkerSelection selection) { this.selection = selection; }
    private JSONObject data = new JSONObject();
    private String signature = "", selectedLabel = "";
    private boolean dark, disposed;
    private double centerX = .5, centerY = .5;
    private int zoom = 10;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final LinkedHashMap<String, Bitmap> tiles = new LinkedHashMap<>(32, .75f, true);
    private final Set<String> pending = new HashSet<>(), failed = new HashSet<>();
    private final ExecutorService loader = Executors.newFixedThreadPool(2);
    private final ScaleGestureDetector scale;
    private float lastX, lastY, downX, downY, scaleAmount = 1;
    NativeChatStreetMap(Context context) {
        super(context); setMinimumHeight(dp(240)); setFocusable(true);
        scale = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                scaleAmount *= detector.getScaleFactor();
                if (scaleAmount > 1.4f) { zoom = Math.min(18, zoom+1); scaleAmount=1; invalidate(); }
                else if (scaleAmount < .7f) { zoom = Math.max(2, zoom-1); scaleAmount=1; invalidate(); }
                return true;
            }
        });
        setContentDescription("Street map. Drag to pan; pinch to zoom. Map data © OpenStreetMap contributors.");
    }
    void setData(JSONObject next, boolean dark) {
        String nextSignature = next.toString();
        boolean changed = !nextSignature.equals(signature); data = next; signature = nextSignature;
        if (this.dark != dark) { tiles.clear(); failed.clear(); } this.dark = dark;
        if (changed) { selectedLabel = ""; fit(); }
        invalidate();
    }
    private java.util.List<double[]> points() {
        java.util.List<double[]> points = new ArrayList<>();
        JSONArray markers = data.optJSONArray("markers"), lines = data.optJSONArray("lines");
        if (markers != null) for (int i=0; i<markers.length(); i++) points.add(point(markers.optJSONObject(i)));
        if (lines != null) for (int i=0; i<lines.length(); i++) { JSONArray list=lines.optJSONObject(i).optJSONArray("points"); for (int j=0;j<list.length();j++) points.add(point(list.optJSONObject(j))); }
        return points;
    }
    private void fit() {
        java.util.List<double[]> points=points(); if (points.isEmpty()) return;
        double minX=1,maxX=0,minY=1,maxY=0;
        for (double[] p:points) { minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]); }
        centerX=(minX+maxX)/2;centerY=(minY+maxY)/2;
        double width=Math.max(dp(250), getWidth())-dp(56), height=Math.max(dp(200),getHeight())-dp(64);
        zoom=16;
        while (zoom>2 && ((maxX-minX)*world()>width || (maxY-minY)*world()>height)) zoom--;
    }
    private double world() { return 256.0 * (1 << zoom); }
    private static double[] point(JSONObject p) {
        double lat=Math.max(-85.05112878, Math.min(85.05112878,p.optDouble("latitude")));
        double sin=Math.sin(Math.toRadians(lat));
        return new double[]{(p.optDouble("longitude")+180)/360, .5-Math.log((1+sin)/(1-sin))/(4*Math.PI)};
    }
    private float x(double x) { return (float)((x-centerX)*world()+getWidth()/2.0); }
    private float y(double y) { return (float)((y-centerY)*world()+getHeight()/2.0); }
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh) { super.onSizeChanged(w,h,oldw,oldh); if (oldw==0) fit(); }
    @Override protected void onMeasure(int widthSpec, int heightSpec) { setMeasuredDimension(MeasureSpec.getSize(widthSpec), resolveSize(dp(240), heightSpec)); }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas); canvas.drawColor(dark?0xff22252a:0xffebece7);
        if (points().isEmpty()) { paint.setColor(dark?Color.WHITE:Color.DKGRAY); paint.setTextSize(dp(14));canvas.drawText("No map locations available",dp(12),dp(30),paint);return; }
        double left=centerX*world()-getWidth()/2.0, top=centerY*world()-getHeight()/2.0;
        int count=1<<zoom;
        for(int tx=(int)Math.floor(left/256); tx<=Math.floor((left+getWidth())/256);tx++) for(int ty=(int)Math.floor(top/256);ty<=Math.floor((top+getHeight())/256);ty++) {
            if(ty<0||ty>=count)continue; int wrapped=((tx%count)+count)%count;
            String key=zoom+"/"+wrapped+"/"+ty;
            Bitmap bitmap=tiles.get(key);
            if(bitmap!=null) canvas.drawBitmap(bitmap,null,new RectF((float)(tx*256-left),(float)(ty*256-top),(float)(tx*256-left+256),(float)(ty*256-top+256)),null);
            else request(key);
        }
        paint.setColor(0xff7033ff);paint.setStrokeWidth(dp(4));paint.setStyle(Paint.Style.STROKE);
        JSONArray lines=data.optJSONArray("lines");
        if(lines!=null)for(int i=0;i<lines.length();i++){ JSONArray list=lines.optJSONObject(i).optJSONArray("points");Path path=new Path();for(int j=0;j<list.length();j++){double[] p=point(list.optJSONObject(j));if(j==0)path.moveTo(x(p[0]),y(p[1]));else path.lineTo(x(p[0]),y(p[1]));}canvas.drawPath(path,paint); }
        paint.setStyle(Paint.Style.FILL);JSONArray markers=data.optJSONArray("markers");
        if(markers!=null)for(int i=0;i<markers.length();i++){double[] p=point(markers.optJSONObject(i));paint.setColor(Color.WHITE);canvas.drawCircle(x(p[0]),y(p[1]),dp(8),paint);paint.setColor(0xff7033ff);canvas.drawCircle(x(p[0]),y(p[1]),dp(6),paint);}
        paint.setColor(dark?0xe622252a:0xe6ffffff);canvas.drawRect(0,getHeight()-dp(25),getWidth(),getHeight(),paint);
        paint.setColor(dark?Color.WHITE:Color.DKGRAY);paint.setTextSize(dp(10));canvas.drawText("© OpenStreetMap contributors",dp(6),getHeight()-dp(8),paint);
        if(!selectedLabel.isEmpty()){paint.setColor(dark?0xff22252a:Color.WHITE);canvas.drawRect(0,0,getWidth(),dp(38),paint);paint.setColor(dark?Color.WHITE:Color.BLACK);paint.setTextSize(dp(12));canvas.drawText(selectedLabel,dp(8),dp(24),paint);}
        if(!failed.isEmpty()&&tiles.isEmpty()){paint.setColor(dark?Color.WHITE:Color.BLACK);paint.setTextSize(dp(12));canvas.drawText("Street tiles unavailable — check connection",dp(8),dp(56),paint);}
    }
    private void request(String key) {
        if(disposed || pending.contains(key)||failed.contains(key)||pending.size()>=24)return;
        pending.add(key);
        loader.execute(()->{
            Bitmap bitmap=null;HttpURLConnection connection=null;
            try {
                byte[] bytes = cachedTile(key);
                if (bytes == null) {
                    connection=(HttpURLConnection)new URL("https://tile.openstreetmap.org/"+key+".png").openConnection();
                    connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
                    connection.setRequestProperty("User-Agent","TrashedNativeMap/1 (+https://trashed.app)");
                    if(connection.getResponseCode()==200) {
                        bytes=NativeChatCache.readBounded(connection.getInputStream(),512*1024);
                        saveTile(key, bytes);
                    }
                }
                if(bytes != null) { BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);if(bounds.outWidth==256&&bounds.outHeight==256)bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length); }
            }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
            Bitmap result=bitmap;post(()->{pending.remove(key);if(disposed)return;if(result!=null){if(tiles.size()>=64)tiles.remove(tiles.keySet().iterator().next());tiles.put(key,result);}else failed.add(key);invalidate();});
        });
    }
    @Override public boolean onTouchEvent(MotionEvent event) {
        scale.onTouchEvent(event);
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){downX=lastX=event.getX();downY=lastY=event.getY();getParent().requestDisallowInterceptTouchEvent(true);return true;}
        if(event.getActionMasked()==MotionEvent.ACTION_MOVE){if(!scale.isInProgress()){centerX-=(event.getX()-lastX)/world();centerY=Math.max(0,Math.min(1,centerY-(event.getY()-lastY)/world()));centerX=(centerX%1+1)%1;invalidate();}lastX=event.getX();lastY=event.getY();return true;}
        if(event.getActionMasked()==MotionEvent.ACTION_UP){getParent().requestDisallowInterceptTouchEvent(false);if(Math.hypot(event.getX()-downX,event.getY()-downY)<dp(10)){JSONArray markers=data.optJSONArray("markers");if(markers!=null)for(int i=0;i<markers.length();i++){JSONObject m=markers.optJSONObject(i);double[]p=point(m);if(Math.hypot(x(p[0])-event.getX(),y(p[1])-event.getY())<dp(24)){selectedLabel=m.optString("label");announceForAccessibility(selectedLabel);if(selection!=null)selection.select(m.optString("id"));invalidate();break;}}performClick();}return true;}
        return true;
    }
    @Override public boolean performClick(){super.performClick();return true;}
    // Public raster assets only, no markers, auth, headers or coordinates in filenames.
    // OSM policy: at least 7-day cache, identified client, attribution, viewport-only requests.
    private static final long TILE_TTL = 7L * 24 * 60 * 60 * 1000;
    private java.io.File tileDirectory() { return new java.io.File(getContext().getCacheDir(), "native-public-map-tiles-v1"); }
    private byte[] cachedTile(String key) throws java.io.IOException {
        java.io.File directory = tileDirectory(); directory.mkdirs();
        long total = 0, now = System.currentTimeMillis(); int count = 0;
        java.io.File[] files = directory.listFiles();
        if (files != null) for (java.io.File file : files) {
            long age = now - file.lastModified();
            if (age < 0 || age > TILE_TTL) file.delete(); else { total += file.length(); count++; }
        }
        java.io.File file = new java.io.File(directory, NativeChatCache.digest(key) + ".png");
        if (file.isFile()) return NativeChatCache.readBounded(new java.io.FileInputStream(file), 512*1024);
        // Never evict fresh tiles to create a re-download loop or offer bulk/offline prefetch.
        if (total >= 32L*1024*1024 || count >= 256) throw new java.io.IOException("Tile cache limit");
        return null;
    }
    private void saveTile(String key, byte[] bytes) {
        java.io.File directory = tileDirectory(), file = new java.io.File(directory, NativeChatCache.digest(key)+".png"), temporary = new java.io.File(directory, NativeChatCache.digest(key)+".tmp");
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(temporary)) { output.write(bytes); }
        catch (java.io.IOException error) { temporary.delete(); return; }
        if (!temporary.renameTo(file)) temporary.delete();
    }
    void dispose(){disposed=true;loader.shutdownNow();tiles.clear();pending.clear();failed.clear();}
    int loadedTileCount() { return tiles.size(); }
    boolean visibleTilesReady() { return !tiles.isEmpty() && pending.isEmpty() && failed.isEmpty(); }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
}
