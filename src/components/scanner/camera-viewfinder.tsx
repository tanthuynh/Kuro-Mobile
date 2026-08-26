/**
 * src/components/scanner/camera-viewfinder.tsx
 * Native CameraView viewfinder with reticle, animated laser line, torch control,
 * and simulator/web fallback for Kuro Mobile.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import {
  Barcode,
  QrCode,
  Zap,
  ZapOff,
  Camera,
  Play,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';

export interface CameraViewfinderProps {
  onScan: (code: string) => void;
  torchEnabled?: boolean;
  onToggleTorch?: () => void;
  scanMode?: 'barcode' | 'qr';
  onToggleMode?: (mode: 'barcode' | 'qr') => void;
  testID?: string;
}

export const CameraViewfinder: React.FC<CameraViewfinderProps> = ({
  onScan,
  torchEnabled = false,
  onToggleTorch,
  scanMode = 'barcode',
  onToggleMode,
  testID,
}) => {
  const { colors, typography, layout } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [useSimulator, setUseSimulator] = useState<boolean>(Platform.OS === 'web');

  // Animated laser line
  const laserAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(laserAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
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

  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const hasCamera = isNative && permission?.granted && !useSimulator;

  return (
    <View
      testID={testID || 'camera-viewfinder-container'}
      style={[styles.container, { backgroundColor: '#000000', borderColor: colors.border }]}
    >
      {hasCamera ? (
        <CameraView
          testID="camera-view-native"
          style={StyleSheet.absoluteFillObject}
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
        <View style={styles.fallbackBackground}>
          <Text style={[styles.simText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
            {Platform.OS === 'web'
              ? 'Web Simulator Mode Active'
              : !permission?.granted
              ? 'Camera Permission Required'
              : 'Simulator Mode Active'}
          </Text>

          {!permission?.granted && isNative ? (
            <Button
              variant="primary"
              size="sm"
              icon={<Camera size={16} color={colors.primaryForeground} />}
              onPress={requestPermission}
              style={{ marginTop: 8 }}
            >
              Grant Camera Permission
            </Button>
          ) : (
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

      {/* Viewfinder Controls Overlay (Top) */}
      <View style={styles.topControls}>
        <View style={styles.modeGroup}>
          <Pressable
            onPress={() => onToggleMode?.('barcode')}
            style={[
              styles.modeButton,
              {
                backgroundColor: scanMode === 'barcode' ? colors.primary : 'rgba(0,0,0,0.6)',
              },
            ]}
          >
            <Barcode size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.modeText}>1D Barcode</Text>
          </Pressable>

          <Pressable
            onPress={() => onToggleMode?.('qr')}
            style={[
              styles.modeButton,
              {
                backgroundColor: scanMode === 'qr' ? colors.primary : 'rgba(0,0,0,0.6)',
              },
            ]}
          >
            <QrCode size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.modeText}>QR Code</Text>
          </Pressable>
        </View>

        {onToggleTorch ? (
          <Pressable
            onPress={onToggleTorch}
            style={[
              styles.torchButton,
              {
                backgroundColor: torchEnabled ? colors.status.degraded : 'rgba(0,0,0,0.6)',
              },
            ]}
            accessibilityLabel={torchEnabled ? 'Torch Off' : 'Torch On'}
            testID="torch-toggle-btn"
          >
            {torchEnabled ? <Zap size={18} color="#000000" /> : <ZapOff size={18} color="#FFFFFF" />}
          </Pressable>
        ) : null}
      </View>

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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
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
    minHeight: 32,
  },
  modeText: {
    fontFamily: 'Calibri',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  torchButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
});
