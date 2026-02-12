import { View, type ViewProps, StyleSheet } from 'react-native';
import { colors, radius, shadows } from '@/lib/theme';

interface GlassCardProps extends ViewProps {
  elevated?: boolean;
  /** Show a gold-tinted border for premium feel */
  goldAccent?: boolean;
  /** Blur intensity override (kept for API compat, no longer used) */
  blurIntensity?: number;
  /** Skip inner padding */
  noPadding?: boolean;
}

export default function GlassCard({
  elevated = false,
  goldAccent = false,
  blurIntensity,
  noPadding = false,
  style,
  children,
  ...props
}: GlassCardProps) {
  return (
    <View
      style={[
        styles.outer,
        elevated ? shadows.elevated : shadows.card,
        elevated ? styles.surfaceElevated : styles.surface,
        goldAccent && styles.goldBorder,
        !goldAccent && (elevated ? styles.elevatedBorder : styles.border),
        style,
      ]}
      {...props}
    >
      <View style={!noPadding ? styles.padding : undefined}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: radius['2xl'],
    overflow: 'hidden',
  },
  surface: {
    backgroundColor: colors.glass.surface,
  },
  surfaceElevated: {
    backgroundColor: colors.glass.surfaceElevated,
  },
  padding: {
    padding: 20,
  },
  border: {
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  elevatedBorder: {
    borderWidth: 1,
    borderColor: colors.glass.borderElevated,
  },
  goldBorder: {
    borderWidth: 1.5,
    borderColor: 'rgba(200,162,77,0.15)',
  },
});
