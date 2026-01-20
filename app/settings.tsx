import React, { useEffect, useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, TextInput, ScrollView, Keyboard, TouchableWithoutFeedback, Linking, Switch, Animated } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { auth, db, storage } from "../src/lib/firebase";
import { router } from "expo-router";
import { Avatar } from "../components/Avatar";
import { type ThemeId, getTheme } from "../src/lib/themes";
import { createPressAnimation, getGlowStyle } from "../src/lib/animations";

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
              style={[styles.backBtn, { backgroundColor: theme.surfaceColor }]}
              onPress={goBack}
            >
              <Text style={[styles.backText, { color: theme.textColor }]}>{"<"} BACK</Text>
            </Pressable>
          </View>

          <Text style={[styles.h1, { color: theme.primaryColor }]}>SETTINGS</Text>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.secondaryTextColor }]}>PROFILE PICTURE</Text>
          <View style={[styles.profilePictureSection, { backgroundColor: theme.surfaceColor }]}>
            <Avatar imageUrl={profilePicture} username={username} size={80} theme={theme} />
            <Pressable
              style={[styles.changeBtn, { backgroundColor: theme.surfaceGlow }, uploading && styles.btnDisabled]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                changeProfilePicture();
              }}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={theme.textColor} />
              ) : (
                <Text style={[styles.changeBtnText, { color: theme.textColor }]}>
                  {profilePicture ? "CHANGE" : "ADD"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.secondaryTextColor }]}>BIO</Text>
          <TextInput
            style={[styles.bioInput, { backgroundColor: theme.surfaceColor, color: theme.textColor }]}
            placeholder="Tell people about yourself..."
            placeholderTextColor={theme.mutedTextColor}
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={150}
          />
          <Text style={[styles.charCount, { color: theme.mutedTextColor }]}>{bio.length}/150</Text>
          <Pressable
            style={[styles.saveBioBtn, { backgroundColor: theme.primaryColor }, savingBio && styles.btnDisabled]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              saveBio();
            }}
            disabled={savingBio}
          >
            {savingBio ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBioBtnText}>SAVE BIO</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.secondaryTextColor }]}>PUSH NOTIFICATIONS</Text>
          <Text style={[styles.sectionDescription, { color: theme.mutedTextColor }]}>
            Choose which notifications you want to receive
          </Text>

          <View style={[styles.settingRow, { backgroundColor: theme.surfaceColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>Likes</Text>
            <Switch
              value={notifPrefs.likes}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateNotificationPref('likes', val);
              }}
              trackColor={{ false: theme.surfaceGlow, true: theme.primaryColor }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.settingRow, { backgroundColor: theme.surfaceColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>Comments</Text>
            <Switch
              value={notifPrefs.comments}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateNotificationPref('comments', val);
              }}
              trackColor={{ false: theme.surfaceGlow, true: theme.primaryColor }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.settingRow, { backgroundColor: theme.surfaceColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>Follows</Text>
            <Switch
              value={notifPrefs.follows}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateNotificationPref('follows', val);
              }}
              trackColor={{ false: theme.surfaceGlow, true: theme.primaryColor }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.settingRow, { backgroundColor: theme.surfaceColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>Reposts</Text>
            <Switch
              value={notifPrefs.reposts}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateNotificationPref('reposts', val);
              }}
              trackColor={{ false: theme.surfaceGlow, true: theme.primaryColor }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {isAdmin && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.secondaryTextColor }]}>ADMIN</Text>
            <Pressable
              style={[styles.adminBtn, { backgroundColor: theme.surfaceColor }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/admin");
              }}
            >
              <Text style={[styles.adminBtnText, { color: theme.primaryColor }]}>OPEN ADMIN PANEL</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.secondaryTextColor }]}>SUPPORT & LEGAL</Text>

          <View style={[styles.infoBox, { backgroundColor: theme.surfaceColor }]}>
            <Text style={[styles.infoTitle, { color: theme.textColor }]}>Contact Information</Text>
            <Text style={[styles.infoText, { color: theme.secondaryTextColor }]}>Support: support@7thfloor.digital</Text>
            <Text style={[styles.infoText, { color: theme.secondaryTextColor }]}>Moderation: moderation@7thfloor.digital</Text>
          </View>

          <Pressable
            style={[styles.linkBtn, { backgroundColor: theme.surfaceColor }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openPrivacyPolicy();
            }}
          >
            <Text style={[styles.linkBtnText, { color: theme.textColor }]}>Privacy Policy</Text>
            <Text style={[styles.linkArrow, { color: theme.mutedTextColor }]}>{">"}</Text>
          </Pressable>

          <Pressable
            style={[styles.linkBtn, { backgroundColor: theme.surfaceColor }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openTermsOfService();
            }}
          >
            <Text style={[styles.linkBtnText, { color: theme.textColor }]}>Terms of Service</Text>
            <Text style={[styles.linkArrow, { color: theme.mutedTextColor }]}>{">"}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.secondaryTextColor }]}>ACCOUNT</Text>

          <Pressable
            style={[styles.btn, { backgroundColor: theme.surfaceColor }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              logout();
            }}
          >
            <Text style={[styles.btnText, { color: theme.textColor }]}>LOG OUT</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnDanger]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              deleteAccount();
            }}
          >
            <Text style={styles.btnDangerText}>DELETE ACCOUNT</Text>
          </Pressable>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  content: { padding: 20, gap: 28, paddingBottom: 40 },

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
    backgroundColor: "rgba(10, 10, 10, 0.8)",
  },

  nav: { marginBottom: 10 },
  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  backText: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 13,
    letterSpacing: 1,
  },

  h1: {
    fontSize: 24,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 3,
    marginBottom: 8,
  },

  section: { gap: 12 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },
  sectionDescription: {
    fontSize: 12,
    fontFamily: "SpaceMono",
    marginTop: -4,
    letterSpacing: 0.5,
  },

  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontFamily: "SpaceMono",
    letterSpacing: 0.5,
  },

  profilePictureSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderRadius: 12,
  },

  changeBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  changeBtnText: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 12,
    letterSpacing: 1,
  },

  bioInput: {
    borderRadius: 12,
    padding: 14,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 14,
    fontFamily: "SpaceMono",
  },
  charCount: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    textAlign: "right",
    letterSpacing: 0.5,
  },

  btn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 13,
    letterSpacing: 1,
  },

  saveBioBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBioBtnText: {
    color: "#fff",
    fontFamily: "SpaceMono-Bold",
    fontSize: 13,
    letterSpacing: 1,
  },

  adminBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  adminBtnText: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 13,
    letterSpacing: 1,
  },

  linkBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
  },
  linkBtnText: {
    fontFamily: "SpaceMono",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  linkArrow: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 16,
  },

  infoBox: {
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  infoTitle: {
    fontSize: 12,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "SpaceMono",
    letterSpacing: 0.5,
  },

  btnDanger: {
    backgroundColor: "#ff3b30",
  },
  btnDangerText: {
    color: "#fff",
    fontFamily: "SpaceMono-Bold",
    fontSize: 13,
    letterSpacing: 1,
  },

  btnDisabled: { opacity: 0.5 },
});
