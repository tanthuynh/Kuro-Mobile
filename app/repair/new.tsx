/**
 * app/repair/new.tsx
 * Scan-to-Repair & Fault Reporting Screen in Kuro Mobile.
 * Pre-fills equipment metadata, captures damage photos, and logs new repair tickets.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Wrench,
  ShieldAlert,
  CheckCircle2,
  Camera,
  AlertTriangle,
  Send,
  Package,
  QrCode,
  Layers,
  MapPin,
  Barcode as BarcodeIcon,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { HapticService } from '@/services/haptic-service';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { RepairPhotoGallery } from '@/components/repair/repair-photo-gallery';
import { createRepairTicket, uploadRepairDamagePhoto } from '@/services/repair-service';
import {
  CANONICAL_REPAIR_PRIORITIES,
  calculateEquipmentCondition,
} from '@/lib/repair-engine';
import type {
  RepairPriority,
  RepairStatus,
  EquipmentCondition,
  RepairAttachment,
} from '@/types/repair';

const REPAIR_TYPES = [
  'Physical Damage',
  'Electrical / Power',
  'Cable / Connector',
  'Optical / Lens / Sensor',
  'Software / Firmware',
  'Cosmetic / Enclosure',
  'Routine Maintenance',
  'Other Fault',
];

export default function NewRepairScreen() {
  const router = useRouter();
  const { colors, typography, spacing, layout } = useTheme();
  const { user, tenant } = useAuth();
  const tenantId = user?.tenantId || tenant?.tenantId || '';

  // Parse query params passed from scanner or inventory screen
  const params = useLocalSearchParams<{
    equipmentId?: string;
    name?: string;
    serialNumber?: string;
    category?: string;
    barcode?: string;
    location?: string;
    quantity?: string;
  }>();

  // Form State
  const [equipmentName, setEquipmentName] = useState(params.name || '');
  const [serialNumber, setSerialNumber] = useState(params.serialNumber || '');
  const [barcode, setBarcode] = useState(params.barcode || '');
  const [category, setCategory] = useState(params.category || 'Equipment');
  const [location, setLocation] = useState(params.location || '');
  const [equipmentId, setEquipmentId] = useState(params.equipmentId || '');

  const [faultDescription, setFaultDescription] = useState('');
  const [repairType, setRepairType] = useState(REPAIR_TYPES[0]);
  const [priority, setPriority] = useState<RepairPriority>('High');
  const [condition, setCondition] = useState<EquipmentCondition>('Out of Service');
  const [initialStatus, setInitialStatus] = useState<RepairStatus>('Reported');

  // Photo attachments state
  const [photos, setPhotos] = useState<Array<{ id: string; url: string; uri?: string; fileName?: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync params if they change
  useEffect(() => {
    if (params.name) setEquipmentName(params.name);
    if (params.serialNumber) setSerialNumber(params.serialNumber);
    if (params.barcode) setBarcode(params.barcode);
    if (params.category) setCategory(params.category);
    if (params.location) setLocation(params.location);
    if (params.equipmentId) setEquipmentId(params.equipmentId);
  }, [params.name, params.serialNumber, params.barcode, params.category, params.location, params.equipmentId]);

  // Handle capturing/attaching photo
  const handleAddPhoto = () => {
    // Generate simulated/captured photo item
    const timestamp = Date.now();
    const mockPhotoUri = `https://firebasestorage.googleapis.com/v0/b/mock/o/damage_${timestamp}.jpg`;
    const newPhoto = {
      id: `photo_${timestamp}_${Math.random().toString(36).substring(2, 6)}`,
      url: mockPhotoUri,
      uri: mockPhotoUri,
      fileName: `damage_${timestamp}.jpg`,
    };

    setPhotos((prev) => [...prev, newPhoto]);
    HapticService.scanSuccess().catch(() => {});
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = async () => {
    if (!equipmentName.trim()) {
      setError('Equipment name or identifier is required');
      return;
    }

    if (!faultDescription.trim()) {
      setError('Please provide a fault description / damage notes');
      return;
    }

    if (!tenantId) {
      setError('Active tenant context missing. Please log in again.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const attachmentsPayload: RepairAttachment[] = photos.map((p) => ({
        id: p.id,
        type: 'Photo',
        url: p.url || p.uri || '',
        fileName: p.fileName || 'damage_photo.jpg',
        uploadedAt: new Date().toISOString(),
      }));

      const ticketId = await createRepairTicket(tenantId, {
        equipment: {
          id: equipmentId || null,
          name: equipmentName.trim(),
          serialNumber: serialNumber.trim() || null,
          barcode: barcode.trim() || null,
          category: category.trim() || 'Equipment',
          knownLocation: location.trim() || null,
          quantity: 1,
        },
        repairType,
        priority,
        status: initialStatus,
        condition,
        requestedBy: user?.name || user?.email || 'Field Tech',
        assignee: user ? { id: user.id, name: user.name, email: user.email } : null,
        initialNote: faultDescription.trim(),
        attachments: attachmentsPayload,
      });

      await HapticService.scanSuccess();

      // Navigate back or to details
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/repairs' as any);
      }
    } catch (err: any) {
      console.error('[NewRepairScreen] Submit error:', err);
      setError(err?.message || 'Failed to submit repair ticket');
      await HapticService.scanError();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScreenHeader
        title="Report Equipment Fault"
        subtitle={equipmentName ? `Logging ticket for ${equipmentName}` : 'Create New Repair Ticket'}
        leftAction={
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            testID="new-repair-back-btn"
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Equipment Details Card */}
        <Card style={styles.card} testID="equipment-specs-card">
          <CardHeader style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Package size={18} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                Equipment Identification
              </Text>
            </View>
            {barcode ? (
              <Badge variant="brand">#{barcode}</Badge>
            ) : null}
          </CardHeader>

          <CardContent style={styles.cardContent}>
            <Input
              label="Equipment Name *"
              placeholder="e.g. Sony FX6 Cinema Camera"
              value={equipmentName}
              onChangeText={(val) => {
                setEquipmentName(val);
                if (error) setError(null);
              }}
              testID="input-equipment-name"
            />

            <View style={styles.rowTwoCols}>
              <View style={styles.col}>
                <Input
                  label="Serial Number"
                  placeholder="e.g. SN-88239"
                  value={serialNumber}
                  onChangeText={setSerialNumber}
                  testID="input-serial-number"
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Barcode / Asset #"
                  placeholder="e.g. BAR-0042"
                  value={barcode}
                  onChangeText={setBarcode}
                  testID="input-barcode"
                />
              </View>
            </View>

            <View style={styles.rowTwoCols}>
              <View style={styles.col}>
                <Input
                  label="Category"
                  placeholder="e.g. Cameras & Optics"
                  value={category}
                  onChangeText={setCategory}
                  testID="input-category"
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Current Location"
                  placeholder="e.g. Shelf B3 / Bay 4"
                  value={location}
                  onChangeText={setLocation}
                  testID="input-location"
                />
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Fault & Problem Description */}
        <Card style={styles.card} testID="fault-details-card">
          <CardHeader style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <AlertTriangle size={18} color={colors.destructive} />
              <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                Fault & Damage Details
              </Text>
            </View>
          </CardHeader>

          <CardContent style={styles.cardContent}>
            {/* Repair Type Selector */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                Fault Category / Repair Type
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScroll}
              >
                {REPAIR_TYPES.map((type) => {
                  const isSelected = repairType === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setRepairType(type)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.card,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      testID={`repair-type-chip-${type.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: isSelected ? colors.primaryForeground : colors.foreground,
                            fontSize: typography.fontSize.xs,
                          },
                        ]}
                      >
                        {type}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Priority Selector */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                Priority Level
              </Text>
              <View style={styles.priorityRow}>
                {CANONICAL_REPAIR_PRIORITIES.filter((p) => p !== 'None' && p !== 'Deferred').map((p) => {
                  const isSelected = priority === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setPriority(p)}
                      style={[
                        styles.priorityPill,
                        {
                          backgroundColor: isSelected
                            ? p === 'Critical'
                              ? colors.destructive
                              : p === 'High'
                              ? '#EA580C'
                              : p === 'Medium'
                              ? '#D97706'
                              : colors.primary
                            : colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                      testID={`priority-pill-${p.toLowerCase()}`}
                    >
                      <Text
                        style={[
                          styles.priorityText,
                          {
                            color: isSelected ? '#FFFFFF' : colors.foreground,
                            fontSize: typography.fontSize.xs,
                          },
                        ]}
                      >
                        {p}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Equipment Condition Toggle */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground, fontSize: typography.fontSize.xs }]}>
                Equipment Operational Condition
              </Text>
              <View style={styles.conditionRow}>
                <Pressable
                  onPress={() => setCondition('Out of Service')}
                  style={[
                    styles.conditionOption,
                    {
                      backgroundColor:
                        condition === 'Out of Service'
                          ? 'rgba(239, 68, 68, 0.18)'
                          : colors.card,
                      borderColor:
                        condition === 'Out of Service'
                          ? colors.destructive
                          : colors.border,
                    },
                  ]}
                  testID="condition-out-of-service"
                >
                  <ShieldAlert
                    size={16}
                    color={condition === 'Out of Service' ? colors.destructive : colors.mutedForeground}
                  />
                  <View>
                    <Text
                      style={[
                        styles.conditionTitle,
                        {
                          color: condition === 'Out of Service' ? colors.destructive : colors.foreground,
                          fontSize: typography.fontSize.xs,
                        },
                      ]}
                    >
                      Out of Service
                    </Text>
                    <Text style={[styles.conditionSub, { color: colors.mutedForeground, fontSize: 10 }]}>
                      Prevent prep & dispatch
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => setCondition('Available to Use')}
                  style={[
                    styles.conditionOption,
                    {
                      backgroundColor:
                        condition === 'Available to Use'
                          ? 'rgba(16, 185, 129, 0.18)'
                          : colors.card,
                      borderColor:
                        condition === 'Available to Use'
                          ? colors.status.online
                          : colors.border,
                    },
                  ]}
                  testID="condition-available"
                >
                  <CheckCircle2
                    size={16}
                    color={condition === 'Available to Use' ? colors.status.online : colors.mutedForeground}
                  />
                  <View>
                    <Text
                      style={[
                        styles.conditionTitle,
                        {
                          color: condition === 'Available to Use' ? colors.status.online : colors.foreground,
                          fontSize: typography.fontSize.xs,
                        },
                      ]}
                    >
                      Available to Use
                    </Text>
                    <Text style={[styles.conditionSub, { color: colors.mutedForeground, fontSize: 10 }]}>
                      Minor fault, usable
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>

            {/* Fault Description Text Area */}
            <View style={styles.formGroup}>
              <Input
                label="Fault Description & Notes *"
                placeholder="Describe the issue, symptoms, broken parts, or required maintenance in detail..."
                value={faultDescription}
                onChangeText={(val) => {
                  setFaultDescription(val);
                  if (error) setError(null);
                }}
                multiline
                numberOfLines={4}
                style={styles.textArea}
                testID="input-fault-description"
              />
            </View>
          </CardContent>
        </Card>

        {/* Photo Evidence Capture */}
        <Card style={styles.card} testID="photos-card">
          <CardContent style={styles.cardContent}>
            <RepairPhotoGallery
              photos={photos}
              editable
              onAddPhoto={handleAddPhoto}
              onRemovePhoto={handleRemovePhoto}
              title="Damage Photos & Evidence"
              testID="new-repair-photo-gallery"
            />
          </CardContent>
        </Card>

        {/* Error Banner */}
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: colors.destructive }]}>
            <AlertTriangle size={16} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive, fontSize: typography.fontSize.xs }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Submit Button */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon={<Send size={16} color={colors.primaryForeground} />}
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.submitButton}
          testID="submit-repair-btn"
        >
          {isSubmitting ? 'Logging Fault...' : 'Submit Fault Report'}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
  card: {
    borderRadius: 12,
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
  cardContent: {
    padding: 14,
    gap: 10,
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  col: {
    flex: 1,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  chipsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityPill: {
    flex: 1,
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    borderWidth: 1,
  },
  priorityText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  conditionOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  conditionTitle: {
    fontFamily: 'Calibri',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  conditionSub: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  textArea: {
    fontFamily: 'Calibri',
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    flex: 1,
    fontWeight: '600',
    lineHeight: 16,
  },
  submitButton: {
    marginTop: 4,
  },
});
