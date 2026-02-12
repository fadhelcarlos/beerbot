import { useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
// BlurView removed — it prevents SVG icon rendering inside the tab bar
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Beer, ClipboardList, User } from 'lucide-react-native';
import { colors, typography, shadows, springs } from '@/lib/theme';

const TAB_CONFIG = [
  { name: 'venues/index', label: 'VENUES', Icon: Beer },
  { name: 'orders/index', label: 'ORDERS', Icon: ClipboardList },
  { name: 'profile/index', label: 'PROFILE', Icon: User },
] as const;

const TAB_COUNT = TAB_CONFIG.length;
const ICON_SIZE = 22;

// ─── Tab Bar Button ───

function TabButton({
  focused,
  label,
  Icon,
  onPress,
  onLongPress,
}: {
  focused: boolean;
  label: string;
  Icon: typeof Beer;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, springs.snappy);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springs.snappy);
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={styles.tabButton}
    >
      <Animated.View style={[styles.tabButtonInner, animatedStyle]}>
        <Icon
          size={ICON_SIZE}
          color={focused ? colors.gold[500] : 'rgba(245,240,232,0.35)'}
          strokeWidth={focused ? 2.2 : 1.8}
        />
        <Text
          style={[
            typography.overline,
            styles.tabLabel,
            { color: focused ? colors.gold[500] : 'rgba(245,240,232,0.35)' },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Custom Tab Bar ───

function LiquidGoldTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const pillPosition = useSharedValue(0);


  // Animate pill to the active tab index
  useEffect(() => {
    const activeIndex = TAB_CONFIG.findIndex(
      (t) => t.name === state.routes[state.index]?.name,
    );
    if (activeIndex >= 0) {
      pillPosition.value = withSpring(activeIndex, springs.snappy);
    }
  }, [state.index, state.routes, pillPosition]);

  const pillAnimatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      pillPosition.value,
      Array.from({ length: TAB_COUNT }, (_, i) => i),
      Array.from({ length: TAB_COUNT }, (_, i) => i),
    );
    return {
      // Position is handled via left percentage in the wrapper
      transform: [{ translateX: 0 }],
      left: `${(translateX / TAB_COUNT) * 100}%` as unknown as number,
    };
  });

  const handlePress = useCallback(
    (routeName: string, routeKey: string, isFocused: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const event = navigation.emit({
        type: 'tabPress',
        target: routeKey,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(routeName);
      }
    },
    [navigation],
  );

  const handleLongPress = useCallback(
    (routeKey: string) => {
      navigation.emit({ type: 'tabLongPress', target: routeKey });
    },
    [navigation],
  );

  // Hide tab bar on order flow screens
  const currentRouteName = state.routes[state.index]?.name ?? '';
  if (currentRouteName.startsWith('order/')) return null;

  return (
    <View style={[styles.tabBarOuter, { paddingBottom: insets.bottom }]}>
      <View style={styles.tabBarInner}>
        {/* Animated gold pill indicator */}
        <Animated.View
          style={[
            styles.pillWrapper,
            pillAnimatedStyle,
            { width: `${100 / TAB_COUNT}%` as unknown as number },
          ]}
        >
          <View style={[styles.pill, shadows.glowSubtle]} />
        </Animated.View>

        {/* Tab buttons */}
        <View style={styles.tabButtonsRow}>
          {TAB_CONFIG.map((tab) => {
            const route = state.routes.find((r) => r.name === tab.name);
            if (!route) return null;
            const isFocused =
              state.routes[state.index]?.name === tab.name;
            return (
              <TabButton
                key={tab.name}
                focused={isFocused}
                label={tab.label}
                Icon={tab.Icon}
                onPress={() => handlePress(tab.name, route.key, isFocused)}
                onLongPress={() => handleLongPress(route.key)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Main Layout ───

export default function MainLayout() {
  return (
    <Tabs
      tabBar={(props) => <LiquidGoldTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {/* Visible tabs */}
      <Tabs.Screen name="venues/index" />
      <Tabs.Screen name="orders/index" />
      <Tabs.Screen name="profile/index" />
      {/* Hidden screens — not shown in tab bar */}
      <Tabs.Screen name="venues/[id]" options={{ href: null }} />
      <Tabs.Screen name="orders/[id]" options={{ href: null }} />
      <Tabs.Screen name="profile/payment-methods" options={{ href: null }} />
      <Tabs.Screen name="order/configure" options={{ href: null }} />
      <Tabs.Screen name="order/payment" options={{ href: null }} />
      <Tabs.Screen name="order/qr" options={{ href: null }} />
      <Tabs.Screen name="order/redeem" options={{ href: null }} />
      <Tabs.Screen name="order/verify-age" options={{ href: null }} />
    </Tabs>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: colors.glass.border,
    backgroundColor: colors.bg.primary,
  },
  tabBarInner: {
    backgroundColor: colors.bg.elevated,
  },
  tabButtonsRow: {
    flexDirection: 'row',
    height: 60,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
  },
  pillWrapper: {
    position: 'absolute',
    top: 0,
    height: 3,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pill: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.gold[500],
    ...Platform.select({
      ios: {
        shadowColor: colors.gold[500],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});
