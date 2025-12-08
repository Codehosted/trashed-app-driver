import { ViewStyle, TextStyle } from 'react-native';

/**
 * Convert Tailwind CSS classes to React Native styles
 * This is a simplified parser that handles common Tailwind classes
 */
export function parseTailwindClasses(className: string, type: 'view' | 'text' = 'view'): ViewStyle | TextStyle {
  const classes = className.split(/\s+/).filter(Boolean);
  const style: ViewStyle & TextStyle = {};

  classes.forEach(cls => {
    // Colors - background
    if (cls.startsWith('bg-')) {
      const color = cls.replace('bg-', '');
      style.backgroundColor = tailwindColorToHex(color);
    }
    // Colors - text (but not text size)
    else if (cls.startsWith('text-') && !cls.match(/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/)) {
      const color = cls.replace('text-', '');
      style.color = tailwindColorToHex(color);
    }
    // Colors - border
    else if (cls.startsWith('border-') && !cls.match(/^border-[0-9]/)) {
      const color = cls.replace('border-', '');
      // Skip if it's a width (border-0, border-2, etc.)
      if (!['0', '2', '4', '8'].includes(color)) {
        style.borderColor = tailwindColorToHex(color);
      }
    }

    // Spacing
    else if (cls.startsWith('p-')) {
      const value = cls.replace('p-', '');
      const padding = tailwindSpacingToNumber(value);
      style.padding = padding;
    } else if (cls.startsWith('px-')) {
      const value = cls.replace('px-', '');
      style.paddingHorizontal = tailwindSpacingToNumber(value);
    } else if (cls.startsWith('py-')) {
      const value = cls.replace('py-', '');
      style.paddingVertical = tailwindSpacingToNumber(value);
    } else if (cls.startsWith('pt-')) {
      const value = cls.replace('pt-', '');
      style.paddingTop = tailwindSpacingToNumber(value);
    } else if (cls.startsWith('pb-')) {
      const value = cls.replace('pb-', '');
      style.paddingBottom = tailwindSpacingToNumber(value);
    } else if (cls.startsWith('pl-')) {
      const value = cls.replace('pl-', '');
      style.paddingLeft = tailwindSpacingToNumber(value);
    } else if (cls.startsWith('pr-')) {
      const value = cls.replace('pr-', '');
      style.paddingRight = tailwindSpacingToNumber(value);
    } else if (cls.startsWith('m-')) {
      const value = cls.replace('m-', '');
      style.margin = tailwindSpacingToNumber(value);
    } else if (cls.startsWith('mx-')) {
      const value = cls.replace('mx-', '');
      style.marginHorizontal = tailwindSpacingToNumber(value);
    } else if (cls.startsWith('my-')) {
      const value = cls.replace('my-', '');
      style.marginVertical = tailwindSpacingToNumber(value);
    }

    // Typography - font size
    else if (cls.match(/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)$/)) {
      const size = cls.replace('text-', '');
      style.fontSize = tailwindFontSizeToNumber(size);
    }
    // Typography - font weight
    else if (cls === 'font-bold') {
      style.fontWeight = '700';
    } else if (cls === 'font-semibold') {
      style.fontWeight = '600';
    } else if (cls === 'font-medium') {
      style.fontWeight = '500';
    } else if (cls === 'font-normal') {
      style.fontWeight = '400';
    }

    // Layout
    else if (cls === 'flex') {
      style.flex = 1;
    } else if (cls === 'flex-row') {
      style.flexDirection = 'row';
    } else if (cls === 'flex-col') {
      style.flexDirection = 'column';
    } else if (cls.startsWith('items-')) {
      const align = cls.replace('items-', '');
      if (align === 'center') style.alignItems = 'center';
      else if (align === 'start') style.alignItems = 'flex-start';
      else if (align === 'end') style.alignItems = 'flex-end';
    } else if (cls.startsWith('justify-')) {
      const justify = cls.replace('justify-', '');
      if (justify === 'center') style.justifyContent = 'center';
      else if (justify === 'start') style.justifyContent = 'flex-start';
      else if (justify === 'end') style.justifyContent = 'flex-end';
      else if (justify === 'between') style.justifyContent = 'space-between';
    }

    // Borders
    else if (cls === 'rounded') {
      style.borderRadius = 4;
    } else if (cls.startsWith('rounded-')) {
      const radius = cls.replace('rounded-', '');
      style.borderRadius = tailwindSpacingToNumber(radius);
    } else if (cls === 'border') {
      style.borderWidth = 1;
    } else if (cls.startsWith('border-') && !cls.includes('color')) {
      const width = cls.match(/border-(\w+)/)?.[1];
      if (width && ['0', '2', '4', '8'].includes(width)) {
        style.borderWidth = parseInt(width);
      }
    }

    // Width/Height
    else if (cls === 'w-full') {
      style.width = '100%';
    } else if (cls === 'h-full') {
      style.height = '100%';
    } else if (cls.startsWith('w-')) {
      const value = cls.replace('w-', '');
      if (value === 'full') {
        style.width = '100%';
      } else if (value === 'auto') {
        style.width = 'auto';
      } else {
        style.width = tailwindSpacingToNumber(value);
      }
    } else if (cls.startsWith('h-')) {
      const value = cls.replace('h-', '');
      if (value === 'full') {
        style.height = '100%';
      } else if (value === 'auto') {
        style.height = 'auto';
      } else {
        style.height = tailwindSpacingToNumber(value);
      }
    }
    // Text alignment
    else if (cls === 'text-center') {
      style.textAlign = 'center';
    } else if (cls === 'text-left') {
      style.textAlign = 'left';
    } else if (cls === 'text-right') {
      style.textAlign = 'right';
    }
    // Display
    else if (cls === 'hidden') {
      style.display = 'none';
    } else if (cls === 'block') {
      style.display = 'flex';
    }
  });

  // Return appropriate type based on component
  if (type === 'text') {
    const textStyle: Partial<TextStyle> = {};
    Object.keys(style).forEach(key => {
      if (isTextStyleProperty(key)) {
        const value = style[key as keyof typeof style];
        if (value !== undefined) {
          (textStyle as any)[key] = value;
        }
      }
    });
    return textStyle as TextStyle;
  }
  
  const viewStyle: Partial<ViewStyle> = {};
  Object.keys(style).forEach(key => {
    if (isViewStyleProperty(key)) {
      const value = style[key as keyof typeof style];
      if (value !== undefined) {
        (viewStyle as any)[key] = value;
      }
    }
  });
  return viewStyle as ViewStyle;
}

