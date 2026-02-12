import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#08080F' },
        animation: 'slide_from_right',
      }}
    />
  );
}
