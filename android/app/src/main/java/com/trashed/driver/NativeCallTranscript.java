package com.trashed.driver;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Only recognizes explicit line-prefix speakers; never infers a speaker or rewrites content. */
final class NativeCallTranscript {
    static final class Turn {
        final int id;
        final String role, label, timestamp, text;
        Turn(int id, String role, String label, String timestamp, String text) {
            this.id=id;this.role=role;this.label=label;this.timestamp=timestamp;this.text=text;
        }
    }
    private static final Pattern HEADER = Pattern.compile("^\\s*(?:\\[([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\\]\\s*|([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)\\s+)?(caller|customer|user|assistant|agent|trisha|operator|human)\\s*:[ \\t]?(.*)$",Pattern.CASE_INSENSITIVE);
    static List<Turn> parse(String raw) {
        if(raw==null||raw.trim().isEmpty())return Collections.emptyList();
        List<Turn> result=new ArrayList<>();
        String role="unknown",label="Transcript",timestamp="";
        StringBuilder text=new StringBuilder();boolean explicit=false;
        for(String line:raw.replace("\r\n","\n").replace('\r','\n').split("\n",-1)){
            Matcher m=HEADER.matcher(line);
            if(m.matches()){
                append(result,role,label,timestamp,text,explicit);
                String speaker=m.group(3).toLowerCase(Locale.ROOT);
                if(speaker.equals("caller")||speaker.equals("customer")||speaker.equals("user")){role="caller";label="Caller";}
                else if(speaker.equals("assistant")||speaker.equals("agent")||speaker.equals("trisha")){role="assistant";label=speaker.equals("trisha")?"Trisha":"Assistant";}
                else {role="operator";label="Operator";}
                timestamp=m.group(1)!=null?m.group(1):m.group(2)!=null?m.group(2):"";
                text=new StringBuilder(m.group(4));explicit=true;
            } else {if(text.length()>0)text.append('\n');text.append(line);}
        }
        append(result,role,label,timestamp,text,explicit);
        return Collections.unmodifiableList(result);
    }
    private static void append(List<Turn> out,String role,String label,String timestamp,StringBuilder text,boolean explicit){
        String value=text.toString().trim();
        if(explicit||!value.isEmpty())out.add(new Turn(out.size(),role,label,timestamp,value));
    }
}
