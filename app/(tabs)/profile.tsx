/**
 * app/(tabs)/profile.tsx
 * User Profile, Tenant Information, Presence & Sign-Out Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Pressable,
} from 'react-native';
import {
  Building2,
  Shield,
  LogOut,
  Moon,
  Sun,
  Smartphone,
  Activity,
} from 'lucide-react-native';

import { useTheme } from '@/context/theme-context';
import { useAuth } from '@/context/auth-context';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OnlineIndicator } from '@/components/ui/online-indicator';

export default function ProfileScreen() {
  const { colors, typography, spacing, themeMode, setThemeMode } = useTheme();
  const { user, tenant, signOut } = useAuth();

  const [isAvailable, setIsAvailable] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const getInitials = (name?: string): string => {
    if (!name) return 'OP';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleSignOutPrompt = () => {
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

  const enabledModules = user?.enabledModules || ['dashboard', 'events', 'logistics', 'dispatch', 'repair', 'inventory'];
  const accessRights = user?.accessRights || ['Events', 'Logistics', 'Dispatch', 'Inventory'];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Account Profile" subtitle="Operator Profile & Tenant Workspace" />

      <ScrollView contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}>
        {/* User Identity Card */}
        <Card style={styles.userCard}>
          <CardContent style={{ paddingTop: spacing.base }}>
            <View style={styles.userHeaderRow}>
              <View style={[styles.avatarCircle, { backgroundColor: colors.brandGreenScale.green2, borderColor: colors.brandGreenScale.green4 }]}>
                <Text style={[styles.avatarText, { color: colors.primary, fontSize: typography.fontSize.xl }]}>
                  {getInitials(user?.name)}
                </Text>
              </View>

              <View style={styles.userInfoBlock}>
                <Text style={[styles.userName, { color: colors.cardForeground, fontSize: typography.fontSize.lg }]}>
                  {user?.name || 'Kuro Operator'}
                </Text>
                <Text style={[styles.userEmail, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                  {user?.email || 'operator@amiastudios.com'}
                </Text>
                <View style={styles.badgeRow}>
                  <Badge variant="brand">{user?.role || 'Administrator'}</Badge>
                </View>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Tenant Organization Information */}
        <Card style={styles.sectionCard}>
          <CardHeader>
            <View style={styles.sectionHeaderRow}>
              <Building2 size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: colors.cardForeground, fontSize: typography.fontSize.md }]}>
                Organization Workspace
              </Text>
            </View>
          </CardHeader>
          <CardContent>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                Company Name
              </Text>
              <Text style={[styles.infoValue, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                {tenant?.tenantName || user?.tenantName || 'Amia Studios'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                Tenant ID
              </Text>
              <Text style={[styles.infoCode, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                {user?.tenantId || 'tenant-amia-prod'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground, fontSize: typography.fontSize.sm }]}>
                Workspace Status
              </Text>
              <Badge variant="success">Active</Badge>
            </View>

            <View style={[styles.modulesBlock, { borderTopColor: colors.border }]}>
              <Text style={[styles.modulesTitle, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                Active Feature Modules
              </Text>
              <View style={styles.chipsWrap}>
                {enabledModules.map((mod) => (
                  <Badge key={mod} variant="secondary" style={styles.moduleChip}>
                    {mod}
                  </Badge>
                ))}
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Role & Permissions */}
        <Card style={styles.sectionCard}>
          <CardHeader>
            <View style={styles.sectionHeaderRow}>
              <Shield size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: colors.cardForeground, fontSize: typography.fontSize.md }]}>
                Role & Operational Access Rights
              </Text>
            </View>
          </CardHeader>
          <CardContent>
            <View style={styles.chipsWrap}>
              {accessRights.map((right) => (
                <Badge key={right} variant="brand" style={styles.moduleChip}>
                  {right}
                </Badge>
              ))}
            </View>
          </CardContent>
        </Card>

        {/* Presence & System Controls */}
        <Card style={styles.sectionCard}>
          <CardHeader>
            <View style={styles.sectionHeaderRow}>
              <Activity size={18} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: colors.cardForeground, fontSize: typography.fontSize.md }]}>
                Presence & Application Settings
              </Text>
            </View>
          </CardHeader>
          <CardContent>
            {/* Online Presence Toggle */}
            <View style={styles.presenceToggleRow}>
              <View style={styles.presenceTextGroup}>
                <View style={styles.presenceStatusHeader}>
                  <OnlineIndicator status={isAvailable ? 'online' : 'offline'} pulse={isAvailable} size={8} />
                  <Text style={[styles.presenceTitle, { color: colors.foreground, fontSize: typography.fontSize.sm, marginLeft: 6 }]}>
                    {isAvailable ? 'Available (Online)' : 'Away (Offline)'}
                  </Text>
                </View>
                <Text style={[styles.presenceDesc, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
                  Broadcast live operational availability to warehouse dispatch.
                </Text>
              </View>
              <Switch
                value={isAvailable}
                onValueChange={setIsAvailable}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Theme Selector */}
            <View style={[styles.themeSelectRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.themeLabel, { color: colors.foreground, fontSize: typography.fontSize.sm }]}>
                App Appearance
              </Text>
              <View style={styles.themeButtonsGroup}>
                <Pressable
                  onPress={() => setThemeMode('dark')}
                  style={[
                    styles.themeButton,
                    {
                      backgroundColor: themeMode === 'dark' ? colors.primary : colors.surface,
                      borderColor: themeMode === 'dark' ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Moon size={14} color={themeMode === 'dark' ? colors.primaryForeground : colors.foreground} />
                  <Text style={[styles.themeBtnText, { color: themeMode === 'dark' ? colors.primaryForeground : colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Dark
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setThemeMode('light')}
                  style={[
                    styles.themeButton,
                    {
                      backgroundColor: themeMode === 'light' ? colors.primary : colors.surface,
                      borderColor: themeMode === 'light' ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Sun size={14} color={themeMode === 'light' ? colors.primaryForeground : colors.foreground} />
                  <Text style={[styles.themeBtnText, { color: themeMode === 'light' ? colors.primaryForeground : colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Light
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setThemeMode('system')}
                  style={[
                    styles.themeButton,
                    {
                      backgroundColor: themeMode === 'system' ? colors.primary : colors.surface,
                      borderColor: themeMode === 'system' ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Smartphone size={14} color={themeMode === 'system' ? colors.primaryForeground : colors.foreground} />
                  <Text style={[styles.themeBtnText, { color: themeMode === 'system' ? colors.primaryForeground : colors.foreground, fontSize: typography.fontSize.xs }]}>
                    Auto
                  </Text>
                </Pressable>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Sign Out Action Button */}
        <Button
          variant="destructive"
          size="lg"
          fullWidth
          loading={isSigningOut}
          loadingText="Signing out..."
          icon={<LogOut size={18} color={colors.destructiveForeground} />}
          onPress={handleSignOutPrompt}
          style={{ marginTop: spacing.md }}
        >
          Sign Out of Account
        </Button>

        {/* Version Footer */}
        <View style={styles.versionFooter}>
          <Text style={[styles.versionText, { color: colors.mutedForeground, fontSize: typography.fontSize.xs }]}>
            Kuro Mobile ERP • Build 1.0.0 (Release)
          </Text>
        </View>
      </ScrollView>
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
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontWeight: '700',
  },
  userInfoBlock: {
    flex: 1,
  },
  userName: {
    fontWeight: '700',
  },
  userEmail: {
    marginTop: 2,
  },
  badgeRow: {
    marginTop: 6,
  },
  sectionCard: {
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    fontWeight: '500',
  },
  infoValue: {
    fontWeight: '600',
  },
  infoCode: {
    fontFamily: 'monospace',
  },
  modulesBlock: {
    paddingTop: 10,
    borderTopWidth: 1,
    marginTop: 4,
  },
  modulesTitle: {
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  moduleChip: {
    marginBottom: 2,
  },
  presenceToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  presenceTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  presenceStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presenceTitle: {
    fontWeight: '600',
  },
  presenceDesc: {
    marginTop: 2,
  },
  themeSelectRow: {
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeLabel: {
    fontWeight: '600',
  },
  themeButtonsGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  themeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 36,
  },
  themeBtnText: {
    fontWeight: '600',
  },
  versionFooter: {
    marginTop: 20,
    alignItems: 'center',
  },
  versionText: {
    textAlign: 'center',
  },
});
