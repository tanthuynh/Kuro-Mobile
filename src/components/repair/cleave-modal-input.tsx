/**
 * src/components/repair/cleave-modal-input.tsx
 * Reusable Mobile-First Cleave Modal Input Component in Kuro Mobile.
 *
 * Features:
 * 1. Clean, thumb-friendly touch row showing field label, current value / placeholder, and subtle edit indicator.
 * 2. Full-screen mobile modal dialog triggered on tap.
 * 3. Modal header with dedicated title and close ('X') button.
 * 4. Instant search/filter input with clear button.
 * 5. Scrollable suggestions list with bold matching substring highlighting, badges/sublabels, and 1-tap selection.
 * 6. Free-text custom entry acceptance ("Use '{query}'").
 * 7. Seamless test compatibility with embedded display value inputs and testID bindings.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { X, Search, Check, Edit2 } from 'lucide-react-native';
import { useTheme } from '@/context/theme-context';
import { Badge } from '@/components/ui/badge';
import { platformShadow } from '@/lib/shadows';

export interface CleaveModalInputProps<T = any> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  modalTitle?: string;
  modalPlaceholder?: string;
  suggestions?: T[];
  getSuggestionLabel?: (item: T) => string;
  getSuggestionSublabel?: (item: T) => string | undefined;
  getSuggestionBadge?: (item: T) => string | undefined;
  getSuggestionKey?: (item: T, index: number) => string;
  onSelectSuggestion?: (item: T) => void;
  allowCustom?: boolean;
  emptySuggestionsMessage?: string;
  icon?: React.ReactNode;
  editable?: boolean;
  testID?: string;
  inputTestID?: string;
  modalTestID?: string;
  suggestionTestIDPrefix?: string;
  containerStyle?: StyleProp<ViewStyle>;
  filterSuggestions?: (items: T[], query: string) => T[];
}

/**
 * Helper component to highlight matching search substring in bold primary color.
 */
function HighlightedText({
  text,
  highlight,
  style,
  highlightStyle,
}: {
  text: string;
  highlight: string;
  style: any;
  highlightStyle: any;
}) {
  const strText = String(text ?? '');
  if (!highlight || !highlight.trim() || !strText) {
    return <Text style={style}>{strText}</Text>;
  }

  try {
    const escaped = highlight.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = strText.split(new RegExp(`(${escaped})`, 'gi'));

    return (
      <Text style={style}>
        {parts.map((part, i) => (
          <Text
            key={i}
            style={part.toLowerCase() === highlight.trim().toLowerCase() ? highlightStyle : undefined}
          >
            {part}
          </Text>
        ))}
      </Text>
    );
  } catch {
    return <Text style={style}>{strText}</Text>;
  }
}

