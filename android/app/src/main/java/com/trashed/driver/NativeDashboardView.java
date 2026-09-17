package com.trashed.driver;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.drawable.GradientDrawable;
import android.view.MotionEvent;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.view.ViewCompat;
import com.google.android.material.button.MaterialButton;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Native data and touch/accessible chart interaction. No HTML or chart WebView. */
final class NativeDashboardView extends LinearLayout {
    final NativeWorkspaceTokens tokens;
    NativeDashboard snapshot;
    boolean year, table;
    int selected = -1;

    NativeDashboardView(NativeWorkspaceTokens tokens) {
        super(tokens.context); this.tokens = tokens; setOrientation(VERTICAL); setTag("native-dashboard");
    }
    String money(double value) { return NumberFormat.getCurrencyInstance(Locale.US).format(value); }
    void show(NativeDashboard data) { snapshot = data; if (selected >= data.json.optJSONArray("monthlyRevenue").length()) selected = -1; render(); }
    void render() {
        removeAllViews(); if (snapshot == null) return;
        JSONObject data = snapshot.json, revenue = data.optJSONObject("revenue");
        TextView business = tokens.text(data.optString("businessName").isEmpty() ? "Your business" : data.optString("businessName"),24,true);
        addView(business, tokens.row());
        TextView subtitle = tokens.text("Business overview",14,false); subtitle.setTextColor(tokens.secondary); addView(subtitle,tokens.row());

        LinearLayout revenueCard = card();
        revenueCard.addView(tokens.text("Revenue · USD",18,true),tokens.row());
        LinearLayout periods = new LinearLayout(getContext()); periods.setTag("dashboard-period");
        for (boolean annual : new boolean[]{false,true}) {
            MaterialButton button = tokens.button(annual ? "Year" : "Month", year == annual, () -> { year = annual; render(); });
            button.setSelected(year == annual); button.setTag(annual ? "dashboard-year" : "dashboard-month");
            ViewCompat.setStateDescription(button, year == annual ? "Selected" : "Not selected");
            LayoutParams layout = new LayoutParams(0,-2,1); layout.setMarginEnd(tokens.dp(annual ? 0 : 8)); periods.addView(button,layout);
        }
        revenueCard.addView(periods,tokens.row());
        TextView amount = tokens.text(money(revenue.optDouble(year ? "thisYear" : "thisMonth")),34,true);
        amount.setTag("dashboard-revenue-amount"); revenueCard.addView(amount,tokens.row());
        TextView label = tokens.text(year ? "This year" : "This month",14,false); label.setTextColor(tokens.secondary); revenueCard.addView(label,tokens.row());
        if (!year && !revenue.isNull("monthlyGrowthPercent")) {
            TextView growth = tokens.text(String.format(Locale.US,"%.1f%% vs previous month",revenue.optDouble("monthlyGrowthPercent")),12,false);
            growth.setTextColor(tokens.secondary); revenueCard.addView(growth,tokens.row());
        }
        View divider = new View(getContext()); divider.setBackgroundColor(tokens.divider);
        LayoutParams line = new LayoutParams(-1,tokens.dp(1)); line.topMargin=tokens.dp(16); line.bottomMargin=tokens.dp(16);revenueCard.addView(divider,line);
        revenueCard.addView(tokens.text("Monthly revenue",16,true),tokens.row());
        JSONArray months = data.optJSONArray("monthlyRevenue");
        if (months.length()==0) revenueCard.addView(tokens.text("No monthly revenue data",14,false),tokens.row());
        else {
            revenueCard.addView(new Chart(months),new LayoutParams(-1,tokens.dp(210)));
            TextView selectedLabel;
            if(selected>=0 && selected<months.length()) {
                JSONObject month=months.optJSONObject(selected);selectedLabel=tokens.text(month.optString("month")+" · "+money(month.optDouble("revenue")),15,true);
            } else selectedLabel=tokens.text("Tap a bar to inspect a month.",12,false);
            selectedLabel.setTag("dashboard-selected-month"); selectedLabel.setTextColor(tokens.secondary);selectedLabel.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);revenueCard.addView(selectedLabel,tokens.row());
            boolean zero=true;for(int i=0;i<months.length();i++)zero &= months.optJSONObject(i).optDouble("revenue")==0;
            if(zero)revenueCard.addView(tokens.text("No revenue recorded in these months.",14,false),tokens.row());
            MaterialButton disclosure=tokens.button(table?"Hide chart data":"Show accessible chart data",false,()->{table=!table;render();});
            disclosure.setTag("dashboard-chart-data");ViewCompat.setStateDescription(disclosure,table?"Expanded":"Collapsed");revenueCard.addView(disclosure,tokens.row());
            if(table) for(int i=0;i<months.length();i++) {
                final int index=i;JSONObject month=months.optJSONObject(i);
                MaterialButton row=tokens.button(month.optString("month")+" · "+money(month.optDouble("revenue")),selected==i,()->{selected=index;render();});
                row.setTag("dashboard-month-"+month.optString("month"));row.setSelected(selected==i);revenueCard.addView(row,tokens.row());
            }
        }
        addCard(revenueCard);
        JSONObject rentals=data.optJSONObject("rentals"),inventory=data.optJSONObject("inventory");
        float fontScale=getResources().getConfiguration().fontScale;
        LinearLayout summary=tokens.column();
        LinearLayout row=new LinearLayout(getContext());row.setOrientation(fontScale>1.3?VERTICAL:HORIZONTAL);
        metric(row,"Rentals",rentals.optLong("total"),rentals.optLong("active")+" active · "+rentals.optLong("pending")+" pending",fontScale);
        metric(row,"Customers",data.optJSONObject("customers").optLong("total"),"Total customers",fontScale);summary.addView(row,tokens.row());
        row=new LinearLayout(getContext());row.setOrientation(fontScale>1.3?VERTICAL:HORIZONTAL);
        metric(row,"Available",inventory.optLong("available"),"of "+inventory.optLong("total")+" inventory",fontScale);
        metric(row,"Completed",rentals.optLong("completed"),"Completed rentals",fontScale);summary.addView(row,tokens.row());
        addView(summary,tokens.row());

