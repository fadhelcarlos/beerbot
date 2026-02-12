import { useState, useEffect, useCallback } from 'react';
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
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Fingerprint } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { GlassCard, GlassInput, GoldButton } from '@/components/ui';
import {
  colors,
  typography,
  spacing,
  radius,
  springs,
  shadows,
} from '@/lib/theme';

const BIOMETRIC_EMAIL_KEY = 'beerbot_biometric_email';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapSignInError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Invalid email or password. Please try again.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Please confirm your email address first.';
  }
  if (message.includes('Too many requests')) {
    return 'Too many login attempts. Please wait a moment.';
  }
  return message;
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field-level validation (shown after blur)
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailError =
    touched.email && email.length > 0 && !isValidEmail(email)
      ? 'Enter a valid email address'
      : null;
  const emailEmpty =
    touched.email && email.length === 0 ? 'Email is required' : null;
  const passwordEmpty =
    touched.password && password.length === 0 ? 'Password is required' : null;

  const isFormValid = isValidEmail(email) && password.length > 0;

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('Biometrics');
  const [hasPreviousLogin, setHasPreviousLogin] = useState(false);

  // Back button scale animation
  const backScale = useSharedValue(1);
  const backAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: backScale.value }],
  }));

  // Check biometric availability on mount (native only)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const storedEmail = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);

      if (compatible && enrolled && storedEmail) {
        setBiometricAvailable(true);
        setHasPreviousLogin(true);

        // Determine biometric type for display label
        const types =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (
          types.includes(
            LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
          )
        ) {
          setBiometricType('Face ID');
        } else if (
          types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ) {
          setBiometricType('Fingerprint');
        }
      }
    })();
  }, []);

  const handleBiometricLogin = useCallback(async () => {
    if (isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Log in to BeerBot',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (!result.success) {
        setIsLoading(false);
        return;
      }

      // Biometric passed -- refresh the persisted session to ensure it's valid
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError || !refreshData.session) {
        setError('Session expired. Please log in with your email and password.');
        setIsLoading(false);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      router.replace('/(main)/venues');
    } catch {
      setError('Biometric authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, router]);

  const handleLogin = useCallback(async () => {
    if (!isFormValid || isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(mapSignInError(signInError.message));
        return;
      }

      // Save email for future biometric login (native only)
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email.trim());
      }

      router.replace('/(main)/venues');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isFormValid, isLoading, email, password, router]);

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
              Welcome Back
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, marginTop: 8 },
              ]}
            >
              Log in to start ordering
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

          {/* Biometric login button */}
          {biometricAvailable && hasPreviousLogin && (
            <Animated.View entering={FadeInDown.duration(400).delay(200)} style={{ marginTop: 32 }}>
              <GoldButton
                label={`Log in with ${biometricType}`}
                onPress={handleBiometricLogin}
                disabled={isLoading}
                loading={isLoading}
                variant="secondary"
              />
            </Animated.View>
          )}

          {/* Divider (shown when biometric is available) */}
          {biometricAvailable && hasPreviousLogin && (
            <Animated.View
              entering={FadeInDown.duration(300).delay(250)}
              style={styles.dividerRow}
            >
              <View style={styles.dividerLine} />
              <Text style={[typography.caption, { color: colors.text.tertiary, marginHorizontal: 16 }]}>
                or
              </Text>
              <View style={styles.dividerLine} />
            </Animated.View>
          )}

          {/* Form fields */}
          <View
            style={{
              marginTop: biometricAvailable && hasPreviousLogin ? 24 : 32,
            }}
          >
            {/* Email */}
            <Animated.View entering={FadeInDown.duration(400).delay(300)}>
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
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect={false}
                returnKeyType="done"
                editable={!isLoading}
                onSubmitEditing={handleLogin}
                error={passwordEmpty}
                rightAction={{
                  label: showPassword ? 'Hide' : 'Show',
                  onPress: () => setShowPassword((v) => !v),
                }}
              />
            </Animated.View>

            {/* Forgot password */}
            <Animated.View entering={FadeInDown.duration(400).delay(450)}>
              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                style={styles.forgotLink}
                disabled={isLoading}
              >
                <Text style={[typography.buttonSmall, { color: colors.gold[500] }]}>
                  Forgot password?
                </Text>
              </Pressable>
            </Animated.View>
          </View>

        </View>
      </ScrollView>

      {/* Fixed bottom CTAs */}
      <View style={[styles.fixedBottom, { paddingBottom: insets.bottom + 16 }]}>
        <GoldButton
          label="Log In"
          onPress={handleLogin}
          disabled={!isFormValid || isLoading}
          loading={isLoading}
        />
        <Pressable
          onPress={() => router.push('/(auth)/register')}
          style={styles.bottomLink}
          disabled={isLoading}
        >
          <Text
            style={[
              typography.label,
              { color: colors.text.secondary, textAlign: 'center' },
            ]}
          >
            Don't have an account?{' '}
            <Text style={{ color: colors.gold[500] }}>Sign up</Text>
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.glass.border,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingVertical: 4,
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
