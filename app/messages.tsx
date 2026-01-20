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
  Animated,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
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
import { createGlowPulse, createPressAnimation } from "../src/lib/animations";
import { Avatar } from "../components/Avatar";

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

          const [iBlockedThem, theyBlockedMe] = await Promise.all([
            getDoc(doc(db, "blocks", me, "blocked", otherUid)),
            getDoc(doc(db, "blocks", otherUid, "blocked", me)),
          ]);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

      if (minutes < 1) return "NOW";
      if (minutes < 60) return `${minutes}M`;
      if (hours < 24) return `${hours}H`;
      if (days < 7) return `${days}D`;
      return `${Math.floor(days / 7)}W`;
    };

    const getMessagePreview = () => {
      if (!item.lastMessage) return "NO MESSAGES YET";

      const prefix = item.lastMessage.senderId === me ? "YOU: " : "";
      if (item.lastMessage.type === "image") return prefix + "[IMAGE]";
      if (item.lastMessage.type === "post") return prefix + "[POST]";
      return prefix + (item.lastMessage.text || "").toUpperCase();
    };

    return (
      <ConversationCard
        item={item}
        otherUser={otherUser}
        isUnread={isUnread}
        getTimeAgo={getTimeAgo}
        getMessagePreview={getMessagePreview}
        theme={theme}
      />
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primaryColor} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]} edges={["top"]}>
      {theme.stanPhoto && (
        <>
          <ExpoImage source={theme.stanPhoto} style={styles.fixedBackground} contentFit="cover" />
          <View style={styles.fixedBackgroundOverlay} />
        </>
      )}

      <View style={styles.wrap}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backArrow, { color: theme.textColor }]}>{"<"}</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.primaryColor }]}>MESSAGES</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primaryColor}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textColor }]}>NO MESSAGES</Text>
              <Text style={[styles.emptySubtext, { color: theme.secondaryTextColor }]}>
                START A CONVERSATION FROM A USER PROFILE
              </Text>
            </View>
          }
        />

        <View style={[styles.bottomNav, { backgroundColor: theme.backgroundColor, borderTopColor: theme.borderColor }]}>
          <Pressable
            style={styles.navBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/stanspace");
            }}
          >
            <Text style={[styles.navIconTypo, { color: theme.textColor }]}>⌂</Text>
            <Text style={[styles.navLabel, { color: theme.mutedTextColor }]}>HOME</Text>
          </Pressable>

          <Pressable
            style={styles.navBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/stanspace");
            }}
          >
            <Text style={[styles.navIconTypo, { color: theme.primaryColor }]}>+</Text>
            <Text style={[styles.navLabel, { color: theme.mutedTextColor }]}>NEW</Text>
          </Pressable>

          <Pressable
            style={styles.navBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/stanspace");
            }}
          >
            <Text style={[styles.navIconTypo, { color: theme.textColor }]}>◎</Text>
            <Text style={[styles.navLabel, { color: theme.mutedTextColor }]}>FIND</Text>
          </Pressable>

          <Pressable
            style={styles.navBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (me) router.push(`/u/${me}`);
            }}
          >
            <Text style={[styles.navIconTypo, { color: theme.textColor }]}>◯</Text>
            <Text style={[styles.navLabel, { color: theme.mutedTextColor }]}>ME</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ConversationCard({ item, otherUser, isUnread, getTimeAgo, getMessagePreview, theme }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const unreadPulse = useRef(new Animated.Value(0.3)).current;
  const pressHandlers = createPressAnimation(scale);

  useEffect(() => {
    if (isUnread) {
      createGlowPulse(unreadPulse).start();
    } else {
      unreadPulse.setValue(0);
    }
  }, [isUnread]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[styles.conversationCard, { backgroundColor: theme.surfaceColor }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/messages/${item.id}`);
        }}
        {...pressHandlers}
      >
        <Avatar
          imageUrl={otherUser.profilePictureUrl}
          username={otherUser.username}
          size={44}
          theme={theme}
          showGlow={isUnread}
        />

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.username, { color: theme.textColor }, isUnread && { color: theme.primaryColor }]}>
              @{otherUser.username.toUpperCase()}
            </Text>
            <View style={styles.timestampRow}>
              <Text style={[styles.timestamp, { color: theme.mutedTextColor }]}>
                {item.lastMessage ? getTimeAgo(item.lastMessage.createdAt) : ""}
              </Text>
              {isUnread && (
                <Animated.View style={[styles.unreadDot, { backgroundColor: theme.primaryColor, opacity: unreadPulse }]} />
              )}
            </View>
          </View>

          <Text
            style={[styles.lastMessage, { color: theme.secondaryTextColor }, isUnread && { color: theme.textColor }]}
            numberOfLines={1}
          >
            {getMessagePreview()}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
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
    backgroundColor: "rgba(10, 10, 10, 0.8)",
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
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backArrow: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  conversationCard: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 14,
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
    fontSize: 13,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 0.5,
  },
  timestampRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timestamp: {
    fontSize: 11,
    fontFamily: "SpaceMono",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lastMessage: {
    fontSize: 12,
    fontFamily: "SpaceMono",
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  navBtn: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  navIconTypo: {
    fontSize: 24,
    fontFamily: "SpaceMono-Bold",
  },
  navLabel: {
    fontSize: 9,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },
});
