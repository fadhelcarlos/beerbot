import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
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
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/auth-store';
import { checkVerificationStatus } from '@/lib/api/verification';
import GlassInput from '@/components/ui/GlassInput';
import GoldButton from '@/components/ui/GoldButton';
import PremiumBadge from '@/components/ui/PremiumBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import {
  colors,
  typography,
  radius,
  spacing,
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

type LucideIcon = React.ComponentType<{ size: number; color: string; strokeWidth: number }>;

interface MenuItem {
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  labelColor?: string;
  description?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  loading?: boolean;
}

interface MenuSection {
  title?: string;
  items: MenuItem[];
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
    <View style={styles.editFormCard}>
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
        <GoldButton label="Cancel" onPress={onCancel} variant="ghost" disabled={saving} style={{ flex: 1 }} />
        <GoldButton label="Save" onPress={handleSave} loading={saving} disabled={saving} style={{ flex: 1 }} />
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
  const [confirmAction, setConfirmAction] = useState<'signOut' | 'deleteAccount' | 'confirmDelete' | null>(null);

  // Fetch user profile
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

  const { data: verificationStatus } = useQuery({
    queryKey: ['verification-status'],
    queryFn: checkVerificationStatus,
    enabled: !!user?.id,
    staleTime: 1000 * 60,
  });

  const handleSaveProfile = useCallback(async (newName: string) => {
    const { error: dbError } = await supabase
      .from('users')
      .update({ full_name: newName })
      .eq('id', user!.id);
    if (dbError) throw dbError;
    await supabase.auth.updateUser({ data: { full_name: newName } });
    await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    setIsEditing(false);
  }, [user, queryClient]);

  const handleSignOut = useCallback(() => setConfirmAction('signOut'), []);

