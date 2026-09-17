/**
 * src/components/scanner/camera-viewfinder.tsx
 * Native CameraView viewfinder with reticle, animated laser line, torch control,
 * and simulator/web fallback for Kuro Mobile.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  AppState,
  type AppStateStatus,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import {
  Barcode,
  QrCode,
  Zap,
  ZapOff,
  Camera,
  Play,
  CameraOff,
  Settings,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';

export interface CameraViewfinderProps {
  onScan: (code: string) => void;
  torchEnabled?: boolean;
  onToggleTorch?: () => void;
  showTorchControl?: boolean;
  onResetTorch?: () => void;
  scanMode?: 'barcode' | 'qr';
  onToggleMode?: (mode: 'barcode' | 'qr') => void;
  isVisible?: boolean;
  testID?: string;
}

export const CameraViewfinder: React.FC<CameraViewfinderProps> = ({
  onScan,
  torchEnabled = false,
  onToggleTorch,
  showTorchControl = true,
  onResetTorch,
  scanMode = 'barcode',
  onToggleMode,
  isVisible = true,
  testID,
}) => {
  const { colors, typography } = useTheme();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [useSimulator, setUseSimulator] = useState<boolean>(Platform.OS === 'web');
  const isFocused = useIsFocused();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState || 'active');

  // AppState listener & Recheck camera permissions on resume from Settings
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      if (nextState === 'active' && typeof getPermission === 'function') {
        getPermission().catch(() => {});
      }
    });

    return () => {
      subscription.remove();
    };
  }, [getPermission]);

  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const isAppActive = appState === 'active' || (process.env.NODE_ENV === 'test' && appState !== 'background');
  const isViewfinderActive = isFocused && isAppActive && isVisible;

  // Explicit torch reset on blur, backgrounding, or visibility change
  useEffect(() => {
    if (!isViewfinderActive && torchEnabled) {
      onResetTorch?.();
    }
  }, [isViewfinderActive, torchEnabled, onResetTorch]);

  useEffect(() => {
    return () => {
      if (torchEnabled) {
        onResetTorch?.();
      }
    };
  }, [torchEnabled, onResetTorch]);

  // Animated laser line
  const laserAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(laserAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [laserAnim]);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (result.data) {
      onScan(result.data);
    }
  };

  // Sample simulation barcodes
  const sampleCodes = [
    'BAR-LA-K2-0042',
    'BAR-RB-BMFL-018',
    'SN-994821',
    'SN-441209',
    'BAR-SH-AD4Q-007',
    'BAR-AW-AQ4-002',
    'BAR-CM-PS5-033',
    'BAR-CAB-SOC-050',
  ];

  const handleSimulatedScan = () => {
    const randomCode = sampleCodes[Math.floor(Math.random() * sampleCodes.length)];
    onScan(randomCode);
  };

  const isPermissionDenied =
    !permission?.granted &&
    (permission?.status === 'denied' || permission?.canAskAgain === false);

  const handleOpenSettings = async () => {
    try {
      if (typeof Linking.openSettings === 'function') {
        await Linking.openSettings();
      }
    } catch (err) {
      console.warn('[CameraViewfinder] Failed to open settings:', err);
    }
  };

  const hasCamera = isNative && permission?.granted && isViewfinderActive && !useSimulator;

  return (
    <View
      testID={testID || 'camera-viewfinder-container'}
      style={[styles.container, { backgroundColor: '#000000', borderColor: colors.border }]}
    >
      {hasCamera ? (
        <CameraView
          testID="camera-view-native"
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchEnabled}
          barcodeScannerSettings={{
            barcodeTypes: [
              'qr',
              'code128',
              'code39',
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'itf14',
              'datamatrix',
              'pdf417',
            ],
          }}
          onBarcodeScanned={handleBarcodeScanned}
        />
      ) : (
        <View style={styles.fallbackBackground} testID="camera-viewfinder-fallback">
          {isNative && isPermissionDenied ? (
            <View style={styles.deniedContainer} testID="camera-permission-denied-message">
              <CameraOff size={32} color={colors.destructive} style={{ marginBottom: 6 }} />
              <Text
                style={[
                  styles.deniedTitle,
                  { color: colors.foreground, fontSize: typography.fontSize.sm },
                ]}
              >
                Camera Access Disabled
              </Text>
              <Text
                style={[
                  styles.deniedDesc,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.xs },
                ]}
              >
                Camera permission is denied. Please enable camera access in your device settings to scan equipment barcodes, or use manual code entry below.
              </Text>
              <Button
                variant="primary"
                size="sm"
                icon={<Settings size={14} color={colors.primaryForeground} />}
                onPress={handleOpenSettings}
                style={{ marginTop: 10 }}
                testID="open-camera-settings-btn"
              >
                Open Settings
              </Button>
            </View>
          ) : isNative && !permission?.granted ? (
            <View style={styles.promptContainer}>
              <Camera size={32} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text
                style={[
                  styles.simText,
                  { color: colors.foreground, fontSize: typography.fontSize.sm },
                ]}
              >
                Camera Permission Required
              </Text>
              <Text
                style={[
                  styles.deniedDesc,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.xs, marginTop: 4 },
                ]}
              >
                Allow Kuro Mobile to access your device camera to scan barcodes and asset tags.
              </Text>
              <Button
                variant="primary"
                size="sm"
                icon={<Camera size={16} color={colors.primaryForeground} />}
                onPress={requestPermission}
                style={{ marginTop: 10 }}
                testID="grant-camera-permission-btn"
              >
                Grant Camera Permission
              </Button>
            </View>
          ) : (
            <View style={styles.simulatorContainer}>
              <Text
                style={[
                  styles.simText,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm },
                ]}
              >
                {Platform.OS === 'web'
                  ? 'Web Simulator Mode Active'
                  : 'Simulator Mode Active'}
              </Text>

              <Button
                variant="outline"
                size="sm"
                icon={<Play size={14} color={colors.foreground} />}
                onPress={handleSimulatedScan}
                style={{ marginTop: 8 }}
                testID="simulate-scan-trigger-btn"
              >
                Simulate Barcode Scan
              </Button>
            </View>
          )}
        </View>
      )}

      {/* Target Reticle Corners */}
      <View style={[styles.reticleCorner, styles.topLeft, { borderColor: colors.primary }]} />
      <View style={[styles.reticleCorner, styles.topRight, { borderColor: colors.primary }]} />
      <View style={[styles.reticleCorner, styles.bottomLeft, { borderColor: colors.primary }]} />
      <View style={[styles.reticleCorner, styles.bottomRight, { borderColor: colors.primary }]} />

      {/* Animated Laser Scanning Line */}
      <Animated.View
        style={[
          styles.laserGuide,
          {
            backgroundColor: colors.primary,
            transform: [
              {
                translateY: laserAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-80, 80],
                }),
              },
            ],
          },
        ]}
      />

      {hasCamera && showTorchControl && onToggleTorch ? (
        <View style={[styles.topControls, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
          <Pressable
            testID="torch-toggle-btn"
            accessibilityRole="button"
            accessibilityLabel={torchEnabled ? 'Turn flashlight off' : 'Turn flashlight on'}
            accessibilityState={{ selected: torchEnabled }}
            onPress={onToggleTorch}
            style={[styles.torchButton, { backgroundColor: torchEnabled ? colors.primary : 'rgba(0,0,0,0.65)' }]}
          >
            {torchEnabled ? <Zap size={22} color="#FFFFFF" /> : <ZapOff size={22} color="#FFFFFF" />}
          </Pressable>
        </View>
      ) : null}

      {/* Viewfinder Guidance Label (Bottom) */}
      <View style={styles.bottomPrompt}>
        <Text style={styles.promptText}>
          Point camera reticle at equipment asset tag
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  deniedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  deniedTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  deniedDesc: {
    fontFamily: 'Calibri',
    textAlign: 'center',
    lineHeight: 16,
  },
  promptContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  simulatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  simText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
    textAlign: 'center',
  },
  reticleCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderWidth: 3,
    zIndex: 3,
  },
  topLeft: {
    top: 24,
    left: 24,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 24,
    right: 24,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 24,
    left: 24,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 24,
    right: 24,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  laserGuide: {
    width: '80%',
    height: 2,
    opacity: 0.85,
    zIndex: 2,
  },
  topControls: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 4,
  },
  modeGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    minHeight: 36,
  },
  modeText: {
    fontFamily: 'Calibri',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  torchButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomPrompt: {
    position: 'absolute',
    bottom: 12,
    zIndex: 4,
  },
  promptText: {
    fontFamily: 'Calibri',
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },
});
