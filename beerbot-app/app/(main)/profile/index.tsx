import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import {
  UserPen,
  Shield,
  CreditCard,
  ClipboardList,
  LogOut,
  Trash2,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/auth-store';
import { checkVerificationStatus } from '@/lib/api/verification';
import GlassCard from '@/components/ui/GlassCard';
import GlassInput from '@/components/ui/GlassInput';
import GoldButton from '@/components/ui/GoldButton';
import PremiumBadge from '@/components/ui/PremiumBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import {
  colors,
  typography,
  radius,
  spacing,
  shadows,
  goldGradient,
} from '@/lib/theme';

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
  icon: Icon,
  label,
  subtitle,
  onPress,
  iconColor,
  labelColor,
  rightElement,
}: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  iconColor?: string;
  labelColor?: string;
  rightElement?: React.ReactNode;
}) {
  const ic = iconColor ?? colors.gold[400];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingHorizontal: spacing.cardPadding,
        paddingVertical: 14,
        width: '100%' as const,
        gap: 12,
        opacity: pressed && onPress ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          backgroundColor: `${ic}15`,
        }}
      >
        <Icon size={18} color={ic} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, flexShrink: 1 }}>
        <Text
          style={{
            fontSize: 16,
            lineHeight: 24,
            color: labelColor ?? colors.text.primary,
            textDecorationLine: 'none',
            fontWeight: '500',
          }}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontSize: 12,
              lineHeight: 18,
              color: colors.text.tertiary,
              marginTop: 2,
              fontWeight: '500',
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightElement}
      {onPress && !rightElement ? (
        <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
      ) : null}
    </Pressable>
  );
}

