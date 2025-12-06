import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { RouteStop, Theme } from '../types';
import { MAP_CONFIG } from '../constants';
import { RoadMarker } from './RoadMarker';
import { DriverMarker } from './DriverMarker';

interface RoadMapProps {
  stops: RouteStop[];
  activeIndex: number;
  onStopClick: (index: number) => void;
  theme: Theme;
  zoom: number;
  userLocation: { lat: number; lng: number } | null;
}

// Web Mercator Math
const TILE_SIZE = 256;

const latLngToGlobalPoint = (lat: number, lng: number, zoom: number) => {
  const scale = (1 << zoom) * TILE_SIZE;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
};

const MapTiles = ({ localCenter, globalOrigin, zoom, theme }: { localCenter: { x: number, y: number }, globalOrigin: { x: number, y: number }, zoom: number, theme: Theme }) => {
    // Current Global Center
    const globalCenterX = globalOrigin.x + localCenter.x;
    const globalCenterY = globalOrigin.y + localCenter.y;

    const centerTileX = Math.floor(globalCenterX / TILE_SIZE);
    const centerTileY = Math.floor(globalCenterY / TILE_SIZE);

    const rangeX = 6;  
    const rangeY = 12;

    const tiles = [];
    for (let x = centerTileX - rangeX; x <= centerTileX + rangeX; x++) {
        for (let y = centerTileY - rangeY; y <= centerTileY + rangeY; y++) {
             tiles.push({ x, y });
        }
    }

    // CartoDB Providers
    const tileBase = theme === 'dark' 
        ? 'https://a.basemaps.cartocdn.com/dark_all'
        : 'https://a.basemaps.cartocdn.com/light_all';

    return (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {tiles.map((tile) => {
                const left = tile.x * TILE_SIZE - globalOrigin.x;
                const top = tile.y * TILE_SIZE - globalOrigin.y;

                return (
                    <img 
                        key={`${tile.x}-${tile.y}`}
                        src={`${tileBase}/${zoom}/${tile.x}/${tile.y}.png`}
                        alt=""
                        className={`absolute max-w-none select-none transition-opacity duration-500 ${theme === 'dark' ? 'opacity-100' : 'opacity-90 contrast-125'}`}
                        style={{
                            width: TILE_SIZE + 1,
                            height: TILE_SIZE + 1,
                            left: left,
                            top: top,
                            transform: 'translateZ(0)',
                            willChange: 'transform'
                        }}
                    />
                );
            })}
        </div>
    );
}

