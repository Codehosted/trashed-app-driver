package com.trashed.driver;

import java.util.*;

/** Pure Web Mercator bounds, including the shortest longitude arc across the date line. */
final class NativeMapViewport {
    private static final double LIMIT = 85.05112878;
    static double[] point(double latitude, double longitude) {
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) return null;
        double sin = Math.sin(Math.toRadians(Math.max(-LIMIT, Math.min(LIMIT,latitude))));
        return new double[]{(longitude+180)/360, .5-Math.log((1+sin)/(1-sin))/(4*Math.PI)};
    }
    static double delta(double x, double center) { double delta=x-center; return delta-Math.floor(delta+.5); }
    static final class Fit {
        final double x,y; final int zoom;
        Fit(double x,double y,int zoom){this.x=x;this.y=y;this.zoom=zoom;}
    }
    static Fit fit(List<double[]> points, double width, double height) {
        if(points.isEmpty()) return new Fit(.5,.5,2);
        List<Double> xs=new ArrayList<>();double minY=1,maxY=0;
        for(double[] point:points){xs.add(point[0]);minY=Math.min(minY,point[1]);maxY=Math.max(maxY,point[1]);}
        Collections.sort(xs);double gap=-1,start=xs.get(0);
        for(int i=0;i<xs.size();i++) {
            double next=i+1<xs.size()?xs.get(i+1):xs.get(0)+1;
            if(next-xs.get(i)>gap){gap=next-xs.get(i);start=next%1;}
        }
        double span=1-gap;int zoom=16;
        while(zoom>2 && (span*(256L<<zoom)>Math.max(1,width) || (maxY-minY)*(256L<<zoom)>Math.max(1,height))) zoom--;
        return new Fit((start+span/2)%1,(minY+maxY)/2,zoom);
    }
}
