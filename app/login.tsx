import React, { useState, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import * as Haptics from "expo-haptics";
import { auth } from "../src/lib/firebase";
import { getTheme, getGlowShadow } from "../src/lib/themes";
import { createPressAnimation, getGlowStyle } from "../src/lib/animations";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

  // Use default theme (neon) for login screen
  const theme = getTheme(null);

  // Animation values
  const submitScale = useRef(new Animated.Value(1)).current;
  const checkboxScale = useRef(new Animated.Value(1)).current;
  const loginTabScale = useRef(new Animated.Value(1)).current;
  const signupTabScale = useRef(new Animated.Value(1)).current;

  const submitPressHandlers = createPressAnimation(submitScale);
  const checkboxPressHandlers = createPressAnimation(checkboxScale);
  const loginTabPressHandlers = createPressAnimation(loginTabScale);
  const signupTabPressHandlers = createPressAnimation(signupTabScale);

  const signUp = async () => {
    if (!email.trim() || !pw) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Please enter email and password");
      return;
    }

    if (!tosAccepted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Terms Required", "Please accept the Terms of Service to continue");
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Invalid Email", "Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), pw);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sign up failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    if (!email.trim() || !pw) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Invalid Email", "Please enter a valid email address or username");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, pw);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sign in failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mode === "login") {
      signIn();
    } else {
      signUp();
    }
  };

  const handleModeChange = (newMode: "login" | "signup") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(newMode);
    setTosAccepted(false);
  };

  const handleTosToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTosAccepted(!tosAccepted);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.keyboardView}
      >
        <View style={styles.wrap}>
          <View style={styles.header}>
            <Text style={[styles.appName, { color: theme.textColor, ...getGlowShadow(theme.primaryColor, 15) }]}>
              STANCLICKIN
            </Text>
            <Text style={[styles.tagline, { color: theme.secondaryTextColor }]}>
              The creator-owned community
            </Text>
          </View>

          <View style={styles.modeTabs}>
            <Animated.View style={[{ flex: 1, transform: [{ scale: loginTabScale }] }]}>
              <Pressable
                style={[
                  styles.modeTab,
                  { backgroundColor: theme.surfaceColor },
                  mode === "login" && {
                    backgroundColor: theme.primaryColor,
                    ...getGlowStyle(theme.primaryColor, 8),
                  },
                ]}
                onPress={() => handleModeChange("login")}
                {...loginTabPressHandlers}
              >
                <Text
                  style={[
                    styles.modeTabText,
                    { color: theme.secondaryTextColor },
                    mode === "login" && { color: theme.backgroundColor },
                  ]}
                >
                  Login
                </Text>
              </Pressable>
            </Animated.View>

            <Animated.View style={[{ flex: 1, transform: [{ scale: signupTabScale }] }]}>
              <Pressable
                style={[
                  styles.modeTab,
                  { backgroundColor: theme.surfaceColor },
                  mode === "signup" && {
                    backgroundColor: theme.primaryColor,
                    ...getGlowStyle(theme.primaryColor, 8),
                  },
                ]}
                onPress={() => handleModeChange("signup")}
                {...signupTabPressHandlers}
              >
                <Text
                  style={[
                    styles.modeTabText,
                    { color: theme.secondaryTextColor },
                    mode === "signup" && { color: theme.backgroundColor },
                  ]}
                >
                  Sign Up
                </Text>
              </Pressable>
            </Animated.View>
          </View>

          <View style={styles.form}>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.surfaceColor, color: theme.textColor },
                emailFocused && {
                  ...getGlowStyle(theme.primaryColor, 6),
                },
              ]}
              placeholder={mode === "login" ? "Email or Username" : "Email"}
              placeholderTextColor={theme.mutedTextColor}
              autoCapitalize="none"
              keyboardType={mode === "login" ? "default" : "email-address"}
              value={email}
              onChangeText={setEmail}
              editable={!loading}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.surfaceColor, color: theme.textColor },
                pwFocused && {
                  ...getGlowStyle(theme.primaryColor, 6),
                },
              ]}
              placeholder="Password"
              placeholderTextColor={theme.mutedTextColor}
              secureTextEntry
              value={pw}
              onChangeText={setPw}
              editable={!loading}
              onSubmitEditing={handleSubmit}
              onFocus={() => setPwFocused(true)}
              onBlur={() => setPwFocused(false)}
            />

            <Animated.View style={{ transform: [{ scale: submitScale }] }}>
              <Pressable
                style={[
                  styles.btn,
                  {
                    backgroundColor: theme.primaryColor,
                    ...getGlowStyle(theme.primaryColor, 10),
                  },
                  loading && styles.btnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={loading}
                {...submitPressHandlers}
              >
                <Text style={[styles.btnText, { color: theme.backgroundColor }]}>
                  {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
                </Text>
              </Pressable>
            </Animated.View>

            {mode === "signup" && (
              <>
                <Animated.View style={{ transform: [{ scale: checkboxScale }] }}>
                  <Pressable
                    style={styles.tosRow}
                    onPress={handleTosToggle}
                    {...checkboxPressHandlers}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        { backgroundColor: theme.surfaceColor },
                        tosAccepted && {
                          backgroundColor: theme.primaryColor,
                          ...getGlowStyle(theme.primaryColor, 6),
                        },
                      ]}
                    >
                      {tosAccepted && (
                        <Text style={[styles.checkmark, { color: theme.backgroundColor }]}>
                          ✓
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.tosText, { color: theme.secondaryTextColor }]}>
                      I agree to the Terms of Service. STANCLICKIN has zero tolerance for objectionable content, harassment, spam, or abusive behavior.
                    </Text>
                  </Pressable>
                </Animated.View>

                <Text style={[styles.hint, { color: theme.mutedTextColor }]}>
                  By signing up, you'll get access to exclusive content and the creator community.
                </Text>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
    fontFamily: "SpaceMono",
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 14,
    fontWeight: "500",
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },

  modeTabs: {
    flexDirection: "row",
    gap: 12,
  },
  modeTab: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  modeTabText: {
    fontWeight: "700",
    fontSize: 15,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },

  form: {
    gap: 14,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: "SpaceMono",
  },
  btn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontWeight: "700",
    fontSize: 16,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },
  hint: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
    fontFamily: "SpaceMono",
  },
  tosRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkmark: {
    fontSize: 16,
    fontWeight: "900",
    fontFamily: "SpaceMono",
  },
  tosText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    fontFamily: "SpaceMono",
  },
});
