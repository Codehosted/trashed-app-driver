package com.trashed.driver;
import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.*;
import android.provider.OpenableColumns;
import java.io.*;
/** Test APK-only bytes for controlled ActivityResult boundary tests. Never user data. */
public final class NativeChatInputBytes extends ContentProvider {
 public static final String AUTHORITY="com.trashed.driver.test.chatbytes";
 public boolean onCreate(){return true;}
 private String checked(Uri uri){
  if(!"ranchu".equals(Build.HARDWARE))throw new SecurityException();
  int uid=Binder.getCallingUid();int target;
  try{target=getContext().getPackageManager().getApplicationInfo("com.trashed.driver",0).uid;}catch(Exception e){throw new SecurityException();}
  if(uid!=target&&uid!=getContext().getApplicationInfo().uid)throw new SecurityException();
  String id=uri.getLastPathSegment();if(id==null||!id.matches("small[0-8]|limit|oversize"))throw new SecurityException();return id;
 }
 private long size(String id){return id.equals("limit")?12L*1024*1024:id.equals("oversize")?12L*1024*1024+1:23;}
 public Cursor query(Uri uri,String[] projection,String sel,String[] args,String sort){String id=checked(uri);String[] cols=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor c=new MatrixCursor(cols);MatrixCursor.RowBuilder row=c.newRow();for(String col:cols)row.add(col.equals(OpenableColumns.DISPLAY_NAME)?id+".txt":col.equals(OpenableColumns.SIZE)?size(id):null);return c;}
 public String getType(Uri uri){checked(uri);return "text/plain";}
 public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{String id=checked(uri);if(!mode.equals("r"))throw new SecurityException();try{ParcelFileDescriptor[] pipe=ParcelFileDescriptor.createPipe();new Thread(()->{try(OutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){byte[] data=new byte[8192];java.util.Arrays.fill(data,(byte)'x');for(long left=size(id);left>0;){int n=(int)Math.min(left,data.length);out.write(data,0,n);left-=n;}}catch(IOException ignored){}},"synthetic-input-test").start();return pipe[0];}catch(IOException e){throw new FileNotFoundException();}}
 public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}public int update(Uri u,ContentValues v,String s,String[]a){throw new UnsupportedOperationException();}public int delete(Uri u,String s,String[]a){throw new UnsupportedOperationException();}
}
