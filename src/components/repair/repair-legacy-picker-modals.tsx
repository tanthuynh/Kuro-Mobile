import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Button } from '@/components/ui/button';
import type { Equipment } from '@/types/equipment';
import type { TenantSupplier, TenantCrewMember } from '@/types/repair';
import type { ThemeColors, typography } from '@/constants/theme';

export type ThemeTypography = typeof typography;

export interface RepairLegacyPickerModalsProps {
  isEditEquipmentModalOpen: boolean;
  onCloseEditEquipmentModal: () => void;
  equipmentName: string;
  tenantEquipment: Equipment[];
  onSelectEquipment: (eq: Equipment) => void | Promise<void>;
  onSaveEquipmentName: (name: string) => void | Promise<void>;

  isEditSerialModalOpen: boolean;
  onCloseEditSerialModal: () => void;
  serialNumber: string;
  onSaveSerialNumber: (serial: string) => void | Promise<void>;

  isEditInternalRefModalOpen: boolean;
  onCloseEditInternalRefModal: () => void;
  internalReference: string;
  onSaveInternalRef: (ref: string) => void | Promise<void>;

  isSupplierPickerModalOpen: boolean;
  onCloseSupplierPickerModal: () => void;
  tenantSuppliers: TenantSupplier[];
  onSelectSupplier: (supplier: TenantSupplier) => void | Promise<void>;
  onSaveCustomSupplier: (customName: string) => void | Promise<void>;

  isCrewPickerModalOpen: boolean;
  onCloseCrewPickerModal: () => void;
  tenantCrew: TenantCrewMember[];
  onSelectCrew: (crew: TenantCrewMember) => void | Promise<void>;
  onSaveCustomCrew: (customName: string) => void | Promise<void>;

  colors?: ThemeColors;
  typography?: ThemeTypography;
}

