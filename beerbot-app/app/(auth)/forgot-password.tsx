import { useState } from 'react';
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
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react-native';
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

  // Back button scale animation
  const backScale = useSharedValue(1);
  const backAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: backScale.value }],
  }));

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
              Reset Password
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.secondary, marginTop: 8 },
              ]}
            >
              Enter your email and we'll send you a reset link
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

          {sent ? (
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
                      Check your email for a reset link
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: 'rgba(52,211,153,0.7)', marginTop: 4 },
                      ]}
                    >
                      We sent a password reset link to {email}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </Animated.View>
          ) : (
            <View style={{ marginTop: 32 }}>
              <Animated.View entering={FadeInDown.duration(400).delay(200)}>
                <GlassInput
                  label="Email"
                  placeholder="you@example.com"
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
              </Animated.View>

              <Animated.View
                entering={FadeInDown.duration(400).delay(300)}
                style={{ marginTop: 24 }}
              >
                <GoldButton
                  label="Send Reset Link"
                  onPress={handleReset}
                  disabled={!isValidEmail(email) || isLoading}
                  loading={isLoading}
                />
              </Animated.View>
            </View>
          )}

          <Animated.View entering={FadeInDown.duration(400).delay(400)}>
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
  successRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bottomLink: {
    marginTop: 24,
    paddingVertical: 8,
  },
});
