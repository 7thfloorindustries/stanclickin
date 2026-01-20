import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Alert, Modal, TextInput, Share } from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { doc, increment, onSnapshot, runTransaction, serverTimestamp, getDoc, updateDoc, deleteDoc, collection, getDocs, setDoc } from "firebase/firestore";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { auth, db } from "../src/lib/firebase";
import { Avatar } from "./Avatar";
import { createNotification } from "../src/lib/notifications";
import { renderTextWithLinks } from "../src/lib/textUtils";
import { type Theme, getTheme } from "../src/lib/themes";
import { getGlowStyle, reanimatedSpringConfigs } from "../src/lib/animations";

export type Post = {
  id: string;
  uid: string;
  text: string;
  imageUrl?: string;
  createdAt?: any;
  likeCount?: number;
  commentCount?: number;
  repostCount?: number;
  shareCount?: number;
  engagementCount?: number;
  repostedBy?: string;
  repostedByUid?: string;
};

type PostCardProps = {
  post: Post;
  username?: string;
  onUsernameLoad?: (username: string) => void;
  theme?: Theme;
  onRepostRemoved?: (postId: string) => void;
};

// Particle component for like burst effect
const LikeParticle = ({
  angle,
  color,
  active,
  delay = 0,
}: {
  angle: number;
  color: string;
  active: boolean;
  delay?: number;
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      const radians = (angle * Math.PI) / 180;
      const distance = 40 + Math.random() * 20;
      const targetX = Math.cos(radians) * distance;
      const targetY = Math.sin(radians) * distance;

      translateX.value = withDelay(delay, withTiming(targetX, { duration: 400, easing: Easing.out(Easing.cubic) }));
      translateY.value = withDelay(delay, withTiming(targetY, { duration: 400, easing: Easing.out(Easing.cubic) }));
      scale.value = withDelay(delay, withSequence(
        withTiming(1.2, { duration: 100 }),
        withTiming(0, { duration: 300 })
      ));
      opacity.value = withDelay(delay, withSequence(
        withTiming(1, { duration: 50 }),
        withTiming(0, { duration: 350 })
      ));
    } else {
      translateX.value = 0;
      translateY.value = 0;
      scale.value = 1;
      opacity.value = 0;
    }
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

// Heart overlay component
const HeartOverlay = ({ visible, theme }: { visible: boolean; theme: Theme }) => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSequence(
        withTiming(0, { duration: 0 }),
        withSpring(1.3, reanimatedSpringConfigs.bouncy),
        withTiming(1, { duration: 100 })
      );
      opacity.value = withSequence(
        withTiming(1, { duration: 0 }),
        withDelay(400, withTiming(0, { duration: 300 }))
      );
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.heartOverlay, animatedStyle]}>
      <Text style={[styles.heartOverlayIcon, { color: "#ff3b30", textShadowColor: "#ff3b30" }]}>
        ♥
      </Text>
      {/* Particle burst */}
      <View style={styles.particleContainer}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
          <LikeParticle
            key={angle}
            angle={angle}
            color="#ff3b30"
            active={visible}
            delay={i * 25}
          />
        ))}
      </View>
    </Animated.View>
  );
};

