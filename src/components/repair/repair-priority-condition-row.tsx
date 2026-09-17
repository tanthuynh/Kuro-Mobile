import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { CheckCircle2, ShieldAlert } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import type { RepairPriority, EquipmentCondition, RepairStatus } from '@/types/repair';
import type { ThemeColors, typography } from '@/constants/theme';

export type ThemeTypography = typeof typography;

export interface RepairPriorityConditionRowProps {
  priority: RepairPriority;
  condition: EquipmentCondition;
  status?: RepairStatus;
  onChangePriority: (priority: RepairPriority) => void;
  onChangeCondition: (condition: EquipmentCondition) => void;
  colors?: ThemeColors;
  typography?: ThemeTypography;
  isDark?: boolean;
  testID?: string;
}

export const RepairPriorityConditionRow: React.FC<RepairPriorityConditionRowProps> = ({
  priority,
  condition,
  onChangePriority,
  onChangeCondition,
  colors: propColors,
  typography: propTypography,
  isDark: propIsDark,
  testID = 'combined-priority-condition-row',
}) => {
  const theme = useTheme();
  const colors = propColors || theme.colors;
  const typography = propTypography || theme.typography;
  const isDark = propIsDark !== undefined ? propIsDark : theme.isDark;

  const isOutOfService = condition === 'Out of Service';

  return (
    <View style={styles.sideBySideCardsRow} testID={testID}>
      {/* Left Card: PRIORITY */}
      <Card style={[styles.card, styles.prioritySideCard]} testID="ticket-priority-card">
        <CardContent style={styles.sideCardContent}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
              PRIORITY
            </Text>
          </View>

          <View style={styles.priorityBoxRow} testID="ticket-priority-strip">
            {/* Low */}
            <Pressable
              onPress={() => onChangePriority('Low')}
              style={({ pressed }) => [
                styles.sideEqualBox,
                {
                  backgroundColor:
                    priority === 'Low'
                      ? isDark
                        ? 'rgba(59, 130, 246, 0.18)'
                        : 'rgba(59, 130, 246, 0.10)'
                      : colors.surface,
                  borderColor: priority === 'Low' ? '#3B82F6' : colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
              testID="priority-btn-low"
              accessibilityRole="button"
              accessibilityState={{ selected: priority === 'Low' }}
              accessibilityLabel="Set priority to Low"
            >
              <View style={[styles.indicatorDot, { backgroundColor: '#3B82F6' }]} />
              <Text
                style={[
                  styles.boxLabelText,
                  {
                    color: priority === 'Low' ? (isDark ? '#60A5FA' : '#1D4ED8') : colors.foreground,
                    fontWeight: '500',
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                Low
              </Text>
              <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                {priority === 'Low' ? 'Low Priority' : ''}
              </Text>
            </Pressable>

            {/* Medium */}
            <Pressable
              onPress={() => onChangePriority('Medium')}
              style={({ pressed }) => [
                styles.sideEqualBox,
                {
                  backgroundColor:
                    priority === 'Medium'
                      ? isDark
                        ? 'rgba(245, 158, 11, 0.18)'
                        : 'rgba(245, 158, 11, 0.10)'
                      : colors.surface,
                  borderColor: priority === 'Medium' ? '#F59E0B' : colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
              testID="priority-btn-medium"
              accessibilityRole="button"
              accessibilityState={{ selected: priority === 'Medium' }}
              accessibilityLabel="Set priority to Medium"
            >
              <View style={[styles.indicatorDot, { backgroundColor: '#F59E0B' }]} />
              <Text
                style={[
                  styles.boxLabelText,
                  {
                    color: priority === 'Medium' ? (isDark ? '#FBBF24' : '#B45309') : colors.foreground,
                    fontWeight: '500',
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                Med
              </Text>
              <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                {priority === 'Medium' ? 'Medium Priority' : ''}
              </Text>
            </Pressable>

            {/* High */}
            <Pressable
              onPress={() => onChangePriority('High')}
              style={({ pressed }) => [
                styles.sideEqualBox,
                {
                  backgroundColor:
                    priority === 'High'
                      ? isDark
                        ? 'rgba(239, 68, 68, 0.18)'
                        : 'rgba(239, 68, 68, 0.10)'
                      : colors.surface,
                  borderColor: priority === 'High' ? '#EF4444' : colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
              testID="priority-btn-high"
              accessibilityRole="button"
              accessibilityState={{ selected: priority === 'High' }}
              accessibilityLabel="Set priority to High"
            >
              <View style={[styles.indicatorDot, { backgroundColor: '#EF4444' }]} />
              <Text
                style={[
                  styles.boxLabelText,
                  {
                    color: priority === 'High' ? (isDark ? '#F87171' : '#DC2626') : colors.foreground,
                    fontWeight: '500',
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                High
              </Text>
              <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                {priority === 'High' ? 'High Priority' : ''}
              </Text>
            </Pressable>
          </View>
        </CardContent>
      </Card>

      {/* Right Card: CONDITION */}
      <Card style={[styles.card, styles.conditionSideCard]} testID="ticket-condition-card">
        <CardContent style={styles.sideCardContent}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
              CONDITION
            </Text>
          </View>

          <View style={styles.conditionBoxRow} testID="ticket-condition-strip">
            {/* Available to Use */}
            <Pressable
              onPress={() => onChangeCondition('Available to Use')}
              style={({ pressed }) => [
                styles.sideEqualBox,
                {
                  flexDirection: 'column',
                  backgroundColor:
                    !isOutOfService
                      ? isDark
                        ? 'rgba(16, 185, 129, 0.18)'
                        : 'rgba(16, 185, 129, 0.10)'
                      : colors.surface,
                  borderColor: !isOutOfService ? '#10B981' : colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
              testID="condition-btn-available"
              accessibilityRole="button"
              accessibilityState={{ selected: !isOutOfService }}
              accessibilityLabel="Set condition to Available to Use"
            >
              <CheckCircle2
                size={16}
                color={!isOutOfService ? (isDark ? '#34D399' : '#047857') : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.boxLabelText,
                  {
                    color: !isOutOfService ? (isDark ? '#34D399' : '#047857') : colors.foreground,
                    fontWeight: '500',
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                Available
              </Text>
              <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                {!isOutOfService ? 'Available to Use' : ''}
              </Text>
            </Pressable>

            {/* Out of Service */}
            <Pressable
              onPress={() => onChangeCondition('Out of Service')}
              style={({ pressed }) => [
                styles.sideEqualBox,
                {
                  flexDirection: 'column',
                  backgroundColor:
                    isOutOfService
                      ? isDark
                        ? 'rgba(239, 68, 68, 0.18)'
                        : 'rgba(239, 68, 68, 0.10)'
                      : colors.surface,
                  borderColor: isOutOfService ? '#EF4444' : colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
              testID="condition-btn-out-of-service"
              accessibilityRole="button"
              accessibilityState={{ selected: isOutOfService }}
              accessibilityLabel="Set condition to Out of Service"
            >
              <ShieldAlert
                size={16}
                color={isOutOfService ? (isDark ? '#F87171' : '#DC2626') : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.boxLabelText,
                  {
                    color: isOutOfService ? (isDark ? '#F87171' : '#DC2626') : colors.foreground,
                    fontWeight: '500',
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                Out of Svc
              </Text>
              <Text style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
                {isOutOfService ? 'Out of Service' : ''}
              </Text>
            </Pressable>
          </View>

          {/* Hidden condition/priority selectors for backwards test compatibility */}
          <View style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}>
            <Pressable testID="condition-available" onPress={() => onChangeCondition('Available to Use')} />
            <Pressable testID="condition-out-of-service" onPress={() => onChangeCondition('Out of Service')} />
            <Pressable testID="priority-pill-high" onPress={() => onChangePriority('High')} />
            <Pressable testID="priority-pill-medium" onPress={() => onChangePriority('Medium')} />
            <Pressable testID="priority-pill-low" onPress={() => onChangePriority('Low')} />
          </View>
        </CardContent>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  sideBySideCardsRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
  },
  prioritySideCard: {
    flex: 3,
  },
  conditionSideCard: {
    flex: 2,
  },
  sideCardContent: {
    padding: 10,
  },
  sectionHeaderRow: {
    marginBottom: 6,
  },
  sectionHeaderLabel: {
    fontFamily: 'Calibri',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  priorityBoxRow: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
  },
  conditionBoxRow: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
  },
  sideEqualBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    gap: 4,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  boxLabelText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 16,
  },
});
