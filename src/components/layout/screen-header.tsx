import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/theme-context';
import { Badge } from '@/components/ui/badge';
import { OnlineIndicator, type ConnectionStatus } from '@/components/ui/online-indicator';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showTenantBadge?: boolean;
  tenantName?: string;
  showConnectionStatus?: boolean;
  connectionStatus?: ConnectionStatus;
  latencyMs?: number;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  showTenantBadge = false,
  tenantName,
  showConnectionStatus = false,
  connectionStatus = 'online',
  latencyMs,
  leftAction,
  rightAction,
  style,
  testID,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, typography, spacing, layout } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
          paddingTop: insets.top + spacing.sm,
          paddingBottom: spacing.sm,
          paddingHorizontal: spacing.base,
        },
        style,
      ]}
    >
      <View style={[styles.contentRow, { minHeight: layout.headerHeight - spacing.sm }]}>
        <View style={styles.leftSlot}>
          {leftAction ? <View style={styles.actionSlot}>{leftAction}</View> : null}
          <View style={styles.titleBlock}>
            <View style={styles.titleLine}>
              <Text
                numberOfLines={1}
                style={[
                  styles.title,
                  {
                    color: colors.foreground,
                    fontSize: typography.fontSize.xl,
                    lineHeight: typography.lineHeight.xl,
                  },
                ]}
              >
                {title}
              </Text>
              {showTenantBadge && tenantName ? (
                <Badge variant="secondary" style={styles.tenantBadge}>
                  {tenantName}
                </Badge>
              ) : null}
            </View>
            {subtitle ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.subtitle,
                  {
                    color: colors.mutedForeground,
                    fontSize: typography.fontSize.sm,
                    lineHeight: typography.lineHeight.sm,
                    marginTop: 2,
                  },
                ]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.rightSlot}>
          {showConnectionStatus ? (
            <OnlineIndicator
              status={connectionStatus}
              latencyMs={latencyMs}
              showLabel={true}
              style={styles.connectionIndicator}
            />
          ) : null}
          {rightAction ? <View style={styles.actionSlot}>{rightAction}</View> : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderBottomWidth: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: 'Calibri',
    fontWeight: '700',
  },
  subtitle: {
    fontFamily: 'Calibri',
    fontWeight: '400',
  },
  tenantBadge: {
    marginLeft: 6,
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionSlot: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectionIndicator: {
    marginRight: 4,
  },
});