const PostCardComponent = ({ post, username: providedUsername, onUsernameLoad, theme: providedTheme, onRepostRemoved }: PostCardProps) => {
  const theme = providedTheme || getTheme();
  const uid = auth.currentUser?.uid;
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [author, setAuthor] = useState<string>(providedUsername || "...");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [likes, setLikes] = useState(post.likeCount ?? 0);
  const [reposts, setReposts] = useState(post.repostCount ?? 0);
  const [shares, setShares] = useState(post.shareCount ?? 0);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const [showHeartOverlay, setShowHeartOverlay] = useState(false);
  const [showParticleBurst, setShowParticleBurst] = useState(false);

  const comments = post.commentCount ?? 0;
  const isMyPost = uid === post.uid;

  // Reanimated animation values
  const cardScale = useSharedValue(1);
  const cardBgColor = useSharedValue(theme.surfaceColor);
  const likeScale = useSharedValue(1);
  const commentScale = useSharedValue(1);
  const bookmarkScale = useSharedValue(1);
  const repostScale = useSharedValue(1);
  const shareScale = useSharedValue(1);

  // Double-tap last tap time tracking
  const lastTapTime = useRef(0);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const likeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));

  const commentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: commentScale.value }],
  }));

  const bookmarkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookmarkScale.value }],
  }));

  const repostAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: repostScale.value }],
  }));

  const shareAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shareScale.value }],
  }));

  const canEdit = () => {
    if (!post.createdAt?.seconds) return false;
    const postTime = post.createdAt.seconds * 1000;
    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;
    return now - postTime < twoMinutes;
  };

  useEffect(() => {
    setLikes(post.likeCount ?? 0);
  }, [post.likeCount]);

  useEffect(() => {
    setReposts(post.repostCount ?? 0);
  }, [post.repostCount]);

  useEffect(() => {
    setShares(post.shareCount ?? 0);
  }, [post.shareCount]);

  const getTimeAgo = (timestamp: any) => {
    if (!timestamp?.seconds) return "";
    const now = Date.now();
    const postTime = timestamp.seconds * 1000;
    const diffMs = now - postTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "NOW";
    if (diffMins < 60) return `${diffMins}M`;
    if (diffHours < 24) return `${diffHours}H`;
    if (diffDays < 7) return `${diffDays}D`;
    return new Date(postTime).toLocaleDateString();
  };

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

  useEffect(() => {
    if (!uid) return;
    const bookmarkRef = doc(db, "bookmarks", uid, "posts", post.id);
    return onSnapshot(bookmarkRef, (snap) => setBookmarked(snap.exists()));
  }, [post.id, uid]);

  useEffect(() => {
    if (!uid) return;
    const repostRef = doc(db, "posts", post.id, "reposts", uid);
    return onSnapshot(repostRef, (snap) => setReposted(snap.exists()));
  }, [post.id, uid]);

  const animateBounce = (scale: Animated.SharedValue<number>) => {
    scale.value = withSequence(
      withSpring(1.2, reanimatedSpringConfigs.bouncy),
      withSpring(1, reanimatedSpringConfigs.snappy)
    );
  };

  const toggleLike = async (showOverlay = false) => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (!liked) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {}

    animateBounce(likeScale);

    if (showOverlay && !liked) {
      setShowHeartOverlay(true);
      setShowParticleBurst(true);
      setTimeout(() => {
        setShowHeartOverlay(false);
        setShowParticleBurst(false);
      }, 800);
    }

    const postRef = doc(db, "posts", post.id);
    const likeRef = doc(db, "posts", post.id, "likes", user.uid);

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
      setLiked(isCurrentlyLiked);
      setLikes((prev) => (isCurrentlyLiked ? prev + 1 : prev - 1));
      Alert.alert("Error", "Failed to update like");
    }
  };

  const openComments = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {}

    animateBounce(commentScale);
    router.push({ pathname: "/post", params: { postId: post.id, text: post.text } });
  };

  const toggleBookmark = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {}

    animateBounce(bookmarkScale);

    const isCurrentlyBookmarked = bookmarked;
    setBookmarked(!isCurrentlyBookmarked);

    try {
      const bookmarkRef = doc(db, "bookmarks", user.uid, "posts", post.id);

      if (isCurrentlyBookmarked) {
        await deleteDoc(bookmarkRef);
      } else {
        const bookmarkData: any = {
          postId: post.id,
          uid: post.uid,
          text: post.text || "",
          createdAt: post.createdAt,
          bookmarkedAt: serverTimestamp(),
        };

        if (post.imageUrl) {
          bookmarkData.imageUrl = post.imageUrl;
        }

        await setDoc(bookmarkRef, bookmarkData);
      }
    } catch (error) {
      console.error("Bookmark error:", error);
      setBookmarked(isCurrentlyBookmarked);
      Alert.alert("Error", "Failed to update bookmark");
    }
  };

  const toggleRepost = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (!reposted) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {}

    animateBounce(repostScale);

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

        const baseEng = (data?.likeCount ?? 0) + (data?.commentCount ?? 0) + (data?.repostCount ?? 0);
        if (data && data.engagementCount == null) tx.update(postRef, { engagementCount: baseEng });

        if (repostSnap.exists()) {
          tx.delete(repostRef);
          tx.update(postRef, { repostCount: increment(-1), engagementCount: increment(-1) });
          wasReposted = true;
        } else {
          tx.set(repostRef, { uid: user.uid, createdAt: serverTimestamp() });
          tx.update(postRef, { repostCount: increment(1), engagementCount: increment(1) });
          wasReposted = false;
        }
      });

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

      if (wasReposted && onRepostRemoved) {
        onRepostRemoved(post.id);
      }
    } catch (error) {
      setReposted(isCurrentlyReposted);
      setReposts((prev) => (isCurrentlyReposted ? prev + 1 : prev - 1));
      Alert.alert("Error", "Failed to update repost");
    }
  };

  const sharePost = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {}

    animateBounce(shareScale);

    const postPreview = post.text.length > 100
      ? post.text.substring(0, 100) + "..."
      : post.text;

    const shareText = post.text
      ? `Check out this post by @${author} on STANCLICKIN:\n\n${postPreview}\n\nDownload STANCLICKIN: https://apps.apple.com/app/stanclickin/id6738643257`
      : `Check out @${author}'s post on STANCLICKIN!\n\nDownload STANCLICKIN: https://apps.apple.com/app/stanclickin/id6738643257`;

    try {
      const result = await Share.share({
        message: shareText,
      });

      if (result.action === Share.sharedAction) {
        setShares((prev) => prev + 1);

        const postRef = doc(db, "posts", post.id);
        await updateDoc(postRef, {
          shareCount: increment(1),
          engagementCount: increment(1),
        });

        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {}
      }
    } catch (error: any) {
      console.error("Error sharing:", error);
      if (error?.message && !error.message.includes("cancel")) {
        Alert.alert("Error", "Failed to share post");
      }
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
      const likesSnap = await getDocs(collection(db, "posts", post.id, "likes"));
      const commentsSnap = await getDocs(collection(db, "posts", post.id, "comments"));

      const batch = await import("firebase/firestore").then((m) => m.writeBatch(db));
      likesSnap.docs.forEach((d) => batch.delete(d.ref));
      commentsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();

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

    const buttons = options.filter((o) => o !== "Cancel");
    Alert.alert("Post options", "Choose an action", buttons.map((b) => ({ text: b, onPress: () => onSelect(options.indexOf(b)) })));
  };

  // Handle double tap
  const handleDoubleTap = useCallback(() => {
    if (!liked) {
      toggleLike(true);
    }
  }, [liked]);

  // Handle single tap for navigation
  const handleSingleTap = useCallback(() => {
    openComments();
  }, []);

  // Tap tracking for double-tap detection
  const handleTap = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapTime.current < DOUBLE_TAP_DELAY) {
      // Double tap
      handleDoubleTap();
      lastTapTime.current = 0;
    } else {
      // Single tap - wait to see if there's a second tap
      lastTapTime.current = now;
      setTimeout(() => {
        if (lastTapTime.current === now) {
          handleSingleTap();
        }
      }, DOUBLE_TAP_DELAY);
    }
  }, [handleDoubleTap, handleSingleTap]);

  // Press animation handlers
  const handlePressIn = () => {
    cardScale.value = withSpring(0.98, reanimatedSpringConfigs.snappy);
  };

  const handlePressOut = () => {
    cardScale.value = withSpring(1, reanimatedSpringConfigs.smooth);
  };

  const glowShadow = getGlowStyle(theme.glowColor, 8);

  return (
    <Animated.View style={[styles.post, { backgroundColor: theme.surfaceColor }, glowShadow, cardAnimatedStyle]}>
      {post.repostedBy && (
        <View style={styles.repostIndicator}>
          <Text style={[styles.repostIcon, { color: theme.primaryColor }]}>{"↻"}</Text>
          <Text style={[styles.repostText, { color: theme.secondaryTextColor }]}>
            REPOSTED BY @{post.repostedBy.toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.postHeader}>
        <Pressable style={styles.userInfo} onPress={() => router.push(`/u/${post.uid}`)}>
          <Avatar imageUrl={profilePicture} username={author} size={36} theme={theme} />
          <View>
            <Text style={[styles.handle, { color: theme.textColor }]}>@{author.toUpperCase()}</Text>
            <Text style={[styles.timestamp, { color: theme.mutedTextColor }]}>
              {getTimeAgo(post.createdAt)}
              {post.editedAt && " // EDITED"}
            </Text>
          </View>
        </Pressable>
        <Pressable style={styles.menuBtn} onPress={openPostMenu}>
          <Text style={[styles.menuIcon, { color: theme.secondaryTextColor }]}>...</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={handleTap}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.contentArea}
      >
        {renderTextWithLinks(
          post.text,
          [styles.postText, { color: theme.textColor }],
          [styles.linkText, { color: theme.primaryColor }],
          true
        )}

        {/* Heart overlay for double-tap */}
        <HeartOverlay visible={showHeartOverlay} theme={theme} />
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
              <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
              <Image
                source={{ uri: post.imageUrl }}
                style={styles.fullscreenImage}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Pressable style={[styles.closeBtn, { backgroundColor: theme.surfaceColor }]} onPress={() => setImageModalVisible(false)}>
                <Text style={[styles.closeBtnText, { color: theme.textColor }]}>x</Text>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={() => toggleLike(true)}>
          <Animated.View style={[styles.actionContent, likeAnimatedStyle]}>
            <Text
              style={[
                styles.actionIcon,
                styles.likeIcon,
                { color: liked ? "#ff3b30" : theme.secondaryTextColor },
                liked && { textShadowColor: "#ff3b30", textShadowRadius: 8 }
              ]}
            >
              {liked ? "♥" : "♡"}
            </Text>
            {likes > 0 && (
              <Text style={[styles.actionCount, { color: liked ? "#ff3b30" : theme.secondaryTextColor }]}>
                {likes}
              </Text>
            )}
          </Animated.View>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={openComments}>
          <Animated.View style={[styles.actionContent, commentAnimatedStyle]}>
            <Text style={[styles.actionIcon, { color: theme.secondaryTextColor }]}>◯</Text>
            {comments > 0 && (
              <Text style={[styles.actionCount, { color: theme.secondaryTextColor }]}>{comments}</Text>
            )}
          </Animated.View>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={toggleRepost}>
          <Animated.View style={[styles.actionContent, repostAnimatedStyle]}>
            <Text
              style={[
                styles.actionIcon,
                { color: reposted ? theme.primaryColor : theme.secondaryTextColor },
                reposted && { textShadowColor: theme.primaryColor, textShadowRadius: 8 }
              ]}
            >
              {"↻"}
            </Text>
            {reposts > 0 && (
              <Text style={[styles.actionCount, { color: reposted ? theme.primaryColor : theme.secondaryTextColor }]}>
                {reposts}
              </Text>
            )}
          </Animated.View>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={sharePost}>
          <Animated.View style={[styles.actionContent, shareAnimatedStyle]}>
            <Text style={[styles.actionIcon, { color: theme.secondaryTextColor }]}>↗</Text>
            {shares > 0 && (
              <Text style={[styles.actionCount, { color: theme.secondaryTextColor }]}>{shares}</Text>
            )}
          </Animated.View>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={toggleBookmark}>
          <Animated.View style={[styles.actionContent, bookmarkAnimatedStyle]}>
            <Text
              style={[
                styles.actionIcon,
                { color: bookmarked ? theme.primaryColor : theme.secondaryTextColor },
                bookmarked && { textShadowColor: theme.primaryColor, textShadowRadius: 8 }
              ]}
            >
              {bookmarked ? "★" : "☆"}
            </Text>
          </Animated.View>
        </Pressable>
      </View>

      <Modal visible={editModalVisible} animationType="slide" transparent={true}>
        <View style={styles.editModalOverlay}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.editModal, { backgroundColor: theme.surfaceColor }]}>
            <View style={styles.editModalHeader}>
              <Text style={[styles.editModalTitle, { color: theme.textColor }]}>EDIT POST</Text>
              <Pressable onPress={() => setEditModalVisible(false)}>
                <Text style={[styles.editModalClose, { color: theme.textColor }]}>x</Text>
              </Pressable>
            </View>

            <TextInput
              style={[styles.editInput, {
                backgroundColor: theme.backgroundColor,
                color: theme.textColor,
                borderColor: theme.borderColor
              }]}
              placeholder="Post text..."
              placeholderTextColor={theme.mutedTextColor}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
            />

            <Pressable
              style={[styles.editSaveBtn, { backgroundColor: theme.primaryColor }]}
              onPress={editPost}
            >
              <Text style={[styles.editSaveBtnText, { color: theme.backgroundColor }]}>SAVE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
};

