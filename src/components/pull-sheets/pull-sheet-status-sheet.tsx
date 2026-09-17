/**
 * src/components/pull-sheets/pull-sheet-status-sheet.tsx
 * Modal bottom sheet for manual status selection, rollback/revert, and viewing
 * pull sheet line item details and scanned barcodes in Kuro Mobile.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import {
  CheckCircle2,
  X,
  RotateCcw,
  Tag,
  Info,
  Barcode,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';
import { ModalSheet } from '@/components/ui/modal-sheet';
import {
  PULLSHEET_LIFECYCLE_ORDER,
  STATUS_DISPLAY_CONFIG,
  normalizePullsheetStatus,
  getPreviousPullsheetStatus,
} from '@/lib/pull-sheet-engine';
import type { PullsheetItem, PullsheetItemStatus } from '@/types/pull-sheet';

export interface PullSheetStatusSheetProps {
  item: PullsheetItem | null;
  visible: boolean;
  onClose: () => void;
  onSelectStatus: (itemId: string, newStatus: PullsheetItemStatus) => void;
  onRollback?: (itemId: string) => void;
  testID?: string;
}

export const PullSheetStatusSheet: React.FC<PullSheetStatusSheetProps> = ({
  item,
  visible,
  onClose,
  onSelectStatus,
  onRollback,
  testID,
}) => {
  const { colors, typography, layout } = useTheme();

  if (!item) return null;

  const currentStatus = normalizePullsheetStatus(item.status);
  const prevStatus = getPreviousPullsheetStatus(currentStatus);

  const handleStatusSelect = (status: PullsheetItemStatus) => {
    onSelectStatus(item.id, status);
    onClose();
  };

  const handleRollback = () => {
    if (onRollback) {
      onRollback(item.id);
    } else {
      onSelectStatus(item.id, prevStatus);
    }
    onClose();
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Item Status & Progression"
      icon={<Tag size={18} color={colors.primary} />}
      testID={testID || 'pullsheet-status-sheet-modal'}
    >
      {/* Item Details */}
      <View
        style={[
          styles.itemSummaryBox,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.itemDescription,
            { color: colors.cardForeground, fontSize: typography.fontSize.base },
          ]}
        >
          {item.description}
        </Text>

        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
            Required Quantity: <Text style={{ color: colors.foreground, fontWeight: '700' }}>{item.quantity}</Text>
          </Text>
          {item.scannedQuantity !== undefined ? (
            <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
              Scanned: <Text style={{ color: colors.status.online, fontWeight: '700' }}>{item.scannedQuantity}</Text>
            </Text>
          ) : null}
        </View>

        {item.internalNote ? (
          <View style={styles.noteBox}>
            <Info size={14} color={colors.status.degraded} style={{ marginRight: 6 }} />
            <Text
              style={[
                styles.noteText,
                { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
              ]}
            >
              {item.internalNote}
            </Text>
          </View>
        ) : null}

        {item.scannedBarcodes && item.scannedBarcodes.length > 0 ? (
          <View style={styles.barcodesContainer}>
            <View style={styles.barcodeHeaderRow}>
              <Barcode size={14} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.barcodeTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                Scanned Asset Serials ({item.scannedBarcodes.length}):
              </Text>
            </View>
            <View style={styles.barcodeChipsRow}>
              {item.scannedBarcodes.map((barcode, i) => (
                <View
                  key={i}
                  style={[
                    styles.barcodeChip,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.barcodeChipText, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                    {barcode}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* Quick Rollback Action */}
      {currentStatus !== 'pending' && currentStatus !== 'none' ? (
        <Button
          variant="outline"
          size="sm"
          icon={<RotateCcw size={14} color={colors.foreground} />}
          onPress={handleRollback}
          style={styles.rollbackButton}
          testID="rollback-status-btn"
        >
          Revert to {STATUS_DISPLAY_CONFIG[prevStatus]?.label || 'Previous'}
        </Button>
      ) : null}

      {/* Status Option Buttons */}
      <Text
        style={[
          styles.optionsHeader,
          { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
        ]}
      >
        SELECT OPERATIONAL STATUS
      </Text>

      {PULLSHEET_LIFECYCLE_ORDER.map((statusKey) => {
        const config = STATUS_DISPLAY_CONFIG[statusKey];
        const isSelected = currentStatus === statusKey;

        return (
          <Pressable
            key={statusKey}
            onPress={() => handleStatusSelect(statusKey)}
            style={[
              styles.statusOptionRow,
              {
                backgroundColor: isSelected ? config.bgColor : colors.surface,
                borderColor: isSelected ? config.borderColor : colors.border,
                borderRadius: layout.borderRadius.md,
              },
            ]}
            testID={`select-status-option-${statusKey}`}
          >
            <View style={styles.optionLeft}>
              <Text
                style={[
                  styles.optionLabel,
                  {
                    color: isSelected ? config.color : colors.foreground,
                    fontSize: typography.fontSize.sm,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {config.label}
              </Text>
            </View>

            {isSelected ? (
              <CheckCircle2 size={18} color={config.color} />
            ) : null}
          </Pressable>
        );
      })}
    </ModalSheet>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContent: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    maxHeight: '80%',
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  scrollBody: {},
  itemSummaryBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  itemDescription: {
    fontFamily: 'Calibri',
    fontWeight: '600',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 6,
  },
  metaText: {
    fontFamily: 'Calibri',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  noteText: {
    fontFamily: 'Calibri',
    flex: 1,
  },
  barcodesContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  barcodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  barcodeTitle: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  barcodeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  barcodeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  barcodeChipText: {
    fontFamily: 'Calibri',
  },
  rollbackButton: {
    marginBottom: 16,
  },
  optionsHeader: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  statusOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  optionLabel: {
    fontFamily: 'Calibri',
  },
});
