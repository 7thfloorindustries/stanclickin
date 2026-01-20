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
  Modal,
  ScrollView,
  Animated,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  doc,
  getDocs,
} from "firebase/firestore";
import { auth, db, storage } from "../../src/lib/firebase";
import { sendMessage, markConversationAsRead, setTypingIndicator } from "../../src/lib/messaging";
import { type ThemeId, getTheme } from "../../src/lib/themes";
import { type Post } from "../../components/PostCard";
import { Avatar } from "../../components/Avatar";
import { createPressAnimation, createGlowPulse } from "../../src/lib/animations";

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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [postPickerVisible, setPostPickerVisible] = useState(false);
  const [recentPosts, setRecentPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const theme = getTheme(userTheme);

  // Animation values
  const sendScale = useRef(new Animated.Value(1)).current;
  const typingDot1 = useRef(new Animated.Value(0.3)).current;
  const typingDot2 = useRef(new Animated.Value(0.5)).current;
  const typingDot3 = useRef(new Animated.Value(0.7)).current;
  const sendPressHandlers = createPressAnimation(sendScale);

  // Typing animation
  useEffect(() => {
    if (otherUserTyping) {
      const animateTyping = () => {
        Animated.loop(
          Animated.stagger(200, [
            Animated.sequence([
              Animated.timing(typingDot1, { toValue: 1, duration: 400, useNativeDriver: true }),
              Animated.timing(typingDot1, { toValue: 0.3, duration: 400, useNativeDriver: true }),
            ]),
            Animated.sequence([
              Animated.timing(typingDot2, { toValue: 1, duration: 400, useNativeDriver: true }),
              Animated.timing(typingDot2, { toValue: 0.5, duration: 400, useNativeDriver: true }),
            ]),
            Animated.sequence([
              Animated.timing(typingDot3, { toValue: 1, duration: 400, useNativeDriver: true }),
              Animated.timing(typingDot3, { toValue: 0.7, duration: 400, useNativeDriver: true }),
            ]),
          ])
        ).start();
      };
      animateTyping();
    }
  }, [otherUserTyping]);

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

        setMessages(msgs.reverse());
        setLoading(false);

        if (me) {
          markConversationAsRead(conversationId, me);
        }

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

  useEffect(() => {
    if (!conversationId || !otherUser?.uid) return;

    const typingRef = doc(db, "conversations", conversationId, "typing", otherUser.uid);
    return onSnapshot(typingRef, (snap) => {
      const data = snap.data();
      if (!data) {
        setOtherUserTyping(false);
        return;
      }

      const now = Date.now();
      const lastUpdate = data.updatedAt?.seconds * 1000 || 0;
      const isExpired = now - lastUpdate > 5000;

      setOtherUserTyping(data.typing && !isExpired);
    });
  }, [conversationId, otherUser?.uid]);

  const handleTextChange = (newText: string) => {
    setText(newText);

    if (!conversationId || !me) return;

    setTypingIndicator(conversationId, me, true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setTypingIndicator(conversationId, me, false);
    }, 3000);
  };

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert("Permission needed", "Please allow access to your photo library");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();

    if (blob.size > 5 * 1024 * 1024) {
      throw new Error("Image too large. Maximum size is 5MB.");
    }

    const filename = `${Date.now()}.jpg`;
    const storageRef = ref(storage, `messages/${me}/${filename}`);

    await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(storageRef);

    return downloadUrl;
  };

  const loadRecentPosts = async () => {
    setLoadingPosts(true);
    try {
      const q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const posts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Post[];
      setRecentPosts(posts);
    } catch (error) {
      console.error("Error loading posts:", error);
    } finally {
      setLoadingPosts(false);
    }
  };

  const sharePost = async (post: Post) => {
    if (!conversationId || !me || !otherUser) return;

    setPostPickerVisible(false);
    setSending(true);

    try {
      const authorDoc = await getDoc(doc(db, "users", post.uid));
      const authorUsername = authorDoc.data()?.username || "user";

      await sendMessage({
        conversationId,
        senderId: me,
        recipientId: otherUser.uid,
        type: "post",
        postData: {
          postId: post.id,
          text: post.text,
          imageUrl: post.imageUrl,
          authorUid: post.uid,
          authorUsername,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error("Error sharing post:", error);
      Alert.alert("Error", "Failed to share post");
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    const messageText = text.trim();
    if (!messageText && !selectedImage) return;
    if (!conversationId || !me || !otherUser) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSending(true);
    setText("");
    const imageToUpload = selectedImage;
    setSelectedImage(null);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setTypingIndicator(conversationId, me, false);

    try {
      let imageUrl: string | undefined;

      if (imageToUpload) {
        imageUrl = await uploadImage(imageToUpload);
      }

      await sendMessage({
        conversationId,
        senderId: me,
        recipientId: otherUser.uid,
        text: messageText || null,
        type: imageUrl ? "image" : "text",
        imageUrl,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error("Error sending message:", error);
      Alert.alert("Error", "Failed to send message");
      setText(messageText);
      setSelectedImage(imageToUpload);
    } finally {
      setSending(false);
    }
  };

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

    if (minutes < 1) return "NOW";
    if (minutes < 60) return `${minutes}M`;
    if (hours < 24) return `${hours}H`;
    if (days < 7) return `${days}D`;
    return `${Math.floor(days / 7)}W`;
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
              ? [styles.messageBubbleMe, { backgroundColor: theme.surfaceGlow }]
              : [styles.messageBubbleOther, { backgroundColor: theme.surfaceColor }],
          ]}
        >
          {item.type === "image" && item.imageUrl && (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.messageImage}
              resizeMode="cover"
            />
          )}

          {item.type === "post" && item.postData && (
            <Pressable
              style={[styles.sharedPost, { backgroundColor: theme.backgroundColor }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/post",
                  params: {
                    postId: item.postData!.postId,
                    text: item.postData!.text,
                    imageUrl: item.postData!.imageUrl || "",
                  },
                });
              }}
            >
              <Text style={[styles.sharedPostAuthor, { color: theme.primaryColor }]}>
                @{item.postData.authorUsername.toUpperCase()}
              </Text>
              <Text style={[styles.sharedPostText, { color: theme.textColor }]} numberOfLines={3}>
                {item.postData.text}
              </Text>
              {item.postData.imageUrl && (
                <Image
                  source={{ uri: item.postData.imageUrl }}
                  style={styles.sharedPostImage}
                  resizeMode="cover"
                />
              )}
            </Pressable>
          )}

          {item.text && (
            <Text style={[styles.messageText, { color: theme.textColor }]}>{item.text}</Text>
          )}

          <View style={styles.messageMetadata}>
            <Text style={[styles.messageTimestamp, { color: theme.mutedTextColor }]}>
              {getTimeAgo(item.createdAt)}
            </Text>
            {isMe && item.read && (
              <Text style={[styles.readReceipt, { color: theme.secondaryTextColor }]}>READ</Text>
            )}
          </View>
        </View>
      </View>
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

      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backArrow, { color: theme.textColor }]}>{"<"}</Text>
          </Pressable>
          {otherUser && (
            <Pressable
              style={styles.headerUser}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/u/${otherUser.uid}`);
              }}
            >
              <Avatar
                imageUrl={otherUser.profilePictureUrl}
                username={otherUser.username}
                size={32}
                theme={theme}
              />
              <Text style={[styles.headerUsername, { color: theme.textColor }]}>
                @{otherUser.username.toUpperCase()}
              </Text>
            </Pressable>
          )}
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textColor }]}>NO MESSAGES</Text>
              <Text style={[styles.emptySubtext, { color: theme.secondaryTextColor }]}>
                SEND A MESSAGE TO START
              </Text>
            </View>
          }
          ListFooterComponent={
            otherUserTyping ? (
              <View style={styles.typingIndicatorContainer}>
                <View style={[styles.typingIndicator, { backgroundColor: theme.surfaceColor }]}>
                  <View style={styles.typingDots}>
                    <Animated.View style={[styles.typingDot, { backgroundColor: theme.primaryColor, opacity: typingDot1 }]} />
                    <Animated.View style={[styles.typingDot, { backgroundColor: theme.primaryColor, opacity: typingDot2 }]} />
                    <Animated.View style={[styles.typingDot, { backgroundColor: theme.primaryColor, opacity: typingDot3 }]} />
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        <View style={[styles.inputContainer, { borderTopColor: theme.borderColor }]}>
          {selectedImage && (
            <View style={styles.imagePreviewContainer}>
              <Image
                source={{ uri: selectedImage }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
              <Pressable
                style={[styles.removeImageButton, { backgroundColor: theme.surfaceColor }]}
                onPress={() => setSelectedImage(null)}
              >
                <Text style={[styles.removeImageText, { color: theme.textColor }]}>x</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.inputRow}>
            <Pressable style={styles.attachButton} onPress={pickImage}>
              <Text style={[styles.attachButtonText, { color: theme.secondaryTextColor }]}>+</Text>
            </Pressable>
            <Pressable
              style={styles.attachButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                loadRecentPosts();
                setPostPickerVisible(true);
              }}
            >
              <Text style={[styles.shareButtonText, { color: theme.secondaryTextColor }]}>^</Text>
            </Pressable>
            <TextInput
              style={[styles.input, { color: theme.textColor, backgroundColor: theme.surfaceColor }]}
              placeholder="MESSAGE..."
              placeholderTextColor={theme.mutedTextColor}
              value={text}
              onChangeText={handleTextChange}
              multiline
              maxLength={500}
            />
            <Animated.View style={{ transform: [{ scale: sendScale }] }}>
              <Pressable
                style={[styles.sendButton, { backgroundColor: theme.primaryColor }]}
                onPress={handleSend}
                disabled={(!text.trim() && !selectedImage) || sending}
                {...sendPressHandlers}
              >
                <Text style={[
                  styles.sendButtonText,
                  { color: theme.backgroundColor },
                  (!text.trim() && !selectedImage) && styles.sendButtonTextDisabled
                ]}>
                  {sending ? "..." : ">"}
                </Text>
              </Pressable>
            </Animated.View>
          </View>
        </View>

        <Modal
          visible={postPickerVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setPostPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.postPickerModal, { backgroundColor: theme.surfaceColor }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.textColor }]}>SHARE POST</Text>
                <Pressable onPress={() => setPostPickerVisible(false)}>
                  <Text style={[styles.modalClose, { color: theme.textColor }]}>x</Text>
                </Pressable>
              </View>

              {loadingPosts ? (
                <ActivityIndicator size="large" color={theme.primaryColor} style={{ marginTop: 40 }} />
              ) : (
                <ScrollView style={styles.postsList} showsVerticalScrollIndicator={true}>
                  {recentPosts.length === 0 ? (
                    <Text style={[styles.noPostsText, { color: theme.mutedTextColor }]}>NO POSTS TO SHARE</Text>
                  ) : (
                    recentPosts.map((post) => (
                      <Pressable
                        key={post.id}
                        style={[styles.postItem, { backgroundColor: theme.surfaceGlow, borderColor: theme.borderColor }]}
                        onPress={() => sharePost(post)}
                      >
                        <Text style={[styles.postText, { color: theme.textColor }]} numberOfLines={3}>
                          {post.text}
                        </Text>
                        {post.imageUrl && (
                          <Image
                            source={{ uri: post.imageUrl }}
                            style={styles.postItemImage}
                            resizeMode="cover"
                          />
                        )}
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
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
  headerUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerUsername: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 0.5,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexGrow: 1,
  },
  messageBubbleContainer: {
    marginBottom: 12,
    maxWidth: "80%",
  },
  messageBubbleContainerMe: {
    alignSelf: "flex-end",
  },
  messageBubbleContainerOther: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  messageBubbleMe: {
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    fontFamily: "SpaceMono",
    lineHeight: 20,
  },
  messageMetadata: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  messageTimestamp: {
    fontSize: 10,
    fontFamily: "SpaceMono",
  },
  readReceipt: {
    fontSize: 10,
    fontFamily: "SpaceMono",
  },
  typingIndicatorContainer: {
    alignSelf: "flex-start",
    maxWidth: "80%",
    marginTop: 8,
  },
  typingIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  typingDots: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  attachButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  attachButtonText: {
    fontSize: 24,
    fontFamily: "SpaceMono-Bold",
  },
  shareButtonText: {
    fontSize: 20,
    fontFamily: "SpaceMono-Bold",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "SpaceMono",
    borderRadius: 20,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonText: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
  },
  sendButtonTextDisabled: {
    opacity: 0.4,
  },
  imagePreviewContainer: {
    position: "relative",
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: 150,
    borderRadius: 12,
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  removeImageText: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
  },
  sharedPost: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  sharedPostAuthor: {
    fontSize: 11,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sharedPostText: {
    fontSize: 13,
    fontFamily: "SpaceMono",
    marginBottom: 8,
  },
  sharedPostImage: {
    width: "100%",
    height: 100,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "flex-end",
  },
  postPickerModal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    height: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },
  modalClose: {
    fontSize: 24,
    fontFamily: "SpaceMono-Bold",
  },
  postsList: {
    flex: 1,
  },
  noPostsText: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 12,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },
  postItem: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  postText: {
    fontSize: 13,
    fontFamily: "SpaceMono",
    marginBottom: 8,
  },
  postItemImage: {
    width: "100%",
    height: 120,
    borderRadius: 8,
  },
});
