/**
 * src/components/logistics/logistics-job-overview-card.tsx
 * Modular Job Overview Card for Logistics Job Detail.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { User, Truck, Radio, Building2 } from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QuickStatusSelector } from '@/components/repair/quick-status-selector';
import type { LogisticsEntry } from '@/types/logistics';

export interface LogisticsJobOverviewCardProps {
  /** Core logistics entry containing driverName, vehicleId, status, destinations, etc. */
  job: LogisticsEntry;
  /** Formatted vehicle name + rego (e.g. "Van 04 (NSW-KURO1)") */
  vehicleDisplayName?: string | null;
  /** Whether live GPS tracking is currently active */
  isTracking: boolean;
  /** Whether location permission has been revoked or tracking suspended mid-job */
  showPermissionRevokedWarning?: boolean;
  /** Callback triggered when a status pill is selected in QuickStatusSelector */
  onSelectStatus: (newStatus: string) => void | Promise<void>;
  /** Whether an asynchronous status transition is in flight */
  isUpdatingStatus?: boolean;
  /** Optional client or organizer name */
  clientName?: string | null;
  /** Optional custom testID (defaults to 'job-overview-card') */
  testID?: string;
}

export function LogisticsJobOverviewCard({
  job,
  vehicleDisplayName,
  isTracking,
  showPermissionRevokedWarning = false,
  onSelectStatus,
  isUpdatingStatus = false,
  clientName,
  testID = 'job-overview-card',
}: LogisticsJobOverviewCardProps) {
  const { colors, typography } = useTheme();

  return (
    <Card style={styles.card} testID={testID}>
      <CardContent style={styles.overviewCardContent}>
        {/* Section Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
            JOB OVERVIEW
          </Text>
          <Badge
            variant={showPermissionRevokedWarning ? 'destructive' : isTracking ? 'brand' : 'secondary'}
            icon={isTracking ? <Radio size={12} color={colors.primary} /> : undefined}
            testID="detail-tracking-status-badge"
          >
            {showPermissionRevokedWarning ? 'Permission Required' : isTracking ? 'Tracking' : 'Idle'}
          </Badge>
        </View>

        {/* Driver and Vehicle Row */}
        <View style={styles.driverVehicleRow}>
          {/* Driver */}
          <View style={styles.overviewField}>
            <Text style={[styles.overviewLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
              Driver
            </Text>
            <View style={styles.fieldValueRow}>
              <User size={15} color={colors.primary} />
              <Text style={[styles.overviewValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {job.driverName || 'Unassigned'}
              </Text>
            </View>
          </View>

          {/* Vehicle */}
          <View style={styles.overviewField}>
            <Text style={[styles.overviewLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
              Vehicle
            </Text>
            <View style={styles.fieldValueRow}>
              <Truck size={15} color={colors.primary} />
              <Text style={[styles.overviewValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {vehicleDisplayName || job.vehicleName || job.vehicleId || 'Not Assigned'}
              </Text>
            </View>
          </View>
        </View>

        {/* Optional Client / Event Organizer Metadata Row */}
        {(clientName || (job as any).clientName) && (
          <View style={styles.clientMetadataRow}>
            <Building2 size={14} color={colors.mutedForeground} />
            <Text style={[styles.clientMetadataText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Client: {clientName || (job as any).clientName}
            </Text>
          </View>
        )}

        {/* QuickStatusSelector (Pending is disabled for drivers) */}
        <View style={styles.quickStatusContainer}>
          <QuickStatusSelector
            currentStatus={job.status}
            statuses={['Pending', 'Planned', 'In Progress', 'Completed', 'Cancelled']}
            disabledStatuses={['Pending']}
            onSelectStatus={onSelectStatus}
            isUpdating={isUpdatingStatus}
            showHeader={true}
            headerTitle="STATUS"
            testID="job-quick-status-selector"
          />
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  overviewCardContent: {
    padding: 14,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeaderLabel: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 18,
  },
  driverVehicleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  overviewField: {
    flex: 1,
    gap: 4,
  },
  overviewLabel: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overviewValue: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  clientMetadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  clientMetadataText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
  quickStatusContainer: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
});
