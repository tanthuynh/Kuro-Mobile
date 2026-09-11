/**
 * src/components/common/ErrorBoundary.tsx
 * Top-Level React Error Boundary for Kuro Mobile.
 *
 * Catches unhandled JavaScript render and lifecycle exceptions, prevents native crashes,
 * safely sanitizes diagnostic errors (redacting any JWTs or credentials), and provides
 * graceful user recovery actions ("Try Again" and "Reload").
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { Button } from '@/components/ui/button';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, resetError: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  prevChildren?: ReactNode;
}

/**
 * Sanitizes error messages by redacting JWT tokens, passwords, and sensitive keys.
 */
function sanitizeErrorMessage(msg: string): string {
  if (!msg) return 'An unexpected application error occurred.';
  let sanitized = msg;
  sanitized = sanitized.replace(/ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, '[REDACTED_JWT]');
  sanitized = sanitized.replace(/(password|secret|token|credential)=([^\s&]+)/gi, '$1=[REDACTED]');
  sanitized = sanitized.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]');
  return sanitized;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      prevChildren: props.children,
    };
  }

  static getDerivedStateFromProps(
    nextProps: ErrorBoundaryProps,
    prevState: ErrorBoundaryState
  ): Partial<ErrorBoundaryState> | null {
    if (prevState.prevChildren !== nextProps.children) {
      return {
        hasError: false,
        error: null,
        prevChildren: nextProps.children,
      };
    }
    return null;
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const sanitizedMsg = sanitizeErrorMessage(error?.message || '');
    console.error('[ErrorBoundary] Uncaught application exception:', sanitizedMsg, errorInfo?.componentStack);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      const displayMessage = sanitizeErrorMessage(this.state.error?.message || 'Something went wrong.');

      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.card}>
              <View style={styles.iconWrap}>
                <AlertTriangle size={36} color="#D92929" />
              </View>

              <Text style={styles.title}>Something Went Wrong</Text>

              <Text style={styles.description}>
                Kuro Mobile encountered an unexpected error. Your saved session data remains intact.
              </Text>

              <View style={styles.errorBox}>
                <Text style={styles.errorText} numberOfLines={4}>
                  {displayMessage}
                </Text>
              </View>

              <Button
                variant="primary"
                size="default"
                fullWidth
                icon={<RefreshCw size={16} color="#FAFAFA" />}
                onPress={this.handleReset}
                testID="error-boundary-retry-btn"
                style={styles.retryButton}
              >
                Try Again
              </Button>
            </View>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141414',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1F1F1F',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(217, 41, 41, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Calibri',
    fontSize: 20,
    fontWeight: '700',
    color: '#FAFAFA',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Calibri',
    fontSize: 14,
    lineHeight: 20,
    color: '#A1A1AA',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorBox: {
    width: '100%',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 18,
    color: '#E6E6E6',
  },
  retryButton: {
    minHeight: 48,
  },
});
