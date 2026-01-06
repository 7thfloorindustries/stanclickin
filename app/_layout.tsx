import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";

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
