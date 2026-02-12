import { useState, useCallback } from 'react';
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';

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

const STRENGTH_CONFIG: Record<PasswordStrength, { label: string; color: string; width: string }> = {
  weak: { label: 'Weak', color: '#ef4444', width: '33%' },
  medium: { label: 'Medium', color: '#f59e0b', width: '66%' },
  strong: { label: 'Strong', color: '#22c55e', width: '100%' },
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
  const targetWidth = strength === 'weak' ? 33 : strength === 'medium' ? 66 : 100;
  barWidth.value = withTiming(targetWidth, { duration: 300 });

  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
    backgroundColor: config.color,
  }));

  if (password.length === 0) return null;

  return (
    <View className="mt-2">
      <View className="h-1.5 w-full rounded-full bg-dark-600 overflow-hidden">
        <Animated.View
          style={[{ height: '100%', borderRadius: 9999 }, animatedBarStyle]}
        />
      </View>
      <Text style={{ color: config.color }} className="text-xs mt-1">
        {config.label}
      </Text>
    </View>
  );
}

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
      // Navigate to venue selection.
      router.replace('/(main)/venues');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isFormValid, isLoading, email, password, fullName, router]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          className="px-6 pt-4 pb-2 self-start active:opacity-60"
          hitSlop={16}
        >
          <Text className="text-brand text-base">← Back</Text>
        </Pressable>

        <Animated.View
          entering={FadeIn.duration(400)}
          className="flex-1 px-6 pt-6"
        >
          {/* Header */}
          <Text className="text-3xl font-bold text-white">Create Account</Text>
          <Text className="text-base text-white/50 mt-2">
            Sign up to start ordering beer
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

          {/* Form fields */}
          <View className="mt-8">
            {/* Full Name */}
            <View>
              <Text className="text-sm text-white/70 mb-2">Full Name</Text>
              <TextInput
                className="bg-dark-700 rounded-xl px-4 py-3.5 text-white text-base"
                placeholder="John Doe"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={fullName}
                onChangeText={setFullName}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="next"
                editable={!isLoading}
              />
              {nameError && (
                <Text className="text-red-400 text-xs mt-1">{nameError}</Text>
              )}
            </View>

            {/* Email */}
            <View className="mt-5">
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
                <Text className="text-red-400 text-xs mt-1">{emailError ?? emailEmpty}</Text>
              )}
            </View>

            {/* Password */}
            <View className="mt-5">
              <Text className="text-sm text-white/70 mb-2">Password</Text>
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
                  returnKeyType="done"
                  editable={!isLoading}
                  onSubmitEditing={handleRegister}
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
              {(passwordError || passwordEmpty) && (
                <Text className="text-red-400 text-xs mt-1">{passwordError ?? passwordEmpty}</Text>
              )}
              <PasswordStrengthBar password={password} />
            </View>
          </View>

          {/* Submit button */}
          <Pressable
            onPress={handleRegister}
            disabled={!isFormValid || isLoading}
            className={`mt-8 w-full items-center justify-center rounded-2xl py-4 ${
              isFormValid && !isLoading ? 'bg-brand active:opacity-80' : 'bg-brand/40'
            }`}
          >
            {isLoading ? (
              <ActivityIndicator color="#1a1a2e" size="small" />
            ) : (
              <Text className="text-lg font-bold text-dark">Create Account</Text>
            )}
          </Pressable>

          {/* Login link */}
          <Pressable
            onPress={() => router.push('/(auth)/login')}
            className="mt-6 active:opacity-60"
            disabled={isLoading}
          >
            <Text className="text-sm text-white/50 text-center">
              Already have an account?{' '}
              <Text className="text-brand font-medium">Log in</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
