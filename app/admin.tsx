import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { collection, query, where, onSnapshot, doc, deleteDoc, updateDoc, getDoc, orderBy, limit } from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";
import { type ThemeId, getTheme } from "../src/lib/themes";
import { createPressAnimation, getGlowStyle } from "../src/lib/animations";

type Report = {
  id: string;
  type: "post" | "comment";
  postId: string;
  postUid?: string;
  commentId?: string;
  commentUid?: string;
  reportedBy: string;
  reason: string;
  createdAt: any;
  status: "pending" | "dismissed" | "resolved";
};

type User = {
  uid: string;
  username: string;
  email?: string;
  createdAt: any;
  isAdmin?: boolean;
};

type PushError = {
  id: string;
  recipientUid: string;
  type: string;
  error: string;
  timestamp: any;
};

export default function AdminPanel() {
  const me = auth.currentUser?.uid;
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pushErrors, setPushErrors] = useState<PushError[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"reports" | "users" | "pushErrors">("reports");
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null);

  const theme = getTheme(userTheme);

  // Animation values
  const backScale = useRef(new Animated.Value(1)).current;
  const backPressHandlers = createPressAnimation(backScale);

  // Load user theme
  useEffect(() => {
    if (!me) return;

    const userRef = doc(db, "users", me);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserTheme(data?.theme || null);
      }
    });
  }, [me]);

  // Check if user is admin
  useEffect(() => {
    if (!me) return;

    const checkAdmin = async () => {
      const userDoc = await getDoc(doc(db, "users", me));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setIsAdmin(userData?.isAdmin === true);
      }
      setLoading(false);
    };

    checkAdmin();
  }, [me]);

  // Load pending reports
  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, "reports"), where("status", "==", "pending"));
    return onSnapshot(q, (snap) => {
      const reportsData = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Report[];
      setReports(reportsData);
      setLoading(false);
    });
  }, [isAdmin]);

  // Load all users
  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(q, (snap) => {
      const usersData = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) })) as User[];
      setUsers(usersData);
    });
  }, [isAdmin]);

  // Load push notification errors
  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, "push_errors"), orderBy("timestamp", "desc"), limit(50));
    return onSnapshot(q, (snap) => {
      const errorsData = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PushError[];
      setPushErrors(errorsData);
    });
  }, [isAdmin]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleTabChange = (tab: "reports" | "users" | "pushErrors") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const dismissReport = async (reportId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateDoc(doc(db, "reports", reportId), { status: "dismissed" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Report dismissed");
    } catch (error) {
      console.error("Error dismissing report:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to dismiss report");
    }
  };

  const deleteReportedContent = async (report: Report) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Delete content",
      "This will permanently delete the reported content. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            try {
              if (report.type === "post") {
                // Delete post
                await deleteDoc(doc(db, "posts", report.postId));
              } else if (report.type === "comment" && report.commentId) {
                // Delete comment
                await deleteDoc(doc(db, "posts", report.postId, "comments", report.commentId));
              }

              // Mark report as resolved
              await updateDoc(doc(db, "reports", report.id), { status: "resolved" });

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Deleted", "Content has been removed");
            } catch (error) {
              console.error("Error deleting content:", error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Error", "Failed to delete content");
            }
          },
        },
      ]
    );
  };

  const viewReportedPost = (postId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/post", params: { postId } });
  };

  const viewUserProfile = (uid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/u/[uid]", params: { uid } });
  };

  const getReasonText = (reason: string) => {
    switch (reason) {
      case "spam":
        return "Spam";
      case "harassment":
        return "Harassment";
      case "inappropriate":
        return "Inappropriate content";
      default:
        return reason;
    }
  };

  const getTimeAgo = (timestamp: any) => {
    if (!timestamp?.seconds) return "";
    const now = Date.now();
    const reportTime = timestamp.seconds * 1000;
    const diffMs = now - reportTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(reportTime).toLocaleDateString();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]}>
        <ActivityIndicator size="large" color={theme.primaryColor} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]}>
        <View style={styles.wrap}>
          <Animated.View style={{ transform: [{ scale: backScale }] }}>
            <Pressable
              style={[styles.backBtn, { backgroundColor: theme.surfaceColor }]}
              onPress={handleBack}
              {...backPressHandlers}
            >
              <Text style={[styles.backText, { color: theme.textColor }]}>Back</Text>
            </Pressable>
          </Animated.View>

          <View style={styles.notAdminContainer}>
            <Text style={[styles.notAdminTitle, { color: theme.textColor }]}>Access Denied</Text>
            <Text style={[styles.notAdminText, { color: theme.secondaryTextColor }]}>
              You need admin privileges to access this page.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Animated.View style={{ transform: [{ scale: backScale }] }}>
            <Pressable
              style={[styles.backBtn, { backgroundColor: theme.surfaceColor }]}
              onPress={handleBack}
              {...backPressHandlers}
            >
              <Text style={[styles.backText, { color: theme.textColor }]}>Back</Text>
            </Pressable>
          </Animated.View>

          <Text style={[styles.title, { color: theme.textColor }]}>Admin Panel</Text>
        </View>

        {/* Contact Information */}
        <View style={[styles.contactBox, { backgroundColor: theme.surfaceColor }]}>
          <Text style={[styles.contactTitle, { color: theme.textColor }]}>App Contact Information</Text>
          <Text style={[styles.contactText, { color: theme.secondaryTextColor }]}>Support: support@7thfloor.digital</Text>
          <Text style={[styles.contactText, { color: theme.secondaryTextColor }]}>Moderation: moderation@7thfloor.digital</Text>
          <Text style={[styles.contactNote, { color: theme.mutedTextColor }]}>
            This contact information is published within the app for App Store compliance.
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[
              styles.tab,
              { backgroundColor: theme.surfaceColor },
              activeTab === "reports" && {
                backgroundColor: theme.primaryColor,
                ...getGlowStyle(theme.primaryColor, 6),
              },
            ]}
            onPress={() => handleTabChange("reports")}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.secondaryTextColor },
                activeTab === "reports" && { color: theme.backgroundColor },
              ]}
            >
              Reports ({reports.length})
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tab,
              { backgroundColor: theme.surfaceColor },
              activeTab === "users" && {
                backgroundColor: theme.primaryColor,
                ...getGlowStyle(theme.primaryColor, 6),
              },
            ]}
            onPress={() => handleTabChange("users")}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.secondaryTextColor },
                activeTab === "users" && { color: theme.backgroundColor },
              ]}
            >
              Users ({users.length})
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tab,
              { backgroundColor: theme.surfaceColor },
              activeTab === "pushErrors" && {
                backgroundColor: theme.primaryColor,
                ...getGlowStyle(theme.primaryColor, 6),
              },
            ]}
            onPress={() => handleTabChange("pushErrors")}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.secondaryTextColor },
                activeTab === "pushErrors" && { color: theme.backgroundColor },
              ]}
            >
              Push ({pushErrors.length})
            </Text>
          </Pressable>
        </View>

        {activeTab === "reports" ? (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>Pending Reports</Text>

            {reports.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: theme.secondaryTextColor }]}>No pending reports</Text>
              </View>
            ) : (
              <FlatList
                data={reports}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 100 }}
                renderItem={({ item }) => (
                  <View style={[styles.reportCard, { backgroundColor: theme.surfaceColor }]}>
                    <View style={styles.reportHeader}>
                      <Text style={[styles.reportType, { backgroundColor: theme.primaryColor, color: theme.backgroundColor }]}>
                        {item.type.toUpperCase()}
                      </Text>
                      <Text style={[styles.reportTime, { color: theme.mutedTextColor }]}>{getTimeAgo(item.createdAt)}</Text>
                    </View>

                    <Text style={[styles.reportReason, { color: theme.textColor }]}>Reason: {getReasonText(item.reason)}</Text>
                    <Text style={[styles.reportDetails, { color: theme.secondaryTextColor }]}>
                      Reported by: {item.reportedBy}
                    </Text>

                    <View style={styles.reportActions}>
                      <Pressable
                        style={[styles.actionBtn, styles.viewBtn, { backgroundColor: theme.surfaceGlow }]}
                        onPress={() => viewReportedPost(item.postId)}
                      >
                        <Text style={[styles.actionBtnText, { color: theme.textColor }]}>View</Text>
                      </Pressable>

                      <Pressable
                        style={[styles.actionBtn, styles.deleteBtn, { backgroundColor: theme.primaryColor }]}
                        onPress={() => deleteReportedContent(item)}
                      >
                        <Text style={[styles.actionBtnTextWhite, { color: theme.backgroundColor }]}>Delete</Text>
                      </Pressable>

                      <Pressable
                        style={[styles.actionBtn, styles.dismissBtn, { backgroundColor: theme.surfaceGlow }]}
                        onPress={() => dismissReport(item.id)}
                      >
                        <Text style={[styles.actionBtnText, { color: theme.textColor }]}>Dismiss</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              />
            )}
          </>
        ) : activeTab === "users" ? (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>User Directory</Text>

            {users.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: theme.secondaryTextColor }]}>No users found</Text>
              </View>
            ) : (
              <FlatList
                data={users}
                keyExtractor={(item) => item.uid}
                contentContainerStyle={{ paddingBottom: 100 }}
                renderItem={({ item }) => (
                  <View style={[styles.userCard, { backgroundColor: theme.surfaceColor }]}>
                    <View style={styles.userHeader}>
                      <Text style={[styles.username, { color: theme.textColor }]}>@{item.username}</Text>
                      {item.isAdmin && (
                        <Text style={[styles.adminBadge, { backgroundColor: theme.accentColor, color: theme.backgroundColor }]}>
                          ADMIN
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.userEmail, { color: theme.secondaryTextColor }]}>{item.email || "No email"}</Text>
                    <Text style={[styles.userUid, { color: theme.mutedTextColor }]}>UID: {item.uid}</Text>
                    <Pressable
                      style={[styles.viewProfileBtn, { backgroundColor: theme.surfaceGlow }]}
                      onPress={() => viewUserProfile(item.uid)}
                    >
                      <Text style={[styles.viewProfileText, { color: theme.textColor }]}>View Profile</Text>
                    </Pressable>
                  </View>
                )}
              />
            )}
          </>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>Push Notification Errors (Last 50)</Text>

            {pushErrors.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: theme.primaryColor }]}>
                  ✓ No push notification errors
                </Text>
                <Text style={[styles.emptySubtext, { color: theme.secondaryTextColor }]}>
                  This is good! All push notifications are being delivered successfully.
                </Text>
              </View>
            ) : (
              <FlatList
                data={pushErrors}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 100 }}
                renderItem={({ item }) => (
                  <View style={[styles.errorCard, { backgroundColor: theme.surfaceColor }]}>
                    <View style={styles.errorHeader}>
                      <Text style={[styles.errorType, { backgroundColor: theme.accentColor, color: theme.backgroundColor }]}>
                        {item.type}
                      </Text>
                      <Text style={[styles.errorTime, { color: theme.mutedTextColor }]}>
                        {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString() : 'Unknown'}
                      </Text>
                    </View>
                    <Text style={[styles.errorMessage, { color: theme.textColor }]}>Error: {item.error}</Text>
                    <Text style={[styles.errorUid, { color: theme.secondaryTextColor }]}>User: {item.recipientUid}</Text>
                  </View>
                )}
              />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1, padding: 16 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  backText: { fontWeight: "700", fontFamily: "SpaceMono" },

  title: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },

  contactBox: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    fontFamily: "SpaceMono",
  },
  contactText: {
    fontSize: 14,
    marginBottom: 4,
    fontWeight: "600",
    fontFamily: "SpaceMono",
  },
  contactNote: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: "italic",
    fontFamily: "SpaceMono",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    fontFamily: "SpaceMono",
  },

  reportCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },

  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  reportType: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontFamily: "SpaceMono",
  },

  reportTime: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "SpaceMono",
  },

  reportReason: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
    fontFamily: "SpaceMono",
  },

  reportDetails: {
    fontSize: 13,
    marginBottom: 12,
    fontFamily: "SpaceMono",
  },

  reportActions: {
    flexDirection: "row",
    gap: 8,
  },

  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
  },

  viewBtn: {},

  deleteBtn: {},

  dismissBtn: {},

  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "SpaceMono",
  },

  actionBtnTextWhite: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "SpaceMono",
  },

  emptyState: {
    paddingVertical: 40,
    alignItems: "center",
  },

  emptyText: {
    fontSize: 16,
    textAlign: "center",
    fontFamily: "SpaceMono",
  },

  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    fontFamily: "SpaceMono",
  },

  notAdminContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },

  notAdminTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    fontFamily: "SpaceMono",
  },

  notAdminText: {
    fontSize: 16,
    textAlign: "center",
    fontFamily: "SpaceMono",
  },

  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },

  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
  },

  tabText: {
    fontWeight: "700",
    fontSize: 13,
    fontFamily: "SpaceMono",
  },

  userCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },

  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  username: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "SpaceMono",
  },

  adminBadge: {
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontFamily: "SpaceMono",
  },

  userEmail: {
    fontSize: 14,
    marginBottom: 4,
    fontWeight: "600",
    fontFamily: "SpaceMono",
  },

  userUid: {
    fontSize: 11,
    marginBottom: 12,
    fontFamily: "SpaceMono",
  },

  viewProfileBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
  },

  viewProfileText: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "SpaceMono",
  },

  errorCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },

  errorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  errorType: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontFamily: "SpaceMono",
  },

  errorTime: {
    fontSize: 11,
    fontFamily: "SpaceMono",
  },

  errorMessage: {
    fontSize: 14,
    marginBottom: 4,
    fontWeight: "600",
    fontFamily: "SpaceMono",
  },

  errorUid: {
    fontSize: 12,
    fontFamily: "SpaceMono",
  },
});
