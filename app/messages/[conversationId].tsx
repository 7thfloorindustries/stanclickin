import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  doc,
} from "firebase/firestore";
import { auth, db } from "../../src/lib/firebase";
import { sendMessage, markConversationAsRead, setTypingIndicator } from "../../src/lib/messaging";
import { type ThemeId, getTheme } from "../../src/lib/themes";

interface Message {
  id: string;
  senderId: string;
  text: string | null;
  type: "text" | "image" | "post" | "gif";
  imageUrl?: string;
  postData?: {
    postId: string;
    text: string;
    imageUrl?: string;
    authorUid: string;
    authorUsername: string;
  };
  createdAt: any;
  read: boolean;
  readAt?: any;
}

export default function ConversationScreen() {
  const navigation = useNavigation<any>();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const me = auth.currentUser?.uid;

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [otherUser, setOtherUser] = useState<{
    uid: string;
    username: string;
    profilePictureUrl: string | null;
  } | null>(null);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
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

  // Load conversation data to get other user info
  useEffect(() => {
    if (!conversationId || !me) return;

    const conversationRef = doc(db, "conversations", conversationId);
    return onSnapshot(conversationRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const otherUid = data.participants.find((uid: string) => uid !== me);
        if (otherUid && data.participantData?.[otherUid]) {
          setOtherUser({
            uid: otherUid,
            username: data.participantData[otherUid].username,
            profilePictureUrl: data.participantData[otherUid].profilePictureUrl,
          });
        }
      }
    });
  }, [conversationId, me]);

  // Load messages
  useEffect(() => {
    if (!conversationId) return;

    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(100));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Message[];

        // Reverse so newest is at bottom
        setMessages(msgs.reverse());
        setLoading(false);

        // Mark conversation as read when viewing
        if (me) {
          markConversationAsRead(conversationId, me);
        }

        // Auto-scroll to bottom on new message
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      },
      (error) => {
        console.error("Error loading messages:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [conversationId, me]);

  // Listen to other user's typing status
  useEffect(() => {
    if (!conversationId || !otherUser?.uid) return;

    const typingRef = doc(db, "conversations", conversationId, "typing", otherUser.uid);
    return onSnapshot(typingRef, (snap) => {
      const data = snap.data();
      if (!data) {
        setOtherUserTyping(false);
        return;
      }

      // Auto-expire if last update was > 5 seconds ago
      const now = Date.now();
      const lastUpdate = data.updatedAt?.seconds * 1000 || 0;
      const isExpired = now - lastUpdate > 5000;

      setOtherUserTyping(data.typing && !isExpired);
    });
  }, [conversationId, otherUser?.uid]);

  const handleTextChange = (newText: string) => {
    setText(newText);

    if (!conversationId || !me) return;

    // Set typing indicator
    setTypingIndicator(conversationId, me, true);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto-clear after 3 seconds of no typing
    typingTimeoutRef.current = setTimeout(() => {
      setTypingIndicator(conversationId, me, false);
    }, 3000);
  };

  const handleSend = async () => {
    const messageText = text.trim();
    if (!messageText || !conversationId || !me || !otherUser) return;

    setSending(true);
    setText("");

    // Clear typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setTypingIndicator(conversationId, me, false);

    try {
      await sendMessage({
        conversationId,
        senderId: me,
        recipientId: otherUser.uid,
        text: messageText,
        type: "text",
      });

      // Scroll to bottom after sending
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error("Error sending message:", error);
      Alert.alert("Error", "Failed to send message");
      setText(messageText); // Restore text on error
    } finally {
      setSending(false);
    }
  };

  const goBack = () => {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      router.replace("/messages");
    }
  };

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

  const renderMessage = ({ item }: { item: Message }) => {
    if (!me) return null;

    const isMe = item.senderId === me;

    return (
      <View
        style={[
          styles.messageBubbleContainer,
          isMe ? styles.messageBubbleContainerMe : styles.messageBubbleContainerOther,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isMe
              ? [styles.messageBubbleMe, { backgroundColor: theme.linkColor }]
              : [styles.messageBubbleOther, { backgroundColor: theme.mutedColor + "33" }],
          ]}
        >
          {item.type === "text" && item.text && (
            <Text
              style={[
                styles.messageText,
                isMe
                  ? styles.messageTextMe
                  : [styles.messageTextOther, { color: theme.textColor }],
              ]}
            >
              {item.text}
            </Text>
          )}

          <View style={styles.messageMetadata}>
            <Text
              style={[
                styles.messageTimestamp,
                isMe ? styles.messageTimestampMe : { color: theme.mutedColor },
              ]}
            >
              {getTimeAgo(item.createdAt)}
            </Text>
            {isMe && item.read && (
              <Text style={styles.readReceipt}>✓✓</Text>
            )}
          </View>
        </View>
      </View>
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

      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backText, { color: theme.linkColor }]}>
              ‹ Back
            </Text>
          </Pressable>
          {otherUser && (
            <Pressable
              style={styles.headerUser}
              onPress={() => router.push(`/u/${otherUser.uid}`)}
            >
              {otherUser.profilePictureUrl ? (
                <Image
                  source={{ uri: otherUser.profilePictureUrl }}
                  style={styles.headerAvatar}
                />
              ) : (
                <View
                  style={[
                    styles.headerAvatarPlaceholder,
                    { backgroundColor: theme.mutedColor },
                  ]}
                >
                  <Text style={styles.headerAvatarText}>
                    {otherUser.username.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.headerUsername, { color: theme.textColor }]}>
                @{otherUser.username}
              </Text>
            </Pressable>
          )}
          <View style={{ width: 60 }} />
        </View>

        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.mutedColor }]}>
                No messages yet
              </Text>
              <Text
                style={[styles.emptySubtext, { color: theme.mutedColor }]}
              >
                Send a message to start the conversation
              </Text>
            </View>
          }
          ListFooterComponent={
            otherUserTyping ? (
              <View style={styles.typingIndicatorContainer}>
                <View
                  style={[
                    styles.typingIndicator,
                    { backgroundColor: theme.mutedColor + "33" },
                  ]}
                >
                  <Text style={[styles.typingText, { color: theme.mutedColor }]}>
                    {otherUser?.username} is typing...
                  </Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Input Area */}
        <View style={[styles.inputContainer, { borderTopColor: theme.borderColor }]}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.mutedColor + "22",
                color: theme.textColor,
              },
            ]}
            placeholder="Type a message..."
            placeholderTextColor={theme.mutedColor}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={500}
          />
          <Pressable
            style={[
              styles.sendButton,
              {
                backgroundColor: text.trim() ? theme.linkColor : theme.mutedColor,
              },
            ]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            <Text style={styles.sendButtonText}>
              {sending ? "..." : "Send"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  headerUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  headerAvatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  headerUsername: {
    fontSize: 16,
    fontWeight: "500",
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  messageBubbleContainer: {
    marginBottom: 8,
    maxWidth: "80%",
  },
  messageBubbleContainerMe: {
    alignSelf: "flex-end",
  },
  messageBubbleContainerOther: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  messageBubbleMe: {
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  messageTextMe: {
    color: "#fff",
  },
  messageTextOther: {},
  messageMetadata: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  messageTimestamp: {
    fontSize: 11,
  },
  messageTimestampMe: {
    color: "rgba(255,255,255,0.7)",
  },
  readReceipt: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
  },
  typingIndicatorContainer: {
    alignSelf: "flex-start",
    maxWidth: "80%",
    marginTop: 8,
  },
  typingIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  typingText: {
    fontSize: 14,
    fontStyle: "italic",
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
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
  },
  sendButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
