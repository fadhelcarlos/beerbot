import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { GlassCard, GlassInput, GoldButton } from '@/components/ui';
import {
  colors,
  typography,
  spacing,
  radius,
  springs,
} from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

  // Back button scale animation
  const backScale = useSharedValue(1);
  const backAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: backScale.value }],
  }));

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
        // No tokens -- check if we already have a recovery session from the auth listener
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
      style={styles.container}
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
              Set New Password
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, marginTop: 8 },
              ]}
            >
              Choose a strong password for your account
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
                <View style={styles.errorRow}>
                  <AlertTriangle
                    size={18}
                    color={colors.status.danger}
                    strokeWidth={2}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[typography.label, { color: colors.status.danger }]}>
                      {error}
                    </Text>
                    {!sessionReady && (
                      <Pressable
                        onPress={() => router.replace('/(auth)/forgot-password')}
                        style={{ marginTop: 8 }}
                      >
                        <Text
                          style={[
                            typography.buttonSmall,
                            { color: colors.gold[500] },
                          ]}
                        >
                          Request a new reset link
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </GlassCard>
            </Animated.View>
          )}

          {success ? (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={{ marginTop: 32 }}
            >
              <GlassCard
                goldAccent
                style={{
                  borderColor: 'rgba(52,211,153,0.2)',
                  borderWidth: 1,
                  backgroundColor: colors.status.successMuted,
                }}
              >
                <View style={styles.successRow}>
                  <CheckCircle
                    size={22}
                    color={colors.status.success}
                    strokeWidth={2}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={[
                        typography.bodyMedium,
                        { color: colors.status.success },
                      ]}
                    >
                      Password updated successfully
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: 'rgba(52,211,153,0.7)', marginTop: 4 },
                      ]}
                    >
                      Redirecting to venue selection...
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </Animated.View>
          ) : sessionReady ? (
            <View style={{ marginTop: 32 }}>
              {/* New Password */}
              <Animated.View entering={FadeInDown.duration(400).delay(200)}>
                <GlassInput
                  label="New Password"
                  placeholder="Min 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoCorrect={false}
                  returnKeyType="next"
                  editable={!isLoading}
                  error={passwordTooShort ?? passwordEmpty}
                  rightAction={{
                    label: showPassword ? 'Hide' : 'Show',
                    onPress: () => setShowPassword((v) => !v),
                  }}
                />
              </Animated.View>

              {/* Confirm Password */}
              <Animated.View
                entering={FadeInDown.duration(400).delay(300)}
                style={{ marginTop: 20 }}
              >
                <GlassInput
                  label="Confirm Password"
                  placeholder="Re-enter your password"
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
                  error={confirmMismatch ?? confirmEmpty}
                  rightAction={{
                    label: showConfirm ? 'Hide' : 'Show',
                    onPress: () => setShowConfirm((v) => !v),
                  }}
                />
              </Animated.View>

              {/* Submit button */}
              <Animated.View
                entering={FadeInDown.duration(400).delay(400)}
                style={{ marginTop: 32 }}
              >
                <GoldButton
                  label="Update Password"
                  onPress={handleReset}
                  disabled={!isFormValid || isLoading}
                  loading={isLoading}
                />
              </Animated.View>
            </View>
          ) : (
            !error && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={colors.gold[500]} size="large" />
                <Text
                  style={[
                    typography.body,
                    { color: colors.text.secondary, marginTop: 16 },
                  ]}
                >
                  Verifying reset link...
                </Text>
              </View>
            )
          )}

          <Animated.View entering={FadeInDown.duration(400).delay(500)}>
            <Pressable
              onPress={() => router.push('/(auth)/login')}
              style={styles.bottomLink}
            >
              <Text
                style={[
                  typography.label,
                  { color: colors.text.secondary, textAlign: 'center' },
                ]}
              >
                Remember your password?{' '}
                <Text style={{ color: colors.gold[500] }}>Log in</Text>
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </ScrollView>
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
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  loadingContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  bottomLink: {
    marginTop: 24,
    paddingVertical: 8,
  },
});
