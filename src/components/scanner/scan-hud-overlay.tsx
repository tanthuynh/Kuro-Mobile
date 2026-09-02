/**
 * src/components/scanner/scan-hud-overlay.tsx
 * Non-blocking Heads-Up Display (HUD) banner overlay in Kuro Mobile.
 * Provides high-contrast, instant visual feedback for continuous barcode scans.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Package,
} from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import type { ScanEvaluationResult } from '@/types/scanner';

export interface ScanHudOverlayProps {
  result: ScanEvaluationResult | null;
  visible: boolean;
  onDismiss: () => void;
  testID?: string;
}

export const ScanHudOverlay: React.FC<ScanHudOverlayProps> = ({
  result,
  visible,
  onDismiss,
  testID,
}) => {
  const { typography, layout } = useTheme();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && result) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, result, slideAnim, opacityAnim]);

  if (!result) return null;

  const getConfig = () => {
    switch (result.type) {
      case 'SUCCESS':
        return {
          bgColor: '#1F471F',
          borderColor: '#22C55E',
          textColor: '#FFFFFF',
          title: result.isFullyPrepped ? 'Prep Line Complete' : 'Asset Scanned',
          icon: <CheckCircle2 size={20} color="#22C55E" />,
        };
      case 'ALREADY_COMPLETED':
        return {
          bgColor: '#78350F',
          borderColor: '#F59E0B',
          textColor: '#FFFFFF',
          title: 'Already Fully Prepped',
          icon: <AlertTriangle size={20} color="#FBBF24" />,
        };
      case 'NOT_ON_PULLSHEET':
        return {
          bgColor: '#7F1D1D',
          borderColor: '#EF4444',
          textColor: '#FFFFFF',
          title: 'Gear Not On Job Pull Sheet',
          icon: <AlertCircle size={20} color="#F87171" />,
        };
      case 'UNKNOWN_CODE':
      default:
        return {
          bgColor: '#7F1D1D',
          borderColor: '#EF4444',
          textColor: '#FFFFFF',
          title: 'Unrecognized Barcode',
          icon: <AlertCircle size={20} color="#F87171" />,
        };
    }
  };

  const config = getConfig();

  return (
    <Animated.View
      testID={testID || 'scan-hud-overlay'}
      style={[
        styles.hudContainer,
        {
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
          borderRadius: layout.borderRadius.lg,
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.hudLeft}>
        <View style={styles.iconWrap}>{config.icon}</View>
        <View style={styles.textGroup}>
          <Text
            style={[
              styles.hudTitle,
              { color: config.textColor, fontSize: typography.fontSize.base },
            ]}
          >
            {config.title}
          </Text>
          <Text
            style={[
              styles.hudMessage,
              { color: 'rgba(255, 255, 255, 0.9)', fontSize: typography.fontSize.sm },
            ]}
            numberOfLines={2}
          >
            {result.message || result.equipment?.name || result.item?.description || 'Code scanned'}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.closeBtn}
        accessibilityRole="button"
        accessibilityLabel="Dismiss scan notification"
      >
        <X size={16} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  hudContainer: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1.5,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  hudLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  iconWrap: {
    marginRight: 10,
  },
  textGroup: {
    flex: 1,
  },
  hudTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  hudMessage: {
    fontFamily: 'Calibri',
    marginTop: 2,
    lineHeight: 18,
  },
  closeBtn: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
