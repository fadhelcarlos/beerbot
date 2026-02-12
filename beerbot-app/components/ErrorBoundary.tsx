import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: '#1a1a2e',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
          }}
        >
          <Text style={{ fontSize: 48, marginBottom: 16 }}>{'\u26A0\uFE0F'}</Text>
          <Text
            style={{
              color: '#ffffff',
              fontSize: 22,
              fontWeight: 'bold',
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            The app encountered an unexpected error. Please try again.
          </Text>
          <Pressable
            onPress={this.handleReset}
            style={{
              backgroundColor: '#f59e0b',
              paddingHorizontal: 32,
              paddingVertical: 14,
              borderRadius: 16,
            }}
          >
            <Text style={{ color: '#1a1a2e', fontSize: 16, fontWeight: 'bold' }}>
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
