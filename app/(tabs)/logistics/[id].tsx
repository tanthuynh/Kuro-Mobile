/**
 * app/logistics/[id].tsx
 * Logistics Job Detail Screen in Kuro Mobile.
 * Refactored to match Repair Detail styling: bracketed [#eventNumber] title,
 * header tracking status badge, 3-button (Play/Pause/Finish) controls row,
 * simplified Job Overview with vehicle name lookup and QuickStatusSelector,
 * and standard uppercase typography.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Truck,
  MapPin,
  User,
  Radio,
  Play,
  Pause,
  CheckCircle2,
  Sliders,
  FileText,
  AlertTriangle,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { useLogisticsJob } from '@/hooks/use-logistics';
import {
  startTrackingJob,
  stopTrackingJob,
  isTrackingActive,
  getActiveTrackingJobId,
  isTrackingSuspended,
  getSuspendedTrackingJobId,
  addLocationListener,
  addSyncStatusListener,
  getSyncStatus,
  checkLocationPermissions,
  getLastTrackingFailureReason,
  type SyncStatusInfo,
} from '@/services/location-tracking-service';
import { fetchVehicleById, formatVehicleDisplayName } from '@/services/logistics-service';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QuickStatusSelector } from '@/components/repair/quick-status-selector';
import { LogisticsDestinationCard } from '@/components/logistics/LogisticsDestinationCard';
import { LogisticsNotesModal } from '@/components/logistics/LogisticsNotesModal';
import { useConsistentBack } from '@/hooks/use-consistent-back';
import { isJobActive, isJobCompleted, isJobScheduled } from '@/lib/logistics-engine';
import type { LogisticsStatus } from '@/types/logistics';

export default function LogisticsJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = Array.isArray(id) ? id[0] : id || '';

  const router = useRouter();
  const { colors, typography, spacing, isDark } = useTheme();
  const { user, tenant } = useAuth();

  const {
    job,
    loading,
    error,
    updateStatus,
    addNote,
    refresh,
  } = useLogisticsJob(jobId);

  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [isStartingTracking, setIsStartingTracking] = useState(false);
  const [isPausingTracking, setIsPausingTracking] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [vehicleDisplayName, setVehicleDisplayName] = useState<string | null>(null);
  const [isDeviceTracking, setIsDeviceTracking] = useState<boolean>(() => {
    return isTrackingActive() && getActiveTrackingJobId() === jobId;
  });
  const [isSuspended, setIsSuspended] = useState<boolean>(() => {
    return isTrackingSuspended() && getSuspendedTrackingJobId() === jobId;
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo>(() => getSyncStatus());

  // Listen to device tracking, suspended session, and sync status updates
  useEffect(() => {
    const updateTracking = () => {
      setIsDeviceTracking(isTrackingActive() && getActiveTrackingJobId() === jobId);
      setIsSuspended(isTrackingSuspended() && getSuspendedTrackingJobId() === jobId);
    };
    updateTracking();

    const unsubLoc = addLocationListener(() => {
      updateTracking();
    });
    const unsubSync = addSyncStatusListener((statusInfo) => {
      setSyncStatus(statusInfo);
      updateTracking();
    });

    return () => {
      unsubLoc();
      unsubSync();
    };
  }, [jobId]);

  const tenantId = user?.tenantId || tenant?.tenantId || job?.tenantId || '';

  // Resolve vehicle name from vehicleId
  useEffect(() => {
    let isMounted = true;

    const resolveVehicle = async () => {
      if (!job?.vehicleId || !job.vehicleId.trim()) {
        if (isMounted) setVehicleDisplayName(null);
        return;
      }

      try {
        const vehicle = await fetchVehicleById(job.vehicleId, tenantId);
        if (!isMounted) return;
        setVehicleDisplayName(formatVehicleDisplayName(vehicle, job.vehicleId));
      } catch {
        if (isMounted) setVehicleDisplayName(job.vehicleId);
      }
    };

    resolveVehicle();

    return () => {
      isMounted = false;
    };
  }, [job?.vehicleId, tenantId]);

  // Core execution helper for starting GPS tracking with permission recovery alert
  const executeStartTracking = async (onSuccessStatus?: string) => {
    if (!job) return;
    try {
      setIsStartingTracking(true);
      setActionError(null);

      const trackingStarted = await startTrackingJob(job.id, tenantId, {
        driverId: user?.id || user?.uid,
        driverName: user?.name || user?.email,
      });

      if (!trackingStarted) {
        const failureReason = getLastTrackingFailureReason();
        let alertTitle = 'Location Permission Required';
        let alertMessage =
          'Location access is required to record route telemetry and dispatch ETA updates. Please enable location permissions in Settings.';

        if (failureReason === 'services_disabled') {
          alertTitle = 'Location Services Disabled';
          alertMessage =
            'Device location services are turned off. Please enable GPS in device Settings to begin route tracking.';
        } else if (failureReason === 'approximate_only') {
          alertTitle = 'Precise Location Required';
          alertMessage =
            'Kuro Mobile requires precise GPS location to track driver routes and calculate ETAs. Please allow precise location access in Settings.';
        }

        Alert.alert(
          alertTitle,
          alertMessage,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (typeof Linking.openSettings === 'function') {
                  Linking.openSettings().catch(() => {});
                }
              },
            },
          ]
        );
        setActionError(alertMessage);
        return;
      }

      if (onSuccessStatus) {
        await updateStatus(onSuccessStatus, `Status updated to ${onSuccessStatus} via Quick Status`);
      } else {
        await updateStatus('In Progress', 'Driver started route and initiated GPS tracking');
      }
    } catch (err: any) {
      console.error('[LogisticsDetail] Tracking activation error:', err);
      setActionError(err?.message || 'Failed to start GPS tracking and activate job');
    } finally {
      setIsStartingTracking(false);
    }
  };

  // Play Action: Starts GPS tracking and updates status to 'In Progress'
  const handlePlay = async () => {
    if (!job) return;
    await executeStartTracking();
  };

  // Pause Action: Stops GPS tracking and leaves job status unchanged
  const handlePause = async () => {
    if (!job) return;
    try {
      setIsPausingTracking(true);
      setActionError(null);

      // 1. Stop GPS tracking
      await stopTrackingJob(job.id);
    } catch (err: any) {
      console.error('[LogisticsDetail] Pause error:', err);
      setActionError(err?.message || 'Failed to pause GPS tracking');
    } finally {
      setIsPausingTracking(false);
    }
  };

  // Finish Action: Updates status to 'Completed' FIRST, and stops GPS tracking only after confirmation (R6)
  const handleFinish = async () => {
    if (!job) return;
    try {
      setIsCompleting(true);
      setActionError(null);

      // 1. Update status to Completed first
      await updateStatus('Completed', 'Driver marked job as completed');

      // 2. Stop GPS tracking only after update status succeeds
      await stopTrackingJob(job.id);
    } catch (err: any) {
      console.error('[LogisticsDetail] Finish error:', err);
      setActionError(err?.message || 'Failed to complete job. GPS tracking remains active — please retry.');
    } finally {
      setIsCompleting(false);
    }
  };

  // Quick Status Selector Submit Handler
  const handleQuickStatusSelect = async (newStatus: string) => {
    if (!job || isUpdatingStatus) return;
    try {
      setIsUpdatingStatus(true);
      setActionError(null);

      // If transitioning to completed or cancelled, update status first, then stop tracking (R6)
      if (isJobCompleted(newStatus) || newStatus.toLowerCase() === 'cancelled' || newStatus.toLowerCase() === 'cancel') {
        await updateStatus(newStatus, `Status updated to ${newStatus} via Quick Status`);
        await stopTrackingJob(job.id);
      } else if (isJobActive(newStatus) && !job.isTrackingActive) {
        // If transitioning to active status and tracking is off, start tracking
        await executeStartTracking(newStatus);
      } else {
        await updateStatus(newStatus, `Status updated to ${newStatus} via Quick Status`);
      }
    } catch (err: any) {
      console.error('[LogisticsDetail] Quick status error:', err);
      setActionError(err?.message || `Failed to update status to ${newStatus}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Notes Modal Submit Handler (adds internal note via logistics hook)
  const handleNotesModalSubmit = async (note: string) => {
    if (!job) return;
    setActionError(null);
    try {
      await addNote(note);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to add note');
    }
  };

  const getStatusBadgeVariant = (status?: LogisticsStatus): BadgeVariant => {
    if (!status) return 'secondary';
    const s = status.trim().toLowerCase();

    if (isJobActive(status)) {
      return 'brand';
    }
    if (isJobCompleted(status)) {
      return 'success';
    }
    if (isJobScheduled(status)) {
      return 'warning';
    }
    if (s === 'cancelled' || s === 'canceled') {
      return 'destructive';
    }
    return 'secondary';
  };

  // Back Navigation handler: Deterministically returns to the Logistics feed,
  // intercepting open modals first.
  const { handleBack } = useConsistentBack({
    fallbackRoute: '/(tabs)/logistics',
    onBeforeBack: () => {
      if (isAddNoteOpen) {
        setIsAddNoteOpen(false);
        return true;
      }
      return false;
    },
  });

  if (loading && !job) {
    return (
      <View style={[styles.screen, styles.centerContainer, { backgroundColor: colors.background }]} testID="logistics-detail-loading">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 12, fontSize: typography.fontSize.sm }]}>
          Loading logistics job details...
        </Text>
      </View>
    );
  }

  if (error || !job) {
    return (
      <View style={[styles.screen, styles.centerContainer, { backgroundColor: colors.background }]} testID="logistics-detail-error">
        <AlertTriangle size={36} color={colors.destructive} />
        <Text style={[styles.errorTitle, { color: colors.foreground, marginTop: 12, fontSize: typography.fontSize.base }]}>
          Logistics Job Not Found
        </Text>
        <Text style={[styles.errorSub, { color: colors.mutedForeground, marginTop: 4, fontSize: typography.fontSize.sm }]}>
          {error?.message || (jobId ? 'The requested logistics job could not be loaded.' : 'No Logistics Job ID was provided in the route.')}
        </Text>
        <Button
          variant="outline"
          size="default"
          onPress={handleBack}
          style={{ marginTop: 16 }}
          testID="job-not-found-back-btn"
        >
          Return to Logistics
        </Button>
      </View>
    );
  }

  const idBadgeDisplay =
    job.eventNumber !== undefined && job.eventNumber !== null
      ? `[${job.eventNumber}]`
      : job.id
      ? `[${job.id.substring(0, 7).toUpperCase()}]`
      : undefined;
  const titleDisplay = job.eventName || job.location || 'Transport Job';

  const isDocTrackingActive = Boolean(job.isTrackingActive);
  const isPermissionDenied = syncStatus.status === 'permission_denied';
  const isJobInProgress = isJobActive(job.status) || isDocTrackingActive;
  const showPermissionRevokedWarning = isSuspended || (isPermissionDenied && isJobInProgress);
  // Never show tracking as active when the required permission is unavailable or suspended
  const isTracking = !showPermissionRevokedWarning && !isPermissionDenied && (isDeviceTracking || isDocTrackingActive);
  const isCompleted = isJobCompleted(job.status);

  const userId = user?.id || (user as any)?.uid;
  const isAssignedDriver = Boolean(userId && (userId === job.assigneeId || userId === job.driverId));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="logistics-detail-screen">
      {/* Top Header */}
      <ScreenHeader
        title={titleDisplay}
        idBadge={idBadgeDisplay}
        onBack={handleBack}
        backTestID="logistics-detail-back-btn"
        backAccessibilityLabel="Go back to Logistics Feed"
        rightAction={
          <Badge variant={getStatusBadgeVariant(job.status)} testID="header-job-status-badge">
            {job.status}
          </Badge>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Offline sync notification banner */}
        {syncStatus.status === 'offline_failed' ? (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B' }]} testID="offline-sync-warning">
            <AlertTriangle size={14} color="#F59E0B" />
            <Text style={[styles.errorBannerText, { color: '#F59E0B', fontSize: typography.fontSize.sm }]}>
              GPS Sync Offline: Live location updates are pending network reconnection.
            </Text>
          </View>
        ) : null}

        {/* Permission revoked warning banner (R3) */}
        {showPermissionRevokedWarning ? (
          <View testID="permission-revoked-warning" style={styles.warningBanner}>
            <AlertTriangle size={16} color={colors.destructive} />
            <Text style={styles.warningText}>
              Location permission revoked. Please re-enable in Settings to resume tracking.
            </Text>
            <Pressable onPress={() => Linking.openSettings().catch(() => {})}>
              <Text style={styles.settingsLink}>Open Settings</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Error notification if action failed */}
        {actionError ? (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: colors.destructive }]}>
            <AlertTriangle size={14} color={colors.destructive} />
            <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.sm }]}>
              {actionError}
            </Text>
          </View>
        ) : null}

        {/* Tracking Controls Card */}
        <Card style={styles.card} testID="job-controls-card">
          <CardContent style={{ padding: 14, gap: 12 }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
                TRACKING
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Start/Pause Toggle Button */}
              <Button
                variant={isTracking ? 'outline' : 'primary'}
                size="default"
                icon={isTracking ? <Pause size={16} color={colors.foreground} /> : <Play size={16} color={colors.primaryForeground} />}
                onPress={isTracking ? handlePause : handlePlay}
                loading={isTracking ? isPausingTracking : isStartingTracking}
                disabled={(isTracking ? isPausingTracking : isStartingTracking) || !isAssignedDriver}
                style={styles.controlBtn}
                testID={isTracking ? 'pause-job-btn' : 'play-job-btn'}
                accessibilityLabel={isTracking ? 'Pause tracking' : 'Start tracking'}
              >
                {isTracking ? 'Pause' : 'Start'}
              </Button>

              {/* Finish Button */}
              <Button
                variant="primary"
                size="default"
                icon={<CheckCircle2 size={16} color={colors.primaryForeground} />}
                onPress={handleFinish}
                loading={isCompleting}
                disabled={isCompleting || isCompleted || !isAssignedDriver}
                style={[styles.controlBtn, { backgroundColor: colors.status.online }]}
                testID="finish-job-btn"
                accessibilityLabel="Finish and complete job"
              >
                Finish
              </Button>
            </View>
          </CardContent>
        </Card>

        {/* Job Overview & Metadata Card */}
        <Card style={styles.card} testID="job-overview-card">
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
                    {vehicleDisplayName || job.vehicleId || 'Not Assigned'}
                  </Text>
                </View>
              </View>
            </View>

            {/* QuickStatusSelector (Pending is disabled for drivers) */}
            <View style={styles.quickStatusContainer}>
              <QuickStatusSelector
                currentStatus={job.status}
                statuses={['Pending', 'Planned', 'In Progress', 'Completed', 'Cancelled']}
                disabledStatuses={['Pending']}
                onSelectStatus={handleQuickStatusSelect}
                isUpdating={isUpdatingStatus}
                showHeader={true}
                headerTitle="STATUS"
                testID="job-quick-status-selector"
              />
            </View>
          </CardContent>
        </Card>

        {/* Destination Stops List */}
        <View style={styles.stopsSection} testID="destination-stops-section">
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeaderLabel, { color: colors.mutedForeground }]}>
              DESTINATION STOPS ({Math.max(0, (job.destinations?.length || 0) - 1)})
            </Text>
          </View>

          {!job.destinations || job.destinations.length === 0 ? (
            <Card style={styles.card}>
              <CardContent style={styles.emptyStopsContent}>
                <MapPin size={24} color={colors.mutedForeground} />
                <Text style={[styles.emptyStopsText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                  No destinations or itinerary stops specified for this job.
                </Text>
              </CardContent>
            </Card>
          ) : (
            job.destinations.map((dest, idx) => (
              <LogisticsDestinationCard
                key={dest.id || `stop-${idx}`}
                destination={dest}
                index={idx}
                totalStops={job.destinations!.length}
                testID={`destination-stop-${dest.id || idx}`}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom Action Pane above Bottom Tab Bar */}
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
      >
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon={<FileText size={16} color={colors.primaryForeground} />}
          onPress={() => setIsAddNoteOpen(true)}
          style={[styles.bottomBarButton, { backgroundColor: colors.brandGreen }]}
          testID="add-note-btn"
        >
          Add Note
        </Button>
      </View>

      {/* Add Note Modal */}
      <LogisticsNotesModal
        visible={isAddNoteOpen}
        onClose={() => setIsAddNoteOpen(false)}
        onSubmit={handleNotesModalSubmit}
        authorName={user?.name || user?.email || 'Driver'}
        testID="job-notes-modal"
      />

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
  errorTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  errorSub: {
    fontFamily: 'Calibri',
    textAlign: 'center',
  },
  backBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorBannerText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
  },
  warningText: {
    flex: 1,
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  settingsLink: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '700',
    color: '#3B82F6',
    textDecorationLine: 'underline',
  },
  card: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  controlButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  controlBtn: {
    flex: 1,
    minHeight: 48,
  },
  bottomActionBar: {
    paddingTop: 8,
    paddingBottom: 18,
    flexDirection: 'row',
  },
  bottomBarButton: {
    flex: 1,
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
  overviewCardContent: {
    padding: 14,
    gap: 12,
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
  quickStatusContainer: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  stopsSection: {
    gap: 8,
  },
  emptyStopsContent: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyStopsText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
