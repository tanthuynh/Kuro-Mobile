import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type ImageStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/context/theme-context';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | number;
  showText?: boolean;
  orientation?: 'horizontal' | 'vertical';
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'sm',
  showText = false,
  orientation = 'horizontal',
  style,
  imageStyle,
  textStyle,
  testID,
}) => {
  const { colors } = useTheme();

  const getDimension = (): number => {
    if (typeof size === 'number') return size;
    switch (size) {
      case 'sm':
        return 24;
      case 'md':
        return 32;
      case 'lg':
        return 48;
      default:
        return 24;
    }
  };

  const getTextSize = (): number => {
    switch (size) {
      case 'sm':
        return 22;
      case 'md':
        return 26;
      case 'lg':
        return 30;
      default:
        return 22;
    }
  };

  const dim = getDimension();
  const defaultFontSize = getTextSize();
  const logoColor = colors.brandGreenScale?.green5 || colors.brandGreen || '#206020';

  const logoNode = (
    <Image
      source={require('../../assets/Logo.png')}
      style={[
        {
          width: dim,
          height: dim,
          tintColor: logoColor,
        },
        imageStyle,
      ]}
      resizeMode="contain"
    />
  );

  if (!showText) {
    return (
      <View style={[styles.inlineBlock, style]} testID={testID}>
        {logoNode}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        orientation === 'vertical' ? styles.vertical : styles.horizontal,
        style,
      ]}
      testID={testID}
    >
      {logoNode}
      <Text
        style={[
          styles.text,
          {
            color: colors.foreground,
            fontSize: defaultFontSize,
          },
          textStyle,
        ]}
      >
        kuro
      </Text>
    </View>
  );
};

export interface GoogleIconProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const GoogleIcon: React.FC<GoogleIconProps> = ({ size = 20, style }) => {
  return (
    <View style={style}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <Path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <Path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <Path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  inlineBlock: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    alignItems: 'center',
  },
  horizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vertical: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    fontVariant: ['small-caps'],
    letterSpacing: 1.5,
  },
});
