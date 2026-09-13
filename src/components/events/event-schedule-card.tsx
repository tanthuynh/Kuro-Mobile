/**
 * src/components/events/event-schedule-card.tsx
 * Vertical timeline and stepper component displaying the 5 operational stage windows:
 * 1. Planning (startTime -> finishTime)
 * 2. Setup / Load-In (deliveryTime -> setupTime)
 * 3. Rehearsal (rehearsalTime)
 * 4. Show / Event (eventStartDate -> eventFinishDate)
 * 5. Packdown / Load-Out (pickupTime -> packdownTime)
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import {
  Calendar,
  Truck,
  Music,
  Tv,
  PackageCheck,
  CheckCircle2,
  Clock,
  Radio,
} from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatStageTime } from '@/lib/date-utils';
import type { Event } from '@/types/events';

export interface EventScheduleCardProps {
  event: Event;
  currentDate?: Date;
  testID?: string;
}

interface StageDefinition {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ComponentType<any>;
  start: Date | null;
  end: Date | null;
  isSinglePoint?: boolean;
}

export const EventScheduleCard: React.FC<EventScheduleCardProps> = ({
  event,
  currentDate = new Date(),
  testID,
}) => {
  const { colors, typography, spacing, layout } = useTheme();

  // Pulse animation for active stage
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const stages: StageDefinition[] = [
    {
      id: 'planning',
      name: 'Planning Period',
      subtitle: 'Office & Preparation',
      icon: Calendar,
      start: event.startTime,
      end: event.finishTime,
    },
    {
      id: 'setup',
      name: 'Setup / Load-In',
      subtitle: 'Delivery to Setup Complete',
      icon: Truck,
      start: event.deliveryTime,
      end: event.setupTime,
    },
    {
      id: 'rehearsal',
      name: 'Rehearsal',
      subtitle: 'Soundcheck & Technical Run',
      icon: Music,
      start: event.rehearsalTime || null,
      end: null,
      isSinglePoint: true,
    },
    {
      id: 'show',
      name: 'Show / Event',
      subtitle: 'Live Production',
      icon: Tv,
      start: event.eventStartDate,
      end: event.eventFinishDate,
    },
    {
      id: 'packdown',
      name: 'Packdown / Load-Out',
      subtitle: 'Strike, Pack & Warehouse Return',
      icon: PackageCheck,
      start: event.pickupTime,
      end: event.packdownTime,
    },
  ];

  const now = currentDate.getTime();

  return (
    <Card testID={testID} style={styles.card}>
      <CardHeader style={styles.cardHeader}>
        <View style={styles.headerTitleRow}>
          <Clock size={18} color={colors.primary} style={{ marginRight: 8 }} />
          <Text
            style={[
              styles.headerTitle,
              { color: colors.foreground, fontSize: typography.fontSize.lg, lineHeight: typography.lineHeight.lg },
            ]}
          >
            Operational Schedule & Timeline
          </Text>
        </View>
      </CardHeader>

      <CardContent style={styles.cardContent}>
        {stages.map((stage, index) => {
          const hasDates = Boolean(stage.start || stage.end);
          const startTime = stage.start?.getTime();
          const endTime = stage.end?.getTime() || (stage.isSinglePoint ? startTime : undefined);

          let stageStatus: 'completed' | 'active' | 'upcoming' | 'unscheduled' = 'unscheduled';

          if (!hasDates) {
            stageStatus = 'unscheduled';
          } else if (endTime && now > endTime) {
            stageStatus = 'completed';
          } else if (startTime && now < startTime) {
            stageStatus = 'upcoming';
          } else if (startTime && (!endTime || (now >= startTime && now <= endTime))) {
            stageStatus = 'active';
          } else if (stage.isSinglePoint && startTime && Math.abs(now - startTime) < 3600000) {
            stageStatus = 'active';
          }

          const isLast = index === stages.length - 1;
          const IconComp = stage.icon;

          const getStatusColor = () => {
            switch (stageStatus) {
              case 'active':
                return colors.status.online;
              case 'completed':
                return colors.status.events;
              case 'upcoming':
                return colors.mutedForeground;
              case 'unscheduled':
              default:
                return colors.border;
            }
          };

          const statusColor = getStatusColor();

          return (
            <View key={stage.id} style={styles.stageRow} testID={`stage-row-${stage.id}`}>
              {/* Left Stepper Column */}
              <View style={styles.stepperCol}>
                <View
                  style={[
                    styles.nodeCircle,
                    {
                      borderColor: statusColor,
                      backgroundColor:
                        stageStatus === 'active'
                          ? 'rgba(22, 163, 74, 0.15)'
                          : stageStatus === 'completed'
                          ? 'rgba(96, 165, 250, 0.15)'
                          : colors.surface,
                    },
                  ]}
                >
                  {stageStatus === 'active' ? (
                    <Animated.View style={{ opacity: pulseAnim }}>
                      <Radio size={14} color={colors.status.online} />
                    </Animated.View>
                  ) : stageStatus === 'completed' ? (
                    <CheckCircle2 size={14} color={colors.status.events} />
                  ) : (
                    <IconComp size={14} color={statusColor} />
                  )}
                </View>

                {!isLast ? (
                  <View
                    style={[
                      styles.connectorLine,
                      {
                        backgroundColor:
                          stageStatus === 'completed' ? colors.status.events : colors.border,
                      },
                    ]}
                  />
                ) : null}
              </View>

              {/* Right Content Column */}
              <View
                style={[
                  styles.stageContent,
                  {
                    paddingBottom: isLast ? 0 : spacing.lg,
                  },
                ]}
              >
                <View style={styles.stageTitleRow}>
                  <Text
                    style={[
                      styles.stageName,
                      {
                        color:
                          stageStatus === 'active'
                            ? colors.foreground
                            : colors.cardForeground,
                        fontSize: typography.fontSize.base,
                        fontWeight: stageStatus === 'active' ? '700' : '600',
                      },
                    ]}
                  >
                    {stage.name}
                  </Text>

                  {stageStatus === 'active' ? (
                    <Badge variant="success" icon={<Radio size={10} color={colors.status.online} />}>
                      CURRENT STAGE
                    </Badge>
                  ) : stageStatus === 'completed' ? (
                    <Badge variant="outline">Completed</Badge>
                  ) : stageStatus === 'upcoming' ? (
                    <Badge variant="secondary">Upcoming</Badge>
                  ) : (
                    <Badge variant="outline">TBD</Badge>
                  )}
                </View>

                <Text
                  style={[
                    styles.stageSubtitle,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm },
                  ]}
                >
                  {stage.subtitle}
                </Text>

                {/* Timing Details Box */}
                <View
                  style={[
                    styles.timingBox,
                    {
                      backgroundColor: colors.surface,
                      borderColor:
                        stageStatus === 'active'
                          ? colors.status.online
                          : colors.border,
                      borderRadius: layout.borderRadius.md,
                    },
                  ]}
                >
                  {stage.isSinglePoint ? (
                    <Text
                      style={[
                        styles.timingText,
                        { color: colors.foreground, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm },
                      ]}
                    >
                      Time: {formatStageTime(stage.start, 'dateTime')}
                    </Text>
                  ) : (
                    <>
                      <Text
                        style={[
                          styles.timingText,
                          { color: colors.foreground, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm },
                        ]}
                      >
                        Start: {formatStageTime(stage.start, 'dateTime')}
                      </Text>
                      <Text
                        style={[
                          styles.timingText,
                          { color: colors.foreground, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm },
                        ]}
                      >
                        Finish: {formatStageTime(stage.end, 'dateTime')}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </CardContent>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    paddingBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  cardContent: {
    paddingTop: 4,
  },
  stageRow: {
    flexDirection: 'row',
  },
  stepperCol: {
    width: 32,
    alignItems: 'center',
  },
  nodeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  connectorLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  stageContent: {
    flex: 1,
    marginLeft: 12,
  },
  stageTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  stageName: {
    fontFamily: 'Calibri',
  },
  stageSubtitle: {
    fontFamily: 'Calibri',
    marginBottom: 8,
  },
  timingBox: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  timingText: {
    fontFamily: 'Calibri',
  },
});
