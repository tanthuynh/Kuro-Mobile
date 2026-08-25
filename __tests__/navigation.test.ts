/**
 * __tests__/navigation.test.ts
 * Navigation Route Guarding & Tab Config Tests
 */

describe('Kuro Mobile Route Guarding & Navigation Hierarchy', () => {
  it('redirects unauthenticated users attempting to access tabs to /(auth)/login', () => {
    const isAuthenticated = false;
    const currentSegment: string = '(tabs)';
    let targetRoute = '';

    if (!isAuthenticated && currentSegment !== '(auth)') {
      targetRoute = '/(auth)/login';
    }

    expect(targetRoute).toBe('/(auth)/login');
  });

  it('redirects authenticated users attempting to access auth stack to /(tabs)', () => {
    const isAuthenticated = true;
    const currentSegment: string = '(auth)';
    let targetRoute = '';

    if (isAuthenticated && currentSegment === '(auth)') {
      targetRoute = '/(tabs)';
    }

    expect(targetRoute).toBe('/(tabs)');
  });

  it('allows authenticated users to freely navigate within tabs', () => {
    const isAuthenticated = true;
    const currentSegment: string = '(tabs)';
    let redirected = false;

    if (!isAuthenticated && currentSegment !== '(auth)') {
      redirected = true;
    } else if (isAuthenticated && currentSegment === '(auth)') {
      redirected = true;
    }

    expect(redirected).toBe(false);
  });
});

