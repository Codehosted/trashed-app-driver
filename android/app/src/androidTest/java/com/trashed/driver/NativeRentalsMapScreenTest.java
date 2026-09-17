package com.trashed.driver;

import static org.junit.Assert.*;
import static com.trashed.driver.NativeWorkspaceRegressionTest.*;
import android.content.Intent;
import android.view.View;
import android.widget.EditText;
import androidx.appcompat.app.AlertDialog;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.net.*;
import java.io.*;

/** Real emulator widgets and independent loopback fixture. Start fixture on 3423 and adb reverse it. */
public class NativeRentalsMapScreenTest {
    static final String ORIGIN="http://127.0.0.1:3423";
    static void control(String json) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(ORIGIN+"/__control").openConnection();
        c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
        try(OutputStream out=c.getOutputStream()){out.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
        assertEquals(200,c.getResponseCode());c.disconnect();
    }
    static void capture(String name) throws Exception { Thread.sleep(800);screenshot(name); }
    static NativeRentalsMapView map(NativeWorkspaceTestActivity a){return a.workspace.findViewWithTag("native-rentals-map");}
    static void chooseFirst(NativeWorkspaceTestActivity a){
        text(a.workspace,"Choose rental").performClick();
        AlertDialog d=(AlertDialog)field(map(a),"dialog");
        d.getListView().performItemClick(d.getListView().getChildAt(0),0,0);
        d.dismiss();
    }
    @Test public void lightFiltersSelectionFitErrorEmptyAndSessionClear() throws Exception { run(false); }
    @Test public void darkFiltersSelectionFitErrorEmptyAndSessionClear() throws Exception { run(true); }
    void run(boolean dark) throws Exception {
        control("{\"rentalsError\":0,\"rentalsEmpty\":false,\"rentalsPermission\":true,\"rentalsWrongScope\":false,\"expired\":false}");
        String mode=dark?"dark":"light";
        InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cmd uimode night "+(dark?"yes":"no")).close();
        Thread.sleep(600);
        Intent intent=new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),NativeWorkspaceTestActivity.class).putExtra("origin",ORIGIN).putExtra("dark",dark);
        try(ActivityScenario<NativeWorkspaceTestActivity> scenario=ActivityScenario.launch(intent)) {
            scenario.onActivity(a->{a.identity="next-auth.session-token=local-ui-fixture";a.show("/vendor/rentals");});
            await(scenario,a->text(a.workspace,"5 of 5 mapped · 1 without coordinates")!=null);
            capture("rentals-"+mode+"-overview.png");
            scenario.onActivity(a->{chooseFirst(a);assertNotNull(text(a.workspace,"FIX-001 · 20 yd"));assertEquals(View.VISIBLE,((View)field(map(a),"detailScroll")).getVisibility());});
            capture("rentals-"+mode+"-selected.png");
            scenario.onActivity(a->{text(a.workspace,"+").performClick();text(a.workspace,"Fit all").performClick();((EditText)a.workspace.findViewWithTag("rentals-search")).setText("Midtown");assertNotNull(text(a.workspace,"1 of 5 mapped · 1 without coordinates"));assertEquals(View.GONE,((View)field(map(a),"detailScroll")).getVisibility());});
            capture("rentals-"+mode+"-search.png");
            scenario.onActivity(a->{((EditText)a.workspace.findViewWithTag("rentals-search")).setText("no-match-qa");assertNotNull(text(a.workspace,"No mapped rentals match. 1 without coordinates."));((EditText)a.workspace.findViewWithTag("rentals-search")).setText("");text(a.workspace,"Status: All").performClick();AlertDialog d=(AlertDialog)field(map(a),"dialog");d.getListView().performItemClick(d.getListView().getChildAt(1),1,1);d.dismiss();assertNotNull(text(a.workspace,"1 of 5 mapped · 1 without coordinates"));});
            capture("rentals-"+mode+"-status.png");
            control("{\"rentalsError\":503}");scenario.onActivity(a->a.workspace.refresh());
            await(scenario,a->text(a.workspace,"Retry")!=null&&text(a.workspace,"Retry").getVisibility()==View.VISIBLE);
            scenario.onActivity(a->{assertNull(field(map(a),"snapshot"));assertEquals(View.GONE,((View)field(map(a),"detailScroll")).getVisibility());});
            capture("rentals-"+mode+"-error.png");
            control("{\"rentalsError\":0}");scenario.onActivity(a->text(a.workspace,"Retry").performClick());
            await(scenario,a->text(a.workspace,"5 of 5 mapped · 1 without coordinates")!=null);
            control("{\"rentalsEmpty\":true}");scenario.onActivity(a->a.workspace.refresh());
            await(scenario,a->text(a.workspace,"No rentals yet.")!=null);capture("rentals-"+mode+"-empty.png");
            control("{\"rentalsEmpty\":false}");scenario.onActivity(a->a.workspace.refresh());
            await(scenario,a->text(a.workspace,"5 of 5 mapped · 1 without coordinates")!=null);
            scenario.onActivity(a->{chooseFirst(a);a.identity="next-auth.session-token=changed-fixture";});
            await(scenario,a->text(a.workspace,"Your session changed. Reopen this screen after signing in.")!=null);
            scenario.onActivity(a->{assertNull(field(map(a),"snapshot"));assertEquals("",field(map(a),"selected"));assertEquals(View.GONE,((View)field(map(a),"detailScroll")).getVisibility());});
            capture("rentals-"+mode+"-session-cleared.png");
        }
    }
}
