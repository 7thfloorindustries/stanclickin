import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, TextInput, ScrollView, Keyboard, TouchableWithoutFeedback, Linking, Switch } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import { auth, db, storage } from "../src/lib/firebase";
import { router } from "expo-router";
import { Avatar } from "../components/Avatar";
import { type ThemeId, getTheme } from "../src/lib/themes";

export default function Settings() {
  const navigation = useNavigation();
  const me = auth.currentUser?.uid;
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState({
    likes: true,
    comments: true,
    follows: true,
    reposts: true,
  });

  const theme = getTheme(userTheme);

  // Load user theme and notification preferences
  useEffect(() => {
    if (!me) return;

    const userRef = doc(db, "users", me);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserTheme(data?.theme || null);

        // Load notification preferences
        if (data?.notificationPreferences) {
          setNotifPrefs(data.notificationPreferences);
        }
      }
    });
  }, [me]);

  useEffect(() => {
    const loadUserData = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUsername(data?.username || "");
        setProfilePicture(data?.profilePictureUrl || null);
        setBio(data?.bio || "");
        setIsAdmin(data?.isAdmin === true);
      }
    };

    loadUserData();
  }, []);

  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace("/stanspace");
    }
  };

  const changeProfilePicture = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert("Permission needed", "Please allow access to your photo library");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const user = auth.currentUser;
    if (!user) return;

    setUploading(true);

    try {
      // Upload to Firebase Storage
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();

      const storageRef = ref(storage, `profilePictures/${user.uid}/profile.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);

      // Update Firestore user document
      await updateDoc(doc(db, "users", user.uid), {
        profilePictureUrl: downloadUrl,
      });

      setProfilePicture(downloadUrl);
      Alert.alert("Success!", "Profile picture updated");
    } catch (error: any) {
      console.error("Error uploading profile picture:", error);
      Alert.alert("Error", error?.message || "Failed to upload profile picture");
    } finally {
      setUploading(false);
    }
  };

  const saveBio = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setSavingBio(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        bio: bio.trim(),
      });
      Alert.alert("Saved!", "Bio updated successfully");
    } catch (error: any) {
      console.error("Error saving bio:", error);
      Alert.alert("Error", error?.message || "Failed to save bio");
    } finally {
      setSavingBio(false);
    }
  };

  const updateNotificationPref = async (key: string, value: boolean) => {
    if (!me) return;

    const newPrefs = { ...notifPrefs, [key]: value };
    setNotifPrefs(newPrefs);

    try {
      await updateDoc(doc(db, "users", me), {
        notificationPreferences: newPrefs,
      });
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      // Revert on error
      setNotifPrefs(notifPrefs);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (e: any) {
      Alert.alert("Logout failed", e?.message ?? String(e));
    }
  };

  const deleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data. This action cannot be undone.\n\nAre you sure you want to continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Alert.alert(
              "Final Confirmation",
              "Are you absolutely sure? This is permanent and cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    const user = auth.currentUser;
                    if (!user) return;

                    try {
                      // Delete user document from Firestore
                      await import("firebase/firestore").then((m) =>
                        m.deleteDoc(doc(db, "users", user.uid))
                      );

                      // Delete the Firebase Auth user
                      await import("firebase/auth").then((m) =>
                        m.deleteUser(user)
                      );

                      Alert.alert("Account Deleted", "Your account has been permanently deleted.");
                      router.replace("/login");
                    } catch (error: any) {
                      console.error("Error deleting account:", error);
                      if (error.code === "auth/requires-recent-login") {
                        Alert.alert(
                          "Re-authentication Required",
                          "For security reasons, please log out and log back in, then try deleting your account again."
                        );
                      } else {
                        Alert.alert("Error", "Failed to delete account. Please contact support@7thfloor.digital");
                      }
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://7thfloorindustries.github.io/stanclickin-legal/privacy.html');
  };

  const openTermsOfService = () => {
    Linking.openURL('https://7thfloorindustries.github.io/stanclickin-legal/terms.html');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]} edges={["top"]}>
      {/* Fixed background image */}
      {theme.stanPhoto && (
        <>
          <Image
            source={theme.stanPhoto}
            style={styles.fixedBackground}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
          />
          <View style={styles.fixedBackgroundOverlay} />
        </>
      )}

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={[styles.wrap, theme.stanPhoto && { backgroundColor: "transparent" }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.nav}>
            <Pressable
              style={[
                styles.backBtn,
                theme.stanPhoto && styles.backBtnWithBanner
              ]}
              onPress={goBack}
            >
              <Text style={[styles.backText, theme.stanPhoto && styles.backTextWithBanner]}>‹ Back</Text>
            </Pressable>
          </View>

          <Text style={[styles.h1, theme.stanPhoto && styles.h1WithBanner]}>Settings</Text>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, theme.stanPhoto && styles.sectionTitleWithBanner]}>Profile Picture</Text>
          <View style={styles.profilePictureSection}>
            <Avatar imageUrl={profilePicture} username={username} size={80} />
            <Pressable
              style={[styles.btn, styles.btnSecondary, uploading && styles.btnDisabled]}
              onPress={changeProfilePicture}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#111" />
              ) : (
                <Text style={styles.btnSecondaryText}>
                  {profilePicture ? "Change Picture" : "Add Picture"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, theme.stanPhoto && styles.sectionTitleWithBanner]}>Bio</Text>
          <TextInput
            style={styles.bioInput}
            placeholder="Tell people about yourself..."
            placeholderTextColor="#999"
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={150}
          />
          <Text style={[styles.charCount, theme.stanPhoto && styles.charCountWithBanner]}>{bio.length}/150</Text>
          <Pressable
            style={[styles.saveBioBtn, savingBio && styles.btnDisabled]}
            onPress={saveBio}
            disabled={savingBio}
          >
            {savingBio ? (
              <ActivityIndicator color="#111" />
            ) : (
              <Text style={styles.saveBioBtnText}>Save Bio</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, theme.stanPhoto && styles.sectionTitleWithBanner]}>Push Notifications</Text>
          <Text style={[styles.sectionDescription, theme.stanPhoto && styles.sectionDescriptionWithBanner]}>
            Choose which notifications you want to receive
          </Text>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, theme.stanPhoto && styles.settingLabelWithBanner]}>Likes</Text>
            <Switch
              value={notifPrefs.likes}
              onValueChange={(val) => updateNotificationPref('likes', val)}
              trackColor={{ false: '#ccc', true: '#111' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, theme.stanPhoto && styles.settingLabelWithBanner]}>Comments</Text>
            <Switch
              value={notifPrefs.comments}
              onValueChange={(val) => updateNotificationPref('comments', val)}
              trackColor={{ false: '#ccc', true: '#111' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, theme.stanPhoto && styles.settingLabelWithBanner]}>Follows</Text>
            <Switch
              value={notifPrefs.follows}
              onValueChange={(val) => updateNotificationPref('follows', val)}
              trackColor={{ false: '#ccc', true: '#111' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, theme.stanPhoto && styles.settingLabelWithBanner]}>Reposts</Text>
            <Switch
              value={notifPrefs.reposts}
              onValueChange={(val) => updateNotificationPref('reposts', val)}
              trackColor={{ false: '#ccc', true: '#111' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {isAdmin && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, theme.stanPhoto && styles.sectionTitleWithBanner]}>Admin</Text>
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => router.push("/admin")}
            >
              <Text style={styles.btnSecondaryText}>Open Admin Panel</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, theme.stanPhoto && styles.sectionTitleWithBanner]}>Support & Legal</Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Contact Information</Text>
            <Text style={styles.infoText}>Support: support@7thfloor.digital</Text>
            <Text style={styles.infoText}>Moderation: moderation@7thfloor.digital</Text>
          </View>

          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={openPrivacyPolicy}
          >
            <Text style={styles.btnSecondaryText}>Privacy Policy</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={openTermsOfService}
          >
            <Text style={styles.btnSecondaryText}>Terms of Service</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, theme.stanPhoto && styles.sectionTitleWithBanner]}>Account</Text>

          <Pressable style={styles.btn} onPress={logout}>
            <Text style={styles.btnText}>Log out</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnDanger]}
            onPress={deleteAccount}
          >
            <Text style={styles.btnDangerText}>Delete Account</Text>
          </Pressable>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { flex: 1 },
  content: { padding: 16, gap: 24, paddingBottom: 40 },

  fixedBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  fixedBackgroundOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },

  nav: { marginBottom: 6 },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#111",
    alignSelf: "flex-start",
  },
  backBtnWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  backText: { fontWeight: "900", color: "#111" },
  backTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  h1: { fontSize: 28, fontWeight: "900", color: "#111" },
  h1WithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },

  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#666" },
  sectionTitleWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  sectionDescription: { fontSize: 14, color: "#999", marginTop: -4 },
  sectionDescriptionWithBanner: {
    color: "rgba(255, 255, 255, 0.9)",
    textShadowColor: "rgba(0, 0, 0, 0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
  },
  settingLabel: { fontSize: 16, fontWeight: "600", color: "#111" },
  settingLabelWithBanner: {
    color: "#111",
  },

  profilePictureSection: { flexDirection: "row", alignItems: "center", gap: 16 },

  bioInput: {
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: 14,
    backgroundColor: "#fff",
    color: "#111",
  },
  charCount: { fontSize: 12, color: "#999", textAlign: "right" },
  charCountWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  btn: { backgroundColor: "#111", padding: 14, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },

  btnSecondary: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#111",
  },
  btnSecondaryText: { color: "#111", fontWeight: "900" },

  saveBioBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#111",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBioBtnText: { color: "#111", fontWeight: "900", fontSize: 16 },

  infoBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#f9f9f9",
    gap: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: "#111",
    fontWeight: "600",
  },
  infoNote: {
    fontSize: 11,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic",
  },

  btnDanger: {
    backgroundColor: "#ff3b30",
  },
  btnDangerText: {
    color: "#fff",
    fontWeight: "900",
  },

  btnDisabled: { opacity: 0.5 },
});
