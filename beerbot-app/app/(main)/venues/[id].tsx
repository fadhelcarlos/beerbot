import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function VenueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View className="flex-1 items-center justify-center bg-dark">
      <Text className="text-xl text-white">Venue Detail: {id}</Text>
    </View>
  );
}
