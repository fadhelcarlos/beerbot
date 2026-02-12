import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Configure how notifications appear when app is foregrounded (native only)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Request notification permissions and return the Expo push token.
 * Returns null if permissions are denied or unavailable.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f59e0b',
    });
  }

  // Get push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return tokenData.data;
}

/**
 * Store the push token in the user's profile row.
 */
export async function savePushToken(token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('users')
    .update({ push_token: token })
    .eq('id', user.id);
}

/**
 * Schedule a local notification at a specific date.
 * Returns the notification identifier for cancellation.
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  triggerDate: Date,
  data?: Record<string, unknown>,
): Promise<string> {
  const secondsUntil = Math.max(
    1,
    Math.floor((triggerDate.getTime() - Date.now()) / 1000),
  );

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: data ?? {},
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntil,
    },
  });
}

/**
 * Cancel a previously scheduled notification by its identifier.
 */
export async function cancelScheduledNotification(
  identifier: string,
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Schedule the 5-minute and 1-minute redemption warning notifications.
 * Returns identifiers for both so they can be cancelled if redeemed early.
 */
export async function scheduleRedemptionWarnings(
  expiresAt: string,
  orderId: string,
): Promise<{ fiveMinId: string | null; oneMinId: string | null }> {
  const expiresMs = new Date(expiresAt).getTime();
  const now = Date.now();

  const fiveMinBefore = expiresMs - 5 * 60 * 1000;
  const oneMinBefore = expiresMs - 1 * 60 * 1000;

  const notifData = { orderId, screen: 'redeem' };

  let fiveMinId: string | null = null;
  let oneMinId: string | null = null;

  if (fiveMinBefore > now) {
    fiveMinId = await scheduleLocalNotification(
      'Your beer is waiting!',
      'Redeem soon \u2014 5 minutes remaining.',
      new Date(fiveMinBefore),
      notifData,
    );
  }

  if (oneMinBefore > now) {
    oneMinId = await scheduleLocalNotification(
      'Last chance!',
      'Your order expires in 60 seconds.',
      new Date(oneMinBefore),
      notifData,
    );
  }

  return { fiveMinId, oneMinId };
}
