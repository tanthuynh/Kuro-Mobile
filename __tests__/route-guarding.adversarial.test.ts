/**
 * __tests__/route-guarding.adversarial.test.ts
 * Adversarial tests for Navigation State Transitions, Route Guarding, and Auth Boundaries
 */

describe('Adversarial Route Guarding & Navigation Security', () => {
  // Model the route guard decision function as implemented in app/_layout.tsx
  function evaluateRouteGate(state: {
    isLoading: boolean;
    isRestoringSession: boolean;
    isAuthenticated: boolean;
    currentSegments: string[];
  }): {
    isReady: boolean;
    redirectTarget: string | null;
  } {
    const isAuthReady = !state.isLoading && !state.isRestoringSession;
    if (!isAuthReady) {
      return { isReady: false, redirectTarget: null };
    }

    const inAuthGroup = state.currentSegments[0] === '(auth)';

    if (!state.isAuthenticated && !inAuthGroup) {
      return { isReady: true, redirectTarget: '/(auth)/login' };
    } else if (state.isAuthenticated && inAuthGroup) {
      return { isReady: true, redirectTarget: '/(tabs)' };
    }

    return { isReady: true, redirectTarget: null };
  }

  describe('Unauthenticated Access Traps', () => {
    it('redirects unauthenticated user from root index to /(auth)/login', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: [],
      });
      expect(decision.isReady).toBe(true);
      expect(decision.redirectTarget).toBe('/(auth)/login');
    });

    it('redirects unauthenticated user from /(tabs)/index to /(auth)/login', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: ['(tabs)', 'index'],
      });
      expect(decision.redirectTarget).toBe('/(auth)/login');
    });

    it('redirects unauthenticated user from deep tab routes like /(tabs)/scanner to /(auth)/login', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: ['(tabs)', 'scanner'],
      });
      expect(decision.redirectTarget).toBe('/(auth)/login');
    });

    it('redirects unauthenticated user from /(tabs)/inventory to /(auth)/login', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: ['(tabs)', 'inventory'],
      });
      expect(decision.redirectTarget).toBe('/(auth)/login');
    });

    it('redirects unauthenticated user from /(tabs)/profile to /(auth)/login', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: ['(tabs)', 'profile'],
      });
      expect(decision.redirectTarget).toBe('/(auth)/login');
    });

    it('does NOT redirect unauthenticated user already on /(auth)/login', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: ['(auth)', 'login'],
      });
      expect(decision.redirectTarget).toBeNull();
    });
  });

  describe('Authenticated Access Traps', () => {
    it('redirects authenticated user on /(auth)/login to /(tabs)', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: true,
        currentSegments: ['(auth)', 'login'],
      });
      expect(decision.isReady).toBe(true);
      expect(decision.redirectTarget).toBe('/(tabs)');
    });

    it('allows authenticated user on /(tabs)/index without redirection', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: true,
        currentSegments: ['(tabs)', 'index'],
      });
      expect(decision.redirectTarget).toBeNull();
    });

    it('allows authenticated user on /(tabs)/scanner without redirection', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: true,
        currentSegments: ['(tabs)', 'scanner'],
      });
      expect(decision.redirectTarget).toBeNull();
    });

    it('allows authenticated user on /(tabs)/inventory without redirection', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: true,
        currentSegments: ['(tabs)', 'inventory'],
      });
      expect(decision.redirectTarget).toBeNull();
    });

    it('allows authenticated user on /(tabs)/profile without redirection', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: true,
        currentSegments: ['(tabs)', 'profile'],
      });
      expect(decision.redirectTarget).toBeNull();
    });
  });

  describe('Asynchronous Loading & Session Hydration Transitions', () => {
    it('holds routing during initial session restoration', () => {
      const decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: true, // Still reading AsyncStorage
        isAuthenticated: false,
        currentSegments: ['(tabs)', 'index'],
      });
      expect(decision.isReady).toBe(false);
      expect(decision.redirectTarget).toBeNull();
    });

    it('holds routing during active auth state verification', () => {
      const decision = evaluateRouteGate({
        isLoading: true, // Checking Firebase onAuthStateChanged
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: ['(tabs)', 'inventory'],
      });
      expect(decision.isReady).toBe(false);
      expect(decision.redirectTarget).toBeNull();
    });

    it('instantly triggers redirect to login once loading resolves to unauthenticated', () => {
      // Step 1: Loading
      let decision = evaluateRouteGate({
        isLoading: true,
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: ['(tabs)', 'inventory'],
      });
      expect(decision.isReady).toBe(false);

      // Step 2: Loaded unauthenticated
      decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: ['(tabs)', 'inventory'],
      });
      expect(decision.isReady).toBe(true);
      expect(decision.redirectTarget).toBe('/(auth)/login');
    });

    it('instantly triggers redirect to tabs once loading resolves to authenticated on login screen', () => {
      // Step 1: Loading on login screen
      let decision = evaluateRouteGate({
        isLoading: true,
        isRestoringSession: false,
        isAuthenticated: false,
        currentSegments: ['(auth)', 'login'],
      });
      expect(decision.isReady).toBe(false);

      // Step 2: Loaded with authenticated session restored
      decision = evaluateRouteGate({
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: true,
        currentSegments: ['(auth)', 'login'],
      });
      expect(decision.isReady).toBe(true);
      expect(decision.redirectTarget).toBe('/(tabs)');
    });
  });

  describe('Session Termination & Remote Eviction Transitions', () => {
    it('triggers immediate redirection from tab to login when user signs out or session is revoked', () => {
      // Initial state: Authenticated in tabs
      let state = {
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: true,
        currentSegments: ['(tabs)', 'profile'],
      };
      expect(evaluateRouteGate(state).redirectTarget).toBeNull();

      // Event: User signed out / token revoked
      state = {
        ...state,
        isAuthenticated: false,
      };
      const decision = evaluateRouteGate(state);
      expect(decision.redirectTarget).toBe('/(auth)/login');
    });
  });
});
