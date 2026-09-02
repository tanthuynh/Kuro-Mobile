/**
 * src/components/repair/mobile-date-scroller.tsx
 * 3-Column Mobile Date Scroller (Day, Month, Year) for Repair Period with Start Date at top,
 * End Date at bottom, and Quick Preset Chips (Today, 3 Days, 1 Week, 2 Weeks, Clear).
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Platform,
} from 'react-native';
import { Calendar, Check, X, RotateCcw } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';
import { parseFirestoreDate } from '@/lib/date-utils';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

export interface MobileDateScrollerProps {
  visible: boolean;
  startDate: string | null;
  endDate: string | null;
  onSave: (startDateIso: string | null, endDateIso: string | null) => void | Promise<void>;
  onClose: () => void;
  testID?: string;
}

interface DateParts {
  day: number;
  month: number; // 0-11
  year: number;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function parseToParts(isoString: string | null, defaultOffsetDays = 0): DateParts {
  if (isoString) {
    const d = parseFirestoreDate(isoString) || new Date();
    return {
      day: d.getUTCDate(),
      month: d.getUTCMonth(),
      year: d.getUTCFullYear(),
    };
  }
  const d = new Date();
  if (defaultOffsetDays !== 0) {
    d.setDate(d.getDate() + defaultOffsetDays);
  }
  return {
    day: d.getDate(),
    month: d.getMonth(),
    year: d.getFullYear(),
  };
}

function partsToIso(parts: DateParts | null): string | null {
  if (!parts) return null;
  const maxDay = getDaysInMonth(parts.year, parts.month);
  const clampedDay = Math.min(parts.day, maxDay);
  const d = new Date(Date.UTC(parts.year, parts.month, clampedDay, 12, 0, 0));
  return d.toISOString();
}

export function MobileDateScroller({
  visible,
  startDate,
  endDate,
  onSave,
  onClose,
  testID = 'mobile-date-scroller-modal',
}: MobileDateScrollerProps) {
  const { colors, typography, spacing, isDark } = useTheme();

  const [startParts, setStartParts] = useState<DateParts | null>(() => parseToParts(startDate));
  const [endParts, setEndParts] = useState<DateParts | null>(() => parseToParts(endDate, 3));
  const [activeTarget, setActiveTarget] = useState<'start' | 'end'>('start');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStartParts(startDate ? parseToParts(startDate) : parseToParts(null));
      setEndParts(endDate ? parseToParts(endDate) : parseToParts(null, 3));
      setError(null);
    }
  }, [visible, startDate, endDate]);

  const handleSetPreset = (preset: 'today' | '3days' | '1week' | '2weeks' | 'clear') => {
    setError(null);
    if (preset === 'clear') {
      setStartParts(null);
      setEndParts(null);
      return;
    }

    const today = new Date();
    const sParts: DateParts = {
      day: today.getDate(),
      month: today.getMonth(),
      year: today.getFullYear(),
    };

    let offsetDays = 0;
    if (preset === 'today') offsetDays = 0;
    else if (preset === '3days') offsetDays = 3;
    else if (preset === '1week') offsetDays = 7;
    else if (preset === '2weeks') offsetDays = 14;

    const eDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
    const eParts: DateParts = {
      day: eDate.getDate(),
      month: eDate.getMonth(),
      year: eDate.getFullYear(),
    };

    setStartParts(sParts);
    setEndParts(eParts);
  };

  const updateActiveParts = (updater: (prev: DateParts) => DateParts) => {
    setError(null);
    if (activeTarget === 'start') {
      setStartParts((prev) => {
        const base = prev || parseToParts(null);
        return updater(base);
      });
    } else {
      setEndParts((prev) => {
        const base = prev || parseToParts(null, 3);
        return updater(base);
      });
    }
  };

  const currentActiveParts = activeTarget === 'start' ? startParts || parseToParts(null) : endParts || parseToParts(null, 3);

  const handleSave = () => {
    const sIso = partsToIso(startParts);
    const eIso = partsToIso(endParts);

    if (sIso && eIso) {
      const sTime = new Date(sIso).getTime();
      const eTime = new Date(eIso).getTime();
      if (eTime < sTime) {
        setError('End date must be on or after start date');
        return;
      }
    }

    onSave(sIso, eIso);
    onClose();
  };

  const renderColumn = (
    title: string,
    items: Array<{ label: string; value: number }>,
    selectedValue: number,
    onSelect: (val: number) => void,
    colTestID: string
  ) => {
    return (
      <View style={styles.columnContainer} testID={colTestID}>
        <Text style={[styles.columnHeader, { color: colors.mutedForeground }]}>{title}</Text>
        <ScrollView
          style={[styles.columnScroll, { backgroundColor: colors.surface, borderColor: colors.border }]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {items.map((item) => {
            const isSelected = item.value === selectedValue;
            return (
              <Pressable
                key={`${title}-${item.value}`}
                onPress={() => onSelect(item.value)}
                style={[
                  styles.columnItem,
                  isSelected && { backgroundColor: colors.primary },
                ]}
                testID={`${colTestID}-item-${item.value}`}
              >
                <Text
                  style={[
                    styles.columnItemText,
                    {
                      color: isSelected ? colors.primaryForeground : colors.foreground,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const startFormatted = startParts
    ? `${String(startParts.day).padStart(2, '0')} ${MONTH_NAMES[startParts.month]} ${startParts.year}`
    : 'Not Set';
  const endFormatted = endParts
    ? `${String(endParts.day).padStart(2, '0')} ${MONTH_NAMES[endParts.month]} ${endParts.year}`
    : 'Not Set';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Calendar size={18} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
                Repair Period Dates
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} testID="close-period-modal-btn">
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Preset Chips */}
          <View style={styles.presetsRow}>
            <Pressable
              style={[styles.presetChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleSetPreset('today')}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              testID="period-preset-today"
            >
              <Text style={[styles.presetText, { color: colors.foreground }]}>Today</Text>
            </Pressable>

            <Pressable
              style={[styles.presetChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleSetPreset('3days')}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              testID="period-preset-3days"
            >
              <Text style={[styles.presetText, { color: colors.foreground }]}>3 Days</Text>
            </Pressable>

            <Pressable
              style={[styles.presetChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleSetPreset('1week')}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              testID="period-preset-1week"
            >
              <Text style={[styles.presetText, { color: colors.foreground }]}>1 Week</Text>
            </Pressable>

            <Pressable
              style={[styles.presetChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleSetPreset('2weeks')}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              testID="period-preset-2weeks"
            >
              <Text style={[styles.presetText, { color: colors.foreground }]}>2 Weeks</Text>
            </Pressable>

            <Pressable
              style={[
                styles.presetChip,
                {
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0.12)',
                  borderColor: isDark ? '#EF4444' : '#DC2626',
                },
              ]}
              onPress={() => handleSetPreset('clear')}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              testID="period-preset-clear"
            >
              <Text style={[styles.presetText, { color: isDark ? '#F87171' : '#DC2626' }]}>Clear</Text>
            </Pressable>
          </View>

          {/* Start / End Date Selector Tabs */}
          <View style={styles.selectorTabsRow}>
            {/* Start Date Box (Top) */}
            <Pressable
              onPress={() => setActiveTarget('start')}
              style={[
                styles.selectorTab,
                {
                  backgroundColor:
                    activeTarget === 'start'
                      ? isDark
                        ? 'rgba(59, 130, 246, 0.22)'
                        : 'rgba(59, 130, 246, 0.12)'
                      : colors.surface,
                  borderColor: activeTarget === 'start' ? (isDark ? '#60A5FA' : colors.primary) : colors.border,
                },
              ]}
              testID="date-tab-start"
            >
              <Text style={[styles.selectorTabLabel, { color: colors.mutedForeground }]}>START DATE</Text>
              <Text
                style={[
                  styles.selectorTabValue,
                  {
                    color:
                      activeTarget === 'start'
                        ? isDark
                          ? '#60A5FA'
                          : colors.primary
                        : colors.foreground,
                  },
                ]}
              >
                {startFormatted}
              </Text>
            </Pressable>

            {/* End Date Box (Bottom / Right) */}
            <Pressable
              onPress={() => setActiveTarget('end')}
              style={[
                styles.selectorTab,
                {
                  backgroundColor:
                    activeTarget === 'end'
                      ? isDark
                        ? 'rgba(59, 130, 246, 0.22)'
                        : 'rgba(59, 130, 246, 0.12)'
                      : colors.surface,
                  borderColor: activeTarget === 'end' ? (isDark ? '#60A5FA' : colors.primary) : colors.border,
                },
              ]}
              testID="date-tab-end"
            >
              <Text style={[styles.selectorTabLabel, { color: colors.mutedForeground }]}>END DATE</Text>
              <Text
                style={[
                  styles.selectorTabValue,
                  {
                    color:
                      activeTarget === 'end'
                        ? isDark
                          ? '#60A5FA'
                          : colors.primary
                        : colors.foreground,
                  },
                ]}
              >
                {endFormatted}
              </Text>
            </Pressable>
          </View>

          {/* Error Message */}
          {error ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0.12)',
                  borderColor: isDark ? '#EF4444' : '#DC2626',
                },
              ]}
            >
              <Text style={[styles.errorText, { color: isDark ? '#F87171' : '#DC2626' }]}>{error}</Text>
            </View>
          ) : null}

          {/* 3-Column Mobile Date Scroller: Day, Month, Year */}
          <View style={styles.scrollerContainer}>
            {renderColumn(
              'DAY',
              Array.from(
                { length: getDaysInMonth(currentActiveParts.year, currentActiveParts.month) },
                (_, i) => i + 1
              ).map((d) => ({ label: String(d).padStart(2, '0'), value: d })),
              Math.min(
                currentActiveParts.day,
                getDaysInMonth(currentActiveParts.year, currentActiveParts.month)
              ),
              (day) => updateActiveParts((p) => ({ ...p, day })),
              'day-col'
            )}

            {renderColumn(
              'MONTH',
              MONTH_NAMES.map((m, idx) => ({ label: m, value: idx })),
              currentActiveParts.month,
              (month) =>
                updateActiveParts((p) => {
                  const maxDays = getDaysInMonth(p.year, month);
                  return { ...p, month, day: Math.min(p.day, maxDays) };
                }),
              'month-col'
            )}

            {renderColumn(
              'YEAR',
              YEARS.map((y) => ({ label: String(y), value: y })),
              currentActiveParts.year,
              (year) =>
                updateActiveParts((p) => {
                  const maxDays = getDaysInMonth(year, p.month);
                  return { ...p, year, day: Math.min(p.day, maxDays) };
                }),
              'year-col'
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.modalFooter}>
            <Button
              variant="outline"
              size="default"
              onPress={onClose}
              style={{ flex: 1 }}
              testID="cancel-period-btn"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="default"
              icon={<Check size={16} color={colors.primaryForeground} />}
              onPress={handleSave}
              style={{ flex: 2 }}
              testID="save-period-btn"
            >
              Apply Period
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 12,
    flexWrap: 'wrap',
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
    minHeight: 36,
  },
  presetText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
  },
  selectorTabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  selectorTab: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 48,
  },
  selectorTabLabel: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
    lineHeight: 18,
  },
  selectorTabValue: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
  },
  errorBanner: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  errorText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  scrollerContainer: {
    flexDirection: 'row',
    gap: 8,
    height: 180,
    marginBottom: 16,
  },
  columnContainer: {
    flex: 1,
  },
  columnHeader: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  columnScroll: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  columnItem: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  columnItemText: {
    fontFamily: 'Calibri',
    fontSize: 14,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
  },
});
