import React from 'react';
import { Lightbulb, Clock, Mail, TrendingUp, Star, Rocket, MapPin } from 'lucide-react';
import { MarkerType } from '../types';

interface IconProps {
  type: MarkerType;
  className?: string;
  size?: number;
}

export const Icon: React.FC<IconProps> = ({ type, className, size = 24 }) => {
  const props = { className, size };
  switch (type) {
    case 'idea': return <Lightbulb {...props} />;
    case 'time': return <Clock {...props} />;
    case 'email': return <Mail {...props} />;
    case 'chart': return <TrendingUp {...props} />;
    case 'star': return <Star {...props} />;
    case 'rocket': return <Rocket {...props} />;
    default: return <MapPin {...props} />;
  }
};
