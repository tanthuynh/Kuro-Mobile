/**
 * src/types/navigation.ts
 * Navigation route parameter types for Expo Router
 */

export type RootStackParamList = {
  '(auth)': undefined;
  '(tabs)': undefined;
  '+not-found': undefined;
  'events/[id]': { id: string };
  'pullsheet/[id]': { id: string };
  'logistics/[id]': { id: string };
  'repair/[id]': { id?: string };
  'repair/new': {
    equipmentId?: string;
    name?: string;
    serialNumber?: string;
    barcode?: string;
    category?: string;
    location?: string;
  };
};

export type AuthStackParamList = {
  login: undefined;
};

export type TabsParamList = {
  index: undefined;     // Events Feed / Home
  logistics: undefined; // Logistics Feed
  repairs: undefined;   // Repairs Feed
  profile: undefined;   // User Profile & Settings
  scanner: { eventId?: string } | undefined;   // Fast Scanner
  inventory: undefined; // Equipment Catalog & Search
};
