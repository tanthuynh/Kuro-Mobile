/**
 * src/components/events/event-scanner-bottom-bar.tsx
 * Decoupled Sticky Bottom Action Bar for Event Scanner with Start/Close and Status Controls.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { QrCode, SlidersHorizontal, X } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';
import type { ScanTargetStatus } from '@/types/scanner';

export interface EventScannerBottomBarProps {
  /** True strictly when event status is Confirmed */
  isScanningAvailable: boolean;
  /** Whether scanner sheet is expanded */
  isScannerOpen?: boolean;
  /** Contract alias for isScannerOpen */
  isScanning?: boolean;
  currentTargetStatus: ScanTargetStatus;
  onStartScan: () => void;
  onCloseScan: () => void;
  onOpenStatusPicker: () => void;
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

export function EventScannerBottomBar({
  isScanningAvailable,
  isScannerOpen,
  isScanning,
  currentTargetStatus,
  onStartScan,
  onCloseScan,
  onOpenStatusPicker,
  testID,
}: EventScannerBottomBarProps) {
  const { colors, spacing } = useTheme();

  if (!isScanningAvailable) {
    return null;
  }

  const isOpen = isScannerOpen !== undefined ? isScannerOpen : Boolean(isScanning);

  return (
    <View
      style={[
        styles.bottomActionBar,
        {
          paddingHorizontal: spacing.base,
          paddingTop: spacing.xs,
          paddingBottom: 18,
          backgroundColor: colors.background,
        },
      ]}
      testID={testID}
    >
      {isOpen ? (
        <View style={styles.scannerOpenButtonsRow}>
          {/* Status Selector Button */}
          <Button
            variant="outline"
            size="lg"
            icon={<SlidersHorizontal size={16} color={colors.foreground} />}
            onPress={onOpenStatusPicker}
            style={styles.statusSelectorBtn}
            testID="scanner-status-selector-btn"
          >
            {`Status: ${getTargetStatusLabel(currentTargetStatus)}`}
          </Button>

          {/* Close Scanner Button */}
          <Button
            variant="secondary"
            size="lg"
            icon={<X size={16} color={colors.secondaryForeground} />}
            onPress={onCloseScan}
            style={styles.closeScannerBtn}
            testID="close-scanner-btn"
          >
            Close Scanner
          </Button>
        </View>
      ) : (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon={<QrCode size={18} color={colors.primaryForeground} />}
          onPress={onStartScan}
          style={[styles.bottomBarBtn, { backgroundColor: colors.brandGreen }]}
          testID="start-scanning-btn"
          accessibilityLabel="Start Scanning"
        >
          Start Scanning
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  bottomBarBtn: {
    width: '100%',
  },
  scannerOpenButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  statusSelectorBtn: {
    flex: 1,
  },
  closeScannerBtn: {
    flex: 1,
  },
});
