import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync, savePushToken } from "../src/lib/pushNotifications";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [hasUsername, setHasUsername] = useState<boolean | null>(null);

  const userDocUnsub = useRef<null | (() => void)>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);

      if (userDocUnsub.current) {
        userDocUnsub.current();
        userDocUnsub.current = null;
      }

      if (!u) {
        setHasUsername(null);
        return;
      }

      setHasUsername(null);
      userDocUnsub.current = onSnapshot(doc(db, "users", u.uid), (snap) => {
        const username = snap.exists() ? (snap.data() as any)?.username : null;
        setHasUsername(!!username);
      });
    });

    return () => {
      unsubAuth();
      if (userDocUnsub.current) userDocUnsub.current();
    };
  }, []);

  // Register for push notifications when user logs in
  useEffect(() => {
    if (!user) return;

    const initPushNotifications = async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await savePushToken(user.uid, token);
        }
      } catch (error) {
        console.error('[Push] Error initializing push notifications:', error);
      }
    };

    initPushNotifications();
  }, [user]);

  // Handle notification received while app is open
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[Push] Notification received:', notification);
      // Could show in-app banner here in future
    });

    return () => subscription.remove();
  }, []);

  // Handle notification tapped (app was closed/background)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;

      // Navigate based on notification type
      if (data.postId) {
        router.push({ pathname: '/post' as any, params: { postId: data.postId } });
      } else if (data.type === 'follow' && data.fromUid) {
        router.push({ pathname: '/u/[uid]' as any, params: { uid: data.fromUid } });
      }
    });

    return () => subscription.remove();
  }, []);

  // Clear badge when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        Notifications.setBadgeCountAsync(0);
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ready) return;

    const seg0 = segments[0];
    const onLogin = seg0 === "login";
    const onUsername = seg0 === "username";

    const inAuthedArea =
      seg0 === "stanspace" ||
      seg0 === "stanhub" ||
      seg0 === "flappyclickin" ||
      seg0 === "post" ||
      seg0 === "settings" ||
      seg0 === "u";

    if (!user && inAuthedArea) router.replace("/login");
    if (user && onLogin) router.replace("/");

    if (user && hasUsername === false && !onUsername) router.replace("/username");
    if (user && hasUsername === true && onUsername) router.replace("/");
  }, [ready, user, segments, hasUsername]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="username" />

      <Stack.Screen name="stanspace" />
      <Stack.Screen name="stanhub" />
      <Stack.Screen name="flappyclickin" />

      <Stack.Screen name="post" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="u/[uid]" />
    </Stack>
  );
}
