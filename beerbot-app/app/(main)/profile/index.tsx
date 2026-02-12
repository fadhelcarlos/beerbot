import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/auth-store';
import { checkVerificationStatus } from '@/lib/api/verification';

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  age_verified: boolean;
  age_verified_at: string | null;
}

// ─────────────────────────────────────────────────
// Menu Row
// ─────────────────────────────────────────────────

function MenuRow({
  icon,
  label,
  subtitle,
  onPress,
  color,
  rightElement,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  color?: string;
  rightElement?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center px-4 py-3.5 active:bg-dark-700"
    >
      <Text className="text-xl w-8 text-center">{icon}</Text>
      <View className="flex-1 ml-3">
        <Text
          className={`text-base ${color ?? 'text-white'}`}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text className="text-xs text-white/40 mt-0.5">{subtitle}</Text>
        ) : null}
      </View>
      {rightElement}
      {onPress && !rightElement ? (
        <Text className="text-white/30 text-lg">{'\u203A'}</Text>
      ) : null}
    </Pressable>
  );
}

function SectionDivider() {
  return <View className="h-px bg-dark-700 mx-4 my-1" />;
}

// ─────────────────────────────────────────────────
// Edit Profile Modal (inline)
// ─────────────────────────────────────────────────

function EditProfileForm({
  currentName,
  currentEmail,
  onSave,
  onCancel,
}: {
  currentName: string;
  currentEmail: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name cannot be empty');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mx-4 rounded-2xl bg-dark-700 border border-dark-600 p-4">
      <Text className="text-lg font-bold text-white mb-4">Edit Profile</Text>

      {error ? (
        <View className="bg-red-500/20 rounded-lg p-3 mb-3">
          <Text className="text-red-400 text-sm">{error}</Text>
        </View>
      ) : null}

      <Text className="text-xs text-white/50 mb-1 ml-1">Full Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor="rgba(255,255,255,0.3)"
        autoCapitalize="words"
        autoCorrect={false}
        className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-white text-base mb-4"
      />

      <Text className="text-xs text-white/50 mb-1 ml-1">Email</Text>
      <View className="bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 mb-2">
        <Text className="text-white/50 text-base">{currentEmail}</Text>
      </View>
      <Text className="text-xs text-white/40 ml-1 mb-4">
        Email changes require confirmation via link
      </Text>

      <View className="flex-row gap-3">
        <Pressable
          onPress={onCancel}
          disabled={saving}
          className="flex-1 bg-dark-600 rounded-xl py-3 items-center active:opacity-80"
        >
          <Text className="text-white font-semibold">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          className="flex-1 bg-brand rounded-xl py-3 items-center active:opacity-80"
        >
          {saving ? (
            <ActivityIndicator color="#1a1a2e" size="small" />
          ) : (
            <Text className="text-dark font-bold">Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────
// Main Profile Screen
// ─────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [isEditing, setIsEditing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch user profile from users table
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async (): Promise<UserProfile> => {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, age_verified, age_verified_at')
        .eq('id', user!.id)
        .single();

      if (error) throw error;
      return data as UserProfile;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60,
  });

  // Fetch verification status
  const { data: verificationStatus } = useQuery({
    queryKey: ['verification-status'],
    queryFn: checkVerificationStatus,
    enabled: !!user?.id,
    staleTime: 1000 * 60,
  });

  // ─── Save profile changes ───
  const handleSaveProfile = useCallback(
    async (newName: string) => {
      // Update Supabase users table
      const { error: dbError } = await supabase
        .from('users')
        .update({ full_name: newName })
        .eq('id', user!.id);

      if (dbError) throw dbError;

      // Also update auth metadata
      await supabase.auth.updateUser({
        data: { full_name: newName },
      });

      // Invalidate profile query to refetch
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      setIsEditing(false);
    },
    [user, queryClient],
  );

  // ─── Sign Out ───
  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsSigningOut(true);
            try {
              await supabase.auth.signOut();
              // Auth store listener will pick up the session change
              // and AuthGate will redirect to welcome
              queryClient.clear();
            } catch {
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            } finally {
              setIsSigningOut(false);
            }
          },
        },
      ],
    );
  }, [queryClient]);

  // ─── Delete Account ───
  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              'Confirm Deletion',
              'Please re-authenticate to confirm. Type DELETE to continue.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm',
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeleting(true);
                    try {
                      // Call Supabase admin delete (via Edge Function or direct)
                      const { error } = await supabase.functions.invoke(
                        'delete-account',
                        { method: 'POST' },
                      );
                      if (error) throw error;

                      await supabase.auth.signOut();
                      queryClient.clear();
                    } catch {
                      Alert.alert(
                        'Error',
                        'Failed to delete account. Please contact support.',
                      );
                    } finally {
                      setIsDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [queryClient]);

  const displayName =
    profile?.full_name ?? user?.user_metadata?.full_name ?? 'User';
  const displayEmail = profile?.email ?? user?.email ?? '';
  const isVerified = profile?.age_verified ?? verificationStatus?.age_verified ?? false;

  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '1.0.0';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-dark"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeIn.duration(400)} className="px-4 pt-4 pb-2">
          <Text className="text-2xl font-bold text-white">Profile</Text>
        </Animated.View>

        {profileLoading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator color="#f59e0b" size="large" />
          </View>
        ) : (
          <>
            {/* User Info Card */}
            <Animated.View
              entering={FadeInDown.delay(50).duration(350)}
              className="mx-4 mt-4 rounded-2xl bg-dark-700 border border-dark-600 p-5"
            >
              {/* Avatar circle with initials */}
              <View className="items-center mb-4">
                <View className="w-20 h-20 rounded-full bg-brand/20 items-center justify-center">
                  <Text className="text-3xl font-bold text-brand">
                    {displayName
                      .split(' ')
                      .map((n: string) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </Text>
                </View>
              </View>

              <Text className="text-xl font-bold text-white text-center">
                {displayName}
              </Text>
              <Text className="text-sm text-white/50 text-center mt-1">
                {displayEmail}
              </Text>

              {/* Verification badge */}
              <View className="flex-row justify-center mt-3">
                {isVerified ? (
                  <View className="flex-row items-center bg-green-500/20 rounded-full px-3 py-1">
                    <Text className="text-sm mr-1">{'\u2713'}</Text>
                    <Text className="text-green-400 text-sm font-semibold">
                      Verified
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center bg-yellow-500/20 rounded-full px-3 py-1">
                    <Text className="text-sm mr-1">{'\u26A0'}</Text>
                    <Text className="text-yellow-400 text-sm font-semibold">
                      Unverified
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>

            {/* Edit Profile Form (inline toggle) */}
            {isEditing ? (
              <Animated.View entering={FadeInDown.duration(300)} className="mt-4">
                <EditProfileForm
                  currentName={displayName}
                  currentEmail={displayEmail}
                  onSave={handleSaveProfile}
                  onCancel={() => setIsEditing(false)}
                />
              </Animated.View>
            ) : null}

            {/* Account Section */}
            <Animated.View
              entering={FadeInDown.delay(100).duration(350)}
              className="mt-6"
            >
              <Text className="text-xs font-semibold text-white/40 uppercase tracking-wider px-4 mb-2">
                Account
              </Text>
              <View className="bg-dark-700 border-y border-dark-600">
                <MenuRow
                  icon={'\uD83D\uDC64'}
                  label="Edit Profile"
                  subtitle="Change your name"
                  onPress={() => setIsEditing(!isEditing)}
                />
                <SectionDivider />
                <MenuRow
                  icon={'\uD83D\uDEE1\uFE0F'}
                  label="Age Verification"
                  subtitle={
                    isVerified
                      ? `Verified${profile?.age_verified_at ? ` on ${new Date(profile.age_verified_at).toLocaleDateString()}` : ''}`
                      : 'Not yet verified'
                  }
                  onPress={
                    !isVerified
                      ? () =>
                          router.push({
                            pathname: '/(main)/order/verify-age',
                            params: {
                              tapId: '',
                              venueId: '',
                              quantity: '1',
                              totalPrice: '0',
                            },
                          })
                      : undefined
                  }
                  rightElement={
                    isVerified ? (
                      <View className="bg-green-500/20 rounded-full px-2 py-0.5">
                        <Text className="text-green-400 text-xs font-semibold">
                          {'\u2713'} Active
                        </Text>
                      </View>
                    ) : (
                      <View className="bg-yellow-500/20 rounded-full px-2 py-0.5">
                        <Text className="text-yellow-400 text-xs font-semibold">
                          Verify
                        </Text>
                      </View>
                    )
                  }
                />
              </View>
            </Animated.View>

            {/* Navigation Section */}
            <Animated.View
              entering={FadeInDown.delay(150).duration(350)}
              className="mt-6"
            >
              <Text className="text-xs font-semibold text-white/40 uppercase tracking-wider px-4 mb-2">
                Activity
              </Text>
              <View className="bg-dark-700 border-y border-dark-600">
                <MenuRow
                  icon={'\uD83D\uDCB3'}
                  label="Payment Methods"
                  subtitle="Manage your cards"
                  onPress={() => router.push('/(main)/profile/payment-methods')}
                />
                <SectionDivider />
                <MenuRow
                  icon={'\uD83D\uDCCB'}
                  label="Order History"
                  subtitle="View past orders"
                  onPress={() => router.push('/(main)/orders')}
                />
              </View>
            </Animated.View>

            {/* Danger Zone */}
            <Animated.View
              entering={FadeInDown.delay(200).duration(350)}
              className="mt-6"
            >
              <View className="bg-dark-700 border-y border-dark-600">
                <MenuRow
                  icon={'\uD83D\uDEAA'}
                  label={isSigningOut ? 'Signing out...' : 'Sign Out'}
                  onPress={isSigningOut ? undefined : handleSignOut}
                  color="text-white"
                  rightElement={
                    isSigningOut ? (
                      <ActivityIndicator color="#f59e0b" size="small" />
                    ) : undefined
                  }
                />
                <SectionDivider />
                <MenuRow
                  icon={'\u26A0\uFE0F'}
                  label={isDeleting ? 'Deleting...' : 'Delete Account'}
                  onPress={isDeleting ? undefined : handleDeleteAccount}
                  color="text-red-400"
                  rightElement={
                    isDeleting ? (
                      <ActivityIndicator color="#ef4444" size="small" />
                    ) : undefined
                  }
                />
              </View>
            </Animated.View>

            {/* App Version */}
            <Animated.View
              entering={FadeInDown.delay(250).duration(350)}
              className="mt-8 mb-4"
            >
              <Text className="text-center text-xs text-white/25">
                BeerBot v{appVersion}
              </Text>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
