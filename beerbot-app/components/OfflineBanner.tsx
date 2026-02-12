import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(
        state.isConnected === false || state.isInternetReachable === false,
      );
    });

    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  return (
    <Animated.View
      entering={SlideInUp.duration(300)}
      exiting={SlideOutUp.duration(300)}
    >
      <View className="bg-red-500/90 px-4 py-2.5">
        <Text className="text-white text-xs font-semibold text-center">
          You&apos;re offline — some features may be unavailable
        </Text>
      </View>
    </Animated.View>
  );
}
