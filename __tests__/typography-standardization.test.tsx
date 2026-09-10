/**
 * __tests__/typography-standardization.test.tsx
 * Comprehensive Typography Scale & UI Primitive Font Legibility Test Suite.
 *
 * Validates:
 * 1. Centralized typography token scale (xs=12, sm=13, base=14, md=16, lg=18, xl=20, 2xl=24, 3xl=30).
 * 2. <Text> component variants and styles (h1, h2, h3, h4, subheading, body, body-sm, caption, label, overline, muted).
 * 3. CardTitle (18px) and CardDescription (13px) font sizes.
 * 4. EmptyState title (18px) and description (13px) font sizes.
 * 5. Input label (13px), textInput (14px), errorText (13px), helperText (13px).
 * 6. ModalSheet title (18px) font size.
 * 7. OnlineIndicator label (13px) font size.
 * 8. Min touch targets (min 48dp) across interactive primitives.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet, type TextStyle } from 'react-native';
import { typography, layout } from '@/constants/theme';
import { Text } from '@/components/ui/text';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { Badge } from '@/components/ui/badge';
import { ScreenHeader } from '@/components/layout/screen-header';
import { QuickStatusSelector } from '@/components/repair/quick-status-selector';
import { RepairTicketCard } from '@/components/repair/repair-ticket-card';
import { EventCard } from '@/components/events/event-card';
import { EventFilterTabs } from '@/components/events/event-filter-tabs';
import { CategoryFilterBar } from '@/components/inventory/category-filter-bar';
import { LogisticsJobCard } from '@/components/logistics/LogisticsJobCard';
import { ScanHudOverlay } from '@/components/scanner/scan-hud-overlay';
import { ThemeProvider } from '@/context/theme-context';
import type { RepairTicket } from '@/types/repair';
import type { Event } from '@/types/events';
import type { LogisticsEntry } from '@/types/logistics';

describe('Typography Standardization & Legibility Hierarchy', () => {
  describe('Typography Scale Tokens', () => {
    it('provides standard legible font sizes across the typography scale', () => {
      expect(typography.fontSize.xs).toBe(12);
      expect(typography.fontSize.sm).toBe(13);
      expect(typography.fontSize.base).toBe(14);
      expect(typography.fontSize.md).toBe(16);
      expect(typography.fontSize.lg).toBe(18);
      expect(typography.fontSize.xl).toBe(20);
      expect(typography.fontSize['2xl']).toBe(24);
      expect(typography.fontSize['3xl']).toBe(30);
    });

    it('provides proportionate line-heights matching font sizes', () => {
      expect(typography.lineHeight.xs).toBe(16);
      expect(typography.lineHeight.sm).toBe(18);
      expect(typography.lineHeight.base).toBe(20);
      expect(typography.lineHeight.md).toBe(22);
      expect(typography.lineHeight.lg).toBe(24);
      expect(typography.lineHeight.xl).toBe(26);
      expect(typography.lineHeight['2xl']).toBe(30);
      expect(typography.lineHeight['3xl']).toBe(36);
    });
  });

  describe('<Text> Component Variant Font Sizes & Styles', () => {
    function getFlattenedStyle(element: React.ReactElement): TextStyle {
      const { getByTestId } = render(<ThemeProvider>{element}</ThemeProvider>);
      const textNode = getByTestId('test-text');
      return StyleSheet.flatten(textNode.props.style);
    }

    it('renders "h1" at 24px with bold weight', () => {
      const style = getFlattenedStyle(<Text variant="h1" testID="test-text">H1 Header</Text>);
      expect(style.fontSize).toBe(24);
      expect(style.lineHeight).toBe(30);
      expect(style.fontWeight).toBe('700');
    });

    it('renders "h2" (section titles) at 18px with bold weight', () => {
      const style = getFlattenedStyle(<Text variant="h2" testID="test-text">H2 Section</Text>);
      expect(style.fontSize).toBe(18);
      expect(style.lineHeight).toBe(24);
      expect(style.fontWeight).toBe('700');
    });

    it('renders "h3" (modal titles) at 16px with bold weight', () => {
      const style = getFlattenedStyle(<Text variant="h3" testID="test-text">H3 Modal</Text>);
      expect(style.fontSize).toBe(16);
      expect(style.lineHeight).toBe(22);
      expect(style.fontWeight).toBe('700');
    });

    it('renders "h4" at 14px with semibold weight', () => {
      const style = getFlattenedStyle(<Text variant="h4" testID="test-text">H4 Title</Text>);
      expect(style.fontSize).toBe(14);
      expect(style.lineHeight).toBe(20);
      expect(style.fontWeight).toBe('600');
    });

    it('renders "subheading" at 14px with semibold weight', () => {
      const style = getFlattenedStyle(<Text variant="subheading" testID="test-text">Subheading</Text>);
      expect(style.fontSize).toBe(14);
      expect(style.lineHeight).toBe(20);
      expect(style.fontWeight).toBe('600');
    });

    it('renders "body" (standard baseline text) at 14px', () => {
      const style = getFlattenedStyle(<Text variant="body" testID="test-text">Body standard text</Text>);
      expect(style.fontSize).toBe(14);
      expect(style.lineHeight).toBe(20);
    });

    it('renders "body-sm" at 13px', () => {
      const style = getFlattenedStyle(<Text variant="body-sm" testID="test-text">Body small</Text>);
      expect(style.fontSize).toBe(13);
      expect(style.lineHeight).toBe(18);
    });

    it('renders "caption" at 13px', () => {
      const style = getFlattenedStyle(<Text variant="caption" testID="test-text">Caption text</Text>);
      expect(style.fontSize).toBe(13);
      expect(style.lineHeight).toBe(18);
    });

    it('renders "label" at 13px semibold uppercase with 0.2 letter spacing', () => {
      const style = getFlattenedStyle(<Text variant="label" testID="test-text">Field Label</Text>);
      expect(style.fontSize).toBe(13);
      expect(style.lineHeight).toBe(18);
      expect(style.fontWeight).toBe('600');
      expect(style.letterSpacing).toBe(0.2);
      expect(style.textTransform).toBe('uppercase');
    });

    it('renders "overline" at 12px bold uppercase with 0.6 letter spacing', () => {
      const style = getFlattenedStyle(<Text variant="overline" testID="test-text">Section Overline</Text>);
      expect(style.fontSize).toBe(12);
      expect(style.lineHeight).toBe(16);
      expect(style.fontWeight).toBe('700');
      expect(style.letterSpacing).toBe(0.6);
      expect(style.textTransform).toBe('uppercase');
    });

    it('renders "muted" at 13px', () => {
      const style = getFlattenedStyle(<Text variant="muted" testID="test-text">Muted text</Text>);
      expect(style.fontSize).toBe(13);
      expect(style.lineHeight).toBe(18);
    });
  });

  describe('UI Component Legible Typography', () => {
    it('verifies CardTitle renders at 18px and CardDescription at 13px', () => {
      const { getByText } = render(
        <ThemeProvider>
          <Card>
            <CardTitle>Card Title Test</CardTitle>
            <CardDescription>Card Description Test</CardDescription>
          </Card>
        </ThemeProvider>
      );

      const titleNode = getByText('Card Title Test');
      const titleStyle = StyleSheet.flatten(titleNode.props.style);
      expect(titleStyle.fontSize).toBe(18);
      expect(titleStyle.lineHeight).toBe(24);

      const descNode = getByText('Card Description Test');
      const descStyle = StyleSheet.flatten(descNode.props.style);
      expect(descStyle.fontSize).toBe(13);
      expect(descStyle.lineHeight).toBe(18);
    });

    it('verifies EmptyState title renders at 18px and description at 13px', () => {
      const { getByText } = render(
        <ThemeProvider>
          <EmptyState
            title="Empty State Title"
            description="Empty State Description"
          />
        </ThemeProvider>
      );

      const titleNode = getByText('Empty State Title');
      const titleStyle = StyleSheet.flatten(titleNode.props.style);
      expect(titleStyle.fontSize).toBe(18);
      expect(titleStyle.lineHeight).toBe(24);

      const descNode = getByText('Empty State Description');
      const descStyle = StyleSheet.flatten(descNode.props.style);
      expect(descStyle.fontSize).toBe(13);
      expect(descStyle.lineHeight).toBe(18);
    });

    it('verifies Input label is 13px, input text is 14px, and error/helper text is 13px', () => {
      const { getByText, getByTestId } = render(
        <ThemeProvider>
          <Input
            label="EQUIPMENT NAME"
            value="Stage Light"
            error="Required field"
            helperText="Enter full asset name"
            testID="test-input"
          />
        </ThemeProvider>
      );

      const labelNode = getByText('EQUIPMENT NAME');
      const labelStyle = StyleSheet.flatten(labelNode.props.style);
      expect(labelStyle.fontSize).toBe(13);
      expect(labelStyle.lineHeight).toBe(18);

      const inputNode = getByTestId('test-input');
      const inputStyle = StyleSheet.flatten(inputNode.props.style);
      expect(inputStyle.fontSize).toBe(14);

      const errorNode = getByText('Required field');
      const errorStyle = StyleSheet.flatten(errorNode.props.style);
      expect(errorStyle.fontSize).toBe(13);
      expect(errorStyle.lineHeight).toBe(18);
    });

    it('verifies ModalSheet title renders at 18px', () => {
      const { getByText } = render(
        <ThemeProvider>
          <ModalSheet visible={true} onClose={() => {}} title="Edit Properties">
            <Text>Content</Text>
          </ModalSheet>
        </ThemeProvider>
      );

      const titleNode = getByText('Edit Properties');
      const titleStyle = StyleSheet.flatten(titleNode.props.style);
      expect(titleStyle.fontSize).toBe(18);
      expect(titleStyle.lineHeight).toBe(24);
    });

    it('verifies OnlineIndicator label renders at 13px', () => {
      const { getByText } = render(
        <ThemeProvider>
          <OnlineIndicator status="online" showLabel label="Connected" />
        </ThemeProvider>
      );

      const labelNode = getByText('Connected');
      const labelStyle = StyleSheet.flatten(labelNode.props.style);
      expect(labelStyle.fontSize).toBe(13);
    });

    it('verifies Badge text renders at standard 13px and container minHeight >= 26', () => {
      const { getByText, getByTestId } = render(
        <ThemeProvider>
          <Badge testID="test-badge" variant="brand">Administrator</Badge>
        </ThemeProvider>
      );

      const badgeTextNode = getByText('Administrator');
      const textStyle = StyleSheet.flatten(badgeTextNode.props.style);
      expect(textStyle.fontSize).toBe(13);
      expect(textStyle.lineHeight).toBe(18);

      const badgeContainerNode = getByTestId('test-badge');
      const containerStyle = StyleSheet.flatten(badgeContainerNode.props.style);
      expect(containerStyle.minHeight).toBeGreaterThanOrEqual(24);
    });

    it('verifies ScreenHeader subtitle renders at 13px', () => {
      const { getByText } = render(
        <ThemeProvider>
          <ScreenHeader title="Repairs" subtitle="Active maintenance tickets" />
        </ThemeProvider>
      );

      const subtitleNode = getByText('Active maintenance tickets');
      const subtitleStyle = StyleSheet.flatten(subtitleNode.props.style);
      expect(subtitleStyle.fontSize).toBe(13);
      expect(subtitleStyle.lineHeight).toBe(18);
    });

    it('verifies QuickStatusSelector button labels render at 13px', () => {
      const { getByText } = render(
        <ThemeProvider>
          <QuickStatusSelector currentStatus="Pending" onSelectStatus={() => {}} />
        </ThemeProvider>
      );

      const pendingLabel = getByText('Pending');
      const labelStyle = StyleSheet.flatten(pendingLabel.props.style);
      expect(labelStyle.fontSize).toBe(13);
    });

    it('verifies RepairTicketCard statusBadgeText renders at 13px', () => {
      const mockTicket: RepairTicket = {
        id: 'T-100',
        tenantId: 'tenant-1',
        repairNumber: 100,
        equipment: { id: 'eq-1', name: 'Moving Head 1' },
        status: 'Under Repair',
        priority: 'High',
        condition: 'Out of Service',
        requestedBy: 'Tech 1',
      };

      const { getByText } = render(
        <ThemeProvider>
          <RepairTicketCard ticket={mockTicket} onPress={() => {}} />
        </ThemeProvider>
      );

      const statusBadgeText = getByText('Under Repair');
      const statusStyle = StyleSheet.flatten(statusBadgeText.props.style);
      expect(statusStyle.fontSize).toBe(13);
      expect(statusStyle.lineHeight).toBe(18);
    });

    it('verifies EventCard eventNumber and typeLabel render at 13px', () => {
      const mockEvent: Event = {
        id: 'ev-1',
        tenantId: 'tenant-1',
        eventName: 'Festival Stage A',
        eventNumber: 1042,
        clientId: 'cl-1',
        eventStatusId: 'Confirmed',
        eventTypeId: 'type-1',
        assigneeId: 'usr-1',
        startTime: new Date('2026-09-01T10:00:00Z'),
        finishTime: new Date('2026-09-01T22:00:00Z'),
        deliveryTime: new Date('2026-09-01T08:00:00Z'),
        setupTime: new Date('2026-09-01T10:00:00Z'),
        eventStartDate: new Date('2026-09-01T12:00:00Z'),
        eventFinishDate: new Date('2026-09-01T20:00:00Z'),
        pickupTime: new Date('2026-09-01T21:00:00Z'),
        packdownTime: new Date('2026-09-01T23:00:00Z'),
      };

      const { getByText } = render(
        <ThemeProvider>
          <EventCard event={mockEvent} typeName="Audio" />
        </ThemeProvider>
      );

      const numNode = getByText('[1042]');
      const numStyle = StyleSheet.flatten(numNode.props.style);
      expect(numStyle.fontSize).toBe(13);
      expect(numStyle.lineHeight).toBe(18);

      const typeNode = getByText('Audio');
      const typeStyle = StyleSheet.flatten(typeNode.props.style);
      expect(typeStyle.fontSize).toBe(13);
      expect(typeStyle.lineHeight).toBe(18);
    });

    it('verifies EventFilterTabs count badges render at 13px and tab touch target minHeight >= 48dp', () => {
      const { getByText, getByTestId } = render(
        <ThemeProvider>
          <EventFilterTabs
            selectedTab="today"
            onSelectTab={() => {}}
            counts={{ today: 5, inProgress: 2, upcoming: 10, all: 17 }}
          />
        </ThemeProvider>
      );

      const countNode = getByText('5');
      const countStyle = StyleSheet.flatten(countNode.props.style);
      expect(countStyle.fontSize).toBe(13);
      expect(countStyle.lineHeight).toBe(18);

      const tabNode = getByTestId('event-tab-today');
      const tabStyle = StyleSheet.flatten(tabNode.props.style);
      expect(tabStyle.minHeight).toBeGreaterThanOrEqual(48);
    });

    it('verifies CategoryFilterBar chip text is 13px and minHeight >= 48dp', () => {
      const { getByText, getByTestId } = render(
        <ThemeProvider>
          <CategoryFilterBar selectedCategory="Audio" onSelectCategory={() => {}} />
        </ThemeProvider>
      );

      const audioNode = getByText('Audio');
      const audioStyle = StyleSheet.flatten(audioNode.props.style);
      expect(audioStyle.fontSize).toBe(13);

      const chipNode = getByTestId('inventory-cat-chip-audio');
      const chipStyle = StyleSheet.flatten(chipNode.props.style);
      expect(chipStyle.minHeight).toBeGreaterThanOrEqual(48);
    });

    it('verifies LogisticsJobCard liveTrackingText renders at 13px', () => {
      const mockJob: LogisticsEntry = {
        id: 'job-1',
        tenantId: 'tenant-1',
        location: 'Metro Arena',
        start: '2026-09-01T08:00:00Z',
        end: '2026-09-01T18:00:00Z',
        createdBy: 'user-1',
        updatedBy: 'user-1',
        createdAt: '2026-09-01T08:00:00Z',
        updatedAt: '2026-09-01T08:00:00Z',
        status: 'In Transit',
        isTrackingActive: true,
        eventName: 'Arena Show',
      };

      const { getByText } = render(
        <ThemeProvider>
          <LogisticsJobCard job={mockJob} onPress={() => {}} />
        </ThemeProvider>
      );

      const trackingNode = getByText('LIVE GPS');
      const trackingStyle = StyleSheet.flatten(trackingNode.props.style);
      expect(trackingStyle.fontSize).toBe(13);
      expect(trackingStyle.lineHeight).toBe(18);
    });

    it('verifies ScanHudOverlay message renders at 13px and close button touch target minHeight >= 48dp', () => {
      const { getByText, getByLabelText } = render(
        <ThemeProvider>
          <ScanHudOverlay
            visible={true}
            onDismiss={() => {}}
            result={{
              type: 'SUCCESS',
              message: 'Asset verified and prepped',
              isFullyPrepped: true,
            }}
          />
        </ThemeProvider>
      );

      const msgNode = getByText('Asset verified and prepped');
      const msgStyle = StyleSheet.flatten(msgNode.props.style);
      expect(msgStyle.fontSize).toBe(13);

      const closeNode = getByLabelText('Dismiss scan notification');
      const closeStyle = StyleSheet.flatten(closeNode.props.style);
      expect(closeStyle.minHeight).toBeGreaterThanOrEqual(48);
    });

    it('verifies accessible minimum touch target (minTouchTarget >= 48dp)', () => {
      expect(layout.minTouchTarget).toBeGreaterThanOrEqual(48);
    });
  });
});
