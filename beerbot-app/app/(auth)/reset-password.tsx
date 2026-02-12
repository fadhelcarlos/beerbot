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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ access_token?: string; refresh_token?: string }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const [touched, setTouched] = useState({ password: false, confirm: false });

  const passwordTooShort =
    touched.password && password.length > 0 && password.length < 8
      ? 'Password must be at least 8 characters'
      : null;
  const passwordEmpty =
    touched.password && password.length === 0 ? 'Password is required' : null;
  const confirmMismatch =
    touched.confirm && confirmPassword.length > 0 && confirmPassword !== password
      ? 'Passwords do not match'
      : null;
  const confirmEmpty =
    touched.confirm && confirmPassword.length === 0
      ? 'Please confirm your password'
      : null;

  const isFormValid =
    password.length >= 8 && confirmPassword === password;

  // Set the recovery session from the deep link tokens
  useEffect(() => {
    async function setRecoverySession() {
      if (params.access_token && params.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (sessionError) {
          setError('Invalid or expired reset link. Please request a new one.');
        } else {
          setSessionReady(true);
        }
      } else {
        // No tokens — check if we already have a recovery session from the auth listener
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setSessionReady(true);
        } else {
          setError('Invalid or expired reset link. Please request a new one.');
        }
      }
    }
    setRecoverySession();
  }, [params.access_token, params.refresh_token]);

  const handleReset = useCallback(async () => {
    if (!isFormValid || isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        if (updateError.message.includes('same as')) {
          setError('New password must be different from your current password.');
        } else {
          setError(updateError.message);
        }
        return;
      }

      setSuccess(true);

      // Auto-navigate to venue selection after brief delay
      setTimeout(() => {
        router.replace('/(main)/venues');
      }, 1500);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isFormValid, isLoading, password, router]);

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
          <Text className="text-3xl font-bold text-white">
            Set New Password
          </Text>
          <Text className="text-base text-white/50 mt-2">
            Choose a strong password for your account
          </Text>

          {error && (
            <Animated.View
              entering={FadeIn.duration(200)}
              className="mt-6 rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-3"
            >
              <Text className="text-red-400 text-sm">{error}</Text>
              {!sessionReady && (
                <Pressable
                  onPress={() => router.replace('/(auth)/forgot-password')}
                  className="mt-2 active:opacity-60"
                >
                  <Text className="text-brand text-sm font-medium">
                    Request a new reset link
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          )}

          {success ? (
            <Animated.View
              entering={FadeIn.duration(300)}
              className="mt-8 rounded-xl bg-green-500/15 border border-green-500/30 px-4 py-4"
            >
              <Text className="text-green-400 text-base font-medium">
                Password updated successfully
              </Text>
              <Text className="text-green-400/70 text-sm mt-1">
                Redirecting to venue selection...
              </Text>
            </Animated.View>
          ) : sessionReady ? (
            <View className="mt-8">
              {/* New Password */}
              <View>
                <Text className="text-sm text-white/70 mb-2">New Password</Text>
                <View className="relative">
                  <TextInput
                    className="bg-dark-700 rounded-xl px-4 py-3.5 pr-16 text-white text-base"
                    placeholder="Min 8 characters"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    value={password}
                    onChangeText={setPassword}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!isLoading}
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
                {(passwordTooShort || passwordEmpty) && (
                  <Text className="text-red-400 text-xs mt-1">
                    {passwordTooShort ?? passwordEmpty}
                  </Text>
                )}
              </View>

              {/* Confirm Password */}
              <View className="mt-5">
                <Text className="text-sm text-white/70 mb-2">
                  Confirm Password
                </Text>
                <View className="relative">
                  <TextInput
                    className="bg-dark-700 rounded-xl px-4 py-3.5 pr-16 text-white text-base"
                    placeholder="Re-enter your password"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect={false}
                    returnKeyType="done"
                    editable={!isLoading}
                    onSubmitEditing={handleReset}
                  />
                  <Pressable
                    onPress={() => setShowConfirm((v) => !v)}
                    className="absolute right-4 top-0 bottom-0 justify-center active:opacity-60"
                    hitSlop={8}
                  >
                    <Text className="text-brand text-sm font-medium">
                      {showConfirm ? 'Hide' : 'Show'}
                    </Text>
                  </Pressable>
                </View>
                {(confirmMismatch || confirmEmpty) && (
                  <Text className="text-red-400 text-xs mt-1">
                    {confirmMismatch ?? confirmEmpty}
                  </Text>
                )}
              </View>

              {/* Submit button */}
              <Pressable
                onPress={handleReset}
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
                  <Text className="text-lg font-bold text-dark">
                    Update Password
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
            !error && (
              <View className="mt-8 items-center">
                <ActivityIndicator color="#f59e0b" size="large" />
                <Text className="text-white/50 text-sm mt-4">
                  Verifying reset link...
                </Text>
              </View>
            )
          )}

          <Pressable
            onPress={() => router.push('/(auth)/login')}
            className="mt-6 active:opacity-60"
          >
            <Text className="text-sm text-white/50 text-center">
              Remember your password?{' '}
              <Text className="text-brand font-medium">Log in</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
