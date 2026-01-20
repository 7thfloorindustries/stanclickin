import React, { useMemo, useState, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, setDoc, collection, query, where, getDocs, runTransaction } from "firebase/firestore";
import * as Haptics from "expo-haptics";
import { auth, db } from "../src/lib/firebase";
import { router } from "expo-router";
import { getTheme } from "../src/lib/themes";
import { createPressAnimation, getGlowStyle } from "../src/lib/animations";

const okUsername = (u: string) => /^[a-z0-9_]{3,15}$/.test(u);

export default function Username() {
  const [username, setUsername] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  const cleaned = useMemo(() => username.trim().toLowerCase(), [username]);
  const valid = useMemo(() => okUsername(cleaned), [cleaned]);

  // Use default theme for onboarding
  const theme = getTheme(null);

  // Animation values
  const saveScale = useRef(new Animated.Value(1)).current;
  const savePressHandlers = createPressAnimation(saveScale);

  const save = async () => {
    const user = auth.currentUser;
    if (!user) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return Alert.alert("Not logged in");
    }

    if (!valid) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return Alert.alert("Invalid username", "Use 3-15 chars: a-z, 0-9, underscore.");
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);

    try {
      // Use transaction to atomically check and claim username
      await runTransaction(db, async (transaction) => {
        const unameRef = doc(db, "usernames", cleaned);
        const unameSnap = await transaction.get(unameRef);

        if (unameSnap.exists()) {
          throw new Error("USERNAME_TAKEN");
        }

        // Atomically claim the username
        transaction.set(unameRef, { uid: user.uid, createdAt: Date.now() });
        transaction.set(doc(db, "users", user.uid), {
          username: cleaned,
          email: user.email,
          createdAt: Date.now()
        }, { merge: true });
      });
    } catch (error: any) {
      setSaving(false);
      if (error.message === "USERNAME_TAKEN") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return Alert.alert("Taken", "That username is already taken.");
      }
      console.error("Error saving username:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return Alert.alert("Error", "Failed to save username. Please try again.");
    }

    // Auto-follow @stanclickin if the account exists
    try {
      const stanclickinQuery = query(collection(db, "users"), where("username", "==", "stanclickin"));
      const stanclickinSnap = await getDocs(stanclickinQuery);

      if (!stanclickinSnap.empty) {
        const stanclickinUid = stanclickinSnap.docs[0].id;

        // Create follow documents
        await setDoc(doc(db, "follows", user.uid, "following", stanclickinUid), {
          uid: stanclickinUid,
          createdAt: Date.now(),
        });
        await setDoc(doc(db, "follows", stanclickinUid, "followers", user.uid), {
          uid: user.uid,
          createdAt: Date.now(),
        });

        console.log("Auto-followed @stanclickin");
      }
    } catch (error) {
      console.error("Error auto-following @stanclickin:", error);
      // Don't block signup if auto-follow fails
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/");
  };

  const charCount = cleaned.length;
  const minChars = 3;
  const maxChars = 15;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]}>
      <View style={styles.wrap}>
        <Text style={[styles.h1, { color: theme.textColor }]}>Pick a username</Text>
        <Text style={[styles.sub, { color: theme.secondaryTextColor }]}>
          This shows as @username.
        </Text>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.surfaceColor, color: theme.textColor },
            inputFocused && {
              ...getGlowStyle(theme.primaryColor, 6),
            },
          ]}
          placeholder="e.g. bigtonytone"
          placeholderTextColor={theme.mutedTextColor}
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          editable={!saving}
          maxLength={maxChars}
        />

        <Text
          style={[
            styles.charCounter,
            { color: theme.mutedTextColor },
            charCount >= minChars && charCount <= maxChars && { color: theme.primaryColor },
            charCount > 0 && charCount < minChars && { color: theme.accentColor },
          ]}
        >
          {charCount}/{maxChars}
        </Text>

        <Animated.View style={{ transform: [{ scale: saveScale }] }}>
          <Pressable
            style={[
              styles.btn,
              {
                backgroundColor: theme.primaryColor,
                ...getGlowStyle(theme.primaryColor, valid ? 10 : 0),
              },
              (!valid || saving) && styles.btnDisabled,
            ]}
            onPress={save}
            disabled={!valid || saving}
            {...savePressHandlers}
          >
            <Text style={[styles.btnText, { color: theme.backgroundColor }]}>
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </Animated.View>

        <Text style={[styles.hint, { color: theme.mutedTextColor }]}>
          Allowed: a-z, 0-9, underscore. 3-15 chars.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 14,
  },
  h1: {
    fontSize: 28,
    fontWeight: "900",
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },
  sub: {
    marginBottom: 8,
    fontFamily: "SpaceMono",
    fontSize: 14,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: "SpaceMono",
  },
  charCounter: {
    fontSize: 12,
    textAlign: "right",
    fontFamily: "SpaceMono",
    fontWeight: "600",
    marginTop: -6,
    marginBottom: 4,
  },
  btn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.35,
  },
  btnText: {
    fontWeight: "700",
    fontSize: 16,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: "SpaceMono",
    textAlign: "center",
  },
});
