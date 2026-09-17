/**
 * src/components/events/event-scanner-drawer.tsx
 * Decoupled Expandable Camera Scanner Viewfinder Drawer for Event Pull Sheet.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Barcode, QrCode, Zap, ZapOff } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { CameraViewfinder } from '@/components/scanner/camera-viewfinder';
import { ScanHudOverlay } from '@/components/scanner/scan-hud-overlay';
import type { ScanTargetStatus, ScanEvaluationResult } from '@/types/scanner';

export interface EventScannerDrawerProps {
  isOpen: boolean;
  currentTargetStatus: ScanTargetStatus;
  scanMode: 'barcode' | 'qr';
  onToggleScanMode: (mode: 'barcode' | 'qr') => void;
  torchEnabled: boolean;
  onToggleTorch: () => void;
  onScan: (code: string) => void;
  lastResult?: ScanEvaluationResult | null;
  hudVisible?: boolean;
  onDismissHud?: () => void;
  testID?: string;
}

const getTargetStatusLabel = (status: ScanTargetStatus): string => {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'prepped_scanned':
      return 'Prepped';
    case 'returned':
      return 'Returned';
    case 'deprepped':
      return 'Deprep';
    default:
      return status;
  }
};

const TARGET_STATUS_BADGE_VARIANTS: Record<ScanTargetStatus, BadgeVariant> = {
  confirmed: 'secondary',
  prepped_scanned: 'success',
  returned: 'brand',
  deprepped: 'warning',
};

export function EventScannerDrawer({
  isOpen,
  currentTargetStatus,
  scanMode,
  onToggleScanMode,
  torchEnabled,
  onToggleTorch,
  onScan,
  lastResult = null,
  hudVisible = false,
  onDismissHud = () => {},
  testID = 'scanner-expandable-sheet',
}: EventScannerDrawerProps) {
  const { colors, typography } = useTheme();

  if (!isOpen) {
    return null;
  }

  return (
    <View
      style={[
        styles.scannerExpandableContainer,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
      testID={testID}
    >
      {/* Scanner Reticle Top Controls */}
      <View style={styles.scannerTopToolbar}>
        <View style={styles.scannerTargetInfo}>
          <Text style={[styles.targetStatusLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
            SCANNING STATUS:
          </Text>
          <Badge variant={TARGET_STATUS_BADGE_VARIANTS[currentTargetStatus] || 'brand'}>
            {getTargetStatusLabel(currentTargetStatus)}
          </Badge>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable
            onPress={() => onToggleScanMode('barcode')}
            style={[
              styles.modeButton,
              { backgroundColor: scanMode === 'barcode' ? colors.primary : colors.card, borderColor: colors.border },
            ]}
          >
            <Barcode size={14} color={scanMode === 'barcode' ? colors.primaryForeground : colors.mutedForeground} style={{ marginRight: 4 }} />
            <Text
              style={{
                fontSize: typography.fontSize.xs,
                color: scanMode === 'barcode' ? colors.primaryForeground : colors.mutedForeground,
                fontFamily: typography.fontFamily.bold,
              }}
            >
              1D
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onToggleScanMode('qr')}
            style={[
              styles.modeButton,
              { backgroundColor: scanMode === 'qr' ? colors.primary : colors.card, borderColor: colors.border },
            ]}
          >
            <QrCode size={14} color={scanMode === 'qr' ? colors.primaryForeground : colors.mutedForeground} style={{ marginRight: 4 }} />
            <Text
              style={{
                fontSize: typography.fontSize.xs,
                color: scanMode === 'qr' ? colors.primaryForeground : colors.mutedForeground,
                fontFamily: typography.fontFamily.bold,
              }}
            >
              QR
            </Text>
          </Pressable>

          <Pressable
            onPress={onToggleTorch}
            style={[
              styles.torchToggleBtn,
              {
                backgroundColor: torchEnabled ? colors.primary : colors.card,
                borderColor: colors.border,
              },
            ]}
            testID="scanner-torch-toggle-btn"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {torchEnabled ? (
              <Zap size={16} color={colors.primaryForeground} />
            ) : (
              <ZapOff size={16} color={colors.mutedForeground} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Camera Viewfinder */}
      <View style={styles.viewfinderWrapper}>
        <CameraViewfinder
          onScan={onScan}
          torchEnabled={torchEnabled}
          onToggleTorch={onToggleTorch}
          showTorchControl={false}
          isVisible={isOpen}
        />

        {/* Non-blocking Floating HUD Overlay */}
        <ScanHudOverlay
          result={lastResult}
          visible={hudVisible}
          onDismiss={onDismissHud}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scannerExpandableContainer: {
    position: 'absolute',
    bottom: 78,
    left: 0,
    right: 0,
    height: 250,
    borderTopWidth: 1,
    zIndex: 20,
    overflow: 'hidden',
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 32,
  },
  scannerTopToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scannerTargetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  targetStatusLabel: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  torchToggleBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  viewfinderWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
});
