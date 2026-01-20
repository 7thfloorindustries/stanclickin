import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  doc,
} from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";
import { type ThemeId, getTheme } from "../src/lib/themes";

interface Conversation {
  id: string;
  participants: string[];
  participantData: {
    [uid: string]: {
      username: string;
      profilePictureUrl: string | null;
    };
  };
  lastMessage: {
    text: string;
    senderId: string;
    createdAt: any;
    type: "text" | "image" | "post" | "gif";
  } | null;
  lastMessageAt: any;
  unreadCount: {
    [uid: string]: number;
  };
  createdAt: any;
  updatedAt: any;
}

export default function MessagesInbox() {
  const navigation = useNavigation<any>();
  const me = auth.currentUser?.uid;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null);

  const theme = getTheme(userTheme);

  // Load user theme
  useEffect(() => {
    if (!me) return;
    const userRef = doc(db, "users", me);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserTheme((data as any)?.theme || null);
      }
    });
  }, [me]);

  // Load conversations
  useEffect(() => {
    if (!me) return;

    const conversationsRef = collection(db, "conversations");
    const q = query(
      conversationsRef,
      where("participants", "array-contains", me),
      orderBy("lastMessageAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const convos: Conversation[] = [];

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data() as any;
          const otherUid = data.participants.find((uid: string) => uid !== me);

          // Check if either user blocked the other
          const [iBlockedThem, theyBlockedMe] = await Promise.all([
            getDoc(doc(db, "blocks", me, "blocked", otherUid)),
            getDoc(doc(db, "blocks", otherUid, "blocked", me)),
          ]);

          // Skip blocked conversations
          if (iBlockedThem.exists() || theyBlockedMe.exists()) {
            continue;
          }

          convos.push({
            id: docSnap.id,
            ...data,
          } as Conversation);
        }

        setConversations(convos);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error("Error loading conversations:", error);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [me]);

  const handleRefresh = () => {
    setRefreshing(true);
  };

  const goBack = () => {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      router.replace("/stanspace");
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    if (!me) return null;

    const otherUid = item.participants.find((uid) => uid !== me);
    if (!otherUid) return null;

    const otherUser = item.participantData[otherUid];
    const unreadCount = item.unreadCount?.[me] || 0;
    const isUnread = unreadCount > 0;

    const getTimeAgo = (timestamp: any) => {
      if (!timestamp) return "";
      const now = new Date();
      const then = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const diff = now.getTime() - then.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return "now";
      if (minutes < 60) return `${minutes}m`;
      if (hours < 24) return `${hours}h`;
      if (days < 7) return `${days}d`;
      return `${Math.floor(days / 7)}w`;
    };

    return (
      <Pressable
        style={[
          styles.conversationCard,
          { borderBottomColor: theme.borderColor },
          isUnread && styles.conversationCardUnread,
        ]}
        onPress={() => router.push(`/messages/${item.id}`)}
      >
        {/* Avatar */}
        <View style={styles.avatar}>
          {otherUser.profilePictureUrl ? (
            <Image
              source={{ uri: otherUser.profilePictureUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <View
              style={[styles.avatarPlaceholder, { backgroundColor: theme.mutedColor }]}
            >
              <Text style={styles.avatarText}>
                {otherUser.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text
              style={[
                styles.username,
                { color: theme.textColor },
                isUnread && styles.usernameUnread,
              ]}
            >
              @{otherUser.username}
            </Text>
            <Text style={[styles.timestamp, { color: theme.mutedColor }]}>
              {item.lastMessage ? getTimeAgo(item.lastMessage.createdAt) : ""}
            </Text>
          </View>

          <View style={styles.messageRow}>
            <Text
              style={[
                styles.lastMessage,
                { color: theme.mutedColor },
                isUnread && [styles.lastMessageUnread, { color: theme.textColor }],
              ]}
              numberOfLines={1}
            >
              {item.lastMessage?.senderId === me ? "You: " : ""}
              {item.lastMessage?.text || "No messages yet"}
            </Text>

            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.linkColor }]}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: theme.backgroundColor }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.linkColor} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.backgroundColor }]}
      edges={["top"]}
    >
      {/* Background image for themes */}
      {theme.stanPhoto && (
        <>
          <Image source={theme.stanPhoto} style={styles.fixedBackground} />
          <View
            style={[
              styles.fixedBackgroundOverlay,
              { backgroundColor: theme.backgroundColor + "EE" },
            ]}
          />
        </>
      )}

      <View style={styles.wrap}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backText, { color: theme.linkColor }]}>
              ‹ Back
            </Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.textColor }]}>
            Messages
          </Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Conversations List */}
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.linkColor}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.mutedColor }]}>
                No messages yet
              </Text>
              <Text
                style={[styles.emptySubtext, { color: theme.mutedColor }]}
              >
                Start a conversation from a user's profile
              </Text>
            </View>
          }
        />

        {/* Bottom Nav */}
        <View style={[styles.bottomNav, { borderTopColor: theme.borderColor }]}>
          <Pressable
            style={styles.navBtn}
            onPress={() => router.replace("/stanspace")}
          >
            <Text style={styles.navIcon}>🏠</Text>
            <Text style={[styles.navLabel, { color: theme.mutedColor }]}>
              Home
            </Text>
          </Pressable>

          <Pressable
            style={styles.navBtn}
            onPress={() => router.push("/stanspace")}
          >
            <Text style={styles.navIcon}>✍️</Text>
            <Text style={[styles.navLabel, { color: theme.mutedColor }]}>
              Post
            </Text>
          </Pressable>

          <Pressable style={styles.navBtn} onPress={() => router.push("/stanspace")}>
            <Text style={styles.navIcon}>🔍</Text>
            <Text style={[styles.navLabel, { color: theme.mutedColor }]}>
              Search
            </Text>
          </Pressable>

          <Pressable style={styles.navBtn}>
            <Text style={styles.navIcon}>💬</Text>
            <Text style={[styles.navLabel, { color: theme.linkColor }]}>
              Messages
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
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
  },
  wrap: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingRight: 8,
  },
  backText: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  listContent: {
    flexGrow: 1,
  },
  conversationCard: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: 1,
  },
  conversationCardUnread: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  avatar: {
    marginRight: 12,
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
  },
  conversationContent: {
    flex: 1,
    justifyContent: "center",
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    fontWeight: "400",
  },
  usernameUnread: {
    fontWeight: "600",
  },
  timestamp: {
    fontSize: 14,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastMessage: {
    fontSize: 14,
    flex: 1,
  },
  lastMessageUnread: {
    fontWeight: "500",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
  },
  bottomNav: {
    flexDirection: "row",
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  navBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  navIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  navLabel: {
    fontSize: 10,
  },
});
