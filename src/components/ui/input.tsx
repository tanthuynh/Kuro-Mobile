import React, { useState, forwardRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTheme } from '@/context/theme-context';
import { Eye, EyeOff } from 'lucide-react-native';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isPassword?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      isPassword = false,
      containerStyle,
      labelStyle,
      inputStyle,
      testID,
      editable = true,
      onFocus,
      onBlur,
      ...restProps
    },
    ref
  ) => {
    const { colors, layout, typography, spacing } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const hasError = Boolean(error);

    const getBorderColor = () => {
      if (hasError) return colors.destructive;
      if (isFocused) return colors.ring;
      return colors.input;
    };

    return (
      <View style={[styles.wrapper, containerStyle]}>
        {label ? (
          <Text
            style={[
              styles.label,
              {
                color: colors.foreground,
                fontSize: typography.fontSize.sm,
                lineHeight: typography.lineHeight.sm,
                marginBottom: spacing.xs,
              },
              labelStyle,
            ]}
          >
            {label}
          </Text>
        ) : null}

        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: colors.surface,
              borderColor: getBorderColor(),
              borderRadius: layout.borderRadius.md,
              minHeight: layout.minTouchTarget,
              borderWidth: isFocused ? 1.5 : 1,
              opacity: editable ? 1 : 0.5,
            },
          ]}
        >
          {leftIcon ? <View style={styles.leftIconContainer}>{leftIcon}</View> : null}

          <TextInput
            ref={ref}
            testID={testID}
            editable={editable}
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={isPassword && !showPassword}
            underlineColorAndroid="transparent"
            style={[
              styles.textInput,
              {
                color: colors.foreground,
                fontSize: typography.fontSize.base,
                lineHeight: typography.lineHeight.base,
                paddingHorizontal: leftIcon ? spacing.xs : spacing.md,
              },
              inputStyle,
            ]}
            onFocus={(e) => {
              setIsFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              onBlur?.(e);
            }}
            {...restProps}
          />

          {isPassword ? (
            <Pressable
              onPress={() => setShowPassword((prev) => !prev)}
              style={styles.eyeButton}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {showPassword ? (
                <EyeOff size={20} color={colors.mutedForeground} />
              ) : (
                <Eye size={20} color={colors.mutedForeground} />
              )}
            </Pressable>
          ) : rightIcon ? (
            <View style={styles.rightIconContainer}>{rightIcon}</View>
          ) : null}
        </View>

        {hasError ? (
          <Text
            style={[
              styles.errorText,
              {
                color: colors.destructive,
                fontSize: typography.fontSize.xs,
                marginTop: spacing.xs,
              },
            ]}
          >
            {error}
          </Text>
        ) : helperText ? (
          <Text
            style={[
              styles.helperText,
              {
                color: colors.mutedForeground,
                fontSize: typography.fontSize.xs,
                marginTop: spacing.xs,
              },
            ]}
          >
            {helperText}
          </Text>
        ) : null}
      </View>
    );
  }
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 48,
  },
  textInput: {
    flex: 1,
    height: '100%',
    minHeight: 48,
    paddingVertical: 10,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
        boxShadow: 'none',
      } as any,
    }),
  },
  leftIconContainer: {
    paddingLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightIconContainer: {
    paddingRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeButton: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 4,
  },
  errorText: {
    fontWeight: '500',
  },
  helperText: {
    fontWeight: '400',
  },
});
