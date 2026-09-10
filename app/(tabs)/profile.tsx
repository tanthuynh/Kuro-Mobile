/**
 * app/(tabs)/profile.tsx
 * User Profile, Tenant Information, Presence & Sign-Out Screen
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Pressable,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LogOut,
  Moon,
  Sun,
  Smartphone,
} from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { ref, onValue, set } from 'firebase/database';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { db, rtdb, auth } from '@/lib/firebase';
import packageJson from '@/../package.json';

/**
 * Crew / User Avatar renderer supporting:
 * 1. In-app SVG Data URIs (data:image/svg+xml;...)
 * 2. Custom photo URLs (Firebase Storage / HTTP / HTTPS)
 * 3. Base64 raster data URIs (data:image/png;base64,...)
 * 4. Fallback Initials with brand/extracted accent color
 */
/**
 * Safely decodes an SVG data URI (percent-encoded, base64, charset-prefixed, or raw XML with % symbols).
 * Returns decoded SVG XML string or null if invalid, without throwing URIError.
 */
export function parseSvgDataUri(avatarUrl?: string | null): string | null {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  const trimmed = avatarUrl.trim();
  if (!trimmed.toLowerCase().startsWith('data:image/svg+xml')) return null;

  try {
    const commaIndex = trimmed.indexOf(',');
    const meta = commaIndex !== -1 ? trimmed.slice(0, commaIndex).toLowerCase() : '';
    const rawPart = commaIndex !== -1 ? trimmed.slice(commaIndex + 1) : '';

    if (!rawPart) return null;

    let content = rawPart;
    if (meta.includes(';base64')) {
      try {
        if (typeof atob === 'function') {
          content = atob(rawPart);
        } else if (typeof Buffer !== 'undefined') {
          content = Buffer.from(rawPart, 'base64').toString('utf8');
        } else if (typeof global !== 'undefined' && typeof (global as any).atob === 'function') {
          content = (global as any).atob(rawPart);
        }
      } catch {
        return null;
      }
    } else {
      // Safely decode percent-encoded SVG data URIs.
      // Lone '%' not followed by two hex digits (e.g. width="100%" or raw unencoded XML) cause
      // decodeURIComponent to throw `URIError: Malformed decodeURI input`.
      // We sanitize unescaped '%' into '%25' so decodeURIComponent succeeds safely.
      try {
        content = decodeURIComponent(rawPart);
      } catch {
        try {
          const sanitized = rawPart.replace(/%(?![0-9a-fA-F]{2})/g, '%25');
          content = decodeURIComponent(sanitized);
        } catch {
          try {
            content = decodeURI(rawPart);
          } catch {
            content = rawPart;
          }
        }
      }
    }

    if (content && content.includes('<svg')) {
      return content;
    }
  } catch {
    // Gracefully fall back to operator initials without throwing or logging noisy warnings
  }
  return null;
}

