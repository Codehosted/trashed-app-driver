package com.trashed.driver;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.core.view.ViewCompat;
import androidx.recyclerview.widget.RecyclerView;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.google.android.material.appbar.MaterialToolbar;
import java.util.List;

/** Native conversation destination; the owning workspace retains the player and list state. */
final class NativeCallTranscriptView extends LinearLayout {
    NativeCallTranscriptView(NativeWorkspaceTokens tokens, String name, String transcript, boolean hasRecording, Runnable back, Runnable play) {
        super(tokens.context);setOrientation(VERTICAL);setBackgroundColor(tokens.background);
        setTag("workspace-transcript-conversation");ViewCompat.setAccessibilityPaneTitle(this,"Call conversation");
        MaterialToolbar header=new MaterialToolbar(tokens.context);
        header.setTitle("Conversation");header.setTitleTextColor(tokens.foreground);
        header.setSubtitle(name.isEmpty()?"Unknown caller":name);header.setSubtitleTextColor(tokens.secondary);
        header.setNavigationIcon(R.drawable.native_workspace_back);header.setNavigationIconTint(tokens.accent);
        header.setNavigationContentDescription("Back to calls");header.setNavigationOnClickListener(v->back.run());
        addView(header,tokens.row());
        if(hasRecording)addView(tokens.button("Play / pause recording",true,play),tokens.row());
        final List<NativeCallTranscript.Turn> turns=NativeCallTranscript.parse(transcript);
        RecyclerView list=new RecyclerView(tokens.context);list.setLayoutManager(new LinearLayoutManager(tokens.context));
        list.setTag("workspace-transcript-messages");list.setClipToPadding(false);list.setPadding(0,tokens.dp(12),0,tokens.dp(16));
        list.setAdapter(new RecyclerView.Adapter<TurnHolder>() {
            {setHasStableIds(true);}
            @Override public long getItemId(int position){return turns.get(position).id;}
            @Override public int getItemCount(){return turns.size();}
            @NonNull @Override public TurnHolder onCreateViewHolder(@NonNull ViewGroup parent,int type){
                LinearLayout row=tokens.column();row.setLayoutParams(new RecyclerView.LayoutParams(-1,-2));return new TurnHolder(row);
            }
            @Override public void onBindViewHolder(@NonNull TurnHolder holder,int position){holder.row.removeAllViews();holder.row.addView(bubble(tokens,turns.get(position),false),tokens.row());}
        });
        addView(list,new LinearLayout.LayoutParams(-1,0,1));
    }
    private static final class TurnHolder extends RecyclerView.ViewHolder {
        final LinearLayout row;
        TurnHolder(LinearLayout row){super(row);this.row=row;}
    }
    static View bubble(NativeWorkspaceTokens tokens,NativeCallTranscript.Turn turn,boolean preview){
        boolean caller="caller".equals(turn.role);
        LinearLayout row=tokens.column();row.setPadding(caller?tokens.dp(28):0,0,caller?0:tokens.dp(28),tokens.dp(12));
        LinearLayout bubble=tokens.column();bubble.setPadding(tokens.dp(14),tokens.dp(8),tokens.dp(14),tokens.dp(8));
        GradientDrawable shape=new GradientDrawable();shape.setCornerRadius(tokens.dp(18));
        shape.setColor(caller?androidx.core.graphics.ColorUtils.blendARGB(tokens.surface,tokens.accent,0.13f):tokens.surface);bubble.setBackground(shape);
        TextView label=tokens.text(turn.label+(turn.timestamp.isEmpty()?"":" · "+turn.timestamp),12,true);label.setTextColor(tokens.secondary);bubble.addView(label,tokens.row());
        TextView body=tokens.text(turn.text.isEmpty()?"No speech captured":turn.text,16,false);body.setTextIsSelectable(true);
        if(preview){body.setMaxLines(3);body.setEllipsize(TextUtils.TruncateAt.END);}
        bubble.addView(body,tokens.row());bubble.setTag("transcript-turn-"+turn.id);row.addView(bubble,tokens.row());
        return row;
    }
}
