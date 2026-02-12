import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { GlassCard, GlassInput, GoldButton } from '@/components/ui';
import {
  colors,
  typography,
  spacing,
  radius,
  springs,
  goldGradient,
} from '@/lib/theme';

// --- Validation helpers ---

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type PasswordStrength = 'weak' | 'medium' | 'strong';

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return 'weak';
  let score = 0;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;
  if (score >= 4) return 'strong';
  if (score >= 2) return 'medium';
  return 'weak';
}

const STRENGTH_CONFIG: Record<
  PasswordStrength,
  { label: string; color: string; width: number; gradientColors: [string, string] }
> = {
  weak: {
    label: 'Weak',
    color: colors.status.danger,
    width: 33,
    gradientColors: ['#F87171', '#EF4444'],
  },
  medium: {
    label: 'Medium',
    color: colors.gold[500],
    width: 66,
    gradientColors: [colors.gold[400], colors.gold[600]],
  },
  strong: {
    label: 'Strong',
    color: colors.status.success,
    width: 100,
    gradientColors: ['#34D399', '#22C55E'],
  },
};

function mapSupabaseError(message: string): string {
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'This email is already registered. Try logging in instead.';
  }
  if (message.includes('invalid') && message.includes('email')) {
    return 'Please enter a valid email address.';
  }
  if (message.includes('password') && message.includes('short')) {
    return 'Password must be at least 8 characters.';
  }
  return message;
}

// --- Password strength bar ---

function PasswordStrengthBar({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  const config = STRENGTH_CONFIG[strength];

  const barWidth = useSharedValue(0);
  const targetWidth = config.width;
  barWidth.value = withTiming(targetWidth, { duration: 300 });

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  if (password.length === 0) return null;

  return (
    <View style={strengthStyles.container}>
      <View style={strengthStyles.track}>
        <Animated.View style={[strengthStyles.barOuter, animatedBarStyle]}>
          <LinearGradient
            colors={config.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={strengthStyles.gradient}
          />
        </Animated.View>
      </View>
      <Text style={[typography.caption, { color: config.color, marginTop: 4 }]}>
        {config.label}
      </Text>
    </View>
  );
}

const strengthStyles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.glass.surface,
    overflow: 'hidden',
  },
  barOuter: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
  },
});

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// --- Main screen ---

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field-level validation state (shown after blur)
  const [touched, setTouched] = useState({ name: false, email: false, password: false });

  const nameError = touched.name && fullName.trim().length === 0 ? 'Full name is required' : null;
  const emailError = touched.email && email.length > 0 && !isValidEmail(email) ? 'Enter a valid email address' : null;
  const emailEmpty = touched.email && email.length === 0 ? 'Email is required' : null;
  const passwordError = touched.password && password.length > 0 && password.length < 8 ? 'Password must be at least 8 characters' : null;
  const passwordEmpty = touched.password && password.length === 0 ? 'Password is required' : null;

  const isFormValid =
    fullName.trim().length > 0 &&
    isValidEmail(email) &&
    password.length >= 8;

  // Back button scale animation
  const backScale = useSharedValue(1);
  const backAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: backScale.value }],
  }));

  const handleRegister = useCallback(async () => {
    if (!isFormValid || isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (signUpError) {
        setError(mapSupabaseError(signUpError.message));
        return;
      }

      // On success, the auth store listener will pick up the session.
      router.replace('/(main)/venues');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isFormValid, isLoading, email, password, fullName, router]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <AnimatedPressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            router.back();
          }}
          onPressIn={() => {
            backScale.value = withSpring(0.93, springs.button);
          }}
          onPressOut={() => {
            backScale.value = withSpring(1, springs.button);
          }}
          style={[styles.backButton, backAnimStyle]}
          hitSlop={16}
        >
          <ArrowLeft size={20} color={colors.text.primary} strokeWidth={2} />
        </AnimatedPressable>

        <View style={styles.content}>
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <Image
              source={require('../../assets/app_logo.png')}
              style={{ width: 56, height: 56, alignSelf: 'center', marginBottom: 20 }}
              resizeMode="contain"
            />
            <Text style={[typography.display, { color: colors.text.primary }]}>
              Create Account
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, marginTop: 8 },
              ]}
            >
              Sign up to start ordering beer
            </Text>
          </Animated.View>

          {/* Error banner */}
          {error && (
            <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 24 }}>
              <GlassCard
                style={{
                  borderColor: 'rgba(248,113,113,0.3)',
                  borderWidth: 1,
                  backgroundColor: colors.status.dangerMuted,
                }}
              >
                <Text style={[typography.label, { color: colors.status.danger }]}>
                  {error}
                </Text>
              </GlassCard>
            </Animated.View>
          )}

          {/* Form fields */}
          <View style={{ marginTop: 32 }}>
            {/* Full Name */}
            <Animated.View entering={FadeInDown.duration(400).delay(200)}>
              <GlassInput
                label="Full Name"
                placeholder="John Doe"
                value={fullName}
                onChangeText={setFullName}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="next"
                editable={!isLoading}
                error={nameError}
              />
            </Animated.View>

            {/* Email */}
            <Animated.View
              entering={FadeInDown.duration(400).delay(300)}
              style={{ marginTop: 20 }}
            >
              <GlassInput
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                returnKeyType="next"
                editable={!isLoading}
                error={emailError ?? emailEmpty}
              />
            </Animated.View>

            {/* Password */}
            <Animated.View
              entering={FadeInDown.duration(400).delay(400)}
              style={{ marginTop: 20 }}
            >
              <GlassInput
                label="Password"
                placeholder="Min 8 characters"
                value={password}
                onChangeText={setPassword}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                returnKeyType="done"
                editable={!isLoading}
                onSubmitEditing={handleRegister}
                error={passwordError ?? passwordEmpty}
                rightAction={{
                  label: showPassword ? 'Hide' : 'Show',
                  onPress: () => setShowPassword((v) => !v),
                }}
              />
              <PasswordStrengthBar password={password} />
            </Animated.View>
          </View>

        </View>
      </ScrollView>

      {/* Fixed bottom CTAs */}
      <View style={[styles.fixedBottom, { paddingBottom: insets.bottom + 16 }]}>
        <GoldButton
          label="Create Account"
          onPress={handleRegister}
          disabled={!isFormValid || isLoading}
          loading={isLoading}
        />
        <Pressable
          onPress={() => router.push('/(auth)/login')}
          style={styles.bottomLink}
          disabled={isLoading}
        >
          <Text
            style={[
              typography.label,
              { color: colors.text.secondary, textAlign: 'center' },
            ]}
          >
            Already have an account?{' '}
            <Text style={{ color: colors.gold[500] }}>Log in</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.glass.surface,
    borderWidth: 1,
    borderColor: colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.screenPadding,
    marginTop: 12,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 24,
  },
  fixedBottom: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    backgroundColor: colors.bg.primary,
  },
  bottomLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
});
