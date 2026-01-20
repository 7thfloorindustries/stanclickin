import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and get push token
 * Returns null if on simulator or permission denied
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token = null;

  // Only on physical devices
  if (!Device.isDevice) {
    console.log('[Push] Push notifications only work on physical devices');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    // If still not granted, return null
    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted for push notifications');
      return null;
    }

    // Get push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '411874fc-21c1-41e1-8cd3-ef06b4db6a2b', // From app.json extra.eas.projectId
    });
    token = tokenData.data;
    console.log('[Push] ✅ Token received:', token);

    // Android-specific channel setup
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#111111',
      });
      console.log('[Push] Android notification channel configured');
    }

    return token;
  } catch (error) {
    console.error('[Push] Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Save push token to user's Firestore document
 */
export async function savePushToken(uid: string, token: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      pushToken: token,
      pushTokenUpdatedAt: new Date().toISOString(),
    });
    console.log('[Push] ✅ Token saved to Firestore');
  } catch (error) {
    console.error('[Push] Error saving push token:', error);
  }
}

/**
 * Remove push token from user document (on logout)
 */
export async function removePushToken(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      pushToken: null,
      pushTokenUpdatedAt: new Date().toISOString(),
    });
    console.log('[Push] Token removed from Firestore');
  } catch (error) {
    console.error('[Push] Error removing push token:', error);
  }
}
