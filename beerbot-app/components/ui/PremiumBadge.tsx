import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, radius } from '@/lib/theme';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'neutral';

interface PremiumBadgeProps {
  label: string;
  variant?: BadgeVariant;
  /** Show a subtle glow behind the badge */
  glow?: boolean;
  /** Smaller size */
  small?: boolean;
}

const VARIANT_STYLES: Record<
  BadgeVariant,
  { bg: string; text: string; glow: string }
> = {
  success: {
    bg: colors.status.successMuted,
    text: colors.status.success,
    glow: 'rgba(52,211,153,0.08)',
  },
  warning: {
    bg: colors.status.warningMuted,
    text: colors.status.warning,
    glow: 'rgba(251,191,36,0.08)',
  },
  danger: {
    bg: colors.status.dangerMuted,
    text: colors.status.danger,
    glow: 'rgba(248,113,113,0.08)',
  },
  info: {
    bg: colors.status.infoMuted,
    text: colors.status.info,
    glow: 'rgba(96,165,250,0.08)',
  },
  gold: {
    bg: 'rgba(200,162,77,0.15)',
    text: colors.gold[400],
    glow: 'rgba(200,162,77,0.08)',
  },
  neutral: {
    bg: 'rgba(255,255,255,0.06)',
    text: colors.text.secondary,
    glow: 'rgba(255,255,255,0.03)',
  },
};

export default function PremiumBadge({
  label,
  variant = 'neutral',
  glow = false,
  small = false,
}: PremiumBadgeProps) {
  const v = VARIANT_STYLES[variant];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: v.bg },
        small && styles.badgeSmall,
        glow && { shadowColor: v.text, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
      ]}
    >
      <Text
        style={[
          small ? typography.overline : typography.caption,
          { color: v.text },
          small && { fontSize: 10, letterSpacing: 0.5 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
