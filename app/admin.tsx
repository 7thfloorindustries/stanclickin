import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { collection, query, where, onSnapshot, doc, deleteDoc, updateDoc, getDoc, orderBy, limit } from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";

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

export default function AdminPanel() {
  const me = auth.currentUser?.uid;
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<"reports" | "users">("reports");

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

  const dismissReport = async (reportId: string) => {
    try {
      await updateDoc(doc(db, "reports", reportId), { status: "dismissed" });
      Alert.alert("Report dismissed");
    } catch (error) {
      console.error("Error dismissing report:", error);
      Alert.alert("Error", "Failed to dismiss report");
    }
  };

  const deleteReportedContent = async (report: Report) => {
    Alert.alert(
      "Delete content",
      "This will permanently delete the reported content. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
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

              Alert.alert("Deleted", "Content has been removed");
            } catch (error) {
              console.error("Error deleting content:", error);
              Alert.alert("Error", "Failed to delete content");
            }
          },
        },
      ]
    );
  };

  const viewReportedPost = (postId: string) => {
    router.push({ pathname: "/post", params: { postId } });
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
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <View style={styles.notAdminContainer}>
            <Text style={styles.notAdminTitle}>Access Denied</Text>
            <Text style={styles.notAdminText}>You need admin privileges to access this page.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>Admin Panel</Text>
        </View>

        {/* Contact Information */}
        <View style={styles.contactBox}>
          <Text style={styles.contactTitle}>App Contact Information</Text>
          <Text style={styles.contactText}>Support: support@7thfloor.digital</Text>
          <Text style={styles.contactText}>Moderation: moderation@7thfloor.digital</Text>
          <Text style={styles.contactNote}>
            This contact information is published within the app for App Store compliance.
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === "reports" && styles.tabActive]}
            onPress={() => setActiveTab("reports")}
          >
            <Text style={[styles.tabText, activeTab === "reports" && styles.tabTextActive]}>
              Reports ({reports.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "users" && styles.tabActive]}
            onPress={() => setActiveTab("users")}
          >
            <Text style={[styles.tabText, activeTab === "users" && styles.tabTextActive]}>
              Users ({users.length})
            </Text>
          </Pressable>
        </View>

        {activeTab === "reports" ? (
          <>
            <Text style={styles.sectionTitle}>Pending Reports</Text>

        {reports.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No pending reports</Text>
          </View>
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={({ item }) => (
              <View style={styles.reportCard}>
                <View style={styles.reportHeader}>
                  <Text style={styles.reportType}>{item.type.toUpperCase()}</Text>
                  <Text style={styles.reportTime}>{getTimeAgo(item.createdAt)}</Text>
                </View>

                <Text style={styles.reportReason}>Reason: {getReasonText(item.reason)}</Text>
                <Text style={styles.reportDetails}>
                  Reported by: {item.reportedBy}
                </Text>

                <View style={styles.reportActions}>
                  <Pressable
                    style={[styles.actionBtn, styles.viewBtn]}
                    onPress={() => viewReportedPost(item.postId)}
                  >
                    <Text style={styles.actionBtnText}>View</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => deleteReportedContent(item)}
                  >
                    <Text style={styles.actionBtnTextWhite}>Delete</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionBtn, styles.dismissBtn]}
                    onPress={() => dismissReport(item.id)}
                  >
                    <Text style={styles.actionBtnText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>User Directory</Text>

            {users.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            ) : (
              <FlatList
                data={users}
                keyExtractor={(item) => item.uid}
                contentContainerStyle={{ paddingBottom: 100 }}
                renderItem={({ item }) => (
                  <View style={styles.userCard}>
                    <View style={styles.userHeader}>
                      <Text style={styles.username}>@{item.username}</Text>
                      {item.isAdmin && (
                        <Text style={styles.adminBadge}>ADMIN</Text>
                      )}
                    </View>
                    <Text style={styles.userEmail}>{item.email || "No email"}</Text>
                    <Text style={styles.userUid}>UID: {item.uid}</Text>
                    <Pressable
                      style={styles.viewProfileBtn}
                      onPress={() => router.push({ pathname: "/u/[uid]", params: { uid: item.uid } })}
                    >
                      <Text style={styles.viewProfileText}>View Profile</Text>
                    </Pressable>
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
  safe: { flex: 1, backgroundColor: "#fff" },
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#111",
  },
  backText: { fontWeight: "900", color: "#111" },

  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111",
  },

  contactBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#f9f9f9",
    marginBottom: 20,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111",
    marginBottom: 8,
  },
  contactText: {
    fontSize: 14,
    color: "#111",
    marginBottom: 4,
    fontWeight: "600",
  },
  contactNote: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
    marginBottom: 12,
  },

  reportCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#fff",
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
    fontWeight: "900",
    color: "#fff",
    backgroundColor: "#ff3b30",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },

  reportTime: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },

  reportReason: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    marginBottom: 4,
  },

  reportDetails: {
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
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

  viewBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#111",
  },

  deleteBtn: {
    backgroundColor: "#ff3b30",
  },

  dismissBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#666",
  },

  actionBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
  },

  actionBtnTextWhite: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
  },

  emptyState: {
    paddingVertical: 40,
    alignItems: "center",
  },

  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },

  notAdminContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },

  notAdminTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111",
    marginBottom: 12,
  },

  notAdminText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },

  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },

  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#fff",
    alignItems: "center",
  },

  tabActive: {
    backgroundColor: "#111",
  },

  tabText: {
    fontWeight: "900",
    color: "#111",
    fontSize: 14,
  },

  tabTextActive: {
    color: "#fff",
  },

  userCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#fff",
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
    fontWeight: "900",
    color: "#111",
  },

  adminBadge: {
    fontSize: 10,
    fontWeight: "900",
    color: "#fff",
    backgroundColor: "#ff9500",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },

  userEmail: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
    fontWeight: "600",
  },

  userUid: {
    fontSize: 11,
    color: "#999",
    marginBottom: 12,
    fontFamily: "monospace",
  },

  viewProfileBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#111",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
  },

  viewProfileText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
  },
});
