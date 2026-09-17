package com.trashed.driver;
import android.content.Context;
import android.content.res.*;
import android.graphics.Color;
import android.graphics.drawable.*;
import android.view.*;
import android.widget.*;
/** In-place semantic recoloring: never replaces an editor, scroll view or player. */
final class NativeSystemAppearance {
 static boolean dark(Context c){return (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;}
 private static final int[][] PAIRS={
 {0xfffafafb,0xff131315},{0xfffafafc,0xff14121a},{0xffffffff,0xff1d1d20},
 {0xff1c1c20,0xfff6f6f8},{0xff211a2b,0xfff2edf9},{0xff62626e,0xffb6b6be},
 {0xff62596e,0xffbfb8cc},{0xffe3e3e8,0xff35353b},{0xffd9d1e0,0xff463b52},
 {0xfff0ebfa,0xff292133},{0xfffaf7fc,0xff292133},{0xffe6e0ed,0xff3d3446},
 {0xff991b1b,0xfffca5a5},{0xffa51e1e,0xffffaaaa},{0xffaa1c1c,0xffffa0a0}
 };
 static int color(int c,boolean dark,boolean text){
  if(c==Color.TRANSPARENT)return c;
  if(text && (c==Color.WHITE || c==0xfff2edf9 || c==0xfff6f6f8 || c==0xff211a2b || c==0xff1c1c20))return dark?0xfff6f6f8:0xff1c1c20;
  if(!text && (c==Color.WHITE || c==0xff1f1a26 || c==0xff1d1d20))return dark?0xff1d1d20:Color.WHITE;
  if(text && (c==0xff7033ff || c==0xffbe9fff))return dark?0xffbe9fff:0xff7033ff;
  for(int[] pair:PAIRS)if(c==pair[0]||c==pair[1])return pair[dark?1:0];return c;
 }
 static int background(View v){Drawable d=v.getBackground();if(v.getBackgroundTintList()!=null)return v.getBackgroundTintList().getDefaultColor();if(d instanceof ColorDrawable)return ((ColorDrawable)d).getColor();if(d instanceof GradientDrawable)return gradientColor((GradientDrawable)d);return 0;}
 // getColor was added in API24. API23 samples the solid fill without reflection.
 static int gradientColor(GradientDrawable gradient) {
  if(android.os.Build.VERSION.SDK_INT>=24) {
   ColorStateList fill=gradient.getColor();return fill==null?Color.TRANSPARENT:fill.getDefaultColor();
  }
  android.graphics.Rect bounds=new android.graphics.Rect(gradient.getBounds());
  android.graphics.Bitmap pixel=android.graphics.Bitmap.createBitmap(3,3,android.graphics.Bitmap.Config.ARGB_8888);
  try {gradient.setBounds(0,0,3,3);gradient.draw(new android.graphics.Canvas(pixel));return pixel.getPixel(1,1);}
  finally {gradient.setBounds(bounds);pixel.recycle();}
 }
 static boolean accent(int c){return c==0xff7033ff || c==0xffbe9fff;}
 // Projected colors retain their source theme; never infer the source from an already repainted pixel.
 static int projected(int value, boolean sourceDark, boolean targetDark, String role, boolean onAccent) {
  if (sourceDark==targetDark || Color.alpha(value)==0 || (onAccent && role.equals("foreground"))) return value;
  float[] hsl=new float[3]; androidx.core.graphics.ColorUtils.colorToHSL(value,hsl);
  int result=value;
  if(hsl[1]<0.22f) {
   if(role.equals("border")) result=targetDark?0xff35353b:0xffe3e3e8;
   else if(role.equals("background")) result=targetDark?0xff1d1d20:0xffffffff;
   else result=targetDark?0xfff6f6f8:0xff1c1c20;
  } else if(role.equals("foreground")) {
   hsl[2]=targetDark?Math.max(.72f,hsl[2]):Math.min(.38f,hsl[2]); result=androidx.core.graphics.ColorUtils.HSLToColor(hsl);
  }
  return androidx.core.graphics.ColorUtils.setAlphaComponent(result,Color.alpha(value));
 }
 static void drawable(Drawable d, boolean dark) {
  if(d==null)return;
  d=d.mutate();
  if(d instanceof InsetDrawable) drawable(((InsetDrawable)d).getDrawable(),dark);
  else if(d instanceof LayerDrawable){LayerDrawable layers=(LayerDrawable)d;for(int i=0;i<layers.getNumberOfLayers();i++)drawable(layers.getDrawable(i),dark);}
  else if(d instanceof ColorDrawable)((ColorDrawable)d).setColor(color(((ColorDrawable)d).getColor(),dark,false));
  else if(d instanceof GradientDrawable){GradientDrawable g=(GradientDrawable)d;g.setColor(color(gradientColor(g),dark,false));}
  else if(d instanceof com.google.android.material.shape.MaterialShapeDrawable){com.google.android.material.shape.MaterialShapeDrawable s=(com.google.android.material.shape.MaterialShapeDrawable)d;if(s.getFillColor()!=null)s.setFillColor(ColorStateList.valueOf(color(s.getFillColor().getDefaultColor(),dark,false)));if(s.getStrokeColor()!=null)s.setStrokeColor(ColorStateList.valueOf(color(s.getStrokeColor().getDefaultColor(),dark,false)));}
 }
 static void dialog(android.app.Dialog dialog) {
  if(dialog.getWindow()==null)return;
  boolean night=dark(dialog.getContext());View root=dialog.getWindow().getDecorView();
  drawable(root.getBackground(),night);repaint(root,night,false);
  dialogText(root,night);
  androidx.core.view.WindowCompat.getInsetsController(dialog.getWindow(),root).setAppearanceLightStatusBars(!night);
  androidx.core.view.WindowCompat.getInsetsController(dialog.getWindow(),root).setAppearanceLightNavigationBars(!night);
 }
 private static void dialogText(View v,boolean night){
  if(v instanceof TextView && !(v instanceof EditText))((TextView)v).setTextColor(night?0xfff6f6f8:0xff1c1c20);
  if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++)dialogText(g.getChildAt(i),night);}
 }
 static void repaint(View v){repaint(v,dark(v.getContext()),false);}
 static void repaint(View v,boolean dark,boolean onAccent){
  if(v instanceof android.webkit.WebView)return;
  int bg=background(v);boolean colored=accent(bg)||onAccent;
  if(v.getBackgroundTintList()!=null && !accent(bg))v.setBackgroundTintList(ColorStateList.valueOf(color(bg,dark,false)));
  drawable(v.getBackground(),dark);
  Drawable drawable=v.getBackground();
  if(drawable instanceof ColorDrawable)((ColorDrawable)drawable.mutate()).setColor(color(((ColorDrawable)drawable).getColor(),dark,false));
  if(drawable instanceof com.google.android.material.shape.MaterialShapeDrawable){com.google.android.material.shape.MaterialShapeDrawable shape=(com.google.android.material.shape.MaterialShapeDrawable)drawable.mutate();if(shape.getFillColor()!=null)shape.setFillColor(ColorStateList.valueOf(color(shape.getFillColor().getDefaultColor(),dark,false)));}
  if(drawable instanceof GradientDrawable){GradientDrawable g=(GradientDrawable)drawable.mutate();g.setColor(color(gradientColor(g),dark,false));}
  if(v instanceof TextView){TextView text=(TextView)v;if(!colored)text.setTextColor(color(text.getCurrentTextColor(),dark,true));text.setHintTextColor(dark?0xffb6b6be:0xff62626e);}
  if(v instanceof EditText){EditText e=(EditText)v;e.setHighlightColor(dark?0x667033ff:0x337033ff);if(android.os.Build.VERSION.SDK_INT>=29 && e.getTextCursorDrawable()!=null)e.getTextCursorDrawable().mutate().setTint(dark?0xffbe9fff:0xff7033ff);}
  if(v instanceof SeekBar){SeekBar s=(SeekBar)v;ColorStateList tint=ColorStateList.valueOf(dark?0xffbe9fff:0xff7033ff);s.setProgressTintList(tint);s.setThumbTintList(tint);}
  if(v instanceof com.google.android.material.textfield.TextInputLayout){com.google.android.material.textfield.TextInputLayout input=(com.google.android.material.textfield.TextInputLayout)v;input.setDefaultHintTextColor(ColorStateList.valueOf(dark?0xffb6b6be:0xff62626e));input.setBoxStrokeColor(dark?0xffbe9fff:0xff7033ff);}
  if(v instanceof com.google.android.material.appbar.MaterialToolbar){com.google.android.material.appbar.MaterialToolbar t=(com.google.android.material.appbar.MaterialToolbar)v;t.setTitleTextColor(dark?0xfff6f6f8:0xff1c1c20);t.setNavigationIconTint(dark?0xffbe9fff:0xff7033ff);if(t.getOverflowIcon()!=null)t.getOverflowIcon().mutate().setTint(dark?0xfff6f6f8:0xff1c1c20);}
  if(v instanceof ImageView && "Trashed".contentEquals(v.getContentDescription()==null?"":v.getContentDescription()))((ImageView)v).setColorFilter(dark?0xfff6f6f8:0xff1c1c20);
  if(v instanceof ViewGroup){ViewGroup group=(ViewGroup)v;for(int i=0;i<group.getChildCount();i++)repaint(group.getChildAt(i),dark,colored);}
  v.invalidate();
 }
}
