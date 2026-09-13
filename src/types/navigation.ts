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
  'repairs/[id]': { id?: string };
  'repairs/new': {
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
  events: undefined;    // Events Tab Stack
  index: undefined;     // Events Feed / Home (redirect)
  logistics: undefined; // Logistics Feed & Stack
  repairs: undefined;   // Repairs Feed & Stack
  profile: undefined;   // User Profile & Settings
  scanner: { eventId?: string } | undefined;   // Fast Scanner
  inventory: undefined; // Equipment Catalog & Search
};
