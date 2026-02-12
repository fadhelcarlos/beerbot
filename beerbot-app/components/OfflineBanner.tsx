import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { WifiOff } from 'lucide-react-native';
import { colors, typography, radius } from '@/lib/theme';

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
      style={styles.wrapper}
    >
      <BlurView intensity={60} tint="dark" style={styles.blur}>
        <View style={styles.overlay} />
        <View style={styles.content}>
          <WifiOff size={14} color={colors.status.danger} strokeWidth={2.5} />
          <Text style={styles.text}>
            You're offline — some features may be unavailable
          </Text>
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,113,113,0.15)',
  },
  blur: {
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  text: {
    ...typography.caption,
    color: colors.status.danger,
  },
});
