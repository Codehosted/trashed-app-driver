import React from 'react';
import { motion } from 'framer-motion';
import { RouteStop } from '../types';
import { MAP_CONFIG } from '../constants';

interface RoadMarkerProps {
  stop: RouteStop;
  isActive: boolean;
  onClick: () => void;
  x: number;
  y: number;
  index: number;
}

export const RoadMarker: React.FC<RoadMarkerProps> = ({ stop, isActive, onClick, x, y, index }) => {
  const width = 32;
  const depth = 32;
  const height = isActive ? 80 : 40;
  const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${stop.id}`;
  
  // Calculate altitude for the label (Height of pillar + gap)
  const labelAltitude = height + 30;

  return (
    <motion.div
      className="absolute group cursor-pointer"
      style={{ 
        left: x,
        top: y,
        zIndex: Math.floor(y), // Sort by depth (South is closer to camera)
        transformStyle: 'preserve-3d',
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.05 * index }}
      onClick={onClick}
    >
        {/* SHADOW - Lying flat on the map (Z=1px to define ground level above tiles) */}
        <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"
            style={{
                width: width * 1.5,
                height: depth * 1.5,
                backgroundColor: isActive ? stop.color : 'rgba(0,0,0,0.5)',
                opacity: 0.5,
                transform: 'translateZ(1px)', 
            }}
        />

        {/* PILLAR CONTAINER - Centered at Z = height/2 to simplify face logic */}
        <motion.div 
            style={{ transformStyle: 'preserve-3d' }}
            animate={{
                // Lift center to H/2 so bottom is at 0. Add small bounce if active.
                transform: `translateZ(${height/2}px) translateY(${isActive ? -10 : 0}px)` 
            }}
        >
            {/* Front Face (South) - Rotated to stand up and pushed South */}
            <div className="absolute top-1/2 left-1/2" style={{
                width, height,
                backgroundColor: stop.color,
                filter: 'brightness(1.0)',
                opacity: 0.9,
                border: '1px solid rgba(255,255,255,0.3)',
                // RotateX -90 makes it vertical facing South. TranslateZ pushes it along its normal (South)
                transform: `translate(-50%, -50%) rotateX(-90deg) translateZ(${depth/2}px)`
            }} />

            {/* Back Face (North) */}
            <div className="absolute top-1/2 left-1/2" style={{
                width, height,
                backgroundColor: stop.color,
                filter: 'brightness(0.7)',
                opacity: 0.9,
                border: '1px solid rgba(255,255,255,0.3)',
                // RotateX 90 makes it vertical facing North
                transform: `translate(-50%, -50%) rotateX(90deg) translateZ(${depth/2}px)`
            }} />

            {/* Right Face (East) */}
            <div className="absolute top-1/2 left-1/2" style={{
                width: depth, height,
                backgroundColor: stop.color,
                filter: 'brightness(0.85)',
                opacity: 0.9,
                border: '1px solid rgba(255,255,255,0.3)',
                // RotateY 90 makes it vertical facing East
                transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${width/2}px)`
            }} />

            {/* Left Face (West) */}
            <div className="absolute top-1/2 left-1/2" style={{
                width: depth, height,
                backgroundColor: stop.color,
                filter: 'brightness(0.85)',
                opacity: 0.9,
                border: '1px solid rgba(255,255,255,0.3)',
                // RotateY -90 makes it vertical facing West
                transform: `translate(-50%, -50%) rotateY(-90deg) translateZ(${width/2}px)`
            }} />

            {/* Top Cap (Roof) */}
            <div className="absolute top-1/2 left-1/2 bg-white flex items-center justify-center overflow-hidden border border-white/40" style={{
                width, height: depth,
                // Simple lift to top
                transform: `translate(-50%, -50%) translateZ(${height/2}px)`
            }}>
                <img 
                    src={avatarUrl} 
                    alt="avatar"
                    className="w-full h-full object-cover"
                />
            </div>
            
            {/* Bottom Cap (Floor - mostly hidden) */}
            <div className="absolute top-1/2 left-1/2" style={{
                width, height: depth,
                backgroundColor: stop.color,
                filter: 'brightness(0.4)',
                transform: `translate(-50%, -50%) translateZ(${-height/2}px)`
            }} />
        </motion.div>

        {/* 3D LABEL - Floating above the pillar */}
        {isActive && (
            <motion.div
                className="absolute top-1/2 left-1/2 flex items-center justify-center pointer-events-none"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                    transformStyle: 'preserve-3d',
                    // 1. Lift to altitude. 
                    // 2. Counter-rotate map tilt so it faces camera.
                    transform: `translate(-50%, -50%) translateZ(${labelAltitude}px) rotateX(${-MAP_CONFIG.tilt}deg)`
                }}
            >
                {/* Simulated 3D Text Slab */}
                <div className="relative group" style={{ transformStyle: 'preserve-3d' }}>
                    
                    {/* Fake thickness layers (stacking divs behind) */}
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="absolute inset-0 rounded-lg bg-slate-800"
                            style={{ transform: `translateZ(-${i}px)` }}
                        />
                    ))}
                    
                    {/* Main Face */}
                    <div className="relative px-4 py-2 bg-slate-900 rounded-lg border border-slate-600/50 shadow-xl text-white text-xs font-bold whitespace-nowrap flex items-center gap-2">
                        <span>{stop.title}</span>
                    </div>
                </div>
            </motion.div>
        )}
    </motion.div>
  );
};
