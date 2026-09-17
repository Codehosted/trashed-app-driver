package com.trashed.driver;
import org.json.*;
import java.io.IOException;
import java.util.*;
/** Versioned, strictly validated, memory-only account snapshot. */
final class NativeDashboard {
 final JSONObject json; final long userId,vendorId;
 NativeDashboard(JSONObject value) throws Exception {
  if (number(value,"version",true)!=1 || !"USD".equals(value.getString("currency"))) throw new IOException("Unsupported dashboard version or currency");
  JSONObject scope=value.getJSONObject("scope"); userId=(long)number(scope,"userId",true); vendorId=(long)number(scope,"vendorId",true);
  if(userId<1 || vendorId<1) throw new IOException("Invalid dashboard scope");
  value.getString("generatedAt"); value.getString("businessName");
  JSONObject revenue=value.getJSONObject("revenue");
  for(String key:new String[]{"today","thisWeek","thisMonth","thisQuarter","thisYear"}) number(revenue,key,false);
  if(!revenue.has("monthlyGrowthPercent")) throw new IOException("Missing growth");
  if(!revenue.isNull("monthlyGrowthPercent")) { Object g=revenue.get("monthlyGrowthPercent"); if(!(g instanceof Number) || !Double.isFinite(((Number)g).doubleValue())) throw new IOException("Invalid growth"); }
  validate(value,"rentals",new String[]{"total","active","pending","completed"});
  validate(value,"inventory",new String[]{"total","available","rented","maintenance"}); validate(value,"customers",new String[]{"total"});
  JSONArray months=value.getJSONArray("monthlyRevenue"); if(months.length()>12) throw new IOException("Too many months");
  Set<String> seen=new HashSet<>(); for(int i=0;i<months.length();i++){JSONObject m=months.getJSONObject(i);String label=m.getString("month");if(label.isEmpty() || !seen.add(label)) throw new IOException("Invalid month");number(m,"revenue",false);}
  JSONArray types=value.getJSONArray("inventoryByType"); for(int i=0;i<types.length();i++){ types.getJSONObject(i).getString("name");number(types.getJSONObject(i),"count",true); }
  json=new JSONObject(value.toString());
 }
 void requireSameScope(NativeDashboard previous) throws NativeWorkspaceApi.Failure { if(previous!=null && (userId!=previous.userId || vendorId!=previous.vendorId)) throw new NativeWorkspaceApi.Failure(401,"Your account or workspace changed. Reopen this screen."); }
 private static void validate(JSONObject value,String group,String[] keys)throws Exception{for(String key:keys)number(value.getJSONObject(group),key,true);}
 private static double number(JSONObject value,String key,boolean integer)throws Exception {Object raw=value.get(key);if(!(raw instanceof Number))throw new IOException("Invalid dashboard number");double n=((Number)raw).doubleValue();if(!Double.isFinite(n)||n<0||(integer&&n!=Math.floor(n)))throw new IOException("Invalid dashboard number");return n;}
}
