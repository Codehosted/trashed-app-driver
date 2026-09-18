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
    private String signature = "", selectedLabel = "", selectedId = "";
    private boolean dark, disposed, rentalStyle, dragged;
    private double centerX = .5, centerY = .5;
    private int zoom = 10;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tilePaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final LinkedHashMap<String, Bitmap> tiles = new LinkedHashMap<>(32, .75f, true);
    private final Set<String> pending = new HashSet<>(), failed = new HashSet<>();
    private final ExecutorService loader = Executors.newFixedThreadPool(2);
    private final ScaleGestureDetector scale;
    private float lastX, lastY, downX, downY, scaleAmount = 1;
    NativeChatStreetMap(Context context) {
        super(context); setMinimumHeight(dp(240)); setFocusable(true);
        scale = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                dragged=true; scaleAmount *= detector.getScaleFactor();
                if (scaleAmount > 1.4f) { zoomBy(1); scaleAmount=1; }
                else if (scaleAmount < .7f) { zoomBy(-1); scaleAmount=1; }
                return true;
            }
        });
        setContentDescription("Street map. Drag to pan; pinch to zoom. Map data © OpenStreetMap contributors.");
    }
    void setRentalStyle() { rentalStyle = true; }
    void selectMarker(String id) { selectedId = id; invalidate(); }
    void fitAll() { fit(); failed.clear(); invalidate(); }
    void zoomBy(int step) { zoom = Math.max(2, Math.min(18,zoom+step)); invalidate(); }
    void appearanceChanged(boolean dark) {
        this.dark = dark;
        // Recolor the actual public raster at draw time, never synthesize streets.
        tilePaint.setColorFilter(rentalStyle && dark ? new ColorMatrixColorFilter(new float[]{
            -.14f,-.48f,-.05f,0,194, -.14f,-.48f,-.05f,0,196, -.14f,-.48f,-.05f,0,200, 0,0,0,1,0
        }) : null);
        invalidate();
    }
    void clearPrivateData() {
        data=new JSONObject(); signature=""; selectedLabel=""; selectedId=""; centerX=centerY=.5; zoom=2; invalidate();
    }
    void setData(JSONObject next, boolean dark) {
        String nextSignature = next.toString();
        boolean changed = !nextSignature.equals(signature); data = next; signature = nextSignature;
        appearanceChanged(dark);
        if (changed) { selectedLabel = ""; fit(); }
        invalidate();
    }
    private java.util.List<double[]> points() {
        java.util.List<double[]> points = new ArrayList<>();
        JSONArray markers = data.optJSONArray("markers"), lines = data.optJSONArray("lines");
        if (markers != null) for (int i=0; i<markers.length(); i++) { double[] p=point(markers.optJSONObject(i)); if(p!=null)points.add(p); }
        if (lines != null) for (int i=0; i<lines.length(); i++) {
            JSONObject line=lines.optJSONObject(i); JSONArray list=line==null?null:line.optJSONArray("points");
            if(list!=null)for(int j=0;j<list.length();j++){double[] p=point(list.optJSONObject(j));if(p!=null)points.add(p);}
        }
        return points;
    }
    private void fit() {
        NativeMapViewport.Fit fit=NativeMapViewport.fit(points(),Math.max(dp(250),getWidth())-dp(64),Math.max(dp(160),getHeight())-dp(100));
        centerX=fit.x;centerY=fit.y;zoom=fit.zoom;
    }
    private double world() { return 256.0 * (1 << zoom); }
    private static double[] point(JSONObject p) { return p==null?null:NativeMapViewport.point(p.optDouble("latitude",Double.NaN),p.optDouble("longitude",Double.NaN)); }
    private float x(double x) { return (float)(NativeMapViewport.delta(x,centerX)*world()+getWidth()/2.0); }
    private float y(double y) { return (float)((y-centerY)*world()+getHeight()/2.0); }
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh) { super.onSizeChanged(w,h,oldw,oldh); if (oldw==0 || (rentalStyle && oldh!=h)) fit(); }
    @Override protected void onMeasure(int widthSpec, int heightSpec) { setMeasuredDimension(MeasureSpec.getSize(widthSpec), resolveSize(dp(240), heightSpec)); }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas); canvas.drawColor(dark?0xff22252a:0xffebece7);
        if (points().isEmpty()) {
            paint.setColor(dark?Color.WHITE:Color.DKGRAY);paint.setTextSize(dp(14));canvas.drawText("No map locations available",dp(12),dp(30),paint);attribution(canvas);return;
        }
        double left=centerX*world()-getWidth()/2.0, top=centerY*world()-getHeight()/2.0;
        int count=1<<zoom;
        for(int tx=(int)Math.floor(left/256);tx<=Math.floor((left+getWidth())/256);tx++)for(int ty=(int)Math.floor(top/256);ty<=Math.floor((top+getHeight())/256);ty++){
            if(ty<0||ty>=count)continue;int wrapped=((tx%count)+count)%count;String key=zoom+"/"+wrapped+"/"+ty;Bitmap bitmap=tiles.get(key);
            if(bitmap!=null)canvas.drawBitmap(bitmap,null,new RectF((float)(tx*256-left),(float)(ty*256-top),(float)(tx*256-left+256),(float)(ty*256-top+256)),tilePaint);
            else request(key);
        }
        paint.setColor(0xff7033ff);paint.setStrokeWidth(dp(4));paint.setStyle(Paint.Style.STROKE);
        JSONArray lines=data.optJSONArray("lines");
        if(lines!=null)for(int i=0;i<lines.length();i++){
            JSONObject line=lines.optJSONObject(i);JSONArray list=line==null?null:line.optJSONArray("points");if(list==null)continue;Path path=new Path();boolean started=false;
            for(int j=0;j<list.length();j++){double[] p=point(list.optJSONObject(j));if(p==null){started=false;continue;}if(!started)path.moveTo(x(p[0]),y(p[1]));else path.lineTo(x(p[0]),y(p[1]));started=true;}
            canvas.drawPath(path,paint);
        }
        paint.setStyle(Paint.Style.FILL);JSONArray markers=data.optJSONArray("markers");
        if(markers!=null)for(int pass=0;pass<2;pass++)for(int i=0;i<markers.length();i++){
            JSONObject marker=markers.optJSONObject(i);double[] p=point(marker);if(p==null)continue;
            boolean selected=rentalStyle&&selectedId.equals(marker.optString("id"));if(selected!=(pass==1))continue;
            if(selected){paint.setColor(0x666e5cff);canvas.drawCircle(x(p[0]),y(p[1]),dp(17),paint);}
            paint.setColor(Color.WHITE);canvas.drawCircle(x(p[0]),y(p[1]),dp(selected?9:rentalStyle?5:8),paint);
            paint.setColor(selected?0xff9865ff:rentalStyle?0xff6199ff:0xff7033ff);canvas.drawCircle(x(p[0]),y(p[1]),dp(selected?7:rentalStyle?4:6),paint);
        }
        attribution(canvas);
        if(!rentalStyle&&!selectedLabel.isEmpty()){paint.setColor(dark?0xff22252a:Color.WHITE);canvas.drawRect(0,0,getWidth(),dp(38),paint);paint.setColor(dark?Color.WHITE:Color.BLACK);paint.setTextSize(dp(12));canvas.drawText(selectedLabel,dp(8),dp(24),paint);}
        if(!failed.isEmpty()&&tiles.isEmpty()){paint.setColor(dark?Color.WHITE:Color.BLACK);paint.setTextSize(dp(12));canvas.drawText("Street tiles unavailable — check connection",dp(8),dp(56),paint);}
    }
    private void attribution(Canvas canvas) {
        paint.setStyle(Paint.Style.FILL);paint.setColor(dark?0xe622252a:0xe6ffffff);canvas.drawRect(0,getHeight()-dp(25),getWidth(),getHeight(),paint);
        paint.setColor(dark?Color.WHITE:Color.DKGRAY);paint.setTextSize(dp(10));canvas.drawText("© OpenStreetMap contributors",dp(6),getHeight()-dp(8),paint);
    }
    private void request(String key) {
        if(disposed||pending.contains(key)||failed.contains(key)||pending.size()>=24)return;
        pending.add(key);
        loader.execute(()->{
            Bitmap bitmap=null;HttpURLConnection connection=null;
            try {
                byte[] bytes=cachedTile(key);
                if(bytes==null){
                    connection=(HttpURLConnection)new URL("https://tile.openstreetmap.org/"+key+".png").openConnection();
                    connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
                    connection.setRequestProperty("User-Agent","TrashedNativeMap/1 (+https://trashed.app)");
                    if(connection.getResponseCode()==200){bytes=NativeChatCache.readBounded(connection.getInputStream(),512*1024);saveTile(key,bytes);}
                }
                if(bytes!=null){BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);if(bounds.outWidth==256&&bounds.outHeight==256)bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length);}
            }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
            Bitmap result=bitmap;post(()->{pending.remove(key);if(disposed)return;if(result!=null){if(tiles.size()>=64)tiles.remove(tiles.keySet().iterator().next());tiles.put(key,result);}else failed.add(key);invalidate();});
        });
    }
    @Override public boolean onTouchEvent(MotionEvent event) {
        scale.onTouchEvent(event);
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){dragged=false;downX=lastX=event.getX();downY=lastY=event.getY();if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(true);return true;}
        if(event.getActionMasked()==MotionEvent.ACTION_MOVE){
            if(Math.hypot(event.getX()-downX,event.getY()-downY)>=dp(10))dragged=true;
            if(!scale.isInProgress()){centerX-=(event.getX()-lastX)/world();centerY=Math.max(0,Math.min(1,centerY-(event.getY()-lastY)/world()));centerX=(centerX%1+1)%1;invalidate();}
            lastX=event.getX();lastY=event.getY();return true;
        }
        if(event.getActionMasked()==MotionEvent.ACTION_CANCEL){if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(false);return true;}
        if(event.getActionMasked()==MotionEvent.ACTION_UP){
            if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(false);
            if(!dragged&&Math.hypot(event.getX()-downX,event.getY()-downY)<dp(10)){
                JSONArray markers=data.optJSONArray("markers");JSONObject nearest=null;double distance=dp(24);
                if(markers!=null)for(int i=0;i<markers.length();i++){JSONObject m=markers.optJSONObject(i);double[]p=point(m);if(p==null)continue;double d=Math.hypot(x(p[0])-event.getX(),y(p[1])-event.getY());if(d<distance){distance=d;nearest=m;}}
                if(nearest!=null){selectedLabel=nearest.optString("label");selectedId=nearest.optString("id");announceForAccessibility(selectedLabel);if(selection!=null)selection.select(selectedId);invalidate();}performClick();
            }return true;
        }
        return true;
    }
    @Override public boolean performClick(){super.performClick();return true;}
    // Public raster assets only, no markers, auth, headers or coordinates in filenames.
    // OSM policy: at least 7-day cache, identified client, attribution, viewport-only requests.
    private static final long TILE_TTL=7L*24*60*60*1000;
    private java.io.File tileDirectory(){return new java.io.File(getContext().getCacheDir(),"native-public-map-tiles-v1");}
    private byte[] cachedTile(String key)throws java.io.IOException{
        java.io.File directory=tileDirectory();directory.mkdirs();long total=0,now=System.currentTimeMillis();int count=0;
        java.io.File[] files=directory.listFiles();
        if(files!=null)for(java.io.File file:files){long age=now-file.lastModified();if(age<0||age>TILE_TTL)file.delete();else{total+=file.length();count++;}}
        java.io.File file=new java.io.File(directory,NativeChatCache.digest(key)+".png");
        if(file.isFile())return NativeChatCache.readBounded(new java.io.FileInputStream(file),512*1024);
        // Never evict fresh tiles to create a re-download loop or offer bulk/offline prefetch.
        if(total>=32L*1024*1024||count>=256)throw new java.io.IOException("Tile cache limit");
        return null;
    }
    private void saveTile(String key,byte[] bytes){
        java.io.File directory=tileDirectory(),file=new java.io.File(directory,NativeChatCache.digest(key)+".png"),temporary=new java.io.File(directory,NativeChatCache.digest(key)+".tmp");
        try(java.io.FileOutputStream output=new java.io.FileOutputStream(temporary)){output.write(bytes);}
        catch(java.io.IOException error){temporary.delete();return;}
        if(!temporary.renameTo(file))temporary.delete();
    }
    void dispose(){disposed=true;clearPrivateData();selection=null;loader.shutdownNow();tiles.clear();pending.clear();failed.clear();}
    int loadedTileCount(){return tiles.size();}
    boolean visibleTilesReady(){return !tiles.isEmpty()&&pending.isEmpty()&&failed.isEmpty();}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
}
