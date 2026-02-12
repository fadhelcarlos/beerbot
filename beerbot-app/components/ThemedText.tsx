import { Text, type TextProps } from 'react-native';

export function ThemedText({ className, ...props }: TextProps & { className?: string }) {
  return <Text className={`text-white ${className ?? ''}`} {...props} />;
}
