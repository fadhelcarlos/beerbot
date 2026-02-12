/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ─── Liquid Gold Design System ───
        bg: {
          DEFAULT: '#08080F',
          elevated: '#0F0F18',
          card: '#12121E',
        },
        gold: {
          DEFAULT: '#C8A24D',
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
          DEFAULT: 'rgba(255,255,255,0.04)',
          border: 'rgba(255,255,255,0.06)',
          elevated: 'rgba(255,255,255,0.08)',
          highlight: 'rgba(255,255,255,0.12)',
        },
        success: {
          DEFAULT: '#34D399',
          muted: 'rgba(52,211,153,0.15)',
          glow: 'rgba(52,211,153,0.08)',
        },
        warning: {
          DEFAULT: '#FBBF24',
          muted: 'rgba(251,191,36,0.15)',
          glow: 'rgba(251,191,36,0.08)',
        },
        danger: {
          DEFAULT: '#F87171',
          muted: 'rgba(248,113,113,0.15)',
          glow: 'rgba(248,113,113,0.08)',
        },
        info: {
          DEFAULT: '#60A5FA',
          muted: 'rgba(96,165,250,0.15)',
          glow: 'rgba(96,165,250,0.08)',
        },
        // Keep brand alias for backward compatibility during migration
        brand: {
          DEFAULT: '#C8A24D',
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
        // Keep dark alias for backward compatibility during migration
        dark: {
          DEFAULT: '#08080F',
          50: '#e8e8ed',
          100: '#c5c5d3',
          200: '#9e9eb8',
          300: '#77779d',
          400: '#45455a',
          500: '#2a2a3d',
          600: '#1a1a2a',
          700: '#12121E',
          800: '#0F0F18',
          900: '#08080F',
        },
      },
      fontFamily: {
        sans: ['Inter_400Regular'],
      },
    },
  },
  plugins: [],
};
