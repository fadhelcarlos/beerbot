import { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import LottieView from 'lottie-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SLIDES = [
  {
    title: 'Order Your Beer',
    description: 'Browse taps at your favorite venues and place your order right from your phone.',
    icon: '🍺',
  },
  {
    title: 'Verify Your Age',
    description: 'Quick one-time age verification keeps the process safe and legal.',
    icon: '🪪',
  },
  {
    title: 'Scan & Pour',
    description: 'Scan the QR code at the tap and pour your perfect pint. Cheers!',
    icon: '📲',
  },
] as const;

function Dot({ index, activeIndex }: { index: number; activeIndex: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => {
    const width = interpolate(
      activeIndex.value,
      [index - 1, index, index + 1],
      [8, 24, 8],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      activeIndex.value,
      [index - 1, index, index + 1],
      [0.3, 1, 0.3],
      Extrapolation.CLAMP,
    );
    return { width, opacity };
  });

  return (
    <Animated.View
      style={[styles.dot, animatedStyle]}
    />
  );
}

function SlideContent({
  slide,
  index,
  scrollX,
  width,
}: {
  slide: (typeof SLIDES)[number];
  index: number;
  scrollX: SharedValue<number>;
  width: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const translateY = interpolate(
      scrollX.value,
      inputRange,
      [40, 0, 40],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateY }], opacity };
  });

  return (
    <Animated.View style={[{ width }, styles.slideContent, animatedStyle]}>
      <Text style={styles.slideIcon}>{slide.icon}</Text>
      <Text className="text-2xl font-bold text-white text-center mt-6">
        {slide.title}
      </Text>
      <Text className="text-base text-white/60 text-center mt-3 px-8 leading-6">
        {slide.description}
      </Text>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const scrollX = useSharedValue(0);
  const activeIndex = useSharedValue(0);
  const currentIndex = useSharedValue(0);

  const lottieOpacity = useSharedValue(0);

  useEffect(() => {
    lottieOpacity.value = withTiming(1, { duration: 800 });
  }, [lottieOpacity]);

  const goToSlide = useCallback(
    (index: number) => {
      'worklet';
      const clamped = Math.max(0, Math.min(index, SLIDES.length - 1));
      currentIndex.value = clamped;
      activeIndex.value = withSpring(clamped, { damping: 15, stiffness: 150 });
      scrollX.value = withSpring(clamped * width, { damping: 15, stiffness: 150 });
    },
    [activeIndex, currentIndex, scrollX, width],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      const offset = currentIndex.value * width - e.translationX;
      scrollX.value = offset;
      activeIndex.value = offset / width;
    })
    .onEnd((e) => {
      const velocity = e.velocityX;
      const threshold = width * 0.25;

      if (Math.abs(e.translationX) > threshold || Math.abs(velocity) > 500) {
        if (e.translationX > 0) {
          goToSlide(currentIndex.value - 1);
        } else {
          goToSlide(currentIndex.value + 1);
        }
      } else {
        goToSlide(currentIndex.value);
      }
    });

  const slidesContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));

  const lottieAnimatedStyle = useAnimatedStyle(() => ({
    opacity: lottieOpacity.value,
  }));

  const navigateToRegister = useCallback(() => {
    router.push('/(auth)/register');
  }, [router]);

  const navigateToLogin = useCallback(() => {
    router.push('/(auth)/login');
  }, [router]);

  return (
    <View
      className="flex-1 bg-dark"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Lottie hero area */}
      <Animated.View
        style={[styles.lottieContainer, lottieAnimatedStyle]}
        className="items-center justify-center"
      >
        <View className="items-center justify-center" style={styles.lottieWrapper}>
          <LottieView
            autoPlay
            loop
            style={styles.lottie}
            source={require('../../assets/welcome-animation.json')}
          />
        </View>
        <Text className="text-4xl font-bold text-brand mt-2">BeerBot</Text>
        <Text className="text-base text-white/50 mt-1">
          Your self-serve beer companion
        </Text>
      </Animated.View>

      {/* Carousel */}
      <View style={styles.carouselArea}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={styles.carouselOuter}>
            <Animated.View
              style={[
                styles.slidesRow,
                { width: width * SLIDES.length },
                slidesContainerStyle,
              ]}
            >
              {SLIDES.map((slide, i) => (
                <SlideContent
                  key={slide.title}
                  slide={slide}
                  index={i}
                  scrollX={scrollX}
                  width={width}
                />
              ))}
            </Animated.View>
          </Animated.View>
        </GestureDetector>

        {/* Dot indicators */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <Dot key={i} index={i} activeIndex={activeIndex} />
          ))}
        </View>
      </View>

      {/* Bottom CTAs */}
      <View className="px-6 pb-4" style={styles.ctaArea}>
        <Pressable
          onPress={navigateToRegister}
          className="w-full items-center justify-center rounded-2xl bg-brand py-4 active:opacity-80"
        >
          <Text className="text-lg font-bold text-dark">Get Started</Text>
        </Pressable>

        <Pressable onPress={navigateToLogin} className="mt-4 active:opacity-60">
          <Text className="text-sm text-white/60 text-center">
            I already have an account
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lottieContainer: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottieWrapper: {
    width: 180,
    height: 180,
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
  carouselArea: {
    flex: 2,
  },
  carouselOuter: {
    flex: 1,
    overflow: 'hidden',
  },
  slidesRow: {
    flexDirection: 'row',
    flex: 1,
  },
  slideContent: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  slideIcon: {
    fontSize: 56,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
  },
  ctaArea: {
    paddingTop: 8,
  },
});
