import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PaymentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-dark items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Text className="text-3xl mb-3">{'\uD83D\uDCB3'}</Text>
      <Text className="text-white text-xl font-bold text-center">
        Payment
      </Text>
      <Text className="text-white/40 text-sm mt-2 text-center">
        Payment integration coming soon
      </Text>
      <Pressable
        onPress={() => router.back()}
        className="mt-6 bg-dark-600 rounded-full px-6 py-3 active:opacity-70"
      >
        <Text className="text-brand font-semibold">Go back</Text>
      </Pressable>
    </View>
  );
}
