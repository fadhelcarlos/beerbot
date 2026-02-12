import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';

const BIOMETRIC_EMAIL_KEY = 'beerbot_biometric_email';

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

  // Check biometric availability on mount
  useEffect(() => {
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

      // Biometric passed — Supabase session is already persisted in SecureStore
      // by the Supabase client. Try refreshing the existing session.
      const { data, error: refreshError } = await supabase.auth.getSession();

      if (refreshError || !data.session) {
        // Session expired or not found — fall back to manual login
        setError('Session expired. Please log in with your email and password.');
        setIsLoading(false);
        return;
      }

      // Session is valid — navigate to main
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

      // Save email for future biometric login
      await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email.trim());

      // On success, the auth store listener picks up the session.
      router.replace('/(main)/venues');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isFormValid, isLoading, email, password, router]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          className="px-6 pt-4 pb-2 self-start active:opacity-60"
          hitSlop={16}
        >
          <Text className="text-brand text-base">{'\u2190'} Back</Text>
        </Pressable>

        <Animated.View
          entering={FadeIn.duration(400)}
          className="flex-1 px-6 pt-6"
        >
          {/* Header */}
          <Text className="text-3xl font-bold text-white">Welcome Back</Text>
          <Text className="text-base text-white/50 mt-2">
            Log in to start ordering
          </Text>

          {/* Error banner */}
          {error && (
            <Animated.View
              entering={FadeIn.duration(200)}
              className="mt-6 rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-3"
            >
              <Text className="text-red-400 text-sm">{error}</Text>
            </Animated.View>
          )}

          {/* Biometric login button */}
          {biometricAvailable && hasPreviousLogin && (
            <Pressable
              onPress={handleBiometricLogin}
              disabled={isLoading}
              className={`mt-8 w-full flex-row items-center justify-center rounded-2xl py-4 border-2 border-brand ${
                isLoading ? 'opacity-40' : 'active:opacity-80'
              }`}
            >
              {isLoading ? (
                <ActivityIndicator color="#f59e0b" size="small" />
              ) : (
                <Text className="text-lg font-bold text-brand">
                  Log in with {biometricType}
                </Text>
              )}
            </Pressable>
          )}

          {/* Divider (shown when biometric is available) */}
          {biometricAvailable && hasPreviousLogin && (
            <View className="flex-row items-center mt-6">
              <View className="flex-1 h-px bg-white/10" />
              <Text className="mx-4 text-sm text-white/30">or</Text>
              <View className="flex-1 h-px bg-white/10" />
            </View>
          )}

          {/* Form fields */}
          <View
            className={
              biometricAvailable && hasPreviousLogin ? 'mt-6' : 'mt-8'
            }
          >
            {/* Email */}
            <View>
              <Text className="text-sm text-white/70 mb-2">Email</Text>
              <TextInput
                className="bg-dark-700 rounded-xl px-4 py-3.5 text-white text-base"
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={email}
                onChangeText={setEmail}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                returnKeyType="next"
                editable={!isLoading}
              />
              {(emailError || emailEmpty) && (
                <Text className="text-red-400 text-xs mt-1">
                  {emailError ?? emailEmpty}
                </Text>
              )}
            </View>

            {/* Password */}
            <View className="mt-5">
              <Text className="text-sm text-white/70 mb-2">Password</Text>
              <View className="relative">
                <TextInput
                  className="bg-dark-700 rounded-xl px-4 py-3.5 pr-16 text-white text-base"
                  placeholder="Enter your password"
                  placeholderTextColor="rgba(255,255,255,0.25)"
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
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-0 bottom-0 justify-center active:opacity-60"
                  hitSlop={8}
                >
                  <Text className="text-brand text-sm font-medium">
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              </View>
              {passwordEmpty && (
                <Text className="text-red-400 text-xs mt-1">
                  {passwordEmpty}
                </Text>
              )}
            </View>

            {/* Forgot password */}
            <Pressable
              onPress={() => router.push('/(auth)/forgot-password')}
              className="mt-3 self-end active:opacity-60"
              disabled={isLoading}
            >
              <Text className="text-sm text-brand">Forgot password?</Text>
            </Pressable>
          </View>

          {/* Submit button */}
          <Pressable
            onPress={handleLogin}
            disabled={!isFormValid || isLoading}
            className={`mt-8 w-full items-center justify-center rounded-2xl py-4 ${
              isFormValid && !isLoading
                ? 'bg-brand active:opacity-80'
                : 'bg-brand/40'
            }`}
          >
            {isLoading ? (
              <ActivityIndicator color="#1a1a2e" size="small" />
            ) : (
              <Text className="text-lg font-bold text-dark">Log In</Text>
            )}
          </Pressable>

          {/* Register link */}
          <Pressable
            onPress={() => router.push('/(auth)/register')}
            className="mt-6 active:opacity-60"
            disabled={isLoading}
          >
            <Text className="text-sm text-white/50 text-center">
              Don&apos;t have an account?{' '}
              <Text className="text-brand font-medium">Sign up</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