function isTextStyleProperty(key: string): boolean {
  const textProps = ['color', 'fontSize', 'fontWeight', 'fontStyle', 'fontFamily', 'textAlign', 'textDecorationLine', 'lineHeight'];
  return textProps.includes(key);
}

function isViewStyleProperty(key: string): boolean {
  const viewProps = ['backgroundColor', 'borderColor', 'borderWidth', 'borderRadius', 'padding', 'paddingHorizontal', 'paddingVertical', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'margin', 'marginHorizontal', 'marginVertical', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'flex', 'flexDirection', 'alignItems', 'justifyContent', 'width', 'height'];
  return viewProps.includes(key);
}

/**
 * Convert Tailwind color names to hex values
 */
function tailwindColorToHex(color: string): string {
  const colorMap: Record<string, string> = {
    'white': '#ffffff',
    'black': '#000000',
    'transparent': 'transparent',
    // Gray scale
    'gray-50': '#f9fafb',
    'gray-100': '#f3f4f6',
    'gray-200': '#e5e7eb',
    'gray-300': '#d1d5db',
    'gray-400': '#9ca3af',
    'gray-500': '#6b7280',
    'gray-600': '#4b5563',
    'gray-700': '#374151',
    'gray-800': '#1f2937',
    'gray-900': '#111827',
    // Slate scale
    'slate-50': '#f8fafc',
    'slate-100': '#f1f5f9',
    'slate-200': '#e2e8f0',
    'slate-300': '#cbd5e1',
    'slate-400': '#94a3b8',
    'slate-500': '#64748b',
    'slate-600': '#475569',
    'slate-700': '#334155',
    'slate-800': '#1e293b',
    'slate-900': '#0f172a',
    // Indigo scale
    'indigo-50': '#eef2ff',
    'indigo-100': '#e0e7ff',
    'indigo-200': '#c7d2fe',
    'indigo-300': '#a5b4fc',
    'indigo-400': '#818cf8',
    'indigo-500': '#6366f1',
    'indigo-600': '#4f46e5',
    'indigo-700': '#4338ca',
    'indigo-800': '#3730a3',
    'indigo-900': '#312e81',
    // Purple scale
    'purple-50': '#faf5ff',
    'purple-100': '#f3e8ff',
    'purple-200': '#e9d5ff',
    'purple-300': '#d8b4fe',
    'purple-400': '#c084fc',
    'purple-500': '#a855f7',
    'purple-600': '#9333ea',
    'purple-700': '#7e22ce',
    'purple-800': '#6b21a8',
    'purple-900': '#581c87',
    // Blue scale
    'blue-50': '#eff6ff',
    'blue-100': '#dbeafe',
    'blue-200': '#bfdbfe',
    'blue-300': '#93c5fd',
    'blue-400': '#60a5fa',
    'blue-500': '#3b82f6',
    'blue-600': '#2563eb',
    'blue-700': '#1d4ed8',
    'blue-800': '#1e40af',
    'blue-900': '#1e3a8a',
    // Red scale
    'red-50': '#fef2f2',
    'red-100': '#fee2e2',
    'red-200': '#fecaca',
    'red-300': '#fca5a5',
    'red-400': '#f87171',
    'red-500': '#ef4444',
    'red-600': '#dc2626',
    'red-700': '#b91c1c',
    'red-800': '#991b1b',
    'red-900': '#7f1d1d',
    // Green scale
    'green-50': '#f0fdf4',
    'green-100': '#dcfce7',
    'green-200': '#bbf7d0',
    'green-300': '#86efac',
    'green-400': '#4ade80',
    'green-500': '#22c55e',
    'green-600': '#16a34a',
    'green-700': '#15803d',
    'green-800': '#166534',
    'green-900': '#14532d',
  };
  
  // If it's already a hex color, return as is
  if (color.startsWith('#')) {
    return color;
  }
  
  return colorMap[color] || color;
}

/**
 * Convert Tailwind spacing to number (px)
 */
function tailwindSpacingToNumber(value: string): number {
  if (value === '0') return 0;
  if (value === 'px') return 1;
  if (value === '0.5') return 2;
  if (value === '1') return 4;
  if (value === '1.5') return 6;
  if (value === '2') return 8;
  if (value === '2.5') return 10;
  if (value === '3') return 12;
  if (value === '3.5') return 14;
  if (value === '4') return 16;
  if (value === '5') return 20;
  if (value === '6') return 24;
  if (value === '8') return 32;
  if (value === '10') return 40;
  if (value === '12') return 48;
  if (value === '16') return 64;
  if (value === '20') return 80;
  if (value === '24') return 96;
  
  // Try to parse as number
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num * 4;
}

/**
 * Convert Tailwind font size to number (px)
 */
function tailwindFontSizeToNumber(size: string): number {
  const sizeMap: Record<string, number> = {
    'xs': 12,
    'sm': 14,
    'base': 16,
    'lg': 18,
    'xl': 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  };
  
  return sizeMap[size] || 16;
}

