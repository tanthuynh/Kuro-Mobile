/**
 * app/(tabs)/scanner.tsx
 * Continuous Barcode & QR Code Equipment Scanner Screen in Kuro Mobile.
 * Operates in Standalone Fleet Lookup mode or Job Pull Sheet Prep mode
 * with real-time HUD feedback, audio beeps, tactile haptics, and live reconciliation.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  QrCode,
  Barcode,
  Zap,
  ZapOff,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  X,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Package,
  Wrench,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/theme-context';
import { useScanner, type RecentScanRecord } from '@/context/scanner-context';
import { useSingleEvent } from '@/hooks/use-events';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { CameraViewfinder } from '@/components/scanner/camera-viewfinder';
import { ScanHudOverlay } from '@/components/scanner/scan-hud-overlay';
import { ManualCodeInput } from '@/components/scanner/manual-code-input';

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, layout } = useTheme();
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
  } = useScanner();

  // If navigated with ?eventId=..., bind to active job
  useEffect(() => {
    if (routeEventId && routeEventId !== activeEventId) {
      setActiveEventId(routeEventId);
    }
  }, [routeEventId, activeEventId, setActiveEventId]);

  const { event: activeEvent } = useSingleEvent(activeEventId || '');
  const [inspectedItem, setInspectedItem] = useState<RecentScanRecord | null>(null);

  const handleScanCode = (code: string) => {
    processScan(code);
  };

  const handleExitJobMode = () => {
    setActiveEventId(null);
  };

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.sm,
        },
      ]}
    >
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
                  { color: colors.mutedForeground, fontSize: typography.fontSize.xs },
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
                onPress={() => router.push(`/pullsheet/${activeEventId}`)}
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
                <Text style={{ color: colors.mutedForeground, fontSize: typography.fontSize.xs }}>
                  Exit
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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
              <Text style={[styles.clearBtnText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Clear
              </Text>
            </Pressable>
          ) : null}
        </View>

        {recentScans.length === 0 ? (
          <View style={[styles.emptyScans, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Barcode size={32} color={colors.mutedForeground} style={{ marginBottom: 6 }} />
            <Text style={[styles.emptyScansText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
              Scanned assets will appear in this live operational log.
            </Text>
          </View>
        ) : (
          recentScans.map((scan) => {
            const isSuccess = scan.resultType === 'SUCCESS';
            const isWarning = scan.resultType === 'ALREADY_COMPLETED';

            return (
              <Pressable
                key={scan.id}
                onPress={() => setInspectedItem(scan)}
                testID={`recent-scan-item-${scan.id}`}
              >
                <Card
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
                      <Text style={[styles.codeBadge, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                        {scan.code}
                      </Text>
                      {scan.location ? (
                        <>
                          <Text style={[styles.metaDot, { color: colors.border }]}>•</Text>
                          <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                            {scan.location}
                          </Text>
                        </>
                      ) : null}
                      <Text style={[styles.metaDot, { color: colors.border }]}>•</Text>
                      <Text style={[styles.metaText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                        {scan.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </Text>
                    </View>
                  </CardContent>
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Item Detail Inspection Modal Sheet */}
      <ModalSheet
        visible={Boolean(inspectedItem)}
        onClose={() => setInspectedItem(null)}
        title="Asset Inspection"
        testID="scanner-detail-modal"
      >
        {inspectedItem ? (
          <View style={styles.modalBody}>
            <Text style={[styles.detailItemName, { color: colors.foreground, fontSize: typography.fontSize.xl }]}>
              {inspectedItem.name}
            </Text>

            <View style={styles.detailChipsRow}>
              <Badge variant="brand">{inspectedItem.category || 'Equipment'}</Badge>
              <Badge variant={inspectedItem.resultType === 'SUCCESS' ? 'success' : 'warning'}>
                {inspectedItem.status}
              </Badge>
            </View>

            <View style={[styles.specGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.specRow}>
                <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  Scanned Code
                </Text>
                <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                  {inspectedItem.code}
                </Text>
              </View>

              {inspectedItem.location ? (
                <View style={styles.specRow}>
                  <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                    Warehouse Location
                  </Text>
                  <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                    {inspectedItem.location}
                  </Text>
                </View>
              ) : null}

              <View style={styles.specRow}>
                <Text style={[styles.specLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  Scan Timestamp
                </Text>
                <Text style={[styles.specValue, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                  {inspectedItem.timestamp.toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <Button
                variant="destructive"
                size="default"
                icon={<Wrench size={16} color="#FFFFFF" />}
                style={{ flex: 1 }}
                onPress={() => {
                  const item = inspectedItem;
                  setInspectedItem(null);
                  router.push({
                    pathname: '/repair/new',
                    params: {
                      name: item.name,
                      barcode: item.code,
                      serialNumber: item.code,
                      category: item.category || 'Equipment',
                      location: item.location || '',
                    },
                  });
                }}
                testID="scanner-report-fault-btn"
              >
                Report Fault
              </Button>

              <Button
                variant="outline"
                size="default"
                style={{ flex: 1 }}
                onPress={() => setInspectedItem(null)}
                testID="scanner-close-inspection-btn"
              >
                Close
              </Button>
            </View>
          </View>
        ) : null}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  jobBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  jobBannerLeft: {
    flex: 1,
    marginRight: 8,
  },
  jobBannerTitle: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  jobBannerSub: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  jobBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exitJobBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  manualCard: {
    marginTop: 12,
    marginBottom: 16,
  },
  manualTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  clearBtnText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  emptyScans: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyScansText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  scanItemCard: {
    marginBottom: 8,
  },
  scanItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  scanItemName: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    flex: 1,
    marginRight: 8,
  },
  scanItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeBadge: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  metaDot: {
    marginHorizontal: 6,
  },
  metaText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'Calibri',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  modalBody: {},
  detailItemName: {
    fontFamily: 'Calibri',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: 8,
  },
  detailChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  specGrid: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  specLabel: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  specValue: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});
