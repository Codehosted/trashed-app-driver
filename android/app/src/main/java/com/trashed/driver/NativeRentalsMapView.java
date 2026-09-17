package com.trashed.driver;

import android.view.View;
import android.widget.*;
import android.text.*;
import androidx.appcompat.app.AlertDialog;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.button.MaterialButton;
import org.json.*;
import java.util.*;

/** Native rentals map, local filters and explicit web-only detail/list actions. */
final class NativeRentalsMapView extends LinearLayout {
    interface Web { void open(String path); }
    private final NativeWorkspaceTokens tokens;
    private final Web web;
    private final NativeChatStreetMap map;
    private final TextView summary;
    private final LinearLayout detail;
    private final ScrollView detailScroll;
    private final EditText search;
    private final MaterialButton filterButton, chooseButton, retry, listButton;
    private NativeRentalsMap snapshot;
    private List<NativeRentalsMap.Order> visible = Collections.emptyList();
    private String filter = "all", selected = "";
    private AlertDialog dialog;
    NativeRentalsMapView(NativeWorkspaceTokens tokens, Runnable refresh, Web web) {
        super(tokens.context); this.tokens=tokens; this.web=web; setOrientation(VERTICAL);
        setTag("native-rentals-map");
        search=new EditText(tokens.context);search.setSingleLine(true);search.setHint("Search rentals");
        search.setContentDescription("Search rentals"); search.setTag("rentals-search");search.setMinHeight(tokens.dp(48));
        search.setTextColor(tokens.foreground);search.setTextSize(16);search.setTypeface(tokens.regular);addView(search,tokens.row());
        LinearLayout controls=new LinearLayout(tokens.context);
        filterButton=tokens.button("Status: All",false,this::chooseStatus);
        chooseButton=tokens.button("Choose rental",false,this::chooseRental);
        controls.addView(filterButton,new LayoutParams(0,-2,1));controls.addView(chooseButton,new LayoutParams(0,-2,1));addView(controls,tokens.row());
        summary=tokens.text("",12,false);summary.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);addView(summary,tokens.row());
        map=new NativeChatStreetMap(tokens.context);map.setRentalStyle();map.setTag("rentals-canvas");map.setMarkerSelection(this::select);
        addView(map,new LayoutParams(-1,0,1));
        LinearLayout mapControls=new LinearLayout(tokens.context);
        mapControls.addView(tokens.button("−",false,()->map.zoomBy(-1)),new LayoutParams(0,-2,1));
        mapControls.getChildAt(0).setContentDescription("Zoom out");
        mapControls.addView(tokens.button("Fit all",false,map::fitAll),new LayoutParams(0,-2,2));
        mapControls.addView(tokens.button("+",false,()->map.zoomBy(1)),new LayoutParams(0,-2,1));
        mapControls.getChildAt(2).setContentDescription("Zoom in");addView(mapControls,tokens.row());
        detail=tokens.column();detail.setPadding(tokens.dp(12),0,tokens.dp(12),0);detail.setBackgroundColor(tokens.surface);
        detailScroll=new ScrollView(tokens.context);detailScroll.addView(detail,tokens.row());detailScroll.setVisibility(GONE);
        addView(detailScroll,new LayoutParams(-1,tokens.dp(168)));
        retry=tokens.button("Retry",true,refresh);retry.setVisibility(GONE);addView(retry,tokens.row());
        listButton=tokens.button("Rental list · Web",false,()->web.open(NativeRentalsMap.LIST_PATH));addView(listButton,tokens.row());
        search.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){render();}
            public void afterTextChanged(Editable value){}
        });
        clear();
    }
    void show(NativeRentalsMap value) { snapshot=value;retry.setVisibility(GONE);listButton.setEnabled(true);render(); }
    void error(boolean canRetry) { clear();retry.setVisibility(canRetry?VISIBLE:GONE); }
    void clear() {
        if(dialog!=null){dialog.dismiss();dialog=null;}
        snapshot=null;visible=Collections.emptyList();selected="";filter="all";
        search.setText("");summary.setText("");detail.removeAllViews();detailScroll.setVisibility(GONE);
        map.clearPrivateData();chooseButton.setEnabled(false);filterButton.setEnabled(false);filterButton.setText("Status: All");
        listButton.setEnabled(false);retry.setVisibility(GONE);
    }
    private void render() {
        if(snapshot==null)return;
        visible=snapshot.filtered(search.getText().toString(),filter);
        JSONArray markers=new JSONArray();
        try { for(NativeRentalsMap.Order order:visible) markers.put(new JSONObject().put("id",order.id).put("label",order.label).put("latitude",order.lat).put("longitude",order.lng));
            map.setData(new JSONObject().put("markers",markers),NativeSystemAppearance.dark(tokens.context));
        } catch(JSONException impossible){throw new IllegalStateException(impossible);}
        summary.setText(snapshot.totalRentalCount==0?"No rentals yet.":visible.isEmpty()?"No mapped rentals match. "+snapshot.unmappedCount+" without coordinates.":visible.size()+" of "+snapshot.count+" mapped · "+snapshot.unmappedCount+" without coordinates");
        chooseButton.setEnabled(!visible.isEmpty());filterButton.setEnabled(true);
        select(selected);
    }
    private void chooseStatus() {
        if(snapshot==null)return;
        List<String> values=new ArrayList<>();values.add("all");
        for(NativeRentalsMap.Order order:snapshot.orders)if(!values.contains(order.status))values.add(order.status);
        showDialog(new MaterialAlertDialogBuilder(tokens.context).setTitle("Rental status")
            .setItems(values.toArray(new String[0]),(d,index)->{filter=values.get(index);filterButton.setText("Status: "+filter);render();}).setNegativeButton("Cancel",null).create());
    }
    private void chooseRental() {
        List<NativeRentalsMap.Order> choices=new ArrayList<>(visible);
        String[] labels=new String[choices.size()];for(int i=0;i<labels.length;i++)labels[i]=choices.get(i).label+" · "+choices.get(i).address;
        showDialog(new MaterialAlertDialogBuilder(tokens.context).setTitle("Mapped rentals").setItems(labels,(d,index)->select(choices.get(index).id)).setNegativeButton("Cancel",null).create());
    }
    private void showDialog(AlertDialog value){if(dialog!=null)dialog.dismiss();dialog=value;dialog.show();NativeSystemAppearance.dialog(dialog);}
    private void select(String id) {
        NativeRentalsMap.Order found=null;for(NativeRentalsMap.Order order:visible)if(order.id.equals(id)){found=order;break;}
        detail.removeAllViews();selected=found==null?"":found.id;map.selectMarker(selected);detailScroll.setVisibility(found==null?GONE:VISIBLE);
        if(found==null)return;
        final NativeRentalsMap.Order order=found;
        detail.addView(tokens.text(order.label,17,true),tokens.row());
        detail.addView(tokens.text(order.status+" · "+order.customerName+"\n"+order.address,13,false),tokens.row());
        if(!order.confirmationCode.isEmpty())detail.addView(tokens.text("Confirmation: "+order.confirmationCode,12,false));
        if(!order.deliveryDate.isEmpty()||!order.pickupDate.isEmpty())detail.addView(tokens.text("Delivery: "+order.deliveryDate+"\nPickup: "+order.pickupDate,12,false));
        if(!order.totalPrice.isEmpty())detail.addView(tokens.text("Total: "+order.totalPrice,12,false));
        detail.addView(tokens.button("Rental details · Web",true,()->{if(snapshot!=null&&selected.equals(order.id))web.open(order.href);}),tokens.row());
        detailScroll.scrollTo(0,0);
    }
    void appearanceChanged(){map.appearanceChanged(NativeSystemAppearance.dark(tokens.context));if(dialog!=null)NativeSystemAppearance.dialog(dialog);}
    void dispose(){clear();map.dispose();}
}
