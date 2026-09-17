/**
 * src/components/logistics/BackgroundLocationDisclosureModal.tsx
 * Prominent In-App Background Location Disclosure Modal for Kuro Mobile.
 *
 * Mandated by Google Play Location Policy and Apple Guideline 5.1.5:
 * Must be presented to the user BEFORE requesting runtime background location permissions.
 * Discloses that location data is collected in the background when the app is closed or not in use
 * to support active logistics route tracking and dispatcher ETA updates.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { Navigation, ShieldCheck, MapPin, X } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';

export interface BackgroundLocationDisclosureModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  testID?: string;
}

export const BackgroundLocationDisclosureModal: React.FC<
  BackgroundLocationDisclosureModalProps
> = ({ visible, onAccept, onDecline, testID = 'bg-location-disclosure-modal' }) => {
  const { colors, typography, spacing } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
      testID={testID}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onDecline}
          accessibilityLabel="Dismiss background location disclosure"
          accessibilityRole="button"
        />

        <View
          style={[
            styles.dialogCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleRow}>
              <View
                style={[
                  styles.iconBadge,
                  { backgroundColor: colors.brandGreenScale.green2 },
                ]}
              >
                <Navigation size={22} color={colors.status.online} />
              </View>
              <Text
                style={[
                  styles.title,
                  { color: colors.foreground, fontSize: typography.fontSize.lg },
                ]}
              >
                Background Location Access
              </Text>
            </View>

            <Pressable
              onPress={onDecline}
              hitSlop={8}
              accessibilityLabel="Close dialog"
              accessibilityRole="button"
            >
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Body Content */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text
              style={[
                styles.leadText,
                { color: colors.foreground, fontSize: typography.fontSize.base },
              ]}
            >
              Kuro Mobile collects location data during active logistics routes,
              <Text style={{ fontWeight: '700' }}>
                {' '}including when the app is closed or not in use
              </Text>
              .
            </Text>

            <View style={styles.featureList}>
              <View style={styles.featureRow}>
                <MapPin size={18} color={colors.primary} style={styles.bulletIcon} />
                <Text
                  style={[
                    styles.featureText,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                  ]}
                >
                  <Text style={{ color: colors.foreground, fontWeight: '600' }}>
                    Real-Time Route Telemetry:
                  </Text>{' '}
                  Enables dispatchers and production crew to track equipment arrival times and delivery progress on live logistics maps.
                </Text>
              </View>

              <View style={styles.featureRow}>
                <ShieldCheck size={18} color={colors.status.online} style={styles.bulletIcon} />
                <Text
                  style={[
                    styles.featureText,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                  ]}
                >
                  <Text style={{ color: colors.foreground, fontWeight: '600' }}>
                    Active Job Bound:
                  </Text>{' '}
                  Location is only collected while a logistics job is marked "In Progress" and ceases immediately when paused or completed.
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.noticeBox,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.noticeText,
                  { color: colors.mutedForeground, fontSize: typography.fontSize.xs },
                ]}
              >
                On the next prompt, please select{' '}
                <Text style={{ color: colors.foreground, fontWeight: '700' }}>
                  "Allow While Using App"
                </Text>{' '}
                and then{' '}
                <Text style={{ color: colors.foreground, fontWeight: '700' }}>
                  "Always Allow"
                </Text>{' '}
                (or "Allow all the time") to enable seamless navigation tracking while driving with your screen locked.
              </Text>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Button
              variant="outline"
              size="default"
              onPress={onDecline}
              style={{ flex: 1, marginRight: spacing.sm }}
              testID="bg-location-decline-btn"
            >
              Not Now
            </Button>
            <Button
              variant="primary"
              size="default"
              onPress={onAccept}
              style={{ flex: 1.5 }}
              testID="bg-location-accept-btn"
            >
              Continue
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  title: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    flex: 1,
  },
  body: {
    maxHeight: 320,
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  leadText: {
    fontFamily: 'Calibri',
    lineHeight: 22,
    marginBottom: 14,
  },
  featureList: {
    gap: 12,
    marginBottom: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bulletIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  featureText: {
    fontFamily: 'Calibri',
    flex: 1,
    lineHeight: 19,
  },
  noticeBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  noticeText: {
    fontFamily: 'Calibri',
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
});
