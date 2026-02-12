import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';

const TAB_ICONS: Record<string, string> = {
  Venues: '\uD83C\uDF7A',
  Orders: '\uD83D\uDCCB',
  Profile: '\uD83D\uDC64',
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View className="items-center justify-center pt-1">
      <Text className={`text-lg ${focused ? '' : 'opacity-50'}`}>
        {TAB_ICONS[label] ?? '\u2699\uFE0F'}
      </Text>
      <Text
        className={`text-[10px] mt-0.5 ${
          focused ? 'text-brand font-semibold' : 'text-white/40'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: '#242449',
          borderTopWidth: 1,
          height: 65,
          paddingBottom: 8,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#f59e0b',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
      }}
    >
      <Tabs.Screen
        name="venues"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Venues" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Orders" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Profile" focused={focused} />
          ),
        }}
      />
      {/* Hide order flow screens from tab bar */}
      <Tabs.Screen
        name="order"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
