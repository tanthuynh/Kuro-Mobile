/**
 * app/(auth)/login.tsx
 * Kuro Authentication Screen
 * Visually & functionally matched to Kuro Web (kuro-web/src/app/login/page.tsx)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Check, AlertTriangle } from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Logo, GoogleIcon } from '@/components/icons';
import type { TenantLookupResult } from '@/types/auth';
import { getCachedTenantLookup, clearCachedTenantLookup } from '@/services/auth-service';

const REMEMBER_ME_KEY = '@kuro_remembered_email';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing } = useTheme();
  const { lookupTenant, signIn, sendPasswordReset, logoutNotice, clearLogoutNotice } = useAuth();

  // Form states
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [resolvedTenant, setResolvedTenant] = useState<TenantLookupResult | null>(null);

  // Status & error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot password modal
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [isSendingPassword, setIsSendingPassword] = useState(false);
  const [resetSentNotice, setResetSentNotice] = useState<string | null>(null);

  // Hydrate remembered email on mount
  useEffect(() => {
    const loadRememberedEmail = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem(REMEMBER_ME_KEY);
        if (savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
      } catch (err) {
        console.error('Error loading remembered email:', err);
      }
    };
    loadRememberedEmail();
  }, []);

  // Step 1: Resolve tenant by email
  const handleEmailSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // Fast-path: Check if matching tenant lookup is already cached locally
      const cachedLookup = await getCachedTenantLookup(trimmedEmail);
      if (cachedLookup) {
        setResolvedTenant(cachedLookup);
        setStep(2);
        setIsSubmitting(false);
        return;
      }

      const lookupResult = await lookupTenant(trimmedEmail);

      if (!lookupResult.success) {
        setErrorMessage(lookupResult.error || 'User not found.');
        setIsSubmitting(false);
        return;
      }

      setResolvedTenant(lookupResult);
      setStep(2);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Sign in with password
  const handlePasswordLogin = async () => {
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await signIn(email.trim().toLowerCase(), password, resolvedTenant?.authTenantId);

      if (!result.success) {
        // If sign in failed with tenant configuration/mismatch error, invalidate cached lookup and return to step 1
        const errStr = (result.error || '').toLowerCase();
        if (errStr.includes('organization') || errStr.includes('tenant') || errStr.includes('auth/invalid-tenant-id')) {
          await clearCachedTenantLookup();
          setResolvedTenant(null);
          setStep(1);
        }
        setErrorMessage(result.error || 'Invalid email or password.');
        setIsSubmitting(false);
        return;
      }

      // Save/clear remembered email
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_ME_KEY, email.trim().toLowerCase());
      } else {
        await AsyncStorage.removeItem(REMEMBER_ME_KEY);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Trigger Google Sign In
  const handleGoogleLogin = () => {
    Alert.alert(
      'Google Sign-In',
      'Please sign in using your enterprise email and password on mobile, or use Google SSO in the Kuro web application.'
    );
  };

  // Trigger password reset email
  const handleForgotPassword = async () => {
    const targetEmail = forgotPasswordEmail.trim().toLowerCase() || email.trim().toLowerCase();
    if (!targetEmail) return;

    setIsSendingPassword(true);
    setResetSentNotice(null);

    try {
      await sendPasswordReset(targetEmail, resolvedTenant?.authTenantId);
      setResetSentNotice('If the email is found in our system, we have sent a password reset link.');
    } catch (err) {
      // Always show success message to avoid leaking valid emails, mirroring web behavior
      setResetSentNotice('If the email is found in our system, we have sent a password reset link.');
    } finally {
      setIsSendingPassword(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screenContainer, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.md,
            paddingHorizontal: spacing.base,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Remote Logout Notice Banner */}
        {logoutNotice ? (
          <View
            style={[
              styles.noticeBanner,
              {
                backgroundColor: logoutNotice.variant === 'destructive' ? 'rgba(239, 68, 68, 0.15)' : colors.brandGreenScale.green2,
                borderColor: logoutNotice.variant === 'destructive' ? colors.destructive : colors.primary,
              },
            ]}
          >
            <AlertTriangle
              size={18}
              color={logoutNotice.variant === 'destructive' ? colors.destructive : colors.primary}
              style={styles.noticeIcon}
            />
            <View style={styles.noticeTextContainer}>
              <Text style={[styles.noticeTitle, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {logoutNotice.title}
              </Text>
              <Text style={[styles.noticeDescription, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                {logoutNotice.description}
              </Text>
            </View>
            <Pressable
              onPress={clearLogoutNotice}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.noticeDismiss}
            >
              <Text style={{ color: colors.mutedForeground, fontSize: typography.fontSize.sm }}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Error Feedback Banner */}
        {errorMessage ? (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: colors.destructive }]}>
            <AlertTriangle size={18} color={colors.destructive} style={{ marginRight: 8 }} />
            <Text style={[styles.errorBannerText, { color: colors.destructive, fontSize: typography.fontSize.sm }]}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        {/* Main Authentication Card */}
        <View style={styles.cardWrapper}>
          <Card style={styles.authCard}>
            {/* Card Header with Kuro Logo (identical to web app) */}
            <CardHeader style={styles.cardHeader}>
              <Logo
                size="sm"
                showText
                textStyle={styles.logoText}
                style={styles.logoContainer}
              />
            </CardHeader>

            <CardContent style={styles.cardContent}>
              {step === 1 ? (
                // Step 1: Email Form
                <View style={styles.formContainer}>
                  {/* Email Input */}
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                      Email
                    </Text>
                    <Input
                      placeholder=""
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onSubmitEditing={handleEmailSubmit}
                      returnKeyType="next"
                      containerStyle={styles.inputWrapper}
                    />
                  </View>

                  {/* Remember Me Checkbox */}
                  <Pressable
                    onPress={() => setRememberMe((prev) => !prev)}
                    style={styles.rememberMeRow}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: rememberMe }}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: rememberMe ? colors.primary : colors.border,
                          backgroundColor: rememberMe ? colors.primary : 'transparent',
                        },
                      ]}
                    >
                      {rememberMe ? <Check size={14} color={colors.primaryForeground} strokeWidth={3} /> : null}
                    </View>
                    <Text style={[styles.rememberMeText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                      Remember me
                    </Text>
                  </Pressable>

                  {/* Continue Button */}
                  <Button
                    variant="secondary"
                    size="default"
                    fullWidth
                    loading={isSubmitting}
                    loadingText="Verifying..."
                    disabled={!email.trim() || isSubmitting}
                    onPress={handleEmailSubmit}
                    style={styles.actionButton}
                  >
                    {isSubmitting ? 'Verifying...' : 'Continue'}
                  </Button>

                  {/* Or Divider */}
                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>Or</Text>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  </View>

                  {/* Sign in with Google Button */}
                  <Button
                    variant="outline"
                    size="default"
                    fullWidth
                    disabled={isSubmitting}
                    onPress={handleGoogleLogin}
                    icon={<GoogleIcon size={18} />}
                    style={styles.googleButton}
                    textStyle={{ fontWeight: '500' }}
                  >
                    Sign in with Google
                  </Button>
                </View>
              ) : (
                // Step 2: Password Form
                <View style={styles.formContainer}>
                  {/* Email Display Row with Change Link */}
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                      Email
                    </Text>
                    <View
                      style={[
                        styles.emailDisplayBox,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.emailDisplayText, { color: colors.foreground, fontSize: typography.fontSize.sm }]}
                      >
                        {email}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setStep(1);
                          setPassword('');
                          setErrorMessage(null);
                        }}
                        disabled={isSubmitting}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[styles.changeText, { color: colors.primary, fontSize: typography.fontSize.sm }]}>
                          Change
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Password Input */}
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                      Password
                    </Text>
                    <Input
                      placeholder=""
                      isPassword
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={password}
                      autoFocus
                      onChangeText={(text) => {
                        setPassword(text);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onSubmitEditing={handlePasswordLogin}
                      returnKeyType="go"
                      containerStyle={styles.inputWrapper}
                    />
                  </View>

                  {/* Forgot Password Link */}
                  <View style={styles.forgotPasswordRow}>
                    <Pressable
                      onPress={() => {
                        setForgotPasswordEmail(email);
                        setResetSentNotice(null);
                        setForgotPasswordOpen(true);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[styles.forgotPasswordText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                        Forgot password?
                      </Text>
                    </Pressable>
                  </View>

                  {/* Sign in with Password Button */}
                  <Button
                    variant="secondary"
                    size="default"
                    fullWidth
                    loading={isSubmitting}
                    loadingText="Logging in..."
                    disabled={!password || isSubmitting}
                    onPress={handlePasswordLogin}
                    style={styles.actionButton}
                  >
                    {isSubmitting ? 'Logging in...' : 'Sign in with Password'}
                  </Button>
                </View>
              )}
            </CardContent>
          </Card>
        </View>

        {/* Footer info (identical to web app) */}
        <View style={styles.footerContainer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
            © {new Date().getFullYear()} KURO version 1.0.0
          </Text>
        </View>

        {/* Forgot Password Modal Dialog */}
        <Modal
          visible={forgotPasswordOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setForgotPasswordOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: typography.fontSize.lg }]}>
                Forgot Password
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground, fontSize: typography.fontSize.sm, marginBottom: spacing.md }]}>
                {"Enter your email address and we'll send you your password if an account exists."}
              </Text>

              {resetSentNotice ? (
                <View style={[styles.successBanner, { backgroundColor: colors.brandGreenScale.green2, borderColor: colors.primary }]}>
                  <Text style={[styles.successBannerText, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                    {resetSentNotice}
                  </Text>
                </View>
              ) : (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                    Email
                  </Text>
                  <Input
                    placeholder="name@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={forgotPasswordEmail}
                    onChangeText={setForgotPasswordEmail}
                    onSubmitEditing={handleForgotPassword}
                    returnKeyType="done"
                    containerStyle={styles.inputWrapper}
                  />
                </View>
              )}

              <View style={styles.modalActionsRow}>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setForgotPasswordOpen(false);
                    setResetSentNotice(null);
                  }}
                  style={{ flex: 1, marginRight: spacing.sm }}
                >
                  Cancel
                </Button>
                {!resetSentNotice ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={isSendingPassword}
                    loadingText="Sending..."
                    disabled={!forgotPasswordEmail.trim() || isSendingPassword}
                    onPress={handleForgotPassword}
                    style={{ flex: 1 }}
                  >
                    Send Password
                  </Button>
                ) : null}
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 384,
  },
  authCard: {
    width: '100%',
    minHeight: 390,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
  },
  cardHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  logoContainer: {
    marginLeft: -10,
  },
  logoText: {
    fontFamily: 'Calibri',
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 1.5,
  },
  cardContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    flex: 1,
    justifyContent: 'space-between',
  },
  formContainer: {
    width: '100%',
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontFamily: 'Calibri',
    fontWeight: '500',
    marginBottom: 6,
  },
  inputWrapper: {
    marginBottom: 0,
  },
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    marginVertical: 4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  rememberMeText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
  actionButton: {
    marginTop: 8,
    height: 44,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  googleButton: {
    minHeight: 48,
  },
  emailDisplayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 6,
    borderWidth: 1,
  },
  emailDisplayText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  changeText: {
    fontFamily: 'Calibri',
    fontWeight: '400',
  },
  forgotPasswordRow: {
    alignItems: 'flex-end',
    minHeight: 28,
    justifyContent: 'center',
    marginBottom: 8,
  },
  forgotPasswordText: {
    fontFamily: 'Calibri',
    fontWeight: '500',
  },
  noticeBanner: {
    width: '100%',
    maxWidth: 384,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  noticeIcon: {
    marginRight: 10,
  },
  noticeTextContainer: {
    flex: 1,
  },
  noticeTitle: {
    fontFamily: 'Calibri',
    fontWeight: '600',
  },
  noticeDescription: {
    fontFamily: 'Calibri',
    marginTop: 2,
  },
  noticeDismiss: {
    padding: 4,
    marginLeft: 8,
  },
  errorBanner: {
    width: '100%',
    maxWidth: 384,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorBannerText: {
    fontFamily: 'Calibri',
    flex: 1,
    fontWeight: '500',
  },
  footerContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontFamily: 'Calibri',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontFamily: 'Calibri',
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: 'Calibri',
    lineHeight: 18,
  },
  successBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  successBannerText: {
    fontFamily: 'Calibri',
    lineHeight: 18,
  },
  modalActionsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
