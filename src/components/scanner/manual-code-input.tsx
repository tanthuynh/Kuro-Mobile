/**
 * src/components/scanner/manual-code-input.tsx
 * Manual barcode / serial / asset tag input fallback for Kuro Mobile.
 */

import React, { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Search, Keyboard } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface ManualCodeInputProps {
  onSubmitCode: (code: string) => void;
  isLoading?: boolean;
  testID?: string;
}

export const ManualCodeInput: React.FC<ManualCodeInputProps> = ({
  onSubmitCode,
  isLoading = false,
  testID,
}) => {
  const { colors, typography, spacing } = useTheme();
  const [code, setCode] = useState('');

  const handleSubmit = () => {
    const clean = code.trim();
    if (!clean) return;
    onSubmitCode(clean);
    setCode('');
  };

  return (
    <View testID={testID || 'manual-code-input-container'} style={styles.container}>
      <View style={styles.inputRow}>
        <View style={styles.inputWrap}>
          <Input
            placeholder="Type barcode or serial number..."
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            leftIcon={<Keyboard size={16} color={colors.mutedForeground} />}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
          />
        </View>

        <Button
          variant="secondary"
          size="default"
          loading={isLoading}
          disabled={!code.trim()}
          onPress={handleSubmit}
          style={styles.submitBtn}
          testID="manual-code-submit-btn"
        >
          Submit
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
  },
  submitBtn: {
    minWidth: 80,
  },
});
