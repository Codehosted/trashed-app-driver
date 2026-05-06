import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

type BrandLogoProps = {
  textColor: string;
  accentColor: string;
  mutedColor?: string;
  size?: 'sm' | 'md' | 'lg';
  subtitle?: string;
  markOnly?: boolean;
};

function isLightColor(color: string): boolean {
  const normalized = color.trim().replace('#', '');
  if (normalized.length !== 6) return false;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

function getLogoSize(size: BrandLogoProps['size']) {
  switch (size) {
    case 'sm':
      return { width: 48, height: 36 };
    case 'lg':
      return { width: 76, height: 58 };
    default:
      return { width: 58, height: 44 };
  }
}

function TrashedEvolvedMark({
  letterColor,
  width,
  height,
}: {
  letterColor: string;
  width: number;
  height: number;
}) {
  return (
    <Svg width={width} height={height} viewBox="345 170 380 290" fill="none">
      <Defs>
        <RadialGradient
          id="brandStripeTop"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(183.25 0 0 183.25 564 251.33)"
        >
          <Stop offset="0" stopColor="rgb(71,71,99)" stopOpacity="0.32" />
          <Stop offset="0.08" stopColor="rgb(59,60,84)" stopOpacity="0.45" />
          <Stop offset="0.24" stopColor="rgb(57,58,81)" stopOpacity="0.47" />
          <Stop offset="1" stopColor="rgb(86,86,120)" stopOpacity="1" />
        </RadialGradient>
        <LinearGradient
          id="brandStripeMid"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(181.33 -6.67 6.67 181.33 546.67 325.33)"
        >
          <Stop offset="0" stopColor="rgb(96,58,156)" stopOpacity="0.54" />
          <Stop offset="0.51" stopColor="rgb(126,84,200)" stopOpacity="0.88" />
          <Stop offset="1" stopColor="rgb(137,93,215)" stopOpacity="1" />
        </LinearGradient>
        <RadialGradient
          id="brandStripeBottom"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(291.75 -96.28 22 66.67 651.33 389.33)"
        >
          <Stop offset="0" stopColor="rgb(141,98,226)" stopOpacity="1" />
          <Stop offset="0.34" stopColor="rgb(141,98,226)" stopOpacity="0.96" />
          <Stop offset="0.43" stopColor="rgb(140,97,225)" stopOpacity="0.83" />
          <Stop offset="0.51" stopColor="rgb(139,96,223)" stopOpacity="0.67" />
          <Stop offset="0.73" stopColor="rgb(90,61,143)" stopOpacity="0.93" />
          <Stop offset="1" stopColor="rgb(77,52,122)" stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <Path
        d="M514.5,230.089C517.526,230.089 524.627,230.127 530.29,230.202C534.442,230.257 537.821,232.026 538.254,234.83C538.584,236.97 538.202,240.237 537.352,241.502C534.584,245.626 526.857,256.876 522.703,263.138C515.597,273.85 511.088,282.141 507.485,282.337C489.742,283.299 471.105,281.196 470.884,284.532C470.643,288.169 471.25,336.537 470.508,338.503C468.847,342.906 453.204,350.66 456.965,376.418C457.862,382.557 465.726,398.992 484.462,403.638C503.135,408.269 517.988,401.128 518.904,408.432C519.262,411.285 518.826,430.392 519.006,439.498C519.188,448.744 519.633,451.077 510.538,452.693C455.042,462.557 427.278,440.726 413.285,422.659C395.767,400.04 398.472,379.282 398.421,335.5C398.362,284.274 398.804,284.03 397.923,283.09C397.051,282.158 396.789,282.717 364.5,282.514C357.131,282.468 349.267,283.919 349.141,277.514C349.137,277.347 349.138,235.139 349.178,234.484C349.497,229.251 351.862,229.977 373.499,229.977C396.932,229.976 398.008,230.577 398.338,228.473C398.775,225.69 397.851,179.686 398.931,177.715C400.7,174.483 401.685,175.24 427.497,175.183C464.375,175.1 464.415,174.616 467.537,175.334C471.452,176.235 470.873,178.531 470.867,198.5C470.858,228.702 470.715,228.845 471.437,229.571C471.795,229.931 471.842,229.972 514.5,230.089Z"
        fill={letterColor}
      />
      <Path
        d="M703.504,255.097C710.618,255.115 718.274,254.147 715.576,258.558C714.981,259.531 698.113,276.989 696.579,278.577C691.982,283.335 688.701,286.215 679.477,287.117C678.974,287.167 560.819,287.085 550.501,287.078C543.97,287.074 535.748,288.401 541.032,282.086C543.014,279.718 560.424,259.903 561.802,258.886C568.049,254.277 568.708,255.093 604.498,255.086C637.5,255.09 670.502,255.093 703.504,255.097Z"
        fill="url(#brandStripeTop)"
      />
      <Path
        d="M616.503,303.921C658.872,303.906 666.574,303.923 669.525,304.013C676.954,304.239 668.592,311.39 664.614,315.606C648.113,333.099 648.167,333.705 640.567,335.761C637.163,336.681 636.515,336.856 596.499,336.656C544.91,336.398 499.67,337.29 497.89,336.005C495.185,334.054 500.257,329.232 500.738,328.726C516.177,312.462 518.278,307.624 524.417,305.281C529.408,303.376 529.595,304.018 616.503,303.921Z"
        fill="url(#brandStripeMid)"
      />
      <Path
        d="M648.5,354.122C666.275,354.209 666.437,353.99 667.545,354.386C671.24,355.703 667.856,359.266 667.571,359.567C652.501,375.435 647.572,382.364 641.303,385.029C631.786,389.075 631.279,387.01 494.5,387.43C471.454,387.501 464.686,358.868 485.456,354.292C486.95,353.963 632.018,354.243 648.5,354.122Z"
        fill="url(#brandStripeBottom)"
      />
    </Svg>
  );
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  textColor,
  mutedColor,
  size = 'md',
  subtitle,
  markOnly = false,
}) => {
  const logoSize = getLogoSize(size);
  const letterColor = isLightColor(textColor) ? '#fdfdfd' : '#181b22';

  if (markOnly) {
    return (
      <View style={styles.markOnly}>
        <TrashedEvolvedMark {...logoSize} letterColor={letterColor} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <TrashedEvolvedMark {...logoSize} letterColor={letterColor} />
      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            size === 'sm' && styles.subtitleSm,
            size === 'lg' && styles.subtitleLg,
            { color: mutedColor ?? textColor },
          ]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
    gap: 2,
  },
  markOnly: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.9,
    textTransform: 'uppercase',
  },
  subtitleSm: {
    fontSize: 8,
    letterSpacing: 1.45,
  },
  subtitleLg: {
    fontSize: 10,
    letterSpacing: 2.1,
  },
});
