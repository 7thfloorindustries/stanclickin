import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { doc, getDoc, setDoc, collection, query, where, getDocs, runTransaction } from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";
import { router } from "expo-router";

const okUsername = (u: string) => /^[a-z0-9_]{3,15}$/.test(u);

export default function Username() {
  const [username, setUsername] = useState("");
  const cleaned = useMemo(() => username.trim().toLowerCase(), [username]);
  const valid = useMemo(() => okUsername(cleaned), [cleaned]);

  const save = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");

    if (!valid) {
      return Alert.alert("Invalid username", "Use 3–15 chars: a–z, 0–9, underscore.");
    }

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
      if (error.message === "USERNAME_TAKEN") {
        return Alert.alert("Taken", "That username is already taken.");
      }
      console.error("Error saving username:", error);
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

    router.replace("/"); // ✅ go to launcher (NOT /(tabs))
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>Pick a username</Text>
      <Text style={styles.sub}>This shows as @username.</Text>

      <TextInput
        style={styles.input}
        placeholder="e.g. bigtonytone"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />

      <Pressable style={[styles.btn, !valid && styles.btnDisabled]} onPress={save} disabled={!valid}>
        <Text style={styles.btnText}>Save</Text>
      </Pressable>

      <Text style={styles.hint}>Allowed: a–z, 0–9, underscore. 3–15 chars.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: "center", gap: 12, backgroundColor: "#fff" },
  h1: { fontSize: 28, fontWeight: "900", color: "#111" },
  sub: { color: "#444", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#111", borderRadius: 12, padding: 14 },
  btn: { padding: 14, borderRadius: 12, backgroundColor: "#111", alignItems: "center" },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: "#fff", fontWeight: "900" },
  hint: { marginTop: 8, opacity: 0.6 },
});