        LinearLayout breakdown=card();breakdown.addView(tokens.text("Inventory breakdown",18,true),tokens.row());
        TextView counts=tokens.text(inventory.optLong("available")+" available · "+inventory.optLong("rented")+" rented · "+inventory.optLong("maintenance")+" unavailable",13,false);
        counts.setTextColor(tokens.secondary);breakdown.addView(counts,tokens.row());
        JSONArray types=data.optJSONArray("inventoryByType");
        if(types.length()==0)breakdown.addView(tokens.text(inventory.optLong("total")==0?"No inventory yet.":"No inventory type breakdown available.",14,false),tokens.row());
        for(int i=0;i<types.length();i++){
            JSONObject type=types.optJSONObject(i);LinearLayout entry=new LinearLayout(getContext());
            TextView name=tokens.text(type.optString("name").replace('_',' '),15,false);entry.addView(name,new LayoutParams(0,-2,1));
            entry.addView(tokens.text(String.valueOf(type.optLong("count")),15,true),new LayoutParams(-2,-2));breakdown.addView(entry,tokens.row());
        }
        addCard(breakdown);
        TextView footer=tokens.text("Revenue in USD. Updated "+updated(data.optString("generatedAt"))+".",12,false);footer.setTextColor(tokens.secondary);addView(footer,tokens.row());
    }
    private String updated(String raw) {
        try {SimpleDateFormat parser=new SimpleDateFormat(raw.contains(".")?"yyyy-MM-dd'T'HH:mm:ss.SSSX":"yyyy-MM-dd'T'HH:mm:ssX",Locale.US);Date date=parser.parse(raw);return date==null?"recently":java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT,java.text.DateFormat.SHORT).format(date);}
        catch(Exception ignored){return "recently";}
    }
    private LinearLayout card() {
        LinearLayout view=tokens.column();view.setPadding(tokens.dp(16),tokens.dp(12),tokens.dp(16),tokens.dp(16));
        GradientDrawable background=new GradientDrawable();background.setColor(tokens.surface);background.setCornerRadius(tokens.dp(18));view.setBackground(background);return view;
    }
    private void addCard(LinearLayout view) {LayoutParams params=tokens.row();params.topMargin=tokens.dp(14);params.bottomMargin=tokens.dp(6);addView(view,params);}
    private void metric(LinearLayout row,String title,long amount,String detail,float fontScale) {
        LinearLayout cell=card();TextView label=tokens.text(title,13,false);label.setTextColor(tokens.secondary);cell.addView(label,tokens.row());
        cell.addView(tokens.text(NumberFormat.getIntegerInstance().format(amount),27,true),tokens.row());TextView extra=tokens.text(detail,12,false);extra.setTextColor(tokens.secondary);cell.addView(extra,tokens.row());
        LayoutParams params=fontScale>1.3?tokens.row():new LayoutParams(0,-1,1);params.topMargin=tokens.dp(10);if(row.getChildCount()==0&&fontScale<=1.3)params.setMarginEnd(tokens.dp(10));row.addView(cell,params);
    }
    final class Chart extends View {
        final JSONArray months;final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        Chart(JSONArray months){super(tokens.context);this.months=months;setTag("dashboard-native-chart");setContentDescription("Monthly revenue chart. Use Show accessible chart data to inspect and select each month.");setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);}
        @Override protected void onDraw(Canvas canvas){
            super.onDraw(canvas);if(months.length()==0)return;
            float left=tokens.dp(4),right=getWidth()-tokens.dp(42),top=tokens.dp(12),bottom=getHeight()-tokens.dp(24),plot=right-left;
            double high=1,low=0;for(int i=0;i<months.length();i++){double n=months.optJSONObject(i).optDouble("revenue");high=Math.max(high,n);low=Math.min(low,n);}
            double range=high-low;float zero=bottom-(float)((0-low)/range)*(bottom-top);float slot=plot/months.length();
            paint.setTextSize(11*getResources().getDisplayMetrics().scaledDensity);paint.setTypeface(tokens.regular);
            for(int i=0;i<4;i++){double n=low+range*i/3;float y=bottom-(float)((n-low)/range)*(bottom-top);paint.setColor(tokens.divider);paint.setStrokeWidth(tokens.dp(1));canvas.drawLine(left,y,right,y,paint);paint.setColor(tokens.secondary);canvas.drawText(n>=1000?String.format(Locale.US,"%.1fk",n/1000):String.format(Locale.US,"%.0f",n),right+tokens.dp(4),y,paint);}
            for(int i=0;i<months.length();i++){JSONObject m=months.optJSONObject(i);double n=m.optDouble("revenue");float y=bottom-(float)((n-low)/range)*(bottom-top);paint.setColor(tokens.accent);paint.setAlpha(selected<0||i==selected?255:95);canvas.drawRoundRect(left+i*slot+tokens.dp(3),Math.min(y,zero),left+(i+1)*slot-tokens.dp(3),Math.max(y,zero),tokens.dp(3),tokens.dp(3),paint);paint.setAlpha(255);
                if(months.length()<=6||getWidth()>=tokens.dp(340)||i%2==0){String label=m.optString("month");label=label.substring(0,Math.min(3,label.length()));paint.setColor(tokens.secondary);canvas.drawText(label,left+i*slot+(slot-paint.measureText(label))/2,getHeight()-tokens.dp(5),paint);}
            }
        }
        @Override public boolean onTouchEvent(MotionEvent event){
            if(event.getAction()==MotionEvent.ACTION_UP){float plot=getWidth()-tokens.dp(46);if(plot>0&&event.getX()>=tokens.dp(4)&&event.getX()<=getWidth()-tokens.dp(42)){selected=Math.min(months.length()-1,Math.max(0,(int)((event.getX()-tokens.dp(4))/plot*months.length())));performClick();render();}return true;}
            return event.getAction()==MotionEvent.ACTION_DOWN;
        }
        @Override public boolean performClick(){super.performClick();return true;}
    }
}
