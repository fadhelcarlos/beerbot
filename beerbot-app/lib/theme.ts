/**
 * Liquid Gold Design System — Theme Tokens
 *
 * Central source of truth for all design decisions.
 * Import this wherever you need programmatic access to colors, fonts, or spacing.
 */

// ─── Colors ───

export const colors = {
  bg: {
    primary: '#08080F',
    elevated: '#0F0F18',
    card: '#12121E',
  },
  gold: {
    50: '#FBF5E8',
    100: '#F5E8C8',
    200: '#EDDBA3',
    300: '#E8D48A',
    400: '#D4B85E',
    500: '#C8A24D',
    600: '#A88538',
    700: '#8A6B28',
    800: '#6B521C',
    900: '#4D3A14',
  },
  glass: {
    surface: 'rgba(255,255,255,0.04)',
    surfaceElevated: 'rgba(255,255,255,0.08)',
    border: 'rgba(255,255,255,0.06)',
    borderElevated: 'rgba(255,255,255,0.10)',
    highlight: 'rgba(255,255,255,0.12)',
  },
  text: {
    primary: '#F5F0E8',
    secondary: 'rgba(245,240,232,0.55)',
    tertiary: 'rgba(245,240,232,0.35)',
    inverse: '#08080F',
  },
  status: {
    success: '#34D399',
    successMuted: 'rgba(52,211,153,0.15)',
    warning: '#FBBF24',
    warningMuted: 'rgba(251,191,36,0.15)',
    danger: '#F87171',
    dangerMuted: 'rgba(248,113,113,0.15)',
    info: '#60A5FA',
    infoMuted: 'rgba(96,165,250,0.15)',
  },
} as const;

// Gold gradient stops for LinearGradient
export const goldGradient = {
  colors: ['#C8A24D', '#E8D48A', '#D4B85E'] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

export const goldGradientButton = {
  colors: ['#D4B85E', '#C8A24D', '#A88538'] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

export const goldGradientSubtle = {
  colors: ['rgba(200,162,77,0.15)', 'rgba(200,162,77,0.05)'] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

// ─── Typography ───

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  display: {
    fontFamily: fonts.bold,
    fontSize: 36,
    letterSpacing: -0.72,
    lineHeight: 44,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 24,
    letterSpacing: -0.24,
    lineHeight: 32,
  },
  heading: {
    fontFamily: fonts.semibold,
    fontSize: 20,
    letterSpacing: 0,
    lineHeight: 28,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 16,
    letterSpacing: 0.16,
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily: fonts.medium,
    fontSize: 16,
    letterSpacing: 0.16,
    lineHeight: 24,
  },
  caption: {
    fontFamily: fonts.medium,
    fontSize: 13,
    letterSpacing: 0.39,
    lineHeight: 18,
  },
  overline: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.88,
    lineHeight: 16,
    textTransform: 'uppercase' as const,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 14,
    letterSpacing: 0.14,
    lineHeight: 20,
  },
  buttonLarge: {
    fontFamily: fonts.bold,
    fontSize: 17,
    letterSpacing: 0.17,
    lineHeight: 24,
  },
  buttonSmall: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    letterSpacing: 0.28,
    lineHeight: 20,
  },
} as const;

// ─── Spacing & Radius ───

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  full: 9999,
} as const;

export const spacing = {
  screenPadding: 20,
  cardPadding: 20,
  sectionGap: 24,
  itemGap: 12,
} as const;

// ─── Shadows (for iOS) ───

export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  elevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  glow: {
    shadowColor: '#C8A24D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  glowSubtle: {
    shadowColor: '#C8A24D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

// ─── Animation Presets ───

export const springs = {
  button: { damping: 22, stiffness: 350, mass: 0.8 },
  card: { damping: 28, stiffness: 260 },
  gentle: { damping: 30, stiffness: 180 },
  snappy: { damping: 18, stiffness: 400, mass: 0.7 },
} as const;
