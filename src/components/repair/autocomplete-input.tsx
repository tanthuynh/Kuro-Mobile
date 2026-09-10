/**
 * src/components/repair/autocomplete-input.tsx
 * Single Text Input with Inline Autocomplete Dropdown / Suggestions List in Kuro Mobile.
 * Supports free-text input and 1-tap suggestion selection for Equipment, Serials, Suppliers, and Crew.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { platformShadow } from '@/lib/shadows';

export interface AutocompleteInputProps<T> {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  suggestions: T[];
  getSuggestionLabel: (item: T) => string;
  getSuggestionSublabel?: (item: T) => string | undefined;
  getSuggestionKey?: (item: T, index: number) => string;
  onSelectSuggestion: (item: T) => void;
  testID?: string;
  inputTestID?: string;
  suggestionTestIDPrefix?: string;
  icon?: React.ReactNode;
  onBlur?: () => void;
  onFocus?: () => void;
  editable?: boolean;
  emptySuggestionsMessage?: string;
  showSuggestionsOnFocus?: boolean;
  filterSuggestions?: (items: T[], query: string) => T[];
  containerStyle?: object;
}

export function AutocompleteInput<T>({
  label,
  value,
  onChangeText,
  placeholder,
  suggestions = [],
  getSuggestionLabel,
  getSuggestionSublabel,
  getSuggestionKey,
  onSelectSuggestion,
  testID,
  inputTestID,
  suggestionTestIDPrefix = 'suggestion-item',
  icon,
  onBlur,
  onFocus,
  editable = true,
  emptySuggestionsMessage,
  showSuggestionsOnFocus = true,
  filterSuggestions,
  containerStyle,
}: AutocompleteInputProps<T>) {
  const { colors, typography } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    };
  }, []);

  const filtered = useMemo(() => {
    const list = Array.isArray(suggestions) ? suggestions : [];
    if (filterSuggestions) {
      return filterSuggestions(list, value);
    }
    const safeVal = (value || '').toString().trim();
    if (!safeVal) {
      return list.slice(0, 10);
    }
    const q = safeVal.toLowerCase();
    return list.filter((item) => {
      const labelStr = String(getSuggestionLabel(item) || '').toLowerCase();
      const sublabelStr = getSuggestionSublabel ? String(getSuggestionSublabel(item) || '').toLowerCase() : '';
      return labelStr.includes(q) || sublabelStr.includes(q);
    });
  }, [suggestions, value, filterSuggestions, getSuggestionLabel, getSuggestionSublabel]);

  const showDropdown = isFocused && editable && Array.isArray(suggestions) && suggestions.length > 0;

  const handleSelect = (item: T) => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    const label = getSuggestionLabel(item);
    onChangeText(label);
    onSelectSuggestion(item);
    setIsFocused(false);
  };

  const handleClear = () => {
    onChangeText('');
  };

  return (
    <View style={[styles.wrapper, containerStyle]} testID={testID}>
      {label ? (
        <Text style={[styles.label, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.surface,
            borderColor: isFocused ? colors.primary : colors.border,
          },
        ]}
      >
        {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
        <TextInput
          value={value}
          onChangeText={(text) => {
            if (blurTimeoutRef.current) {
              clearTimeout(blurTimeoutRef.current);
              blurTimeoutRef.current = null;
            }
            setIsFocused(true);
            onChangeText(text);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          editable={editable}
          onFocus={() => {
            if (blurTimeoutRef.current) {
              clearTimeout(blurTimeoutRef.current);
              blurTimeoutRef.current = null;
            }
            setIsFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            // Small timeout to allow tap on suggestion
            if (blurTimeoutRef.current) {
              clearTimeout(blurTimeoutRef.current);
            }
            blurTimeoutRef.current = setTimeout(() => {
              setIsFocused(false);
              onBlur?.();
            }, 200);
          }}
          style={[styles.input, { color: colors.foreground, fontSize: typography.fontSize.base }]}
          testID={inputTestID}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {value && editable ? (
          <Pressable onPress={handleClear} hitSlop={8} style={styles.clearBtn}>
            <X size={14} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {/* Inline Autocomplete Dropdown List */}
      {showDropdown ? (
        <View
          style={[
            styles.dropdownContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {filtered.length === 0 ? (
            emptySuggestionsMessage ? (
              <View style={styles.emptyItem}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                  {emptySuggestionsMessage}
                </Text>
              </View>
            ) : null
          ) : (
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="always"
              style={styles.dropdownScroll}
            >
              {filtered.map((item, index) => {
                const itemKey = getSuggestionKey ? getSuggestionKey(item, index) : `sugg-${index}`;
                const itemLabel = getSuggestionLabel(item);
                const itemSublabel = getSuggestionSublabel ? getSuggestionSublabel(item) : undefined;

                return (
                  <Pressable
                    key={itemKey}
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                      styles.suggestionItem,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: pressed ? colors.surface : 'transparent',
                      },
                    ]}
                    testID={`${suggestionTestIDPrefix}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={itemLabel}
                  >
                    <Text
                      style={[
                        styles.suggestionLabel,
                        { color: colors.foreground, fontSize: typography.fontSize.base },
                      ]}
                      numberOfLines={1}
                    >
                      {itemLabel}
                    </Text>
                    {itemSublabel ? (
                      <Text
                        style={[
                          styles.suggestionSublabel,
                          { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                        ]}
                        numberOfLines={1}
                      >
                        {itemSublabel}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    zIndex: 10,
    width: '100%',
  },
  label: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 48,
  },
  iconContainer: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'Calibri',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
    }),
  },
  clearBtn: {
    padding: 4,
    marginLeft: 6,
  },
  dropdownContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 180,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    zIndex: 9999,
    ...platformShadow({
      color: '#000',
      offsetY: 4,
      opacity: 0.25,
      radius: 6,
      elevation: 8,
    }),
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 180,
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
  },
  suggestionLabel: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  suggestionSublabel: {
    fontFamily: 'Calibri',
    marginTop: 2,
  },
  emptyItem: {
    padding: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Calibri',
    fontStyle: 'italic',
  },
});
