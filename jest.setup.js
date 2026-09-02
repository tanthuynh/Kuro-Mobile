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

// Mock expo-font
jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn().mockResolvedValue(true),
  isLoaded: jest.fn().mockReturnValue(true),
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

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  getCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  getMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn().mockResolvedValue({ granted: true })],
  useMediaLibraryPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn().mockResolvedValue({ granted: true })],
  MediaTypeOptions: {
    All: 'All',
    Videos: 'Videos',
    Images: 'Images',
  },
}), { virtual: true });

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

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  getBackgroundPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: {
      latitude: -33.8688,
      longitude: 151.2093,
      altitude: 10,
      accuracy: 5,
      heading: 0,
      speed: 0,
    },
    timestamp: 1718000000000,
  }),
  getLastKnownPositionAsync: jest.fn().mockResolvedValue({
    coords: {
      latitude: -33.8688,
      longitude: 151.2093,
      altitude: 10,
      accuracy: 5,
      heading: 0,
      speed: 0,
    },
    timestamp: 1718000000000,
  }),
  startLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  stopLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  hasStartedLocationUpdatesAsync: jest.fn().mockResolvedValue(false),
  watchPositionAsync: jest.fn().mockResolvedValue({
    remove: jest.fn(),
  }),
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  },
  ActivityType: {
    Other: 1,
    AutomotiveNavigation: 2,
    Fitness: 3,
    OtherNavigation: 4,
    Airborne: 5,
  },
  GeofencingEventType: {
    Enter: 1,
    Exit: 2,
  },
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
}), { virtual: true });

// Mock expo-task-manager
jest.mock('expo-task-manager', () => {
  const tasks = new Map();
  return {
    defineTask: jest.fn((taskName, executor) => {
      tasks.set(taskName, executor);
    }),
    isTaskRegisteredAsync: jest.fn().mockImplementation((taskName) => {
      return Promise.resolve(tasks.has(taskName));
    }),
    unregisterTaskAsync: jest.fn().mockImplementation((taskName) => {
      tasks.delete(taskName);
      return Promise.resolve();
    }),
    unregisterAllTasksAsync: jest.fn().mockImplementation(() => {
      tasks.clear();
      return Promise.resolve();
    }),
    isTaskDefined: jest.fn().mockImplementation((taskName) => {
      return tasks.has(taskName);
    }),
    getRegisteredTasksAsync: jest.fn().mockImplementation(() => {
      return Promise.resolve(
        Array.from(tasks.keys()).map((taskName) => ({ taskName, taskType: 'location' }))
      );
    }),
    _getTaskExecutor: (taskName) => tasks.get(taskName),
    _clearTasks: () => tasks.clear(),
  };
}, { virtual: true });


// Mock expo-linking
jest.mock('expo-linking', () => {
  const listeners = new Set();
  return {
    openURL: jest.fn().mockResolvedValue(true),
    canOpenURL: jest.fn().mockResolvedValue(true),
    getInitialURL: jest.fn().mockResolvedValue(null),
    addEventListener: jest.fn((type, handler) => {
      listeners.add(handler);
      return {
        remove: jest.fn(() => listeners.delete(handler)),
      };
    }),
    removeEventListener: jest.fn(),
    createURL: jest.fn((path) => `kuro://${path || ''}`),
    parse: jest.fn((url) => ({
      path: url,
      queryParams: {},
      scheme: url ? url.split(':')[0] : null,
    })),
    sendIntent: jest.fn().mockResolvedValue(undefined),
    openSettings: jest.fn().mockResolvedValue(undefined),
  };
});

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  getCameraPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  getMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  }),
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file:///data/user/0/host.exp.exponent/cache/ExperienceData/camera.jpg',
        width: 1080,
        height: 1920,
        type: 'image',
        fileName: 'camera_capture.jpg',
      },
    ],
  }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file:///data/user/0/host.exp.exponent/cache/ExperienceData/gallery.jpg',
        width: 1080,
        height: 1920,
        type: 'image',
        fileName: 'gallery_photo.jpg',
      },
    ],
  }),
  MediaTypeOptions: {
    All: 'All',
    Videos: 'Videos',
    Images: 'Images',
  },
}));

// Mock global fetch for local image URI blobs
if (typeof global.fetch === 'undefined' || !jest.isMockFunction(global.fetch)) {
  const originalFetch = global.fetch;
  global.fetch = jest.fn((input, init) => {
    if (
      typeof input === 'string' &&
      (input.startsWith('file://') ||
        input.startsWith('content://') ||
        input.startsWith('blob:') ||
        input.startsWith('http://') ||
        input.startsWith('https://'))
    ) {
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve({ size: 1024, type: 'image/jpeg' }),
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });
    }
    if (originalFetch) {
      return originalFetch(input, init);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      blob: () => Promise.resolve({ size: 1024, type: 'image/jpeg' }),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });
  });
}