export function CrewAvatar({
  avatarUrl,
  name,
  size = 68,
}: {
  avatarUrl?: string | null;
  name?: string;
  size?: number;
}) {
  const { colors, typography } = useTheme();

  const getInitials = (n?: string): string => {
    if (!n) return 'OP';
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  };

  const parsedSvgXml = useMemo(() => parseSvgDataUri(avatarUrl), [avatarUrl]);

  // Case 1: In-App SVG Avatar
  if (parsedSvgXml) {
    return (
      <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2 }]}>
        <SvgXml xml={parsedSvgXml} width={size} height={size} />
      </View>
    );
  }

  // Case 2: Custom Photo URL / Base64 Raster Image
  if (
    avatarUrl &&
    typeof avatarUrl === 'string' &&
    (avatarUrl.startsWith('http://') ||
      avatarUrl.startsWith('https://') ||
      avatarUrl.startsWith('data:image/png') ||
      avatarUrl.startsWith('data:image/jpeg'))
  ) {
    return (
      <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
          accessibilityRole="image"
          accessibilityLabel={name || 'Operator avatar'}
        />
      </View>
    );
  }

  // Case 3: Fallback Initials
  return (
    <View
      style={[
        styles.avatarCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.brandGreenScale.green2,
        },
      ]}
    >
      <Text
        style={[
          styles.avatarText,
          {
            color: colors.primary,
            fontSize: typography.fontSize.xl,
          },
        ]}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, themeMode, setThemeMode } = useTheme();
  const { user, tenant, signOut } = useAuth();

  const [isManualOffline, setIsManualOffline] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [liveTenant, setLiveTenant] = useState<any>(null);

  // Sync manual online status with Firebase RTDB (matching Kuro Web user-nav)
  useEffect(() => {
    const uid = auth.currentUser?.uid || user?.uid || user?.id;
    if (!uid || !auth.currentUser) return;
    const manualStatusRef = ref(rtdb, `/presence/${uid}/manualStatus`);
    const unsubscribe = onValue(
      manualStatusRef,
      (snapshot) => {
        setIsManualOffline(snapshot.val() === 'offline');
      },
      (error) => {
        const msg = error?.message?.toLowerCase() || '';
        if (!msg.includes('permission_denied') && !msg.includes('permission denied')) {
          console.warn('Manual status listener error:', error);
        }
      }
    );
    return () => unsubscribe();
  }, [user?.uid, user?.id]);

  // Subscribe to real-time live tenant metadata from Firestore `tenants/{tenantId}`
  useEffect(() => {
    if (!user?.tenantId || user.tenantId === 'root') {
      setLiveTenant(null);
      return;
    }

    try {
      const unsubscribe = onSnapshot(
        doc(db, 'tenants', user.tenantId),
        (snap) => {
          if (snap.exists()) {
            setLiveTenant(snap.data());
          } else {
            setLiveTenant(null);
          }
        },
        (err) => {
          console.warn('[ProfileScreen] Realtime tenant metadata listener error:', err);
        }
      );
      return () => unsubscribe();
    } catch (err) {
      console.warn('[ProfileScreen] Failed to establish tenant metadata listener:', err);
    }
  }, [user?.tenantId]);

  const displayTenantName =
    liveTenant?.company ||
    liveTenant?.name ||
    tenant?.tenantName ||
    user?.tenantName ||
    'Amia Studios';

  const toggleOnlineStatus = async (checked: boolean) => {
    const uid = auth.currentUser?.uid || user?.uid || user?.id;
    setIsManualOffline(!checked);
    if (!uid || !auth.currentUser) return;
    const status = checked ? 'online' : 'offline';
    set(ref(rtdb, `/presence/${uid}/manualStatus`), status).catch((err) => {
      const msg = err?.message?.toLowerCase() || '';
      if (!msg.includes('permission_denied') && !msg.includes('permission denied')) {
        console.warn('Failed to update manual online status:', err);
      }
    });
  };

  const handleSignOutPrompt = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to sign out of your Kuro workspace?');
      if (confirmed) {
        setIsSigningOut(true);
        signOut('manual').catch((err: any) => {
          alert(err.message || 'Failed to sign out.');
          setIsSigningOut(false);
        });
      }
      return;
    }

    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your Kuro workspace?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsSigningOut(true);
            try {
              await signOut('manual');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to sign out.');
              setIsSigningOut(false);
            }
          },
        },
      ]
    );
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
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: spacing.base, paddingBottom: 32 },
        ]}
      >
        {/* User Identity Card */}
        <Card style={styles.userCard}>
          <CardContent style={{ paddingTop: spacing.base, paddingBottom: spacing.base }}>
            <View style={styles.userHeaderRow}>
              {/* Left: Avatar without green outline */}
              <CrewAvatar
                avatarUrl={user?.avatarUrl}
                name={user?.name}
                size={68}
              />

              {/* Center: User Info */}
              <View style={styles.userInfoBlock}>
                <Text
                  style={[
                    styles.userName,
                    { color: colors.cardForeground, fontSize: typography.fontSize.lg },
                  ]}
                >
                  {user?.name || 'Kuro Operator'}
                </Text>

                <Text
                  style={[
                    styles.userEmail,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.base },
                  ]}
                >
                  {user?.email || 'operator@amiastudios.com'}
                </Text>

                {/* Full Tenant Name under User's Email */}
                <Text
                  style={[
                    styles.userTenant,
                    { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
                  ]}
                >
                  {displayTenantName}
                </Text>

                <View style={styles.badgeRow}>
                  <Badge variant="brand">{user?.role || 'Administrator'}</Badge>
                </View>
              </View>

              {/* Right: Available / Away Toggle */}
              <View style={styles.presenceRightSlot}>
                <Text
                  style={[
                    styles.onlineStatusText,
                    {
                      color: colors.mutedForeground,
                      fontSize: typography.fontSize.sm,
                    },
                  ]}
                >
                  {!isManualOffline ? 'Available' : 'Away'}
                </Text>
                <Switch
                  value={!isManualOffline}
                  onValueChange={toggleOnlineStatus}
                  trackColor={{ false: colors.border, true: colors.border }}
                  thumbColor={!isManualOffline ? colors.brandGreen : colors.mutedForeground}
                  style={
                    Platform.OS === 'ios'
                      ? { transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }
                      : { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }
                  }
                  testID="profile-online-status-toggle"
                />
              </View>
            </View>
          </CardContent>
        </Card>

        {/* App Appearance Settings Card (Wide & Double Size Buttons, No Leading Icon) */}
        <Card style={styles.sectionCard}>
          <CardHeader>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.cardForeground, fontSize: typography.fontSize.lg },
              ]}
            >
              App Appearance
            </Text>
          </CardHeader>
          <CardContent>
            <View style={styles.themeButtonsGroupWide}>
              <Pressable
                onPress={() => setThemeMode('dark')}
                style={[
                  styles.themeButtonWide,
                  {
                    backgroundColor: themeMode === 'dark' ? colors.primary : colors.surface,
                    borderColor: themeMode === 'dark' ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Dark Theme"
                testID="theme-dark-btn"
              >
                <Moon
                  size={20}
                  color={themeMode === 'dark' ? colors.primaryForeground : colors.foreground}
                />
                <Text
                  style={[
                    styles.themeBtnTextWide,
                    {
                      color: themeMode === 'dark' ? colors.primaryForeground : colors.foreground,
                      fontSize: typography.fontSize.base,
                    },
                  ]}
                >
                  Dark
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setThemeMode('light')}
                style={[
                  styles.themeButtonWide,
                  {
                    backgroundColor: themeMode === 'light' ? colors.primary : colors.surface,
                    borderColor: themeMode === 'light' ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Light Theme"
                testID="theme-light-btn"
              >
                <Sun
                  size={20}
                  color={themeMode === 'light' ? colors.primaryForeground : colors.foreground}
                />
                <Text
                  style={[
                    styles.themeBtnTextWide,
                    {
                      color: themeMode === 'light' ? colors.primaryForeground : colors.foreground,
                      fontSize: typography.fontSize.base,
                    },
                  ]}
                >
                  Light
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setThemeMode('system')}
                style={[
                  styles.themeButtonWide,
                  {
                    backgroundColor: themeMode === 'system' ? colors.primary : colors.surface,
                    borderColor: themeMode === 'system' ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="System Auto Theme"
                testID="theme-auto-btn"
              >
                <Smartphone
                  size={20}
                  color={themeMode === 'system' ? colors.primaryForeground : colors.foreground}
                />
                <Text
                  style={[
                    styles.themeBtnTextWide,
                    {
                      color: themeMode === 'system' ? colors.primaryForeground : colors.foreground,
                      fontSize: typography.fontSize.base,
                    },
                  ]}
                >
                  Auto
                </Text>
              </Pressable>
            </View>
          </CardContent>
        </Card>
      </ScrollView>

      {/* Fixed Bottom Action Pane above Bottom Tab Bar */}
      <View
        style={[
          styles.bottomActionPane,
          {
            paddingHorizontal: spacing.base,
            paddingTop: spacing.xs,
            paddingBottom: 18,
            backgroundColor: colors.background,
          },
        ]}
      >
        {/* Version Header above Sign Out */}
        <View style={styles.versionFooter}>
          <Text
            style={[
              styles.versionText,
              { color: colors.mutedForeground, fontSize: typography.fontSize.sm },
            ]}
          >
            {`Kuro RMS Mobile • Build ${packageJson.version || '0.1.2'} (Release)`}
          </Text>
        </View>

        <Button
          variant="destructive"
          size="lg"
          fullWidth
          loading={isSigningOut}
          loadingText="Signing out..."
          icon={<LogOut size={18} color={colors.destructiveForeground} />}
          onPress={handleSignOutPrompt}
          testID="profile-sign-out-btn"
        >
          Sign Out of Account
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  userCard: {
    marginBottom: 12,
  },
  userHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarCircle: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarText: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  userInfoBlock: {
    flex: 1,
  },
  userName: {
    fontFamily: 'Calibri',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  presenceRightSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 8,
    gap: 4,
    minHeight: 48,
    minWidth: 48,
  },
  onlineStatusText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  userEmail: {
    fontFamily: 'Calibri',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  userTenant: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    fontWeight: '500',
  },
  badgeRow: {
    marginTop: 6,
  },
  sectionCard: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Calibri',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  themeButtonsGroupWide: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  themeButtonWide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  themeBtnTextWide: {
    fontFamily: 'Calibri',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  bottomActionPane: {
    paddingTop: 8,
    paddingBottom: 18,
  },
  versionFooter: {
    marginBottom: 10,
    alignItems: 'center',
  },
  versionText: {
    fontFamily: 'Calibri',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});


