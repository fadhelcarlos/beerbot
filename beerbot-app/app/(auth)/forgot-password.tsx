import { useState } from 'react';
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
import { supabase } from '@/lib/supabase';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!isValidEmail(email) || isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: 'beerbot://reset-password' },
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSent(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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
          <Text className="text-3xl font-bold text-white">Reset Password</Text>
          <Text className="text-base text-white/50 mt-2">
            Enter your email and we&apos;ll send you a reset link
          </Text>

          {error && (
            <Animated.View
              entering={FadeIn.duration(200)}
              className="mt-6 rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-3"
            >
              <Text className="text-red-400 text-sm">{error}</Text>
            </Animated.View>
          )}

          {sent ? (
            <Animated.View
              entering={FadeIn.duration(300)}
              className="mt-8 rounded-xl bg-green-500/15 border border-green-500/30 px-4 py-4"
            >
              <Text className="text-green-400 text-base font-medium">
                Check your email for a reset link
              </Text>
              <Text className="text-green-400/70 text-sm mt-1">
                We sent a password reset link to {email}
              </Text>
            </Animated.View>
          ) : (
            <View className="mt-8">
              <Text className="text-sm text-white/70 mb-2">Email</Text>
              <TextInput
                className="bg-dark-700 rounded-xl px-4 py-3.5 text-white text-base"
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                returnKeyType="done"
                editable={!isLoading}
                onSubmitEditing={handleReset}
              />

              <Pressable
                onPress={handleReset}
                disabled={!isValidEmail(email) || isLoading}
                className={`mt-6 w-full items-center justify-center rounded-2xl py-4 ${
                  isValidEmail(email) && !isLoading
                    ? 'bg-brand active:opacity-80'
                    : 'bg-brand/40'
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color="#1a1a2e" size="small" />
                ) : (
                  <Text className="text-lg font-bold text-dark">
                    Send Reset Link
                  </Text>
                )}
              </Pressable>
            </View>
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
