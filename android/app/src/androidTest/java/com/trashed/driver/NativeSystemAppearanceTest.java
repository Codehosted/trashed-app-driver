package com.trashed.driver;
import org.junit.Test;
import org.junit.runner.RunWith;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import android.widget.*;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class) public class NativeSystemAppearanceTest {
 @Test public void repaintPreservesEditorAndSelection(){InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
 android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();LinearLayout root=new LinearLayout(c);EditText input=new EditText(c);input.setText("unsaved draft");input.setSelection(3);input.setTextColor(0xff211a2b);root.addView(input);root.setBackgroundColor(0xfffafafb);
 NativeSystemAppearance.repaint(root,true,false);assertSame(input,root.getChildAt(0));assertEquals("unsaved draft",input.getText().toString());assertEquals(3,input.getSelectionStart());assertEquals(0xfff6f6f8,input.getCurrentTextColor());
 NativeSystemAppearance.repaint(root,false,false);assertEquals(0xff1c1c20,input.getCurrentTextColor());assertEquals(3,input.getSelectionStart());
 });}
 @Test public void purpleKeepsWhiteLabel(){InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();Button button=new Button(c);button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xff7033ff));button.setTextColor(-1);NativeSystemAppearance.repaint(button,false,false);assertEquals(-1,button.getCurrentTextColor());});}
}
