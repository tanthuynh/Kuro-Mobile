/**
 * app/logistics/[id].tsx
 * Logistics Job Detail Screen in Kuro Mobile.
 * Displays full schedule, vehicle & driver specs, active GPS tracking banner,
 * 1-tap smart action destination stops, status management, and internal notes history.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Truck,
  MapPin,
  Calendar,
  Clock,
  User,
  Radio,
  Play,
  CheckCircle2,
  Sliders,
  Plus,
  FileText,
  AlertTriangle,
  History,
  Navigation,
  Compass,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { useLogisticsJob } from '@/hooks/use-logistics';
import { startTrackingJob, stopTrackingJob, isTrackingActive as checkTrackingActive } from '@/services/location-tracking-service';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogisticsDestinationCard } from '@/components/logistics/LogisticsDestinationCard';
import { LogisticsStatusModal } from '@/components/logistics/LogisticsStatusModal';
import { LogisticsNotesModal } from '@/components/logistics/LogisticsNotesModal';
import { parseFirestoreDate, formatStageTime, formatEventDateRange, formatTimeAgo } from '@/lib/date-utils';
import { isJobActive, isJobCompleted, isJobScheduled } from '@/lib/logistics-engine';
import type { LogisticsStatus, LogisticsEntry } from '@/types/logistics';

export default function LogisticsJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = Array.isArray(id) ? id[0] : id || '';

  const router = useRouter();
  const { colors, typography, spacing, layout } = useTheme();
  const { user, tenant } = useAuth();

  const {
    job,
    loading,
    error,
    updateStatus,
    addNote,
    refresh,
  } = useLogisticsJob(jobId);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const tenantId = user?.tenantId || tenant?.tenantId || job?.tenantId || '';

  // 1-Tap Activate Job / Start Route action
  const handleActivateJob = async () => {
    if (!job) return;
    try {
      setIsActivating(true);
      setActionError(null);

      // 1. Start background/foreground GPS tracking
      await startTrackingJob(job.id, tenantId, {
        driverId: user?.id || user?.uid,
        driverName: user?.name || user?.email,
      });

      // 2. Update status to In Progress
      await updateStatus('In Progress', 'Driver started route and initiated GPS tracking');
    } catch (err: any) {
      console.error('[LogisticsDetail] Activate job error:', err);
      setActionError(err?.message || 'Failed to activate job and start GPS tracking');
    } finally {
      setIsActivating(false);
    }
  };

  // 1-Tap Complete Job action
  const handleCompleteJob = async () => {
    if (!job) return;
    try {
      setIsCompleting(true);
      setActionError(null);

      // 1. Stop GPS tracking
      await stopTrackingJob(job.id);

      // 2. Update status to Completed
      await updateStatus('Completed', 'Driver marked job as completed');
    } catch (err: any) {
      console.error('[LogisticsDetail] Complete job error:', err);
      setActionError(err?.message || 'Failed to complete job');
    } finally {
      setIsCompleting(false);
    }
  };

  // Status Modal Submit Handler
  const handleStatusModalSubmit = async (newStatus: string, note?: string) => {
    if (!job) return;
    setActionError(null);

    // If new status is Completed, stop tracking
    if (isJobCompleted(newStatus)) {
      await stopTrackingJob(job.id);
    } else if (isJobActive(newStatus) && !job.isTrackingActive) {
      // If transitioning to active status, also start tracking
      await startTrackingJob(job.id, tenantId, {
        driverId: user?.id || user?.uid,
        driverName: user?.name || user?.email,
      });
    }

    await updateStatus(newStatus, note);
  };

  // Notes Modal Submit Handler
  const handleNotesModalSubmit = async (note: string) => {
    if (!job) return;
    setActionError(null);
    await addNote(note);
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

  if (loading && !job) {
    return (
      <View style={[styles.screen, styles.centerContainer, { backgroundColor: colors.background }]} testID="logistics-detail-loading">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground, marginTop: 12 }]}>
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
        <Text style={[styles.errorSub, { color: colors.mutedForeground, marginTop: 4, fontSize: typography.fontSize.xs }]}>
          {error?.message || 'The requested logistics job could not be loaded.'}
        </Text>
        <Button
          variant="outline"
          size="default"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
          testID="job-not-found-back-btn"
        >
          Go Back
        </Button>
      </View>
    );
  }

  const startDate = parseFirestoreDate(job.start);
  const endDate = parseFirestoreDate(job.end);
  const dateRangeStr = formatEventDateRange(startDate, endDate);
  const startTimeStr = startDate ? formatStageTime(startDate, 'timeOnly') : '';
  const endTimeStr = endDate ? formatStageTime(endDate, 'timeOnly') : '';
  const timeWindowStr = startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : startTimeStr || 'Not scheduled';

  const eventNumDisplay = job.eventNumber ? `#${job.eventNumber}` : `#${job.id.substring(0, 7).toUpperCase()}`;
  const titleDisplay = job.eventName || job.location || `Job ${eventNumDisplay}`;

  const isTracking = Boolean(job.isTrackingActive);
  const isActive = isJobActive(job.status);
  const isCompleted = isJobCompleted(job.status);

  // Parse internal notes lines
  const parsedNotes = (job.notes || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="logistics-detail-screen">
      {/* Top Header */}
      <ScreenHeader
        title={titleDisplay}
        subtitle={`${eventNumDisplay} • ${job.location || 'Transport Job'}`}
        leftAction={
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            testID="logistics-detail-back-btn"
            accessibilityLabel="Go back to Logistics Feed"
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </Pressable>
        }
        rightAction={
          <Button
            variant="outline"
            size="sm"
            icon={<Plus size={14} color={colors.primary} />}
            onPress={() => setIsNotesModalOpen(true)}
            testID="detail-add-note-btn"
          >
            Note
          </Button>
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
        {/* Error notification if action failed */}
        {actionError ? (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: colors.destructive }]}>
            <AlertTriangle size={14} color={colors.destructive} />
            <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
              {actionError}
            </Text>
          </View>
        ) : null}

        {/* Live GPS Tracking Banner */}
        <Card style={styles.card} testID="live-gps-tracking-banner">
          <CardContent
            style={[
              styles.trackingBannerContent,
              {
                backgroundColor: isTracking
                  ? 'rgba(34, 197, 94, 0.12)'
                  : colors.muted,
                borderColor: isTracking ? colors.primary : colors.border,
              },
            ]}
          >
            <View style={styles.trackingHeader}>
              <View style={styles.trackingHeaderLeft}>
                <Radio size={16} color={isTracking ? colors.primary : colors.mutedForeground} />
                <Text
                  style={[
                    styles.trackingTitle,
                    {
                      color: isTracking ? colors.primary : colors.foreground,
                      fontSize: typography.fontSize.sm,
                    },
                  ]}
                >
                  {isTracking ? 'GPS Tracking Active' : 'GPS Tracking Inactive'}
                </Text>
              </View>

              <Badge variant={isTracking ? 'brand' : 'secondary'} testID="tracking-status-badge">
                {isTracking ? 'BROADCASTING' : 'IDLE'}
              </Badge>
            </View>

            {isTracking && job.currentLocation ? (
              <View style={styles.coordsBlock}>
                <Text style={[styles.coordsText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                  Lat: {job.currentLocation.latitude.toFixed(5)}, Lng: {job.currentLocation.longitude.toFixed(5)}
                </Text>
                {job.lastLocationUpdate ? (
                  <Text style={[styles.coordsSub, { color: colors.mutedForeground, fontSize: 11 }]}>
                    Last ping: {formatTimeAgo(job.lastLocationUpdate)}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.trackingSubtitle, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                {isCompleted
                  ? 'Job is marked completed. Location tracking stopped.'
                  : 'Start route to begin live location updates for fleet monitoring.'}
              </Text>
            )}
          </CardContent>
        </Card>

        {/* Quick Action Control Bar */}
        <Card style={styles.card} testID="job-action-buttons-card">
          <CardContent style={styles.actionsGrid}>
            {!isActive && !isCompleted ? (
              <Button
                variant="primary"
                size="default"
                icon={<Play size={16} color={colors.primaryForeground} />}
                onPress={handleActivateJob}
                loading={isActivating}
                disabled={isActivating}
                style={styles.actionBtn}
                testID="activate-job-btn"
              >
                Activate Job / Start Route
              </Button>
            ) : null}

            {isActive && !isCompleted ? (
              <Button
                variant="primary"
                size="default"
                icon={<CheckCircle2 size={16} color={colors.primaryForeground} />}
                onPress={handleCompleteJob}
                loading={isCompleting}
                disabled={isCompleting}
                style={[styles.actionBtn, { backgroundColor: colors.status.online }]}
                testID="complete-job-btn"
              >
                Complete Job
              </Button>
            ) : null}

            <View style={styles.secondaryActionRow}>
              <Button
                variant="outline"
                size="default"
                icon={<Sliders size={15} color={colors.foreground} />}
                onPress={() => setIsStatusModalOpen(true)}
                style={styles.halfBtn}
                testID="change-status-btn"
              >
                Change Status
              </Button>

              <Button
                variant="outline"
                size="default"
                icon={<FileText size={15} color={colors.foreground} />}
                onPress={() => setIsNotesModalOpen(true)}
                style={styles.halfBtn}
                testID="add-note-btn"
              >
                Add Note
              </Button>
            </View>
          </CardContent>
        </Card>

        {/* Job Overview & Metadata Card */}
        <Card style={styles.card} testID="job-overview-card">
          <CardHeader style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Truck size={16} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                Job Overview & Schedule
              </Text>
            </View>
            <Badge variant={getStatusBadgeVariant(job.status)} testID="detail-job-status-badge">
              {job.status}
            </Badge>
          </CardHeader>

          <CardContent style={styles.overviewGrid}>
            {/* Driver */}
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Driver
              </Text>
              <Text style={[styles.overviewValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {job.driverName || 'Unassigned'}
              </Text>
            </View>

            {/* Vehicle */}
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Vehicle Rego / ID
              </Text>
              <Text style={[styles.overviewValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {job.vehicleId || 'Not Assigned'}
              </Text>
            </View>

            {/* Location / Hub */}
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Origin / Hub
              </Text>
              <Text style={[styles.overviewValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {job.location || 'Warehouse'}
              </Text>
            </View>

            {/* Event Number */}
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Event Number
              </Text>
              <Text style={[styles.overviewValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {job.eventNumber ? `#${job.eventNumber}` : 'N/A'}
              </Text>
            </View>

            {/* Schedule Date */}
            <View style={[styles.overviewItem, { width: '100%' }]}>
              <Text style={[styles.overviewLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Scheduled Window
              </Text>
              <Text style={[styles.overviewValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {dateRangeStr} {timeWindowStr !== 'Not scheduled' ? `(${timeWindowStr})` : ''}
              </Text>
            </View>
          </CardContent>
        </Card>

        {/* Destination Stops List */}
        <View style={styles.stopsSection} testID="destination-stops-section">
          <View style={styles.stopsSectionHeader}>
            <View style={styles.stopsHeaderLeft}>
              <Navigation size={16} color={colors.primary} />
              <Text style={[styles.stopsHeaderTitle, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                Destination Stops ({job.destinations?.length || 0})
              </Text>
            </View>
          </View>

          {!job.destinations || job.destinations.length === 0 ? (
            <Card style={styles.card}>
              <CardContent style={styles.emptyStopsContent}>
                <MapPin size={24} color={colors.mutedForeground} />
                <Text style={[styles.emptyStopsText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
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

        {/* Internal Notes History */}
        <Card style={styles.card} testID="job-notes-history-card">
          <CardHeader style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <History size={16} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                Internal Notes & Activity ({parsedNotes.length})
              </Text>
            </View>
          </CardHeader>

          <CardContent style={styles.notesContent}>
            {parsedNotes.length === 0 ? (
              <Text style={[styles.emptyNotesText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                No internal notes recorded yet.
              </Text>
            ) : (
              <View style={styles.notesList}>
                {parsedNotes.map((noteLine, idx) => (
                  <View key={`note-${idx}`} style={[styles.noteRow, { borderBottomColor: colors.border }]}>
                    <FileText size={13} color={colors.primary} style={{ marginTop: 2 }} />
                    <Text style={[styles.noteLineText, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                      {noteLine}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </ScrollView>

      {/* Status Modal */}
      <LogisticsStatusModal
        visible={isStatusModalOpen}
        currentStatus={job.status}
        onClose={() => setIsStatusModalOpen(false)}
        onSubmit={handleStatusModalSubmit}
        testID="job-status-modal"
      />

      {/* Notes Modal */}
      <LogisticsNotesModal
        visible={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
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
  card: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  trackingBannerContent: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  trackingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackingTitle: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  trackingSubtitle: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  coordsBlock: {
    marginTop: 2,
    gap: 2,
  },
  coordsText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  coordsSub: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  actionsGrid: {
    padding: 12,
    gap: 8,
  },
  actionBtn: {
    width: '100%',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  halfBtn: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  overviewGrid: {
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  overviewItem: {
    width: '46%',
  },
  overviewLabel: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  overviewValue: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 1,
  },
  stopsSection: {
    gap: 8,
  },
  stopsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  stopsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopsHeaderTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  emptyStopsContent: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyStopsText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  notesContent: {
    padding: 14,
  },
  emptyNotesText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  notesList: {
    gap: 8,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  noteLineText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
});
