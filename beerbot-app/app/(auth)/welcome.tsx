import { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
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
  FadeInDown,
  FadeInUp,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { GoldButton } from '@/components/ui';
import {
  colors,
  typography,
  spacing,
  springs,
} from '@/lib/theme';

const SLIDES = [
  {
    title: 'Order Your Beer',
    description: 'Browse taps at your favorite venues and place your order right from your phone.',
    image: require('../../assets/beer_icon.png'),
  },
  {
    title: 'Verify Your Age',
    description: 'Quick one-time age verification keeps the process safe and legal.',
    image: require('../../assets/verify_icon.png'),
  },
  {
    title: 'Scan & Pour',
    description: 'Scan the QR code at the tap and pour your perfect pint. Cheers!',
    image: require('../../assets/qr_icon.png'),
  },
];

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
    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.85, 1, 0.85],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateY }, { scale }], opacity };
  });

  return (
    <Animated.View style={[{ width }, styles.slideContent, animatedStyle]}>
      <Image source={slide.image} style={styles.slideIcon} resizeMode="contain" />
      <Text
        style={[
          typography.title,
          { color: colors.text.primary, textAlign: 'center', marginTop: 16 },
        ]}
      >
        {slide.title}
      </Text>
      <Text
        style={[
          typography.body,
          {
            color: colors.text.secondary,
            textAlign: 'center',
            marginTop: 8,
            paddingHorizontal: 32,
            lineHeight: 22,
          },
        ]}
      >
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

  const heroOpacity = useSharedValue(0);

  useEffect(() => {
    heroOpacity.value = withTiming(1, { duration: 800 });
  }, [heroOpacity]);

  const goToSlide = useCallback(
    (index: number) => {
      'worklet';
      const clamped = Math.max(0, Math.min(index, SLIDES.length - 1));
      currentIndex.value = clamped;
      activeIndex.value = withSpring(clamped, springs.gentle);
      scrollX.value = withSpring(clamped * width, springs.gentle);
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

  const heroAnimatedStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
  }));

  const navigateToRegister = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push('/(auth)/register');
  }, [router]);

  const navigateToLogin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push('/(auth)/login');
  }, [router]);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {/* Hero — logo + tagline */}
      <Animated.View
        style={[styles.heroContainer, heroAnimatedStyle]}
        entering={FadeInDown.duration(600).delay(100)}
      >
        <Image
          source={require('../../assets/app_logo.png')}
          style={styles.appLogo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>
          Your self-serve beer companion
        </Text>
      </Animated.View>

      {/* Carousel */}
      <Animated.View
        style={styles.carouselArea}
        entering={FadeInUp.duration(500).delay(300)}
      >
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
      </Animated.View>

      {/* Bottom CTAs */}
      <Animated.View
        style={[styles.ctaArea, { paddingHorizontal: spacing.screenPadding }]}
        entering={FadeInUp.duration(500).delay(500)}
      >
        <GoldButton
          label="Get Started"
          onPress={navigateToRegister}
        />

        <Pressable onPress={navigateToLogin} style={styles.loginLink}>
          <Text
            style={[
              typography.label,
              { color: colors.text.secondary, textAlign: 'center' },
            ]}
          >
            I already have an account
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  heroContainer: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appLogo: {
    width: 200,
    height: 200,
  },
  tagline: {
    color: colors.text.secondary,
    fontSize: 15,
    letterSpacing: 0.3,
    marginTop: 8,
  },
  carouselArea: {
    flex: 3,
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
    width: 100,
    height: 100,
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
    backgroundColor: colors.gold[500],
  },
  ctaArea: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  loginLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
});