export const RepairLegacyPickerModals: React.FC<RepairLegacyPickerModalsProps> = ({
  isEditEquipmentModalOpen,
  onCloseEditEquipmentModal,
  equipmentName,
  tenantEquipment,
  onSelectEquipment,
  onSaveEquipmentName,

  isEditSerialModalOpen,
  onCloseEditSerialModal,
  serialNumber,
  onSaveSerialNumber,

  isEditInternalRefModalOpen,
  onCloseEditInternalRefModal,
  internalReference,
  onSaveInternalRef,

  isSupplierPickerModalOpen,
  onCloseSupplierPickerModal,
  tenantSuppliers,
  onSelectSupplier,
  onSaveCustomSupplier,

  isCrewPickerModalOpen,
  onCloseCrewPickerModal,
  tenantCrew,
  onSelectCrew,
  onSaveCustomCrew,

  colors: propColors,
  typography: propTypography,
}) => {
  const theme = useTheme();
  const colors = propColors || theme.colors;
  const typography = propTypography || theme.typography;

  // Local state for modals search & custom entry
  const [equipmentModalSearch, setEquipmentModalSearch] = useState('');
  const [equipmentModalCustom, setEquipmentModalCustom] = useState('');
  const [tempSerialNumber, setTempSerialNumber] = useState(serialNumber);
  const [tempInternalRef, setTempInternalRef] = useState(internalReference);
  const [supplierModalSearch, setSupplierModalSearch] = useState('');
  const [supplierModalCustom, setSupplierModalCustom] = useState('');
  const [crewModalSearch, setCrewModalSearch] = useState('');
  const [crewModalCustom, setCrewModalCustom] = useState('');

  return (
    <>
      {/* 1. Equipment Modal */}
      <Modal
        visible={isEditEquipmentModalOpen}
        transparent
        animationType="slide"
        onRequestClose={onCloseEditEquipmentModal}
        testID="edit-equipment-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={onCloseEditEquipmentModal} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '85%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>Edit Equipment</Text>
              <Pressable onPress={onCloseEditEquipmentModal} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={equipmentModalSearch || equipmentName}
                onChangeText={(t) => {
                  setEquipmentModalSearch(t);
                  setEquipmentModalCustom(t);
                }}
                placeholder="Search or type equipment name..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.modalTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginBottom: 8 }]}
                testID="edit-equipment-name-input"
              />
              <TextInput
                value={equipmentModalSearch}
                onChangeText={setEquipmentModalSearch}
                placeholder="Filter inventory equipment..."
                placeholderTextColor={colors.mutedForeground}
                style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
                testID="equipment-search-input"
              />
              <ScrollView style={{ maxHeight: 200 }}>
                {tenantEquipment
                  .filter((eq) => !equipmentModalSearch || eq.name.toLowerCase().includes(equipmentModalSearch.toLowerCase()))
                  .map((eq, idx) => (
                    <Pressable
                      key={eq.id || `eq-opt-${idx}`}
                      style={[styles.optionRow, { borderBottomColor: colors.border }]}
                      onPress={async () => {
                        await onSelectEquipment(eq);
                        onCloseEditEquipmentModal();
                      }}
                      testID={`equipment-option-${idx}`}
                    >
                      <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.fontSize.base }}>{eq.name}</Text>
                    </Pressable>
                  ))}
              </ScrollView>
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 12 }}
                onPress={async () => {
                  const target = equipmentModalCustom || equipmentName;
                  await onSaveEquipmentName(target);
                  onCloseEditEquipmentModal();
                }}
                testID="save-edit-equipment-btn"
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Serial Modal */}
      <Modal
        visible={isEditSerialModalOpen}
        transparent
        animationType="slide"
        onRequestClose={onCloseEditSerialModal}
        testID="edit-serial-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={onCloseEditSerialModal} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>Edit Serial Number</Text>
              <Pressable onPress={onCloseEditSerialModal} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={tempSerialNumber}
                onChangeText={setTempSerialNumber}
                style={[styles.modalTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                testID="edit-serial-input"
              />
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 12 }}
                onPress={async () => {
                  await onSaveSerialNumber(tempSerialNumber);
                  onCloseEditSerialModal();
                }}
                testID="save-edit-serial-btn"
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. Internal Reference Modal */}
      <Modal
        visible={isEditInternalRefModalOpen}
        transparent
        animationType="slide"
        onRequestClose={onCloseEditInternalRefModal}
        testID="edit-internal-ref-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={onCloseEditInternalRefModal} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>Edit Internal Reference</Text>
              <Pressable onPress={onCloseEditInternalRefModal} hitSlop={8}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={tempInternalRef}
                onChangeText={setTempInternalRef}
                style={[styles.modalTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                testID="edit-internal-ref-input"
              />
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 12 }}
                onPress={async () => {
                  await onSaveInternalRef(tempInternalRef);
                  onCloseEditInternalRefModal();
                }}
                testID="save-edit-internal-ref-btn"
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Supplier Modal */}
      <Modal
        visible={isSupplierPickerModalOpen}
        transparent
        animationType="slide"
        onRequestClose={onCloseSupplierPickerModal}
        testID="supplier-picker-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={onCloseSupplierPickerModal} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '88%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>Select Supplier</Text>
              <Pressable onPress={onCloseSupplierPickerModal} hitSlop={8} testID="close-supplier-picker-btn">
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={supplierModalSearch}
                onChangeText={setSupplierModalSearch}
                placeholder="Search suppliers..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.modalTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginBottom: 8 }]}
                testID="supplier-search-input"
              />
              <ScrollView style={{ maxHeight: 200 }}>
                {tenantSuppliers.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, padding: 12, textAlign: 'center', fontSize: typography.fontSize.sm }}>
                    No suppliers found in tenant contacts.
                  </Text>
                ) : tenantSuppliers.filter((s) => !supplierModalSearch || s.name.toLowerCase().includes(supplierModalSearch.toLowerCase())).length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, padding: 12, textAlign: 'center', fontSize: typography.fontSize.sm }}>
                    No suppliers match your search.
                  </Text>
                ) : (
                  tenantSuppliers
                    .filter((s) => !supplierModalSearch || s.name.toLowerCase().includes(supplierModalSearch.toLowerCase()))
                    .map((s, idx) => (
                      <Pressable
                        key={s.id || `supp-${idx}`}
                        style={[styles.optionRow, { borderBottomColor: colors.border }]}
                        onPress={async () => {
                          await onSelectSupplier(s);
                          onCloseSupplierPickerModal();
                        }}
                        testID={`supplier-option-${idx}`}
                      >
                        <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.fontSize.base }}>{s.name}</Text>
                      </Pressable>
                    ))
                )}
              </ScrollView>
              <TextInput
                value={supplierModalCustom}
                onChangeText={setSupplierModalCustom}
                placeholder="Custom supplier name..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.singleTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginTop: 8 }]}
                testID="supplier-custom-input"
              />
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 8 }}
                onPress={async () => {
                  if (supplierModalCustom.trim()) {
                    await onSaveCustomSupplier(supplierModalCustom.trim());
                  }
                  onCloseSupplierPickerModal();
                }}
                testID="supplier-custom-save-btn"
              >
                Save Custom Supplier
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* 5. Crew Modal */}
      <Modal
        visible={isCrewPickerModalOpen}
        transparent
        animationType="slide"
        onRequestClose={onCloseCrewPickerModal}
        testID="crew-picker-modal"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={onCloseCrewPickerModal} />
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '88%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>Select Crew Member</Text>
              <Pressable onPress={onCloseCrewPickerModal} hitSlop={8} testID="close-crew-picker-btn">
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                value={crewModalSearch}
                onChangeText={setCrewModalSearch}
                placeholder="Search crew members..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.singleTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginBottom: 8 }]}
                testID="crew-search-input"
              />
              <ScrollView style={{ maxHeight: 200 }}>
                {tenantCrew.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, padding: 12, textAlign: 'center', fontSize: typography.fontSize.sm }}>
                    No crew members found in tenant users.
                  </Text>
                ) : tenantCrew.filter((c) => !crewModalSearch || c.name.toLowerCase().includes(crewModalSearch.toLowerCase())).length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, padding: 12, textAlign: 'center', fontSize: typography.fontSize.sm }}>
                    No crew members match your search.
                  </Text>
                ) : (
                  tenantCrew
                    .filter((c) => !crewModalSearch || c.name.toLowerCase().includes(crewModalSearch.toLowerCase()))
                    .map((c, idx) => (
                      <Pressable
                        key={c.id || `crew-${idx}`}
                        style={[styles.optionRow, { borderBottomColor: colors.border }]}
                        onPress={async () => {
                          await onSelectCrew(c);
                          onCloseCrewPickerModal();
                        }}
                        testID={`crew-option-${idx}`}
                      >
                        <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: typography.fontSize.base }}>{c.name}</Text>
                        {c.position ? (
                          <Text style={{ color: colors.mutedForeground, fontSize: typography.fontSize.sm }}>{c.position}</Text>
                        ) : null}
                      </Pressable>
                    ))
                )}
              </ScrollView>
              <TextInput
                value={crewModalCustom}
                onChangeText={setCrewModalCustom}
                placeholder="Custom requester name..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.singleTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginTop: 8 }]}
                testID="crew-custom-input"
              />
              <Button
                variant="primary"
                size="default"
                style={{ marginTop: 8 }}
                onPress={async () => {
                  if (crewModalCustom.trim()) {
                    await onSaveCustomCrew(crewModalCustom.trim());
                  }
                  onCloseCrewPickerModal();
                }}
                testID="crew-custom-save-btn"
              >
                Save Custom Requester
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  modalBody: {
    gap: 8,
  },
  modalTextInput: {
    fontFamily: 'Calibri',
    fontSize: 15,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  singleTextInput: {
    fontFamily: 'Calibri',
    fontSize: 15,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  optionRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
});
