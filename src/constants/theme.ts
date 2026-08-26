/**
 * Kuro Mobile Theme Tokens & Typography
 * Directly derived from Kuro Web design system (globals.css, tailwind.config.ts)
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  cardForeground: string;
  foreground: string;
  popover: string;
  popoverForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  ring: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  brandGreen: string;
  brandGreenMuted: string;
  brandGreenScale: {
    green1: string;
    green2: string;
    green3: string;
    green4: string;
    green5: string;
  };
  status: {
    online: string;
    offline: string;
    degraded: string;
    events: string;
    logistics: string;
    dispatch: string;
    repairs: string;
  };
}

export const darkColors: ThemeColors = {
  background: '#141414',
  surface: '#1A1A1A',
  card: '#1F1F1F',
  cardForeground: '#E5E5E5',
  foreground: '#E5E5E5',
  popover: '#1A1A1A',
  popoverForeground: '#E5E5E5',
  muted: '#1F471F',
  mutedForeground: '#8C8C8C',
  border: '#303030',
  input: '#303030',
  ring: '#CBD5E1',
  primary: '#22C55E',
  primaryForeground: '#FFFFFF',
  secondary: '#1F471F',
  secondaryForeground: '#FAFAFA',
  accent: 'rgba(32, 96, 32, 0.90)',
  accentForeground: '#FAFAFA',
  destructive: '#DC2626',
  destructiveForeground: '#FAFAFA',
  brandGreen: '#206020',
  brandGreenMuted: 'rgba(32, 96, 32, 0.35)',
  brandGreenScale: {
    green1: 'rgba(32, 96, 32, 0.05)',
    green2: 'rgba(32, 96, 32, 0.15)',
    green3: 'rgba(32, 96, 32, 0.35)',
    green4: 'rgba(32, 96, 32, 0.60)',
    green5: 'rgba(32, 96, 32, 0.90)',
  },
  status: {
    online: '#16A34A',
    offline: '#EF4444',
    degraded: '#EAB308',
    events: '#60A5FA',
    logistics: '#16A34A',
    dispatch: '#EAB308',
    repairs: '#EF4444',
  },
};

export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F8FAFC',
  card: '#FFFFFF',
  cardForeground: '#020817',
  foreground: '#020817',
  popover: '#FFFFFF',
  popoverForeground: '#020817',
  muted: '#F1F5F9',
  mutedForeground: '#64748B',
  border: '#E2E8F0',
  input: '#E2E8F0',
  ring: '#020817',
  primary: '#0F172A',
  primaryForeground: '#F8FAFC',
  secondary: '#F1F5F9',
  secondaryForeground: '#0F172A',
  accent: '#F1F5F9',
  accentForeground: '#0F172A',
  destructive: '#EF4444',
  destructiveForeground: '#F8FAFC',
  brandGreen: '#206020',
  brandGreenMuted: 'rgba(32, 96, 32, 0.15)',
  brandGreenScale: {
    green1: 'rgba(32, 96, 32, 0.05)',
    green2: 'rgba(32, 96, 32, 0.15)',
    green3: 'rgba(32, 96, 32, 0.35)',
    green4: 'rgba(32, 96, 32, 0.60)',
    green5: 'rgba(32, 96, 32, 0.90)',
  },
  status: {
    online: '#16A34A',
    offline: '#EF4444',
    degraded: '#EAB308',
    events: '#60A5FA',
    logistics: '#16A34A',
    dispatch: '#EAB308',
    repairs: '#EF4444',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
} as const;

export const layout = {
  minTouchTarget: 48,
  headerHeight: 56,
  tabBarHeight: 64,
  badgeHeight: 24,
  borderRadius: {
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    '2xl': 16,
    full: 9999,
  },
} as const;

export const typography = {
  fontFamily: {
    regular: 'Calibri',
    bold: 'Calibri-Bold',
    italic: 'Calibri-Italic',
    boldItalic: 'Calibri-BoldItalic',
    light: 'Calibri-Light',
    body: 'Calibri',
    heading: 'Calibri-Bold',
  },
  fontSize: {
    xs: 12,
    sm: 13,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  lineHeight: {
    xs: 16,
    sm: 18,
    base: 20,
    md: 22,
    lg: 24,
    xl: 26,
    '2xl': 30,
    '3xl': 36,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export const iconSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  hero: 40,
} as const;