function SectionDivider() {
  return <View style={styles.sectionDivider} />;
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
    <GlassCard style={styles.editFormCard}>
      <Text style={styles.editFormTitle}>Edit Profile</Text>

      {error ? (
        <View style={styles.editFormError}>
          <Text style={styles.editFormErrorText}>{error}</Text>
        </View>
      ) : null}

      <GlassInput
        label="Full Name"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        autoCapitalize="words"
        autoCorrect={false}
      />

      <View style={{ marginTop: 16 }}>
        <Text style={styles.editEmailLabel}>Email</Text>
        <View style={styles.editEmailBox}>
          <Text style={styles.editEmailText}>{currentEmail}</Text>
        </View>
        <Text style={styles.editEmailHint}>
          Email changes require confirmation via link
        </Text>
      </View>

      <View style={styles.editFormActions}>
        <GoldButton
          label="Cancel"
          onPress={onCancel}
          variant="ghost"
          disabled={saving}
          style={{ flex: 1 }}
        />
        <GoldButton
          label="Save"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={{ flex: 1 }}
        />
      </View>
    </GlassCard>
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
  const [confirmAction, setConfirmAction] = useState<'signOut' | 'deleteAccount' | 'confirmDelete' | null>(null);

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
      const { error: dbError } = await supabase
        .from('users')
        .update({ full_name: newName })
        .eq('id', user!.id);

      if (dbError) throw dbError;

      await supabase.auth.updateUser({
        data: { full_name: newName },
      });

      await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      setIsEditing(false);
    },
    [user, queryClient],
  );

  // ─── Sign Out ───
  const handleSignOut = useCallback(() => {
    setConfirmAction('signOut');
  }, []);

  const doSignOut = useCallback(async () => {
    setConfirmAction(null);
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      queryClient.clear();
    } catch {
      // silently fail — user can retry
    } finally {
      setIsSigningOut(false);
    }
  }, [queryClient]);

  // ─── Delete Account ───
  const handleDeleteAccount = useCallback(() => {
    setConfirmAction('deleteAccount');
  }, []);

  const doDeleteAccount = useCallback(async () => {
    setConfirmAction(null);
    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke(
        'delete-account',
        { method: 'POST' },
      );
      if (error) throw error;

      await supabase.auth.signOut();
      queryClient.clear();
    } catch {
      // silently fail — user can retry
    } finally {
      setIsDeleting(false);
    }
  }, [queryClient]);

  const displayName =
    profile?.full_name ?? user?.user_metadata?.full_name ?? 'User';
  const displayEmail = profile?.email ?? user?.email ?? '';
  const isVerified = profile?.age_verified ?? verificationStatus?.age_verified ?? false;

  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '1.0.0';

  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </Animated.View>

        {profileLoading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator color={colors.gold[500]} size="large" />
          </View>
        ) : (
          <>
            {/* User Info Card */}
            <Animated.View
              entering={FadeInDown.delay(50).duration(350)}
              style={styles.sectionWrapper}
            >
              <GlassCard goldAccent>
                <View style={styles.profileCardContent}>
                  {/* Avatar with gold gradient ring */}
                  <View style={[styles.avatarRing, shadows.glow]}>
                    <LinearGradient
                      colors={goldGradient.colors as unknown as [string, string, ...string[]]}
                      start={goldGradient.start}
                      end={goldGradient.end}
                      style={styles.avatarGradient}
                    >
                      <View style={styles.avatarInner}>
                        <Text style={styles.avatarText}>{initials}</Text>
                      </View>
                    </LinearGradient>
                  </View>

                  <Text style={styles.profileName}>{displayName}</Text>
                  <Text style={styles.profileEmail}>{displayEmail}</Text>

                  {/* Verification badge */}
                  <View style={{ marginTop: 16 }}>
                    {isVerified ? (
                      <PremiumBadge label="Verified" variant="success" glow />
                    ) : (
                      <PremiumBadge label="Unverified" variant="warning" />
                    )}
                  </View>
                </View>
              </GlassCard>
            </Animated.View>

            {/* Edit Profile Form (inline toggle) */}
            {isEditing ? (
              <Animated.View entering={FadeInDown.duration(300)} style={styles.sectionWrapperSmall}>
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
              style={styles.sectionWrapper}
            >
              <Text style={styles.sectionLabel}>ACCOUNT</Text>
              <GlassCard noPadding>
                <MenuRow
                  icon={UserPen}
                  label="Edit Profile"
                  subtitle="Change your name"
                  onPress={() => setIsEditing(!isEditing)}
                />
                <SectionDivider />
                <MenuRow
                  icon={Shield}
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
                      <PremiumBadge label="Active" variant="success" small />
                    ) : (
                      <PremiumBadge label="Verify" variant="warning" small />
                    )
                  }
                />
              </GlassCard>
            </Animated.View>

            {/* Activity Section */}
            <Animated.View
              entering={FadeInDown.delay(150).duration(350)}
              style={styles.sectionWrapper}
            >
              <Text style={styles.sectionLabel}>ACTIVITY</Text>
              <GlassCard noPadding>
                <MenuRow
                  icon={CreditCard}
                  label="Payment Methods"
                  subtitle="Manage your cards"
                  onPress={() => router.push('/(main)/profile/payment-methods')}
                />
                <SectionDivider />
                <MenuRow
                  icon={ClipboardList}
                  label="Order History"
                  subtitle="View past orders"
                  onPress={() => router.push('/(main)/orders')}
                />
              </GlassCard>
            </Animated.View>

            {/* Danger Zone */}
            <Animated.View
              entering={FadeInDown.delay(200).duration(350)}
              style={styles.sectionWrapper}
            >
              <GlassCard noPadding>
                <MenuRow
                  icon={LogOut}
                  label={isSigningOut ? 'Signing out...' : 'Sign Out'}
                  iconColor={colors.text.secondary}
                  onPress={isSigningOut ? undefined : handleSignOut}
                  rightElement={
                    isSigningOut ? (
                      <ActivityIndicator color={colors.gold[500]} size="small" />
                    ) : undefined
                  }
                />
                <SectionDivider />
                <MenuRow
                  icon={Trash2}
                  label={isDeleting ? 'Deleting...' : 'Delete Account'}
                  iconColor={colors.status.danger}
                  labelColor={colors.status.danger}
                  onPress={isDeleting ? undefined : handleDeleteAccount}
                  rightElement={
                    isDeleting ? (
                      <ActivityIndicator color={colors.status.danger} size="small" />
                    ) : undefined
                  }
                />
              </GlassCard>
            </Animated.View>

            {/* App Version */}
            <Animated.View
              entering={FadeInDown.delay(250).duration(350)}
              style={styles.versionWrapper}
            >
              <Text style={styles.versionText}>
                BeerBot v{appVersion}
              </Text>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* Sign Out Confirmation */}
      <ConfirmModal
        visible={confirmAction === 'signOut'}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive
        onConfirm={doSignOut}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Delete Account — Step 1 */}
      <ConfirmModal
        visible={confirmAction === 'deleteAccount'}
        title="Delete Account"
        message="This action is permanent and cannot be undone. All your data will be deleted."
        confirmLabel="Delete Account"
        destructive
        onConfirm={() => setConfirmAction('confirmDelete')}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Delete Account — Step 2 (final confirmation) */}
      <ConfirmModal
        visible={confirmAction === 'confirmDelete'}
        title="Are you sure?"
        message="This cannot be reversed. Your account and all associated data will be permanently deleted."
        confirmLabel="Delete Forever"
        destructive
        onConfirm={doDeleteAccount}
        onCancel={() => setConfirmAction(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    ...typography.title,
    color: colors.text.primary,
  },
  loadingWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  sectionWrapper: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.sectionGap,
  },
  sectionWrapperSmall: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.itemGap,
  },
  sectionLabel: {
    ...typography.overline,
    color: colors.text.tertiary,
    marginBottom: 10,
    paddingLeft: 4,
  },
  profileCardContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  // Avatar
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 20,
  },
  avatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    padding: 3.5,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 47,
    backgroundColor: colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.display,
    color: colors.gold[400],
    fontSize: 34,
  },
  profileName: {
    ...typography.title,
    color: colors.text.primary,
    textAlign: 'center',
  },
  profileEmail: {
    ...typography.label,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 6,
  },
  // Menu row
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.cardPadding,
    paddingVertical: 14,
    width: '100%',
    gap: 12,
  },
  menuIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuTextCol: {
    flex: 1,
    marginLeft: 0,
    flexShrink: 1,
  },
  menuLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    letterSpacing: 0.16,
    lineHeight: 24,
    color: colors.text.primary,
    textDecorationLine: 'none',
  },
  menuSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.39,
    lineHeight: 18,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.glass.border,
    marginHorizontal: spacing.cardPadding,
  },
  // Edit form
  editFormCard: {
    marginHorizontal: 0,
  },
  editFormTitle: {
    ...typography.heading,
    color: colors.text.primary,
    marginBottom: 16,
  },
  editFormError: {
    backgroundColor: colors.status.dangerMuted,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  editFormErrorText: {
    ...typography.caption,
    color: colors.status.danger,
  },
  editEmailLabel: {
    ...typography.label,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  editEmailBox: {
    backgroundColor: colors.glass.surface,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  editEmailText: {
    ...typography.body,
    color: colors.text.tertiary,
  },
  editEmailHint: {
    ...typography.caption,
    color: colors.text.tertiary,
    marginTop: 6,
    marginLeft: 4,
    fontSize: 12,
  },
  editFormActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  // Version
  versionWrapper: {
    marginTop: 32,
    marginBottom: 16,
  },
  versionText: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: 'center',
    fontSize: 12,
  },
});
