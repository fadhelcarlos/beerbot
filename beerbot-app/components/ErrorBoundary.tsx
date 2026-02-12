import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { colors, typography, radius, shadows, spacing } from '@/lib/theme';
import GoldButton from '@/components/ui/GoldButton';

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
        <View style={styles.container}>
          <View style={[styles.card, shadows.card]}>
            <BlurView intensity={40} tint="dark" style={styles.blur}>
              <View style={styles.glassOverlay} />
              <View style={styles.content}>
                <View style={styles.iconWrapper}>
                  <AlertTriangle
                    size={32}
                    color={colors.status.warning}
                    strokeWidth={2}
                  />
                </View>
                <Text style={styles.title}>Something went wrong</Text>
                <Text style={styles.description}>
                  The app encountered an unexpected error. Please try again.
                </Text>
                <GoldButton
                  label="Try Again"
                  onPress={this.handleReset}
                  fullWidth={false}
                  style={{ paddingHorizontal: 40 }}
                />
              </View>
            </BlurView>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glass.border,
    width: '100%',
    maxWidth: 360,
  },
  blur: {
    overflow: 'hidden',
    borderRadius: radius['2xl'],
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glass.surface,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.cardPadding,
    paddingVertical: 40,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.status.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    ...typography.title,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
});
