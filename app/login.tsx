import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../src/lib/firebase";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  const signUp = async () => {
    if (!email.trim() || !pw) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Invalid Email", "Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), pw);
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Sign up failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    if (!email.trim() || !pw) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    // Map username "appreviewer" to email for Apple Review
    let loginEmail = email.trim();
    if (loginEmail.toLowerCase() === "appreviewer") {
      loginEmail = "appreviewer@test.com";
    }

    // Basic email format validation (skip for mapped username)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(loginEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address or username");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, pw);
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Sign in failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (mode === "login") {
      signIn();
    } else {
      signUp();
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.wrap}>
          <View style={styles.header}>
            <Text style={styles.appName}>STANCLICKIN</Text>
            <Text style={styles.tagline}>The creator-owned community</Text>
          </View>

          <View style={styles.modeTabs}>
            <Pressable
              style={[styles.modeTab, mode === "login" && styles.modeTabActive]}
              onPress={() => setMode("login")}
            >
              <Text style={[styles.modeTabText, mode === "login" && styles.modeTabTextActive]}>
                Login
              </Text>
            </Pressable>

            <Pressable
              style={[styles.modeTab, mode === "signup" && styles.modeTabActive]}
              onPress={() => setMode("signup")}
            >
              <Text style={[styles.modeTabText, mode === "signup" && styles.modeTabTextActive]}>
                Sign Up
              </Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={mode === "login" ? "Email or Username" : "Email"}
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType={mode === "login" ? "default" : "email-address"}
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              secureTextEntry
              value={pw}
              onChangeText={setPw}
              editable={!loading}
              onSubmitEditing={handleSubmit}
            />

            <Pressable
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
              </Text>
            </Pressable>

            {mode === "signup" && (
              <Text style={styles.hint}>
                By signing up, you'll get access to exclusive content and the creator community.
              </Text>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  keyboardView: { flex: 1 },
  wrap: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 32,
  },

  header: {
    alignItems: "center",
    gap: 8,
  },
  appName: {
    fontSize: 36,
    fontWeight: "900",
    color: "#111",
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },

  modeTabs: {
    flexDirection: "row",
    gap: 8,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  modeTabActive: {
    backgroundColor: "#111",
  },
  modeTabText: {
    fontWeight: "900",
    color: "#111",
    fontSize: 15,
  },
  modeTabTextActive: {
    color: "#fff",
  },

  form: {
    gap: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  btn: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    marginTop: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  hint: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
});
