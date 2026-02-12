import { useState, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { AlertCircle } from 'lucide-react-native';
import { colors, typography, radius } from '@/lib/theme';

interface GlassInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  /** Right-side action (e.g., Show/Hide for passwords) */
  rightAction?: {
    label: string;
    onPress: () => void;
  };
}

export default function GlassInput({
  label,
  error,
  rightAction,
  onFocus,
  onBlur,
  ...inputProps
}: GlassInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleFocus = (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const labelColor = error
    ? 'rgba(248,113,113,0.8)'
    : isFocused
      ? colors.gold[400]
      : colors.text.secondary;

  return (
    <View>
      <Text
        style={[
          typography.label,
          { color: labelColor, marginBottom: 8 },
        ]}
      >
        {label}
      </Text>

      <View
        style={[
          styles.container,
          error && styles.errorBorder,
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[styles.input, rightAction && styles.inputWithAction]}
          placeholderTextColor={colors.text.tertiary}
          selectionColor={colors.gold[500]}
          cursorColor={colors.gold[500]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...inputProps}
        />
        {rightAction && (
          <Pressable
            onPress={rightAction.onPress}
            style={styles.rightAction}
            hitSlop={8}
          >
            <Text style={[typography.buttonSmall, { color: colors.gold[500] }]}>
              {rightAction.label}
            </Text>
          </Pressable>
        )}
      </View>

      {error && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.errorRow}
        >
          <AlertCircle size={13} color="rgba(248,113,113,0.7)" strokeWidth={2.5} />
          <Text style={styles.errorText}>{error}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.glass.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  errorBorder: {
    borderColor: 'rgba(248,113,113,0.2)',
    backgroundColor: 'rgba(248,113,113,0.04)',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  inputWithAction: {
    paddingRight: 8,
  },
  rightAction: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 5,
  },
  errorText: {
    ...typography.caption,
    color: 'rgba(248,113,113,0.7)',
    fontSize: 12,
  },
});
