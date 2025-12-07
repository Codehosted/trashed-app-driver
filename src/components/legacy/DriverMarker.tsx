import React from 'react';
import { motion } from 'framer-motion';

interface DriverMarkerProps {
  x: number;
  y: number;
}

export const DriverMarker: React.FC<DriverMarkerProps> = ({ x, y }) => {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        zIndex: Math.floor(y) + 10, // Always slightly above the road
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Pulse Effect */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-indigo-500"
        style={{ width: 60, height: 60, transform: 'translateZ(1px)' }}
        animate={{ scale: [1, 2], opacity: [1, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
      />

      {/* 3D Vehicle Representation (Simple Low-Poly Car) */}
      <div className="relative" style={{ transformStyle: 'preserve-3d', transform: 'translateZ(10px)' }}>
          
          {/* Shadow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-16 bg-black/40 blur-sm rounded-full" 
               style={{ transform: 'translateZ(-9px)' }} 
          />

          {/* Body Main */}
          <div className="absolute -translate-x-1/2 -translate-y-1/2 bg-indigo-600 rounded-lg"
               style={{ width: 24, height: 40, transform: 'translateZ(5px)' }} />
          
          {/* Cabin */}
          <div className="absolute -translate-x-1/2 -translate-y-1/2 bg-indigo-400 rounded-md"
               style={{ width: 20, height: 24, transform: 'translateZ(15px)' }} />

          {/* Windshield (Indicator of direction - assuming facing 'Up' for now, can add rotation later if heading is known) */}
          <div className="absolute -translate-x-1/2 -translate-y-1/2 bg-sky-300"
               style={{ width: 18, height: 8, top: '-5px', transform: 'translateZ(16px)' }} />

      </div>
    </div>
  );
};
