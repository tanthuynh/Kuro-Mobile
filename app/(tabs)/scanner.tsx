/**
 * app/(tabs)/scanner.tsx
 * Cleaned up Barcode & QR Scanner Screen.
 * Primary scanning is now integrated directly into the Event Pull Sheet (/events/[id]).
 * This screen provides quick fleet lookups and seamless redirection to the active pull sheet.
 */

import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Barcode,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';
import { useConsistentBack } from '@/hooks/use-consistent-back';
import { useScanner } from '@/context/scanner-context';
import { useSingleEvent } from '@/hooks/use-events';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CameraViewfinder } from '@/components/scanner/camera-viewfinder';
import { ScanHudOverlay } from '@/components/scanner/scan-hud-overlay';
import { ManualCodeInput } from '@/components/scanner/manual-code-input';

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const { eventId: routeEventId } = useLocalSearchParams<{ eventId?: string }>();

  const {
    activeEventId,
    setActiveEventId,
    activePullsheet,
    scannerMode,
    setScannerMode,
    torchEnabled,
    toggleTorch,
    lastResult,
    hudVisible,
    dismissHud,
    recentScans,
    clearRecentScans,
    processScan,
    isProcessing,
    isCompletionModalVisible,
    dismissCompletionModal,
  } = useScanner();

  // If navigated with ?eventId=..., bind to active job
  useEffect(() => {
    if (routeEventId && routeEventId !== activeEventId) {
      setActiveEventId(routeEventId);
    }
  }, [routeEventId, activeEventId, setActiveEventId]);

  const { event: activeEvent } = useSingleEvent(activeEventId || '');

  const handleScanCode = (code: string) => {
    processScan(code);
  };

  const handleExitJobMode = () => {
    setActiveEventId(null);
  };

  const onBeforeBack = useCallback(() => {
    if (isCompletionModalVisible) {
      dismissCompletionModal();
      return true;
    }
    return false;
  }, [isCompletionModalVisible, dismissCompletionModal]);

  const { handleBack } = useConsistentBack({
    fallbackRoute: activeEventId ? `/events/${activeEventId}` : '/(tabs)',
    onBeforeBack,
  });

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
        },
      ]}
      testID="continuous-scanner-screen"
    >
      {/* Top Header */}
      <ScreenHeader
        title={activeEvent?.eventName || 'Equipment Scanner'}
        idBadge={activeEvent?.eventNumber ? `[${activeEvent.eventNumber}]` : '[SCAN]'}
        onBack={handleBack}
        backTestID="scanner-header-back-btn"
        backAccessibilityLabel={activeEventId ? 'Return to Event Pull Sheet' : 'Return to Events'}
        rightAction={
          <Badge variant={activeEventId ? 'brand' : 'secondary'}>
            {activeEventId ? 'Job Prep' : 'Continuous'}
          </Badge>
        }
      />

      {/* Floating HUD Feedback Toast */}
      <ScanHudOverlay
        result={lastResult}
        visible={hudVisible}
        onDismiss={dismissHud}
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}>
        {/* Active Job Context Banner */}
        {activeEventId ? (
          <View
            style={[
              styles.jobBanner,
              {
                backgroundColor: colors.brandGreenScale.green2,
                borderColor: colors.brandGreenScale.green4,
              },
            ]}
          >
            <View style={styles.jobBannerLeft}>
              <Text
                style={[
                  styles.jobBannerTitle,
                  { color: colors.foreground, fontSize: typography.fontSize.sm },
                ]}
              >
                Active Job: {activeEvent?.eventName || `Event #${activeEventId}`}
              </Text>
              <Text
                style={[
                  styles.jobBannerSub,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                ]}
              >
                {activePullsheet?.items?.length || 0} line items linked to this session
              </Text>
            </View>

            <View style={styles.jobBannerActions}>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileSpreadsheet size={13} color={colors.secondaryForeground} />}
                onPress={() => router.push(`/events/${activeEventId}` as any)}
                testID="scanner-view-pullsheet-btn"
                style={{ marginRight: 6 }}
              >
                Pull Sheet
              </Button>
              <Pressable
                onPress={handleExitJobMode}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.exitJobBtn}
                testID="exit-job-scanner-mode-btn"
              >
                <Text style={{ color: colors.mutedForeground, fontSize: typography.fontSize.sm }}>
                  Exit
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.noJobBanner,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={[
                  styles.jobBannerTitle,
                  { color: colors.foreground, fontSize: typography.fontSize.sm },
                ]}
              >
                No Active Event Selected
              </Text>
              <Text
                style={[
                  styles.jobBannerSub,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                ]}
              >
                Equipment scanning is integrated directly into each Event Pull Sheet.
              </Text>
            </View>
            <Button
              variant="outline"
              size="sm"
              onPress={() => router.replace('/(tabs)')}
              testID="scanner-select-event-btn"
            >
              Select Event
            </Button>
          </View>
        )}

        {/* Viewfinder Component */}
        <CameraViewfinder
          onScan={handleScanCode}
          torchEnabled={torchEnabled}
          onToggleTorch={toggleTorch}
          scanMode={scannerMode === 'single' ? 'barcode' : 'barcode'}
          onToggleMode={(mode) => setScannerMode(mode === 'qr' ? 'lookup' : 'continuous')}
        />

        {/* Manual Barcode Text Input */}
        <Card style={styles.manualCard}>
          <CardHeader style={{ paddingBottom: 6 }}>
            <Text
              style={[
                styles.manualTitle,
                { color: colors.cardForeground, fontSize: typography.fontSize.sm },
              ]}
            >
              Manual Barcode & Asset Serial Lookup
            </Text>
          </CardHeader>
          <CardContent style={{ paddingTop: 0 }}>
            <ManualCodeInput onSubmitCode={handleScanCode} isLoading={isProcessing} />
          </CardContent>
        </Card>

        {/* Recent Scans Session Log */}
        <View style={styles.recentHeaderRow}>
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.foreground, fontSize: typography.fontSize.md },
            ]}
          >
            Session Scan Log ({recentScans.length})
          </Text>

          {recentScans.length > 0 ? (
            <Pressable onPress={clearRecentScans} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.clearBtnText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                Clear
              </Text>
            </Pressable>
          ) : null}
        </View>

        {recentScans.length === 0 ? (
          <View style={[styles.emptyScans, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Barcode size={32} color={colors.mutedForeground} style={{ marginBottom: 6 }} />
            <Text style={[styles.emptyScansText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
              Scanned assets will appear in this live operational log.
            </Text>
          </View>
        ) : (
          recentScans.map((scan) => {
            const isSuccess = scan.resultType === 'SUCCESS';
            const isWarning = scan.resultType === 'ALREADY_COMPLETED';

            return (
              <Card
                key={scan.id}
                testID={`recent-scan-item-${scan.id}`}
                style={[
                  styles.scanItemCard,
                  {
                    borderLeftColor: isSuccess
                      ? colors.status.online
                      : isWarning
                      ? colors.status.degraded
                      : colors.destructive,
                    borderLeftWidth: 3,
                  },
                ]}
              >
                <CardContent style={{ paddingTop: spacing.sm, paddingBottom: spacing.sm }}>
                  <View style={styles.scanItemHeader}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.scanItemName,
                        { color: colors.cardForeground, fontSize: typography.fontSize.sm },
                      ]}
                    >
                      {scan.name}
                    </Text>
                    <Badge variant={isSuccess ? 'success' : isWarning ? 'warning' : 'destructive'}>
                      {scan.resultType}
                    </Badge>
                  </View>

                  <View style={styles.scanItemMetaRow}>
                    <Text style={[styles.codeBadge, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                      {scan.code}
                    </Text>
                    {scan.location ? (
                      <>
                        <Text style={[styles.metaDot, { color: colors.border }]}>•</Text>
                        <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                          {scan.location}
                        </Text>
                      </>
                    ) : null}
                    <Text style={[styles.metaDot, { color: colors.border }]}>•</Text>
                    <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                      {scan.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </Text>
                  </View>
                </CardContent>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* 100% Pull Sheet Completion Celebration Modal */}
      <Modal
        visible={isCompletionModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={dismissCompletionModal}
        testID="pullsheet-completion-celebration-modal"
      >
        <View style={styles.celebrationOverlay}>
          <View
            style={[
              styles.celebrationCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.brandGreenScale.green4,
              },
            ]}
          >
            <View
              style={[
                styles.celebrationIconWrap,
                { backgroundColor: colors.brandGreenScale.green2 },
              ]}
            >
              <CheckCircle2 size={44} color={colors.status.online} />
            </View>

            <Text
              style={[
                styles.celebrationTitle,
                { color: colors.foreground, fontSize: typography.fontSize.xl },
              ]}
            >
              Pull Sheet 100% Complete!
            </Text>

            <Text
              style={[
                styles.celebrationSub,
                { color: colors.mutedForeground, fontSize: typography.fontSize.base },
              ]}
            >
              All line items for {activeEvent?.eventName || `Job #${activeEventId}`} have been successfully prepped and scanned.
            </Text>

            <View style={styles.celebrationActions}>
              {activeEventId ? (
                <Button
                  variant="primary"
                  size="default"
                  icon={<FileSpreadsheet size={16} color={colors.primaryForeground} />}
                  onPress={() => {
                    dismissCompletionModal();
                    router.replace(`/pullsheet/${activeEventId}` as any);
                  }}
                  testID="celebration-view-pullsheet-btn"
                  style={{ width: '100%', marginBottom: 10 }}
                >
                  View Pull Sheet
                </Button>
              ) : null}

              <Button
                variant="outline"
                size="default"
                onPress={() => {
                  dismissCompletionModal();
                  router.replace('/(tabs)' as any);
                }}
                testID="celebration-return-events-btn"
                style={{ width: '100%' }}
              >
                Return to Events
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  celebrationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  celebrationCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  celebrationIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  celebrationTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  celebrationSub: {
    fontFamily: 'Calibri',
    textAlign: 'center',
    marginBottom: 20,
  },
  celebrationActions: {
    width: '100%',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  jobBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobBannerLeft: {
    flex: 1,
    marginRight: 8,
  },
  jobBannerTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    marginBottom: 2,
  },
  jobBannerSub: {
    fontFamily: 'Calibri',
  },
  jobBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exitJobBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  noJobBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manualCard: {
    marginTop: 12,
    marginBottom: 16,
  },
  manualTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  clearBtnText: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  emptyScans: {
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyScansText: {
    fontFamily: 'Calibri',
    textAlign: 'center',
  },
  scanItemCard: {
    marginBottom: 8,
  },
  scanItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  scanItemName: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  scanItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeBadge: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  metaDot: {
    marginHorizontal: 6,
  },
  metaText: {
    fontFamily: 'Calibri',
  },
});
