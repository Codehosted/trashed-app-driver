package com.trashed.driver;

import static org.junit.Assert.*;
import static com.trashed.driver.NativeWorkspaceRegressionTest.*;
import android.content.Intent;
import android.view.View;
import androidx.recyclerview.widget.RecyclerView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;

public class NativeCallTranscriptScreenTest {
    @Test public void conversationHasBubblesNoSearchAndPreservesPlaybackAndList() throws Exception {
        try (Fixture server=new Fixture()) {
            Intent intent=new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),NativeWorkspaceTestActivity.class).putExtra("origin",server.origin());
            try(ActivityScenario<NativeWorkspaceTestActivity> scenario=ActivityScenario.launch(intent)){
                await(scenario,a->text(a.workspace,"Fixture User")!=null);scenario.onActivity(a->a.show("/calls/history"));
                await(scenario,a->text(a.workspace,"View call")!=null);scenario.onActivity(a->text(a.workspace,"View call").performClick());
                await(scenario,a->text(a.workspace,"Open conversation")!=null);scenario.onActivity(a->text(a.workspace,"Play recording").performClick());
                await(scenario,a->a.workspace.audio.playing());
                scenario.onActivity(a->{text(a.workspace,"Open conversation").performClick();assertTrue(a.workspace.audio.playing());assertFalse(a.workspace.findViewWithTag("workspace-search").isShown());});
                await(scenario,a->a.workspace.findViewWithTag("workspace-transcript-messages")!=null&&a.workspace.findViewWithTag("transcript-turn-0")!=null);
                scenario.onActivity(a->{RecyclerView list=a.workspace.findViewWithTag("workspace-transcript-messages");assertEquals(2,list.getAdapter().getItemCount());assertNotNull(text(a.workspace,"Caller"));assertNotNull(text(a.workspace,"Trisha"));});
                screenshot("conversation-light.png");
                scenario.onActivity(a->{assertTrue(a.workspace.back());assertNull(a.workspace.findViewWithTag("workspace-transcript-conversation"));assertTrue(a.workspace.findViewWithTag("workspace-search").isShown());assertNotNull(text(a.workspace,"Collapse call"));assertTrue(a.workspace.audio.playing());});
                assertEquals(1,server.callReads.get());assertEquals(1,server.audioReads.get());
                scenario.onActivity(a->text(a.workspace,"Open conversation").performClick());
                scenario.onActivity(a->a.identity="changed-session");await(scenario,a->a.workspace.findViewWithTag("workspace-transcript-conversation")==null);
                scenario.onActivity(a->assertFalse(a.workspace.audio.playing()));assertNull(server.failure);
            }
        }
    }
}
