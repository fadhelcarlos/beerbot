import { View, Text } from 'react-native';

export default function WelcomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-dark">
      <Text className="text-3xl font-bold text-brand">BeerBot</Text>
      <Text className="mt-2 text-lg text-white/70">
        Your self-serve beer companion
      </Text>
    </View>
  );
}
