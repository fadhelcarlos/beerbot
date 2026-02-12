import { Text, type TextProps, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '@/lib/theme';

export function ThemedText({ style, ...props }: TextProps) {
  return <Text style={[{ color: colors.text.primary }, style as StyleProp<TextStyle>]} {...props} />;
}