export const PostCard = React.memo(PostCardComponent);

const styles = StyleSheet.create({
  post: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  repostIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  repostIcon: {
    fontSize: 14,
    fontFamily: "SpaceMono",
    fontWeight: "700",
  },
  repostText: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },
  postHeader: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1
  },
  handle: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  menuBtn: {
    padding: 4,
    paddingHorizontal: 8,
  },
  menuIcon: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },
  contentArea: {
    position: "relative",
  },
  postText: {
    fontSize: 15,
    fontFamily: "SpaceMono",
    lineHeight: 22,
    marginBottom: 8
  },
  linkText: {
    fontFamily: "SpaceMono-Bold",
  },
  postImage: {
    width: "100%",
    height: 250,
    borderRadius: 8,
    marginTop: 12
  },
  heartOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -40,
    marginTop: -40,
    width: 80,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  heartOverlayIcon: {
    fontSize: 60,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  particleContainer: {
    position: "absolute",
    width: 80,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%"
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    fontSize: 20,
    fontFamily: "SpaceMono-Bold",
  },

  actions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 44,
  },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionIcon: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
  },
  likeIcon: {
    width: 20,
    textAlign: "center",
  },
  actionCount: {
    fontSize: 13,
    fontFamily: "SpaceMono",
  },

  editModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  editModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 16
  },
  editModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  editModalTitle: {
    fontSize: 16,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },
  editModalClose: {
    fontSize: 24,
    fontFamily: "SpaceMono-Bold",
  },
  editInput: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontFamily: "SpaceMono",
    textAlignVertical: "top"
  },
  editSaveBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center"
  },
  editSaveBtnText: {
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },
});
