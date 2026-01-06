import React, { useEffect, useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Alert, Modal, TextInput, Platform, ActionSheetIOS, Animated } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { doc, increment, onSnapshot, runTransaction, serverTimestamp, getDoc, updateDoc, deleteDoc, collection, getDocs, setDoc } from "firebase/firestore";
import * as Haptics from "expo-haptics";
import { auth, db } from "../src/lib/firebase";
import { Avatar } from "./Avatar";
import { createNotification } from "../src/lib/notifications";
import { renderTextWithLinks } from "../src/lib/textUtils";

export type Post = {
  id: string;
  uid: string;
  text: string;
  imageUrl?: string;
  createdAt?: any;
  likeCount?: number;
  commentCount?: number;
  repostCount?: number;
  engagementCount?: number;
  repostedBy?: string; // Username of person who reposted (for feed display)
  repostedByUid?: string; // UID of person who reposted
};

type PostCardProps = {
  post: Post;
  username?: string;
  onUsernameLoad?: (username: string) => void;
  isDarkTheme?: boolean;
};

const PostCardComponent = ({ post, username: providedUsername, onUsernameLoad, isDarkTheme = false }: PostCardProps) => {
  const uid = auth.currentUser?.uid;
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [author, setAuthor] = useState<string>(providedUsername || "…");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [likes, setLikes] = useState(post.likeCount ?? 0);
  const [reposts, setReposts] = useState(post.repostCount ?? 0);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editText, setEditText] = useState(post.text);

  const comments = post.commentCount ?? 0;
  const isMyPost = uid === post.uid;

  // Animation values
  const likeScale = useRef(new Animated.Value(1)).current;
  const commentScale = useRef(new Animated.Value(1)).current;
  const bookmarkScale = useRef(new Animated.Value(1)).current;
  const repostScale = useRef(new Animated.Value(1)).current;

  // Check if post can be edited (within 2 minutes)
  const canEdit = () => {
    if (!post.createdAt?.seconds) return false;
    const postTime = post.createdAt.seconds * 1000;
    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;
    return now - postTime < twoMinutes;
  };

  // Sync likes and reposts when post prop updates
  useEffect(() => {
    setLikes(post.likeCount ?? 0);
  }, [post.likeCount]);

  useEffect(() => {
    setReposts(post.repostCount ?? 0);
  }, [post.repostCount]);

  // Format timestamp
  const getTimeAgo = (timestamp: any) => {
    if (!timestamp?.seconds) return "";
    const now = Date.now();
    const postTime = timestamp.seconds * 1000;
    const diffMs = now - postTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(postTime).toLocaleDateString();
  };

  // Load username and profile picture if not provided
  useEffect(() => {
    if (providedUsername) {
      setAuthor(providedUsername);
    }

    const fetchUserData = async () => {
      try {
        const userDoc = await import("firebase/firestore").then((m) => m.getDoc(doc(db, "users", post.uid)));
        if (userDoc.exists()) {
          const data = userDoc.data() as any;
          const name = data?.username || "user";
          const pic = data?.profilePictureUrl || null;

          if (!providedUsername) {
            setAuthor(name);
            onUsernameLoad?.(name);
          }
          setProfilePicture(pic);
        } else {
          if (!providedUsername) setAuthor("user");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        if (!providedUsername) setAuthor("user");
      }
    };

    fetchUserData();
  }, [post.uid, providedUsername]);

  useEffect(() => {
    if (!uid) return;
    const likeRef = doc(db, "posts", post.id, "likes", uid);
    return onSnapshot(likeRef, (snap) => setLiked(snap.exists()));
  }, [post.id, uid]);

  // Listen to bookmark state
  useEffect(() => {
    if (!uid) return;
    const bookmarkRef = doc(db, "bookmarks", uid, "posts", post.id);
    return onSnapshot(bookmarkRef, (snap) => setBookmarked(snap.exists()));
  }, [post.id, uid]);

  // Listen to repost state
  useEffect(() => {
    if (!uid) return;
    const repostRef = doc(db, "posts", post.id, "reposts", uid);
    return onSnapshot(repostRef, (snap) => setReposted(snap.exists()));
  }, [post.id, uid]);

  // Animation helpers
  const animateButton = (scale: Animated.Value) => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.15,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const toggleLike = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");

    // Strong haptic feedback - both impact and notification
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (!liked) {
        // Success notification for new likes
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Haptic error:", error);
    }

    // Animate the button
    animateButton(likeScale);

    const postRef = doc(db, "posts", post.id);
    const likeRef = doc(db, "posts", post.id, "likes", user.uid);

    // Optimistic update
    const isCurrentlyLiked = liked;
    setLiked(!isCurrentlyLiked);
    setLikes((prev) => (isCurrentlyLiked ? prev - 1 : prev + 1));

    try {
      let wasLiked = false;
      await runTransaction(db, async (tx) => {
        const likeSnap = await tx.get(likeRef);
        const postSnap = await tx.get(postRef);
        const data = postSnap.data() as any;

        const baseEng = (data?.likeCount ?? 0) + (data?.commentCount ?? 0);
        if (data && data.engagementCount == null) tx.update(postRef, { engagementCount: baseEng });

        if (likeSnap.exists()) {
          tx.delete(likeRef);
          tx.update(postRef, { likeCount: increment(-1), engagementCount: increment(-1) });
          wasLiked = true;
        } else {
          tx.set(likeRef, { uid: user.uid, createdAt: serverTimestamp() });
          tx.update(postRef, { likeCount: increment(1), engagementCount: increment(1) });
          wasLiked = false;
        }
      });

      // Create notification after successful transaction (only for new likes)
      if (!wasLiked && post.uid !== user.uid) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const username = userDoc.exists() ? userDoc.data()?.username : "user";

        await createNotification({
          recipientUid: post.uid,
          type: "post_like",
          fromUid: user.uid,
          fromUsername: username,
          postId: post.id,
        });
      }
    } catch (error) {
      // Revert optimistic update on error
      setLiked(isCurrentlyLiked);
      setLikes((prev) => (isCurrentlyLiked ? prev + 1 : prev - 1));
      Alert.alert("Error", "Failed to update like");
    }
  };

  const openComments = async () => {
    // Haptic feedback
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Haptic error:", error);
    }

    // Animate the button
    animateButton(commentScale);

    router.push({ pathname: "/post", params: { postId: post.id, text: post.text } });
  };

  const toggleBookmark = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");

    // Haptic feedback
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error("Haptic error:", error);
    }

    // Animate the button
    animateButton(bookmarkScale);

    // Optimistic update
    const isCurrentlyBookmarked = bookmarked;
    setBookmarked(!isCurrentlyBookmarked);

    try {
      const bookmarkRef = doc(db, "bookmarks", user.uid, "posts", post.id);

      if (isCurrentlyBookmarked) {
        // Remove bookmark
        await deleteDoc(bookmarkRef);
      } else {
        // Add bookmark
        const bookmarkData: any = {
          postId: post.id,
          uid: post.uid,
          text: post.text || "",
          createdAt: post.createdAt,
          bookmarkedAt: serverTimestamp(),
        };

        // Only add imageUrl if it exists
        if (post.imageUrl) {
          bookmarkData.imageUrl = post.imageUrl;
        }

        await setDoc(bookmarkRef, bookmarkData);
      }
    } catch (error) {
      console.error("Bookmark error:", error);
      // Revert optimistic update on error
      setBookmarked(isCurrentlyBookmarked);
      Alert.alert("Error", "Failed to update bookmark");
    }
  };

  const toggleRepost = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");

    // Strong haptic feedback - both impact and notification
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (!reposted) {
        // Success notification for new reposts
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Haptic error:", error);
    }

    // Animate the button
    animateButton(repostScale);

    // Optimistic update
    const isCurrentlyReposted = reposted;
    setReposted(!isCurrentlyReposted);
    setReposts((prev) => (isCurrentlyReposted ? prev - 1 : prev + 1));

    try {
      const postRef = doc(db, "posts", post.id);
      const repostRef = doc(db, "posts", post.id, "reposts", user.uid);

      let wasReposted = false;
      await runTransaction(db, async (tx) => {
        const repostSnap = await tx.get(repostRef);
        const postSnap = await tx.get(postRef);
        const data = postSnap.data() as any;

        // Initialize engagementCount if missing
        const baseEng = (data?.likeCount ?? 0) + (data?.commentCount ?? 0) + (data?.repostCount ?? 0);
        if (data && data.engagementCount == null) tx.update(postRef, { engagementCount: baseEng });

        if (repostSnap.exists()) {
          // Unrepost
          tx.delete(repostRef);
          tx.update(postRef, { repostCount: increment(-1), engagementCount: increment(-1) });
          wasReposted = true;
        } else {
          // Repost
          tx.set(repostRef, { uid: user.uid, createdAt: serverTimestamp() });
          tx.update(postRef, { repostCount: increment(1), engagementCount: increment(1) });
          wasReposted = false;
        }
      });

      // Create notification for new reposts (only for other users' posts)
      if (!wasReposted && post.uid !== user.uid) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const username = userDoc.exists() ? userDoc.data()?.username : "user";

        await createNotification({
          recipientUid: post.uid,
          type: "post_repost",
          fromUid: user.uid,
          fromUsername: username,
          postId: post.id,
        });
      }
    } catch (error) {
      // Revert optimistic update on error
      setReposted(isCurrentlyReposted);
      setReposts((prev) => (isCurrentlyReposted ? prev + 1 : prev - 1));
      Alert.alert("Error", "Failed to update repost");
    }
  };

  const editPost = async () => {
    if (!editText.trim()) {
      Alert.alert("Error", "Post cannot be empty");
      return;
    }

    try {
      await updateDoc(doc(db, "posts", post.id), {
        text: editText.trim(),
        editedAt: serverTimestamp(),
      });
      setEditModalVisible(false);
      Alert.alert("Success", "Post updated");
    } catch (error) {
      console.error("Error editing post:", error);
      Alert.alert("Error", "Failed to edit post");
    }
  };

  const deletePost = async () => {
    try {
      // Delete all subcollections first
      const likesSnap = await getDocs(collection(db, "posts", post.id, "likes"));
      const commentsSnap = await getDocs(collection(db, "posts", post.id, "comments"));

      const batch = await import("firebase/firestore").then((m) => m.writeBatch(db));
      likesSnap.docs.forEach((d) => batch.delete(d.ref));
      commentsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();

      // Delete the post itself
      await deleteDoc(doc(db, "posts", post.id));
      Alert.alert("Deleted", "Post has been deleted");
    } catch (error) {
      console.error("Error deleting post:", error);
      Alert.alert("Error", "Failed to delete post");
    }
  };

  const reportPost = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");

    Alert.alert(
      "Report post",
      "Why are you reporting this post?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Spam",
          onPress: async () => {
            try {
              await import("firebase/firestore").then((m) =>
                m.addDoc(m.collection(db, "reports"), {
                  type: "post",
                  postId: post.id,
                  postUid: post.uid,
                  reportedBy: user.uid,
                  reason: "spam",
                  createdAt: m.serverTimestamp(),
                  status: "pending",
                })
              );
              Alert.alert("Reported", "Thank you for your report. We'll review this content.");
            } catch (error) {
              console.error("Error reporting post:", error);
              Alert.alert("Error", "Failed to submit report");
            }
          },
        },
        {
          text: "Harassment",
          onPress: async () => {
            try {
              await import("firebase/firestore").then((m) =>
                m.addDoc(m.collection(db, "reports"), {
                  type: "post",
                  postId: post.id,
                  postUid: post.uid,
                  reportedBy: user.uid,
                  reason: "harassment",
                  createdAt: m.serverTimestamp(),
                  status: "pending",
                })
              );
              Alert.alert("Reported", "Thank you for your report. We'll review this content.");
            } catch (error) {
              console.error("Error reporting post:", error);
              Alert.alert("Error", "Failed to submit report");
            }
          },
        },
        {
          text: "Inappropriate",
          onPress: async () => {
            try {
              await import("firebase/firestore").then((m) =>
                m.addDoc(m.collection(db, "reports"), {
                  type: "post",
                  postId: post.id,
                  postUid: post.uid,
                  reportedBy: user.uid,
                  reason: "inappropriate",
                  createdAt: m.serverTimestamp(),
                  status: "pending",
                })
              );
              Alert.alert("Reported", "Thank you for your report. We'll review this content.");
            } catch (error) {
              console.error("Error reporting post:", error);
              Alert.alert("Error", "Failed to submit report");
            }
          },
        },
      ]
    );
  };

  const openPostMenu = () => {
    const options = [];
    if (isMyPost) {
      if (canEdit()) options.push("Edit");
      options.push("Delete");
    } else {
      options.push("Report");
    }
    options.push("Cancel");

    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = options.indexOf("Delete");

    const onSelect = (i: number) => {
      const choice = options[i];
      if (choice === "Edit") {
        setEditText(post.text);
        setEditModalVisible(true);
      } else if (choice === "Delete") {
        Alert.alert("Delete post?", "This can't be undone.", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: deletePost },
        ]);
      } else if (choice === "Report") {
        reportPost();
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex, destructiveButtonIndex },
        (buttonIndex) => onSelect(buttonIndex)
      );
    } else {
      const buttons = options.filter((o) => o !== "Cancel");
      Alert.alert("Post options", "Choose an action", buttons.map((b) => ({ text: b, onPress: () => onSelect(options.indexOf(b)) })));
    }
  };

  return (
    <View style={styles.post}>
      {post.repostedBy && (
        <View style={styles.repostIndicator}>
          <Text style={styles.repostIcon}>🔁</Text>
          <Text style={[styles.repostText, isDarkTheme && styles.repostTextDark]}>Reposted by @{post.repostedBy}</Text>
        </View>
      )}
      <View style={styles.postHeader}>
        <Pressable style={styles.userInfo} onPress={() => router.push(`/u/${post.uid}`)}>
          <Avatar imageUrl={profilePicture} username={author} size={36} />
          <View>
            <Text style={[styles.handle, isDarkTheme && styles.textWhite]}>@{author}</Text>
            <Text style={[styles.timestamp, isDarkTheme && styles.timestampWhite]}>
              {getTimeAgo(post.createdAt)}
              {post.editedAt && " • edited"}
            </Text>
          </View>
        </Pressable>
        <Pressable style={styles.menuBtn} onPress={openPostMenu}>
          <Text style={[styles.menuIcon, isDarkTheme && styles.textWhite]}>⋯</Text>
        </Pressable>
      </View>

      <Pressable onPress={openComments}>
        {renderTextWithLinks(
          post.text,
          [styles.postText, isDarkTheme && styles.textWhite],
          [styles.linkText, isDarkTheme && styles.linkTextDark],
          isDarkTheme
        )}
      </Pressable>

      {post.imageUrl && (
        <>
          <Pressable onPress={() => setImageModalVisible(true)}>
            <Image
              source={{ uri: post.imageUrl }}
              style={styles.postImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </Pressable>

          <Modal
            visible={imageModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setImageModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setImageModalVisible(false)}>
              <Image
                source={{ uri: post.imageUrl }}
                style={styles.fullscreenImage}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Pressable style={styles.closeBtn} onPress={() => setImageModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={toggleLike}>
          <Animated.View style={[styles.actionContent, { transform: [{ scale: likeScale }] }]}>
            <Text style={[styles.actionIcon, isDarkTheme && styles.actionIconDark, liked && styles.actionIconLiked]}>
              {liked ? "♥" : "♡"}
            </Text>
            {likes > 0 && <Text style={[styles.actionCount, isDarkTheme && styles.actionCountDark]}>{likes}</Text>}
          </Animated.View>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={openComments}>
          <Animated.View style={[styles.actionContent, { transform: [{ scale: commentScale }] }]}>
            <Text style={[styles.actionIcon, isDarkTheme && styles.actionIconDark]}>💬</Text>
            {comments > 0 && <Text style={[styles.actionCount, isDarkTheme && styles.actionCountDark]}>{comments}</Text>}
          </Animated.View>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={toggleRepost}>
          <Animated.View style={[styles.actionContent, { transform: [{ scale: repostScale }] }]}>
            <Text style={[styles.actionIcon, isDarkTheme && styles.actionIconDark, reposted && styles.actionIconReposted]}>
              🔁
            </Text>
            {reposts > 0 && <Text style={[styles.actionCount, isDarkTheme && styles.actionCountDark, reposted && styles.actionCountReposted]}>{reposts}</Text>}
          </Animated.View>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={toggleBookmark}>
          <Animated.View style={[styles.actionContent, { transform: [{ scale: bookmarkScale }] }]}>
            <Text style={[styles.actionIcon, isDarkTheme && styles.actionIconDark, bookmarked && styles.actionIconBookmarked]}>
              {bookmarked ? "🔖" : "📑"}
            </Text>
          </Animated.View>
        </Pressable>
      </View>

      <Modal visible={editModalVisible} animationType="slide" transparent={true}>
        <View style={styles.editModalOverlay}>
          <View style={styles.editModal}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Edit Post</Text>
              <Pressable onPress={() => setEditModalVisible(false)}>
                <Text style={styles.editModalClose}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.editInput}
              placeholder="Post text..."
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
            />

            <Pressable style={styles.editSaveBtn} onPress={editPost}>
              <Text style={styles.editSaveBtnText}>Save Changes</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export const PostCard = React.memo(PostCardComponent);

const styles = StyleSheet.create({
  post: { borderWidth: 1, borderColor: "#111", borderRadius: 12, padding: 12, marginBottom: 10 },
  repostIndicator: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  repostIcon: { fontSize: 14 },
  repostText: { fontSize: 12, color: "#111", fontWeight: "800" },
  repostTextDark: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  postHeader: { marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  userInfo: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  handle: { fontWeight: "900", color: "#111", fontSize: 14 },
  timestamp: { fontSize: 12, color: "#111", marginTop: 2, fontWeight: "700" },
  menuBtn: { padding: 4 },
  menuIcon: { fontSize: 20, fontWeight: "900", color: "#111", lineHeight: 20 },
  postText: { fontSize: 16, color: "#111", marginBottom: 8 },
  linkText: {
    color: "#fff",
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  linkTextDark: {
    color: "#00e6ff",
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  postImage: { width: "100%", height: 250, borderRadius: 8, marginTop: 8 },

  // Dark theme text styles
  textWhite: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  timestampWhite: {
    color: "#fff",
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: { width: "100%", height: "100%" },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "#fff",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: { fontSize: 20, fontWeight: "900", color: "#111" },

  actions: { marginTop: 12, flexDirection: "row", gap: 18, alignItems: "center" },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 50,
  },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  actionIcon: { fontSize: 26, color: "#111" },
  actionIconDark: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  actionIconLiked: { color: "#ff0000" },
  actionIconBookmarked: { color: "#ff9500" },
  actionIconReposted: {
    color: "#00d95f",
    fontSize: 28,
  },
  actionCount: { fontSize: 16, fontWeight: "800", color: "#111" },
  actionCountReposted: {
    color: "#00d95f",
    fontWeight: "900",
  },
  actionCountDark: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  editModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  editModal: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  editModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  editModalTitle: { fontSize: 20, fontWeight: "900", color: "#111" },
  editModalClose: { fontSize: 24, fontWeight: "900", color: "#111" },
  editInput: { minHeight: 100, borderWidth: 1, borderColor: "#111", borderRadius: 12, padding: 12, textAlignVertical: "top" },
  editSaveBtn: { backgroundColor: "#111", padding: 14, borderRadius: 12, alignItems: "center" },
  editSaveBtnText: { color: "#fff", fontWeight: "900" },
});
