/**
 * src/types/navigation.ts
 * Navigation route parameter types for Expo Router
 */

export type RootStackParamList = {
  '(auth)': undefined;
  '(tabs)': undefined;
  '+not-found': undefined;
};

export type AuthStackParamList = {
  login: undefined;
};

export type TabsParamList = {
  index: undefined;     // Today's Jobs / Home
  scanner: undefined;   // Fast Scanner
  inventory: undefined; // Equipment Search
  profile: undefined;   // User Profile
};