export const RoadMap: React.FC<RoadMapProps> = ({ stops, activeIndex, onStopClick, theme, zoom, userLocation }) => {
  
  const globalPoints = useMemo(() => stops.map(s => ({
      ...latLngToGlobalPoint(s.coordinates.lat, s.coordinates.lng, zoom),
      id: s.id
  })), [stops, zoom]);

  const origin = useMemo(() => globalPoints[0] || { x: 0, y: 0 }, [globalPoints]);

  const localPoints = useMemo(() => globalPoints.map(p => ({
      x: p.x - origin.x,
      y: p.y - origin.y,
      id: p.id
  })), [globalPoints, origin]);

  // Determine Camera Target
  // If user is far from active stop, maybe center between them? 
  // For now, let's stick to centering on the ACTIVE STOP so we see the destination.
  const activeLocalPoint = localPoints[activeIndex] || { x: 0, y: 0 };
  
  // Calculate Driver Position in Local Space
  const driverLocalPoint = useMemo(() => {
    if (!userLocation) return null;
    const global = latLngToGlobalPoint(userLocation.lat, userLocation.lng, zoom);
    return {
        x: global.x - origin.x,
        y: global.y - origin.y
    };
  }, [userLocation, origin, zoom]);

  const pathData = useMemo(() => {
    if (localPoints.length === 0) return '';
    let d = `M ${localPoints[0].x} ${localPoints[0].y}`;
    for (let i = 1; i < localPoints.length; i++) {
        const p = localPoints[i];
        d += ` L ${p.x} ${p.y}`;
    }
    return d;
  }, [localPoints]);

  const bgColor = theme === 'dark' ? '#0a0a0a' : '#f0f4f8';
  
  // Fog colors
  const fogColor = theme === 'dark' ? 'rgba(10,10,10,1)' : 'rgba(240,244,248,1)';
  const fogTransparent = theme === 'dark' ? 'rgba(10,10,10,0)' : 'rgba(240,244,248,0)';

  return (
    <div 
        className="w-full h-full relative overflow-hidden perspective-container transition-colors duration-500"
        style={{ backgroundColor: bgColor }}
    >
       <style>{`
         .perspective-container {
           perspective: 1200px;
         }
         .map-plane {
           transform-style: preserve-3d;
           will-change: transform;
         }
       `}</style>

       <motion.div
         className="map-plane absolute left-1/2 top-1/2"
         animate={{
            rotateX: MAP_CONFIG.tilt,
            x: -activeLocalPoint.x, 
            y: -activeLocalPoint.y,
         }}
         transition={{ type: "spring", stiffness: 50, damping: 20, mass: 1 }}
         style={{ 
             width: 0, 
             height: 0,
             transformOrigin: '0px 0px' 
         }} 
       >
          {/* Tile Layer */}
          <div className="absolute top-0 left-0 w-0 h-0"> 
             <MapTiles 
                localCenter={activeLocalPoint} 
                globalOrigin={origin} 
                zoom={zoom} 
                theme={theme}
             />
          </div>

          {/* Road Layer */}
          <div className="absolute top-0 left-0 w-0 h-0 overflow-visible pointer-events-none" style={{ transformStyle: 'preserve-3d', zIndex: 1 }}>
            <svg className="overflow-visible absolute top-0 left-0">
                {/* Glow under the road */}
                <path 
                    d={pathData} 
                    fill="none" 
                    stroke={theme === 'dark' ? "#4f46e5" : "#3b82f6"} 
                    strokeWidth="20" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className={theme === 'dark' ? "opacity-20 blur-md" : "opacity-10 blur-md"} 
                />
                {/* Main Road Surface */}
                <path 
                    d={pathData} 
                    fill="none" 
                    stroke={theme === 'dark' ? "#1e293b" : "#94a3b8"} 
                    strokeWidth="12" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                />
                {/* Center Line */}
                <path 
                    d={pathData} 
                    fill="none" 
                    stroke={theme === 'dark' ? "#6366f1" : "#ffffff"} 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeDasharray={theme === 'light' ? '8 8' : '0 0'}
                />
            </svg>
          </div>

          {/* 3D Markers Layer */}
          <div style={{ zIndex: 50, position: 'relative', transformStyle: 'preserve-3d' }}>
            {localPoints.map((p, i) => (
                <RoadMarker 
                    key={stops[i].id}
                    stop={stops[i]}
                    index={i}
                    isActive={i === activeIndex}
                    onClick={() => onStopClick(i)}
                    x={p.x}
                    y={p.y}
                />
            ))}
            
            {/* Driver Marker */}
            {driverLocalPoint && (
                <DriverMarker x={driverLocalPoint.x} y={driverLocalPoint.y} />
            )}
          </div>
       </motion.div>
       
       {/* Horizon Fog */}
       <div 
         className="absolute top-0 left-0 w-full h-48 z-10 pointer-events-none transition-colors duration-500" 
         style={{ background: `linear-gradient(to bottom, ${fogColor}, ${fogTransparent})` }}
       />
       <div 
         className="absolute bottom-0 left-0 w-full h-32 z-10 pointer-events-none transition-colors duration-500" 
         style={{ background: `linear-gradient(to top, ${fogColor}, ${fogTransparent})` }}
       />
       <div 
         className="absolute left-0 top-0 w-32 h-full z-10 pointer-events-none transition-colors duration-500" 
         style={{ background: `linear-gradient(to right, ${fogColor}, ${fogTransparent})` }}
       />
       <div 
         className="absolute right-0 top-0 w-32 h-full z-10 pointer-events-none transition-colors duration-500" 
         style={{ background: `linear-gradient(to left, ${fogColor}, ${fogTransparent})` }}
       />
    </div>
  );
};