  const doSignOut = useCallback(async () => {
    setConfirmAction(null);
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      queryClient.clear();
    } catch {} finally {
      setIsSigningOut(false);
    }
  }, [queryClient]);

  const handleDeleteAccount = useCallback(() => setConfirmAction('deleteAccount'), []);

  const doDeleteAccount = useCallback(async () => {
    setConfirmAction(null);
    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw error;
      await supabase.auth.signOut();
      queryClient.clear();
    } catch {} finally {
      setIsDeleting(false);
    }
  }, [queryClient]);

  const displayName = profile?.full_name ?? user?.user_metadata?.full_name ?? 'User';
  const displayEmail = profile?.email ?? user?.email ?? '';
  const isVerified = profile?.age_verified ?? verificationStatus?.age_verified ?? false;
  const appVersion = Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '1.0.0';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  // ─── Data-driven sections (Checkbox pattern) ───

  const sections: MenuSection[] = [
    {
      title: 'ACCOUNT',
      items: [
        {
          icon: UserPen,
          label: 'Edit Profile',
          description: 'Change your name',
          onPress: () => setIsEditing(!isEditing),
        },
        {
          icon: Shield,
          label: 'Age Verification',
          description: isVerified
            ? `Verified${profile?.age_verified_at ? ` on ${new Date(profile.age_verified_at).toLocaleDateString()}` : ''}`
            : 'Not yet verified',
          onPress: !isVerified
            ? () => router.push({ pathname: '/(main)/order/verify-age', params: { tapId: '', venueId: '', quantity: '1', totalPrice: '0' } })
            : undefined,
          rightElement: isVerified
            ? <PremiumBadge label="Active" variant="success" small />
            : <PremiumBadge label="Verify" variant="warning" small />,
        },
      ],
    },
    {
      title: 'ACTIVITY',
      items: [
        {
          icon: CreditCard,
          label: 'Payment Methods',
          description: 'Manage your cards',
          onPress: () => router.push('/(main)/profile/payment-methods'),
        },
        {
          icon: ClipboardList,
          label: 'Order History',
          description: 'View past orders',
          onPress: () => router.push('/(main)/orders'),
        },
      ],
    },
    {
      items: [
        {
          icon: LogOut,
          iconColor: colors.text.secondary,
          label: isSigningOut ? 'Signing out...' : 'Sign Out',
          onPress: isSigningOut ? undefined : handleSignOut,
          loading: isSigningOut,
        },
        {
          icon: Trash2,
          iconColor: colors.status.danger,
          label: isDeleting ? 'Deleting...' : 'Delete Account',
          labelColor: colors.status.danger,
          onPress: isDeleting ? undefined : handleDeleteAccount,
          loading: isDeleting,
        },
      ],
    },
  ];

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
            {/* Avatar Card */}
            <Animated.View entering={FadeInDown.delay(50).duration(350)} style={styles.sectionWrapper}>
              <View style={styles.card}>
                <View style={styles.profileCardContent}>
                  <View style={styles.avatarRing}>
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
                  <View style={{ marginTop: 16 }}>
                    {isVerified
                      ? <PremiumBadge label="Verified" variant="success" glow />
                      : <PremiumBadge label="Unverified" variant="warning" />
                    }
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* Edit Profile (inline) */}
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

            {/* Menu Sections */}
            {sections.map((section, si) => (
              <Animated.View
                key={si}
                entering={FadeInDown.delay((si + 1) * 60).duration(350)}
                style={styles.sectionWrapper}
              >
                {section.title ? (
                  <Text style={styles.sectionLabel}>{section.title}</Text>
                ) : null}
                <View style={styles.card}>
                  {section.items.map((item, i, arr) => (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.menuItem,
                        i < arr.length - 1 && styles.menuItemBorder,
                      ]}
                      onPress={item.onPress || undefined}
                      disabled={!item.onPress}
                      activeOpacity={0.6}
                    >
                      <View style={[styles.iconCircle, { backgroundColor: (item.iconColor || colors.gold[400]) + '18' }]}>
                        <item.icon size={18} color={item.iconColor || colors.gold[400]} strokeWidth={2} />
                      </View>
                      <View style={styles.menuText}>
                        <Text style={[styles.menuLabel, item.labelColor ? { color: item.labelColor } : null]}>
                          {item.label}
                        </Text>
                        {item.description ? (
                          <Text style={styles.menuDesc} numberOfLines={1}>{item.description}</Text>
                        ) : null}
                      </View>
                      {item.loading ? (
                        <ActivityIndicator color={item.iconColor || colors.gold[500]} size="small" />
                      ) : item.rightElement ? (
                        item.rightElement
                      ) : item.onPress ? (
                        <ChevronRight size={18} color={colors.text.tertiary} strokeWidth={2} />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </Animated.View>
            ))}

            {/* App Version */}
            <Animated.View entering={FadeInDown.delay(250).duration(350)} style={styles.versionWrapper}>
              <Text style={styles.versionText}>BeerBot v{appVersion}</Text>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* Modals */}
      <ConfirmModal
        visible={confirmAction === 'signOut'}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive
        onConfirm={doSignOut}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        visible={confirmAction === 'deleteAccount'}
        title="Delete Account"
        message="This action is permanent and cannot be undone. All your data will be deleted."
        confirmLabel="Delete Account"
        destructive
        onConfirm={() => setConfirmAction('confirmDelete')}
        onCancel={() => setConfirmAction(null)}
      />
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

// ─────────────────────────────────────────────────
// Styles — ALL inline, NO typography spread, NO NativeWind
// ─────────────────────────────────────────────────

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
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
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
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.88,
    lineHeight: 16,
    color: colors.text.tertiary,
    marginBottom: 10,
    paddingLeft: 4,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.glass.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.glass.border,
    overflow: 'hidden',
  },

  // Profile avatar card
  profileCardContent: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
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
    fontFamily: 'Inter_700Bold',
    fontSize: 34,
    color: colors.gold[400],
  },
  profileName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: colors.text.primary,
    textAlign: 'center',
  },
  profileEmail: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 6,
  },

  // Menu rows
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 12,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.glass.border,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuText: {
    flex: 1,
  },
  menuLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    lineHeight: 24,
    color: colors.text.primary,
    marginBottom: 2,
  },
  menuDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.tertiary,
  },

  // Edit form
  editFormCard: {
    backgroundColor: colors.glass.surface,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.glass.border,
    padding: 20,
  },
  editFormTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
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
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: colors.status.danger,
  },
  editEmailLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
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
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: colors.text.tertiary,
  },
  editEmailHint: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 6,
    marginLeft: 4,
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
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
});