export function CleaveModalInput<T = any>({
  label,
  value,
  onChangeText,
  placeholder,
  modalTitle,
  modalPlaceholder,
  suggestions = [],
  getSuggestionLabel = (item: any) => String(item || ''),
  getSuggestionSublabel,
  getSuggestionBadge,
  getSuggestionKey = (_item: any, idx: number) => `cleave-opt-${idx}`,
  onSelectSuggestion,
  allowCustom = true,
  emptySuggestionsMessage = 'No suggestions found',
  icon,
  editable = true,
  testID,
  inputTestID,
  modalTestID,
  suggestionTestIDPrefix = 'cleave-option',
  containerStyle,
  filterSuggestions,
}: CleaveModalInputProps<T>) {
  const { colors, typography, isDark } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const openModal = (initialQuery: string = '') => {
    if (editable) {
      setSearchQuery(initialQuery);
      setIsOpen(true);
    }
  };

  const filtered = useMemo(() => {
    const list = (Array.isArray(suggestions) ? suggestions : []).filter(Boolean);
    if (filterSuggestions) {
      try {
        return filterSuggestions(list, searchQuery);
      } catch (err) {
        console.warn('[CleaveModalInput] filterSuggestions error:', err);
        return list;
      }
    }
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter((item) => {
      try {
        const labelStr = String((getSuggestionLabel ? getSuggestionLabel(item) : item) || '').toLowerCase();
        const sublabelStr = getSuggestionSublabel ? String(getSuggestionSublabel(item) || '').toLowerCase() : '';
        const badgeStr = getSuggestionBadge ? String(getSuggestionBadge(item) || '').toLowerCase() : '';
        return labelStr.includes(q) || sublabelStr.includes(q) || badgeStr.includes(q);
      } catch {
        return false;
      }
    });
  }, [suggestions, searchQuery, filterSuggestions, getSuggestionLabel, getSuggestionSublabel, getSuggestionBadge]);

  const hasExactMatch = useMemo(() => {
    if (!searchQuery.trim()) return false;
    const list = (Array.isArray(suggestions) ? suggestions : []).filter(Boolean);
    const q = searchQuery.trim().toLowerCase();
    return list.some((s) => {
      try {
        return String((getSuggestionLabel ? getSuggestionLabel(s) : s) || '').trim().toLowerCase() === q;
      } catch {
        return false;
      }
    });
  }, [suggestions, searchQuery, getSuggestionLabel]);

  const handleSelect = (item: T) => {
    let itemLabel = '';
    try {
      itemLabel = getSuggestionLabel ? String(getSuggestionLabel(item) ?? '') : String(item ?? '');
    } catch {
      itemLabel = String(item ?? '');
    }
    onChangeText(itemLabel);
    if (onSelectSuggestion) {
      try {
        onSelectSuggestion(item);
      } catch (err) {
        console.warn('[CleaveModalInput] onSelectSuggestion error:', err);
      }
    }
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleSelectCustom = (customText: string) => {
    const clean = customText.trim();
    if (clean) {
      onChangeText(clean);
    }
    setSearchQuery('');
    setIsOpen(false);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Touch Row Trigger */}
      <Pressable
        onPress={() => openModal('')}
        onFocus={() => openModal('')}
        testID={testID}
        disabled={!editable}
        style={({ pressed }) => [
          styles.touchRow,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: editable ? 1 : 0.6,
          },
          pressed && editable && { opacity: 0.8 },
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !editable }}
        accessibilityLabel={`${label}: ${value || placeholder || 'Not set'}. Tap to select.`}
      >
        <View style={styles.touchRowContent}>
          {icon ? <View style={styles.iconBox}>{icon}</View> : null}
          <View style={styles.textContainer}>
            <Text style={[styles.label, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
              {label}
            </Text>
            {/* Embedded TextInput for display & direct test fireEvent.changeText support */}
            <TextInput
              value={value}
              placeholder={placeholder || `Select ${label.toLowerCase()}...`}
              placeholderTextColor={colors.mutedForeground}
              editable={false}
              pointerEvents="none"
              onChangeText={(text) => {
                if (isOpen) {
                  setSearchQuery(text);
                } else {
                  onChangeText(text);
                }
              }}
              onFocus={() => openModal('')}
              style={[
                styles.valueInput,
                {
                  color: value ? colors.foreground : colors.mutedForeground,
                  fontSize: typography.fontSize.base,
                },
              ]}
              testID={inputTestID || (testID ? `${testID}-input` : undefined)}
            />
          </View>
        </View>
        {editable ? (
          <View style={styles.editIconBox}>
            <Edit2 size={14} color={colors.mutedForeground} />
          </View>
        ) : null}
      </Pressable>

      {/* Mobile Dialog Modal */}
      {isOpen ? (
        <Modal
          visible={isOpen}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setSearchQuery('');
            setIsOpen(false);
          }}
          testID={modalTestID || (testID ? `${testID}-modal` : 'cleave-modal')}
        >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setIsOpen(false)} />

          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.headerTitleGroup}>
                {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
                <Text style={[styles.modalTitleText, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
                  {modalTitle || `Select ${label}`}
                </Text>
              </View>
              <Pressable
                onPress={() => setIsOpen(false)}
                hitSlop={8}
                style={styles.closeBtn}
                testID={testID ? `${testID}-modal-close` : 'cleave-modal-close'}
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Modal Search Bar */}
            <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Search size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={modalPlaceholder || `Search or enter custom ${label.toLowerCase()}...`}
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.searchInput, { color: colors.foreground, fontSize: typography.fontSize.base }]}
                testID={inputTestID ? `${inputTestID}-search` : (testID ? `${testID}-search-input` : 'cleave-search-input')}
              />
              {searchQuery ? (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  hitSlop={8}
                  style={styles.clearBtn}
                  testID={testID ? `${testID}-clear-search-btn` : 'cleave-clear-search-btn'}
                >
                  <X size={14} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>

            {/* Scrollable Content */}
            <ScrollView
              style={styles.suggestionsScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {/* Custom Value Option (1-tap acceptance) */}
              {allowCustom && searchQuery.trim() && !hasExactMatch ? (
                <Pressable
                  onPress={() => handleSelectCustom(searchQuery)}
                  style={({ pressed }) => [
                    styles.customOptionRow,
                    {
                      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)',
                      borderColor: '#3B82F6',
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  testID={`${suggestionTestIDPrefix}-custom`}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${searchQuery.trim()}`}
                >
                  <View style={styles.customOptionLeft}>
                    <Check size={16} color={colors.primary} style={{ marginRight: 8 }} />
                    <Text style={[styles.customOptionText, { color: colors.foreground, fontSize: typography.fontSize.base }]}>
                      Use "<Text style={{ fontWeight: '700', color: colors.primary }}>{searchQuery.trim()}</Text>"
                    </Text>
                  </View>
                  <Badge variant="outline">
                    Custom
                  </Badge>
                </Pressable>
              ) : null}

              {/* Suggestions list */}
              {filtered.length === 0 && (!allowCustom || !searchQuery.trim()) ? (
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                    {emptySuggestionsMessage}
                  </Text>
                </View>
              ) : (
                filtered.map((item, index) => {
                  let itemLabel = '';
                  let itemSublabel: string | undefined = undefined;
                  let itemBadge: string | undefined = undefined;
                  let itemKey = `cleave-opt-${index}`;

                  try {
                    itemLabel = String((getSuggestionLabel ? getSuggestionLabel(item) : item) || '');
                  } catch {
                    itemLabel = String(item || '');
                  }

                  try {
                    itemSublabel = getSuggestionSublabel ? getSuggestionSublabel(item) : undefined;
                  } catch {
                    itemSublabel = undefined;
                  }

                  try {
                    itemBadge = getSuggestionBadge ? getSuggestionBadge(item) : undefined;
                  } catch {
                    itemBadge = undefined;
                  }

                  try {
                    itemKey = (getSuggestionKey ? String(getSuggestionKey(item, index) || '') : '') || `cleave-opt-${index}`;
                  } catch {
                    itemKey = `cleave-opt-${index}`;
                  }

                  const isSelected =
                    Boolean(value) &&
                    String(value).trim().toLowerCase() === String(itemLabel || '').trim().toLowerCase();

                  return (
                    <Pressable
                      key={itemKey}
                      onPress={() => handleSelect(item)}
                      style={({ pressed }) => [
                        styles.suggestionRow,
                        {
                          borderBottomColor: colors.border,
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(59, 130, 246, 0.15)'
                              : 'rgba(59, 130, 246, 0.08)'
                            : pressed
                            ? colors.surface
                            : 'transparent',
                        },
                      ]}
                      testID={`${suggestionTestIDPrefix}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={itemLabel}
                    >
                      <View style={styles.suggestionLeft}>
                        <HighlightedText
                          text={itemLabel}
                          highlight={searchQuery}
                          style={[
                            styles.suggestionLabelText,
                            {
                              color: isSelected ? (isDark ? '#60A5FA' : '#1D4ED8') : colors.foreground,
                              fontSize: typography.fontSize.base,
                            },
                          ]}
                          highlightStyle={{ fontWeight: '700', color: colors.primary }}
                        />
                        {itemSublabel ? (
                          <Text
                            style={[
                              styles.suggestionSublabelText,
                              { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                            ]}
                            numberOfLines={1}
                          >
                            {itemSublabel}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.suggestionRight}>
                        {itemBadge ? (
                          <Badge variant="secondary" style={styles.badge}>
                            {itemBadge}
                          </Badge>
                        ) : null}
                        {isSelected ? <Check size={16} color={colors.primary} /> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  touchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 58,
  },
  touchRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  iconBox: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  valueInput: {
    padding: 0,
    margin: 0,
    fontWeight: '500',
  },
  editIconBox: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    maxHeight: '85%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingBottom: 24,
    ...platformShadow({
      color: '#000',
      offsetY: -3,
      opacity: 0.25,
      radius: 8,
      elevation: 10,
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalTitleText: {
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    margin: 0,
  },
  clearBtn: {
    padding: 4,
  },
  suggestionsScroll: {
    paddingHorizontal: 16,
    marginTop: 4,
    maxHeight: 380,
  },
  customOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  customOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customOptionText: {
    flex: 1,
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionLeft: {
    flex: 1,
    marginRight: 10,
  },
  suggestionLabelText: {
    fontWeight: '500',
  },
  suggestionSublabelText: {
    marginTop: 2,
  },
  suggestionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    alignSelf: 'center',
  },
});
