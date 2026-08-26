// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}));


// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: () => ['(tabs)'],
  usePathname: () => '/',
  Link: ({ children }) => children,
  Slot: ({ children }) => children,
  Stack: Object.assign(({ children }) => children, {
    Screen: () => null,
  }),
  Tabs: Object.assign(({ children }) => children, {
    Screen: () => null,
  }),
}));

// Mock expo-splash-screen
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(true),
  hideAsync: jest.fn().mockResolvedValue(true),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 44, right: 0, bottom: 34, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: ({ children }) => children(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// Mock Firebase SDKs for Jest testing environment
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => [{}]),
  getApp: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ tenantId: null, currentUser: null })),
  initializeAuth: jest.fn(() => ({ tenantId: null, currentUser: null })),
  getReactNativePersistence: jest.fn(() => ({})),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn((_db, name) => ({ type: 'collection', name })),
  doc: jest.fn((_db, coll, id) => ({ type: 'doc', coll, id, idVal: id || 'mock-id' })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn().mockResolvedValue(undefined),
  updateDoc: jest.fn().mockResolvedValue(undefined),
  deleteDoc: jest.fn().mockResolvedValue(undefined),
  addDoc: jest.fn().mockResolvedValue({ id: 'mock-doc-id' }),
  onSnapshot: jest.fn(),
  query: jest.fn((coll, ...clauses) => ({ type: 'query', coll, clauses })),
  where: jest.fn((field, op, val) => ({ field, op, val })),
  orderBy: jest.fn((field, dir) => ({ field, dir })),
  limit: jest.fn((num) => ({ limit: num })),
  serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
  arrayUnion: jest.fn((...items) => ({ _method: 'arrayUnion', items })),
  arrayRemove: jest.fn((...items) => ({ _method: 'arrayRemove', items })),
  Timestamp: {
    fromDate: (date) => ({
      toDate: () => date,
      toISOString: () => date.toISOString(),
      _seconds: Math.floor(date.getTime() / 1000),
      _nanoseconds: (date.getTime() % 1000) * 1000000,
    }),
    fromMillis: (ms) => ({
      toDate: () => new Date(ms),
      toISOString: () => new Date(ms).toISOString(),
      _seconds: Math.floor(ms / 1000),
      _nanoseconds: (ms % 1000) * 1000000,
    }),
  },
}));

jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db, path) => ({ type: 'rtdb_ref', path })),
  set: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  onValue: jest.fn(),
  off: jest.fn(),
  serverTimestamp: jest.fn(() => Date.now()),
  onDisconnect: jest.fn(() => ({
    set: jest.fn(),
    remove: jest.fn(),
  })),
}));

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn((_storage, path) => ({ type: 'storage_ref', path })),
  uploadBytes: jest.fn().mockResolvedValue({ ref: { fullPath: 'mock/path' } }),
  uploadBytesResumable: jest.fn().mockReturnValue({
    then: (resolve) => Promise.resolve(resolve({ ref: { fullPath: 'mock/path' } })),
  }),
  getDownloadURL: jest.fn().mockResolvedValue('https://firebasestorage.googleapis.com/download/mock.jpg'),
}));

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => jest.fn().mockResolvedValue({ data: { success: true, authTenantId: null } })),
}));

// Mock expo-camera
jest.mock('expo-camera', () => {
  const React = require('react');
  return {
    CameraView: ({ children, ...props }) => React.createElement('CameraView', props, children),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn().mockResolvedValue({ granted: true })],
  };
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

// Mock expo-av
jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }),
    },
  },
}));


