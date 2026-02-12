import { Pressable, Text, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, typography, radius, shadows, springs, goldGradientButton } from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface GoldButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Full width or auto */
  fullWidth?: boolean;
  /** Optional extra style */
  style?: ViewStyle;
  /** Prefix text (e.g., price) */
  suffix?: string;
}

export default function GoldButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  fullWidth = true,
  style,
  suffix,
}: GoldButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, springs.button);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springs.button);
  };

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  // Danger variant — red tinted for destructive actions
  if (variant === 'danger') {
    return (
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled || loading}
        style={[
          animatedStyle,
          styles.base,
          styles.danger,
          fullWidth && styles.fullWidth,
          disabled && styles.dangerDisabled,
          !disabled && styles.dangerGlow,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.status.danger} size="small" />
        ) : (
          <Text
            style={[
              typography.buttonLarge,
              { color: colors.status.danger },
              disabled && { opacity: 0.4 },
            ]}
          >
            {label}
          </Text>
        )}
      </AnimatedPressable>
    );
  }

  if (variant === 'secondary') {
    return (
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled || loading}
        style={[
          animatedStyle,
          styles.base,
          styles.secondary,
          fullWidth && styles.fullWidth,
          disabled && styles.secondaryDisabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.gold[500]} size="small" />
        ) : (
          <Text
            style={[
              typography.buttonLarge,
              { color: colors.gold[500] },
              disabled && { opacity: 0.4 },
            ]}
          >
            {label}
          </Text>
        )}
      </AnimatedPressable>
    );
  }

  if (variant === 'ghost') {
    return (
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled || loading}
        style={[
          animatedStyle,
          styles.base,
          styles.ghost,
          fullWidth && styles.fullWidth,
          style,
        ]}
      >
        <Text
          style={[
            typography.buttonLarge,
            { color: colors.text.secondary },
            disabled && { opacity: 0.4 },
          ]}
        >
          {label}
        </Text>
      </AnimatedPressable>
    );
  }

  // Primary variant with gold gradient
  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        animatedStyle,
        styles.primaryOuter,
        fullWidth && styles.fullWidth,
        !disabled && shadows.glowSubtle,
        style,
      ]}
    >
      <LinearGradient
        colors={
          disabled
            ? ['rgba(200,162,77,0.25)', 'rgba(200,162,77,0.15)']
            : (goldGradientButton.colors as unknown as [string, string, ...string[]])
        }
        start={goldGradientButton.start}
        end={goldGradientButton.end}
        style={[styles.base, styles.gradient]}
      >
        {loading ? (
          <ActivityIndicator color={colors.bg.primary} size="small" />
        ) : (
          <Text
            style={[
              typography.buttonLarge,
              { color: disabled ? 'rgba(8,8,15,0.5)' : colors.bg.primary },
            ]}
          >
            {label}{suffix ? ` \u00B7 ${suffix}` : ''}
          </Text>
        )}
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  primaryOuter: {
    borderRadius: radius['2xl'],
    overflow: 'hidden',
  },
  fullWidth: {
    width: '100%',
  },
  base: {
    height: 56,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  gradient: {
    width: '100%',
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: 'rgba(200,162,77,0.30)',
    backgroundColor: 'rgba(200,162,77,0.06)',
  },
  secondaryDisabled: {
    borderColor: 'rgba(200,162,77,0.15)',
    backgroundColor: 'rgba(200,162,77,0.05)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    borderWidth: 1.5,
    borderColor: 'rgba(248,113,113,0.30)',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  dangerDisabled: {
    borderColor: 'rgba(248,113,113,0.15)',
    backgroundColor: 'rgba(248,113,113,0.04)',
  },
  dangerGlow: {
    shadowColor: '#F87171',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
});
