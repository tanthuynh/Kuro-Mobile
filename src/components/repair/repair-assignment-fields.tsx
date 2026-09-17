import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Building2, Users } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { CleaveModalInput } from '@/components/repair/cleave-modal-input';
import type { TenantOwner, TenantCrewMember } from '@/types/repair';
import type { ThemeColors, typography } from '@/constants/theme';

export type ThemeTypography = typeof typography;

export interface RepairAssignmentFieldsProps {
  owner?: string | null;
  ownerId?: string | null;
  tenantOwners?: TenantOwner[];
  onChangeOwner: (text: string) => void;
  onSelectOwner: (owner: TenantOwner) => void;

  requestedBy?: string;
  assignedTo?: string;
  crewMembers?: TenantCrewMember[];
  tenantCrew?: TenantCrewMember[];
  onChangeRequestedBy: (text: string) => void;
  onSelectCrew: (crew: TenantCrewMember) => void;
  onAssign?: (crew: TenantCrewMember) => void;

  colors?: ThemeColors;
  typography?: ThemeTypography;
  disabled?: boolean;
}

export const RepairAssignmentFields: React.FC<RepairAssignmentFieldsProps> = ({
  owner,
  ownerId,
  tenantOwners = [],
  onChangeOwner,
  onSelectOwner,
  requestedBy,
  assignedTo,
  crewMembers,
  tenantCrew,
  onChangeRequestedBy,
  onSelectCrew,
  onAssign,
  colors: propColors,
  typography: propTypography,
  disabled = false,
}) => {
  const theme = useTheme();
  const colors = propColors || theme.colors;

  const resolvedOwner = owner || ownerId || '';
  const resolvedCrew = requestedBy || assignedTo || '';
  const resolvedCrewList = crewMembers || tenantCrew || [];

  const handleSelectCrewInternal = (c: TenantCrewMember) => {
    onSelectCrew(c);
    onAssign?.(c);
  };

  return (
    <View style={styles.container}>
      {/* 1. Owner Cleave Modal Input */}
      <CleaveModalInput<TenantOwner>
        label="OWNER"
        value={resolvedOwner}
        onChangeText={onChangeOwner}
        placeholder="Select owner (client / venue)..."
        modalTitle="Select Owner"
        modalPlaceholder="Search client or venue contacts..."
        suggestions={tenantOwners}
        getSuggestionLabel={(o) => o.name}
        getSuggestionSublabel={(o) => o.fullAddress || o.email || o.phone}
        getSuggestionBadge={(o) => o.type || 'Client'}
        getSuggestionKey={(o, idx) => o.id || `owner-${idx}`}
        onSelectSuggestion={onSelectOwner}
        icon={<Building2 size={15} color={colors.mutedForeground} />}
        testID="input-owner"
        inputTestID="input-owner-field"
        suggestionTestIDPrefix="owner-option"
        emptySuggestionsMessage="No client or venue contacts found in tenant database."
        editable={!disabled}
      />

      {/* 2. Requested By Cleave Modal Input */}
      <CleaveModalInput<TenantCrewMember>
        label="REQUESTED BY"
        value={resolvedCrew}
        onChangeText={onChangeRequestedBy}
        placeholder="Select requester from crew..."
        modalTitle="Select Requester"
        modalPlaceholder="Search crew members or enter custom name..."
        suggestions={resolvedCrewList}
        getSuggestionLabel={(c) => c.name}
        getSuggestionSublabel={(c) => c.position || c.role || c.email}
        getSuggestionBadge={(c) => c.role || undefined}
        getSuggestionKey={(c, idx) => c.id || `crew-${idx}`}
        onSelectSuggestion={handleSelectCrewInternal}
        icon={<Users size={15} color={colors.mutedForeground} />}
        testID="input-requested-by"
        inputTestID="input-requested-by-field"
        suggestionTestIDPrefix="crew-option"
        emptySuggestionsMessage="No crew members found in tenant users."
        editable={!disabled}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
});
