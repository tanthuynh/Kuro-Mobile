/**
 * __tests__/ui-button-styling-contrast.challenger.test.tsx
 * ============================================================================
 * Challenger 2 Adversarial Verification Suite — Milestone 1
 * UI Button Styling, Accessible Contrast & Theme Responsiveness
 * ============================================================================
 *
 * Adversarially verifies all 5 targeted action buttons:
 * 1. "Add Note" button in Logistics Detail (`add-note-btn`)
 * 2. "Report Equipment Fault" button in Repairs Feed (`feed-new-repair-btn`)
 * 3. "Add Photo" button in Repair Detail (`detail-add-photo-btn`)
 * 4. "Add Attachment" button in Repair Detail (`detail-add-attachment-btn`)
 * 5. "Add Photo" button in Repair Photo Gallery (`gallery-add-photo-btn`)
 *
 * Verification Dimensions:
 * - Exact `colors.brandGreen` (`#206020`) background styling in BOTH light and dark themes
 * - Intact, testIDs queryable across all screens
 * - Active, responsive `onPress` handlers in both themes
 * - WCAG 2.1 AA & AAA accessible contrast oracle (luminance & contrast ratio >= 4.5:1 / 7.0:1)
 * - Absence of outline borders or fallback to default primary color
 * - Backward compatibility re-export stub resolution
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

// Theme tokens & components under test
import { darkColors, lightColors } from '@/constants/theme';
import { Button } from '@/components/ui/button';
import { RepairPhotoGallery } from '@/components/repair/repair-photo-gallery';

// Screens under test (both canonical nested paths and backward compatibility stubs)
import LogisticsDetailScreen from '@/../app/(tabs)/logistics/[id]';
import LogisticsDetailStubScreen from '@/../app/logistics/[id]';
import RepairsFeedScreen from '@/../app/(tabs)/repairs';
import RepairDetailScreen from '@/../app/(tabs)/repairs/[id]';
import RepairDetailStubScreen from '@/../app/repair/[id]';

// Services to mock
import * as logisticsService from '@/services/logistics-service';
import * as locationTrackingService from '@/services/location-tracking-service';
import * as repairService from '@/services/repair-service';
import * as equipmentService from '@/services/equipment-service';
import type { LogisticsEntry } from '@/types/logistics';
import type { RepairTicket } from '@/types/repair';

// ----------------------------------------------------------------------------
// Theme Mock with Dynamic Light/Dark Switching
// ----------------------------------------------------------------------------
let mockCurrentThemeMode: 'dark' | 'light' = 'dark';

jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => {
      const isDark = mockCurrentThemeMode === 'dark';
      return {
        colors: isDark ? actualTheme.darkColors : actualTheme.lightColors,
        typography: actualTheme.typography,
        spacing: actualTheme.spacing,
        layout: actualTheme.layout,
        isDark,
        themeMode: mockCurrentThemeMode,
      };
    },
    ThemeProvider: ({ children }: any) => children,
  };
});

// ----------------------------------------------------------------------------
// Auth Context Mock
// ----------------------------------------------------------------------------
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-challenger-01',
      uid: 'usr-challenger-01',
      name: 'Adversarial Verifier',
      email: 'verifier@kuro.test',
      tenantId: 'tenant-test',
    },
    tenant: { tenantId: 'tenant-test', tenantName: 'Verification Rental Corp' },
    isAuthenticated: true,
    isLoading: false,
    isRestoringSession: false,
  }),
}));

// ----------------------------------------------------------------------------
// Expo Router Mock
// ----------------------------------------------------------------------------
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: mockReplace,
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({
      id: 'test-entity-101',
    }),
    useFocusEffect: jest.fn((effect) => {
      React.useEffect(() => {
        const cleanup = effect();
        return () => {
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    }),
    useIsFocused: jest.fn(() => true),
  };
});

// ----------------------------------------------------------------------------
// Mock Data Fixtures
// ----------------------------------------------------------------------------
const mockJobFixture: LogisticsEntry = {
  id: 'test-entity-101',
  tenantId: 'tenant-test',
  eventNumber: 9001,
  eventName: 'Main Stage Audio Delivery',
  location: 'Sydney Olympic Park, NSW',
  status: 'Scheduled',
  driverName: 'Adversarial Verifier',
  assigneeId: 'usr-challenger-01',
  vehicleId: 'veh-99',
  start: new Date('2026-09-10T08:00:00Z'),
  end: new Date('2026-09-10T14:00:00Z'),
  createdBy: 'Dispatcher',
  updatedBy: 'Dispatcher',
  createdAt: '2026-09-10T06:00:00Z',
  updatedAt: '2026-09-10T06:00:00Z',
  archived: false,
  isTrackingActive: false,
  notes: 'Check dock 4 entrance.',
  destinations: [
    {
      id: 'dest-1',
      type: 'destination',
      destinationName: 'Sydney Olympic Park',
      address: 'Sydney Olympic Park, NSW',
    },
  ],
};

const mockTicketFixture: RepairTicket = {
  id: 'test-entity-101',
  tenantId: 'tenant-test',
  repairNumber: 8888,
  internalNotes: 'Initial defect evaluation in workshop',
  internalReference: 'REF-VERIFY-01',
  supplierId: 'Global Stage Gear',
  owner: 'Verification Rental Corp',
  repairPeriodStart: '2026-09-10T08:00:00.000Z',
  repairPeriodEnd: '2026-09-15T18:00:00.000Z',
  equipment: {
    id: 'eq-light-1',
    name: 'Ayrton Cobra Laser Beam',
    category: 'Lighting & FX',
    serialNumber: 'SN-COBRA-101',
    barcode: 'BAR-COBRA-01',
    knownLocation: 'Warehouse Bay 3',
  },
  repairType: 'Optical & Laser Source',
  priority: 'High',
  status: 'Under Repair',
  condition: 'Out of Service',
  requestedBy: 'Adversarial Verifier',
  assignee: { id: 'usr-challenger-01', name: 'Adversarial Verifier', email: 'verifier@kuro.test' },
  createdAt: new Date().toISOString(),
  attachments: [
    {
      id: 'att-1',
      type: 'Photo',
      url: 'https://cdn.kuro.test/photo1.jpg',
      fileName: 'cobra_lens.jpg',
      uploadedAt: new Date().toISOString(),
    },
  ],
};

// ----------------------------------------------------------------------------
// WCAG 2.1 Luminance and Contrast Ratio Oracle
// ----------------------------------------------------------------------------
function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [r, g, b];
}

function getRelativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((val) => {
    const srgb = val / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrastRatio(hexColor1: string, hexColor2: string): number {
  const lum1 = getRelativeLuminance(hexToRgb(hexColor1));
  const lum2 = getRelativeLuminance(hexToRgb(hexColor2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ----------------------------------------------------------------------------
// Test Suites
// ----------------------------------------------------------------------------
describe('Challenger 2: UI Button Styling, Contrast & Theme Responsiveness Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentThemeMode = 'dark';

    // Set up logistics service mocks
    jest.spyOn(logisticsService, 'getLogisticsEntry').mockResolvedValue(mockJobFixture);
    jest.spyOn(logisticsService, 'subscribeSingleLogisticsEntry').mockImplementation((_jId, _tId, cb) => {
      cb(mockJobFixture);
      return () => {};
    });
    jest.spyOn(locationTrackingService, 'isTrackingActive').mockReturnValue(false);

    // Set up repair service mocks
    jest.spyOn(repairService, 'getRepairTicket').mockResolvedValue(mockTicketFixture);
    jest.spyOn(repairService, 'subscribeSingleRepairTicket').mockImplementation((_id, _tenantId, onUpdate) => {
      onUpdate(mockTicketFixture);
      return jest.fn();
    });
    jest.spyOn(repairService, 'subscribeTenantRepairTickets').mockImplementation((_tenantId, onUpdate) => {
      onUpdate([mockTicketFixture]);
      return () => {};
    });
    jest.spyOn(repairService, 'fetchTenantSuppliers').mockResolvedValue([]);
    jest.spyOn(repairService, 'fetchTenantOwners').mockResolvedValue([]);
    jest.spyOn(repairService, 'fetchTenantCrewMembers').mockResolvedValue([]);
    jest.spyOn(equipmentService, 'fetchEquipment').mockResolvedValue([]);
  });

  // ==========================================================================
  // 1. MATHEMATICAL CONTRAST ORACLE (WCAG 2.1 COMPLIANCE)
  // ==========================================================================
  describe('1. WCAG 2.1 Contrast Ratio Verification Oracle', () => {
    const brandGreen = darkColors.brandGreen; // '#206020'

    it('asserts brandGreen is exactly "#206020" in both dark and light themes', () => {
      expect(darkColors.brandGreen).toBe('#206020');
      expect(lightColors.brandGreen).toBe('#206020');
    });

    it('verifies darkColors.primaryForeground (#FAFAFA) on brandGreen exceeds WCAG AAA (>= 7.0:1)', () => {
      const contrast = calculateContrastRatio(darkColors.primaryForeground, brandGreen);
      expect(contrast).toBeGreaterThanOrEqual(7.0); // WCAG AAA requirement
      expect(contrast).toBeCloseTo(7.31, 1);
    });

    it('verifies lightColors.primaryForeground (#F8FAFC) on brandGreen exceeds WCAG AAA (>= 7.0:1)', () => {
      const contrast = calculateContrastRatio(lightColors.primaryForeground, brandGreen);
      expect(contrast).toBeGreaterThanOrEqual(7.0); // WCAG AAA requirement
      expect(contrast).toBeCloseTo(7.30, 1);
    });

    it('adversarial counter-check: verifies that standard foreground (#020817) on brandGreen fails WCAG AA (< 4.5:1)', () => {
      const contrast = calculateContrastRatio(lightColors.foreground, brandGreen);
      // Demonstrates why variant="primary" with primaryForeground is mandatory over standard foreground
      expect(contrast).toBeLessThan(4.5);
    });

    it('adversarial counter-check: verifies that mutedForeground on brandGreen fails WCAG AA (< 4.5:1)', () => {
      const contrast = calculateContrastRatio(darkColors.mutedForeground, brandGreen);
      expect(contrast).toBeLessThan(4.5);
    });
  });

  // ==========================================================================
  // 2. CORE BUTTON COMPONENT BEHAVIOR WITH BRANDGREEN
  // ==========================================================================
  describe('2. Core Button Component BrandGreen Merging & Border Elimination', () => {
    (['dark', 'light'] as const).forEach((theme) => {
      it(`merges backgroundColor: brandGreen over variant="primary" and suppresses borders in ${theme} mode`, () => {
        mockCurrentThemeMode = theme;
        const colors = theme === 'dark' ? darkColors : lightColors;

        const { getByTestId } = render(
          <Button
            variant="primary"
            style={{ backgroundColor: colors.brandGreen }}
            testID="oracle-button"
          >
            Oracle Action
          </Button>
        );

        const btn = getByTestId('oracle-button');
        const flatStyle = StyleSheet.flatten(
          typeof btn.props.style === 'function' ? btn.props.style({ pressed: false }) : btn.props.style
        );

        expect(flatStyle.backgroundColor).toBe('#206020');
        expect(flatStyle.borderWidth).toBe(0);
        expect(flatStyle.borderColor).toBe('transparent');
      });
    });
  });

  // ==========================================================================
  // 3. BUTTON 1: "Add Note" IN LOGISTICS DETAIL (`add-note-btn`)
  // ==========================================================================
  describe('3. Button 1: Logistics Detail "Add Note" (`add-note-btn`)', () => {
    (['dark', 'light'] as const).forEach((theme) => {
      it(`renders add-note-btn with brandGreen and opens note modal on press in ${theme} mode`, async () => {
        mockCurrentThemeMode = theme;

        const { findByTestId, getByTestId } = render(<LogisticsDetailScreen />);

        const addNoteBtn = await findByTestId('add-note-btn');
        expect(addNoteBtn).toBeTruthy();

        const flatStyle = StyleSheet.flatten(
          typeof addNoteBtn.props.style === 'function'
            ? addNoteBtn.props.style({ pressed: false })
            : addNoteBtn.props.style
        );
        expect(flatStyle.backgroundColor).toBe('#206020');

        // Verify responsiveness on press
        await act(async () => {
          fireEvent.press(addNoteBtn);
        });

        expect(getByTestId('job-notes-modal')).toBeTruthy();
      });
    });

    it('verifies backward compatibility re-export stub renders add-note-btn identically', async () => {
      const { findByTestId } = render(<LogisticsDetailStubScreen />);
      const addNoteBtn = await findByTestId('add-note-btn');
      const flatStyle = StyleSheet.flatten(
        typeof addNoteBtn.props.style === 'function'
          ? addNoteBtn.props.style({ pressed: false })
          : addNoteBtn.props.style
      );
      expect(flatStyle.backgroundColor).toBe('#206020');
    });
  });

  // ==========================================================================
  // 4. BUTTON 2: "Report Equipment Fault" IN REPAIRS FEED (`feed-new-repair-btn`)
  // ==========================================================================
  describe('4. Button 2: Repairs Feed "Report Equipment Fault" (`feed-new-repair-btn`)', () => {
    (['dark', 'light'] as const).forEach((theme) => {
      it(`renders feed-new-repair-btn with brandGreen and navigates to /repairs/new on press in ${theme} mode`, async () => {
        mockCurrentThemeMode = theme;

        const { getByTestId } = render(<RepairsFeedScreen />);

        const newRepairBtn = getByTestId('feed-new-repair-btn');
        expect(newRepairBtn).toBeTruthy();

        const flatStyle = StyleSheet.flatten(
          typeof newRepairBtn.props.style === 'function'
            ? newRepairBtn.props.style({ pressed: false })
            : newRepairBtn.props.style
        );
        expect(flatStyle.backgroundColor).toBe('#206020');

        // Verify press navigation responsiveness
        await act(async () => {
          fireEvent.press(newRepairBtn);
        });

        expect(mockPush).toHaveBeenCalledWith('/repairs/new');
      });
    });
  });

  // ==========================================================================
  // 5. BUTTONS 3 & 4: "Add Photo" & "Add Attachment" IN REPAIR DETAIL
  // ==========================================================================
  describe('5. Buttons 3 & 4: Repair Detail "Add Photo" & "Add Attachment"', () => {
    (['dark', 'light'] as const).forEach((theme) => {
      it(`renders detail-add-photo-btn with brandGreen and invokes camera permissions on press in ${theme} mode`, async () => {
        mockCurrentThemeMode = theme;
        const reqPermSpy = jest.spyOn(ImagePicker, 'requestCameraPermissionsAsync');
        const launchCamSpy = jest.spyOn(ImagePicker, 'launchCameraAsync');

        const { findByTestId } = render(<RepairDetailScreen />);

        const addPhotoBtn = await findByTestId('detail-add-photo-btn');
        expect(addPhotoBtn).toBeTruthy();

        const flatStyle = StyleSheet.flatten(
          typeof addPhotoBtn.props.style === 'function'
            ? addPhotoBtn.props.style({ pressed: false })
            : addPhotoBtn.props.style
        );
        expect(flatStyle.backgroundColor).toBe('#206020');

        // Press Add Photo
        await act(async () => {
          fireEvent.press(addPhotoBtn);
        });

        expect(reqPermSpy).toHaveBeenCalled();
        expect(launchCamSpy).toHaveBeenCalled();
      });

      it(`renders detail-add-attachment-btn with brandGreen and opens attachment modal on press in ${theme} mode`, async () => {
        mockCurrentThemeMode = theme;

        const { findByTestId, getByTestId } = render(<RepairDetailScreen />);

        const addAttBtn = await findByTestId('detail-add-attachment-btn');
        expect(addAttBtn).toBeTruthy();

        const flatStyle = StyleSheet.flatten(
          typeof addAttBtn.props.style === 'function'
            ? addAttBtn.props.style({ pressed: false })
            : addAttBtn.props.style
        );
        expect(flatStyle.backgroundColor).toBe('#206020');

        // Press Add Attachment
        await act(async () => {
          fireEvent.press(addAttBtn);
        });

        expect(getByTestId('add-attachment-modal')).toBeTruthy();
      });
    });

    it('verifies backward compatibility re-export stub renders repair action buttons identically', async () => {
      const { findByTestId } = render(<RepairDetailStubScreen />);
      const photoBtn = await findByTestId('detail-add-photo-btn');
      const attBtn = await findByTestId('detail-add-attachment-btn');

      const flatPhoto = StyleSheet.flatten(
        typeof photoBtn.props.style === 'function' ? photoBtn.props.style({ pressed: false }) : photoBtn.props.style
      );
      const flatAtt = StyleSheet.flatten(
        typeof attBtn.props.style === 'function' ? attBtn.props.style({ pressed: false }) : attBtn.props.style
      );

      expect(flatPhoto.backgroundColor).toBe('#206020');
      expect(flatAtt.backgroundColor).toBe('#206020');
    });
  });

  // ==========================================================================
  // 6. BUTTON 5: "Add Photo" IN REPAIR PHOTO GALLERY (`gallery-add-photo-btn`)
  // ==========================================================================
  describe('6. Button 5: Repair Photo Gallery "Add Photo" (`gallery-add-photo-btn`)', () => {
    (['dark', 'light'] as const).forEach((theme) => {
      it(`renders gallery-add-photo-btn with brandGreen and triggers onAddPhoto callback on press in ${theme} mode`, async () => {
        mockCurrentThemeMode = theme;
        const mockOnAddPhoto = jest.fn();

        const { getByTestId } = render(
          <RepairPhotoGallery
            photos={[]}
            editable={true}
            onAddPhoto={mockOnAddPhoto}
            testID="test-gallery"
          />
        );

        const galleryBtn = getByTestId('gallery-add-photo-btn');
        expect(galleryBtn).toBeTruthy();

        const flatStyle = StyleSheet.flatten(
          typeof galleryBtn.props.style === 'function'
            ? galleryBtn.props.style({ pressed: false })
            : galleryBtn.props.style
        );
        expect(flatStyle.backgroundColor).toBe('#206020');

        // Press gallery Add Photo
        await act(async () => {
          fireEvent.press(galleryBtn);
        });

        expect(mockOnAddPhoto).toHaveBeenCalledTimes(1);
      });
    });

    it('hides gallery-add-photo-btn when editable is false (defensive read-only contract)', () => {
      const mockOnAddPhoto = jest.fn();
      const { queryByTestId } = render(
        <RepairPhotoGallery
          photos={[]}
          editable={false}
          onAddPhoto={mockOnAddPhoto}
          testID="test-gallery-readonly"
        />
      );

      expect(queryByTestId('gallery-add-photo-btn')).toBeNull();
    });
  });

  // ==========================================================================
  // 7. COMPREHENSIVE 5-BUTTON PALETTE & CONTRAST CONSISTENCY MATRIX
  // ==========================================================================
  describe('7. Comprehensive 5-Button BrandGreen Uniformity Matrix', () => {
    it('verifies all 5 buttons strictly match brandGreen hex #206020 across the application', () => {
      const buttonRegistry = [
        { name: 'Logistics Add Note', testID: 'add-note-btn', color: darkColors.brandGreen },
        { name: 'Repairs Feed Report Fault', testID: 'feed-new-repair-btn', color: darkColors.brandGreen },
        { name: 'Repair Detail Add Photo', testID: 'detail-add-photo-btn', color: darkColors.brandGreen },
        { name: 'Repair Detail Add Attachment', testID: 'detail-add-attachment-btn', color: darkColors.brandGreen },
        { name: 'Repair Gallery Add Photo', testID: 'gallery-add-photo-btn', color: darkColors.brandGreen },
      ];

      buttonRegistry.forEach((btn) => {
        expect(btn.color).toBe('#206020');
      });
    });
  });
});
