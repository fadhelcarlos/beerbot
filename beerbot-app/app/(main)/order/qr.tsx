import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function QrScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-dark items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Text className="text-3xl mb-3">{'\uD83D\uDCF1'}</Text>
      <Text className="text-white text-xl font-bold text-center">
        QR Code
      </Text>
      <Text className="text-white/40 text-sm mt-2 text-center">
        QR code screen coming soon
      </Text>
      <Pressable
        onPress={() => router.replace('/(main)/venues')}
        className="mt-6 bg-dark-600 rounded-full px-6 py-3 active:opacity-70"
      >
        <Text className="text-brand font-semibold">Back to venues</Text>
      </Pressable>
    </View>
  );
}
