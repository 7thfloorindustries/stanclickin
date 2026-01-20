import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, Image, Modal, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, ScrollView, RefreshControl, Animated, LayoutAnimation, Platform, UIManager } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  limit,
  where,
  getDocs,
} from "firebase/firestore";
import ReanimatedAnimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  Easing as ReanimatedEasing,
  FadeIn,
  FadeInDown,
  SlideInRight,
  interpolate,
} from "react-native-reanimated";
import { auth, db, storage } from "../src/lib/firebase";
import { PostCard, type Post } from "../components/PostCard";
import { PostSkeleton } from "../components/PostSkeleton";
import { type ThemeId, getTheme } from "../src/lib/themes";
import { extractHashtags, extractMentions } from "../src/lib/textUtils";
import { createGlowPulse, createPressAnimation, reanimatedSpringConfigs } from "../src/lib/animations";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function useUsernameCache() {
  const cache = useRef<Record<string, string>>({});
  const getUsername = async (uid: string) => {
    if (cache.current[uid]) return cache.current[uid];
    const snap = await getDoc(doc(db, "users", uid));
    const name = (snap.exists() ? (snap.data() as any)?.username : null) || "user";
    cache.current[uid] = name;
    return name;
  };
  return { getUsername };
}

// Animated gradient background component
function AnimatedGradientBackground({ theme }: { theme: ReturnType<typeof getTheme> }) {
  const animProgress = useSharedValue(0);

  useEffect(() => {
    // 10-second cycle animation
    animProgress.value = withRepeat(
      withTiming(1, { duration: 10000, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
      -1, // infinite
      true // reverse
    );
  }, []);

  const gradientStyle = useAnimatedStyle(() => {
    const translateX = interpolate(animProgress.value, [0, 1], [-30, 30]);
    const translateY = interpolate(animProgress.value, [0, 1], [-20, 20]);
    const scale = interpolate(animProgress.value, [0, 0.5, 1], [1.1, 1.15, 1.1]);

    return {
      transform: [
        { translateX },
        { translateY },
        { scale },
      ],
    };
  });

  if (!theme.gradient) return null;

  return (
    <ReanimatedAnimated.View style={[styles.animatedGradientContainer, gradientStyle]}>
      <LinearGradient
        colors={theme.gradient.colors as [string, string, ...string[]]}
        start={theme.gradient.start}
        end={theme.gradient.end}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle color overlay that pulses */}
      <ReanimatedAnimated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.glowColorRgba,
            opacity: 0.1,
          },
        ]}
      />
    </ReanimatedAnimated.View>
  );
}

export default function StanSpace() {
  const navigation = useNavigation<any>();
  const me = auth.currentUser?.uid;

  const flatListRef = useRef<FlatList>(null);

  const [sortMode, setSortMode] = useState<"recent" | "trending" | "following">("trending");
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ users: any[]; posts: Post[] }>({ users: [], posts: [] });
  const [searching, setSearching] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [bookmarksVisible, setBookmarksVisible] = useState(false);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Post[]>([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [trendingVisible, setTrendingVisible] = useState(false);
  const [trendingHashtags, setTrendingHashtags] = useState<Array<{ tag: string; count: number }>>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null);
  const [hideGamePosts, setHideGamePosts] = useState(false);
  const [unreadDMCount, setUnreadDMCount] = useState(0);

  const theme = getTheme(userTheme);

  // Animation values
  const unreadPulse = useRef(new Animated.Value(0.3)).current;
  const dmPulse = useRef(new Animated.Value(0.3)).current;
  const navHomeScale = useRef(new Animated.Value(1)).current;
  const navNewScale = useRef(new Animated.Value(1)).current;
  const navFindScale = useRef(new Animated.Value(1)).current;
  const navMeScale = useRef(new Animated.Value(1)).current;

  // Reanimated badge bounce
  const badgeScale = useSharedValue(1);
  const badgeRingScale = useSharedValue(1);
  const badgeRingOpacity = useSharedValue(0);
  const prevUnreadCount = useRef(0);

  // Bounce animation when unread count increases
  useEffect(() => {
    if (unreadCount > prevUnreadCount.current && unreadCount > 0) {
      // Badge bounce
      badgeScale.value = withSequence(
        withTiming(1.4, { duration: 150 }),
        withSpring(1, reanimatedSpringConfigs.bouncy)
      );
      // Ring expansion
      badgeRingScale.value = 1;
      badgeRingOpacity.value = 1;
      badgeRingScale.value = withTiming(2, { duration: 400, easing: ReanimatedEasing.out(ReanimatedEasing.ease) });
      badgeRingOpacity.value = withTiming(0, { duration: 400 });
    }
    prevUnreadCount.current = unreadCount;
  }, [unreadCount]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  const badgeRingAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeRingScale.value }],
    opacity: badgeRingOpacity.value,
  }));

  // Start pulse animations for unread indicators
  useEffect(() => {
    if (unreadCount > 0) {
      createGlowPulse(unreadPulse).start();
    } else {
      unreadPulse.setValue(0.3);
    }
  }, [unreadCount]);

  useEffect(() => {
    if (unreadDMCount > 0) {
      createGlowPulse(dmPulse).start();
    } else {
      dmPulse.setValue(0.3);
    }
  }, [unreadDMCount]);

  const goMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (navigation?.canGoBack?.()) navigation.goBack();
    else router.replace("/");
  };

  const toggleGamePosts = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newValue = !hideGamePosts;
    setHideGamePosts(newValue);
  };

  const isGamePost = (post: Post) => {
    const text = post.text.toLowerCase();
    return text.includes("flappyclickin") || text.includes("flappy") || text.includes("#game");
  };

  const filteredPosts = useMemo(() => {
    if (!hideGamePosts) return posts;
    return posts.filter((post) => !isGamePost(post));
  }, [posts, hideGamePosts]);

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

  useEffect(() => {
    if (!me) return;

    setLoading(true);

    if (sortMode === "following") {
      const fetchFollowingFeed = async () => {
        try {
          const followingSnap = await getDocs(collection(db, "follows", me, "following"));
          const followingUids = followingSnap.docs.map((d) => d.id);

          if (followingUids.length === 0) {
            setPosts([]);
            setLoading(false);
            return;
          }

          const batches: string[][] = [];
          for (let i = 0; i < followingUids.length; i += 10) {
            batches.push(followingUids.slice(i, i + 10));
          }

          const allPosts: Post[] = [];
          for (const batch of batches) {
            const q = query(
              collection(db, "posts"),
              where("uid", "in", batch),
              orderBy("createdAt", "desc"),
              limit(50)
            );
            const snap = await getDocs(q);
            const batchPosts = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Post[];
            allPosts.push(...batchPosts);
          }

          allPosts.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });

          setPosts(allPosts.slice(0, 50));
          setLoading(false);
        } catch (error) {
          console.error("Error fetching following feed:", error);
          setPosts([]);
          setLoading(false);
        }
      };

      fetchFollowingFeed();

      const followingRef = collection(db, "follows", me, "following");
      return onSnapshot(followingRef, () => {
        fetchFollowingFeed();
      });
    } else {
      let q;

      if (sortMode === "recent") {
        q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
      } else {
        q = query(collection(db, "posts"), orderBy("engagementCount", "desc"), orderBy("createdAt", "desc"), limit(50));
      }

      return onSnapshot(q, (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Post[];
        setPosts(rows);
        setLoading(false);
      });
    }
  }, [sortMode, me]);

  useEffect(() => {
    if (!me) return;

    const q = query(
      collection(db, "notifications", me, "items"),
      where("read", "==", false)
    );

    return onSnapshot(q, async (snap) => {
      const count = snap.size;
      setUnreadCount(count);
    });
  }, [me, unreadDMCount]);

  useEffect(() => {
    if (!me) return;

    const q = query(
      collection(db, "conversations"),
      where("participants", "array-contains", me)
    );

    return onSnapshot(q, (snap) => {
      let totalUnread = 0;
      snap.docs.forEach((doc) => {
        const data = doc.data();
        const myUnread = data.unreadCount?.[me] || 0;
        totalUnread += myUnread;
      });
      setUnreadDMCount(totalUnread);
    });
  }, [me]);

  useEffect(() => {
    if (!me || !notificationsVisible) return;

    const q = query(
      collection(db, "notifications", me, "items"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setNotifications(rows);
    });
  }, [me, notificationsVisible]);

  const canPost = useMemo(() => text.trim().length > 0 || selectedImage !== null, [text, selectedImage]);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert("Permission needed", "Please allow access to your photo library");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();

    const filename = `${Date.now()}.jpg`;
    const storageRef = ref(storage, `posts/${auth.currentUser!.uid}/${filename}`);

    await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(storageRef);

    return downloadUrl;
  };

  const createPost = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");

    const trimmed = text.trim();
    if (!trimmed && !selectedImage) return;

    const extremelyHarmfulPatterns = [
      /k[i1!]ll\s*(you|yourself|urself)/i,
      /murder\s*(you|yourself)/i,
      /(child|kid)\s*(porn|abuse)/i,
      /human\s*traffick/i,
      /n[i1!]gg[e3]r/i,
      /f[a4]gg[o0]t/i,
      /r[a4]p[e3]\s*(you|her|him)/i,
    ];

    const containsExtremeContent = extremelyHarmfulPatterns.some(pattern =>
      pattern.test(trimmed.toLowerCase())
    );

    if (containsExtremeContent) {
      Alert.alert(
        "Content Policy Violation",
        "Your post contains content that violates our community guidelines. Please review our terms of service."
      );
      setUploading(false);
      return;
    }

    setUploading(true);
    try {
      let imageUrl: string | undefined;

      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
      }

      const hashtags = extractHashtags(trimmed);
      const mentions = extractMentions(trimmed);

      const postData: any = {
        uid: user.uid,
        text: trimmed,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        shareCount: 0,
        engagementCount: 0,
        createdAt: serverTimestamp(),
        hashtags: hashtags.length > 0 ? hashtags : [],
        mentions: mentions.length > 0 ? mentions : [],
      };

      if (imageUrl) {
        postData.imageUrl = imageUrl;
      }

      const postRef = await addDoc(collection(db, "posts"), postData);

      if (mentions.length > 0) {
        const { createNotification } = await import("../src/lib/notifications");
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const username = userDoc.exists() ? userDoc.data()?.username : "user";

        for (const mentionedUsername of mentions) {
          try {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("username", "==", mentionedUsername));
            const snap = await getDocs(q);

            if (!snap.empty) {
              const mentionedUserDoc = snap.docs[0];
              await createNotification({
                recipientUid: mentionedUserDoc.id,
                type: "post_mention",
                fromUid: user.uid,
                fromUsername: username,
                postId: postRef.id,
                text: trimmed.substring(0, 100),
              });
            }
          } catch (error) {
            console.error(`Error notifying @${mentionedUsername}:`, error);
          }
        }
      }

      setText("");
      setSelectedImage(null);
      setComposerVisible(false);
      Keyboard.dismiss();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 500);
    } catch (error: any) {
      console.error("Error creating post:", error);

      const isUploadError = error?.message?.includes("storage") || error?.message?.includes("upload");
      const errorTitle = isUploadError ? "Image Upload Failed" : "Post Failed";
      const errorMessage = isUploadError
        ? "Failed to upload image. Your text and image are saved. Check your connection and try again."
        : (error?.message || "Failed to create post. Your content is saved. Please try again.");

      Alert.alert(
        errorTitle,
        errorMessage,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Retry", onPress: () => createPost() }
        ]
      );
    } finally {
      setUploading(false);
    }
  };

  const openMyProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    router.push(`/u/${uid}`);
  };

  const markNotificationAsRead = async (notificationId: string) => {
    if (!me) return;
    try {
      await import("firebase/firestore").then((m) =>
        m.updateDoc(doc(db, "notifications", me, "items", notificationId), { read: true })
      );
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!me) return;
    try {
      const batch = await import("firebase/firestore").then((m) => m.writeBatch(db));
      notifications.filter((n) => !n.read).forEach((n) => {
        batch.update(doc(db, "notifications", me, "items", n.id), { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleNotificationClick = async (notification: any) => {
    await markNotificationAsRead(notification.id);
    setNotificationsVisible(false);

    if (notification.type === "follow") {
      router.push(`/u/${notification.fromUid}`);
    } else if (notification.postId) {
      router.push({ pathname: "/post", params: { postId: notification.postId } });
    }
  };

  const getNotificationText = (notification: any) => {
    const username = notification.fromUsername || "Someone";
    switch (notification.type) {
      case "post_like":
        return `@${username.toUpperCase()} +1 YOUR POST`;
      case "post_comment":
        return `@${username.toUpperCase()} // "${notification.text || "..."}"`;
      case "follow":
        return `@${username.toUpperCase()} >> FOLLOWING YOU`;
      case "comment_like":
        return `@${username.toUpperCase()} +1 YOUR COMMENT`;
      case "post_repost":
        return `@${username.toUpperCase()} >> YOUR POST`;
      case "post_mention":
        return `@${username.toUpperCase()} @ YOU: "${notification.text || "..."}"`;
      default:
        return "NEW NOTIFICATION";
    }
  };

  const getTimeAgo = (timestamp: any) => {
    if (!timestamp?.seconds) return "";
    const now = Date.now();
    const notifTime = timestamp.seconds * 1000;
    const diffMs = now - notifTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "NOW";
    if (diffMins < 60) return `${diffMins}M`;
    if (diffHours < 24) return `${diffHours}H`;
    if (diffDays < 7) return `${diffDays}D`;
    return new Date(notifTime).toLocaleDateString();
  };

  const onRefresh = async () => {
    setRefreshing(true);

    if (sortMode === "following") {
      try {
        const followingSnap = await getDocs(collection(db, "follows", me!, "following"));
        const followingUids = followingSnap.docs.map((d) => d.id);

        if (followingUids.length === 0) {
          setPosts([]);
          setRefreshing(false);
          return;
        }

        const batches: string[][] = [];
        for (let i = 0; i < followingUids.length; i += 10) {
          batches.push(followingUids.slice(i, i + 10));
        }

        const allPosts: Post[] = [];
        for (const batch of batches) {
          const q = query(
            collection(db, "posts"),
            where("uid", "in", batch),
            orderBy("createdAt", "desc"),
            limit(50)
          );
          const snap = await getDocs(q);
          const batchPosts = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Post[];
          allPosts.push(...batchPosts);
        }

        allPosts.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setPosts(allPosts.slice(0, 50));
      } catch (error) {
        console.error("Error refreshing following feed:", error);
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setRefreshing(false);
  };

  const loadBookmarks = async () => {
    if (!me) return;

    setLoadingBookmarks(true);
    try {
      const bookmarksSnap = await getDocs(collection(db, "bookmarks", me, "posts"));

      const posts: Post[] = bookmarksSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.postId,
          uid: data.uid,
          text: data.text,
          imageUrl: data.imageUrl,
          createdAt: data.createdAt,
          likeCount: 0,
          commentCount: 0,
          repostCount: 0,
          engagementCount: 0,
        } as Post;
      });

      posts.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });

      setBookmarkedPosts(posts);
    } catch (error) {
      console.error("Error loading bookmarks:", error);
    } finally {
      setLoadingBookmarks(false);
    }
  };

  const loadTrendingHashtags = async () => {
    setLoadingTrending(true);
    try {
      const postsSnap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100)));

      const hashtagCount: Record<string, number> = {};
      postsSnap.docs.forEach((doc) => {
        const data = doc.data();
        const hashtags = data.hashtags || [];
        hashtags.forEach((tag: string) => {
          hashtagCount[tag] = (hashtagCount[tag] || 0) + 1;
        });
      });

      const trending = Object.entries(hashtagCount)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setTrendingHashtags(trending);
    } catch (error) {
      console.error("Error loading trending hashtags:", error);
    } finally {
      setLoadingTrending(false);
    }
  };

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setSearchResults({ users: [], posts: [] });
      return;
    }

    setSearching(true);
    try {
      const lowerQuery = searchTerm.toLowerCase().replace(/^@/, "");

      const usersSnap = await getDocs(collection(db, "users"));
      const matchingUsers = usersSnap.docs
        .map((d) => ({ uid: d.id, ...(d.data() as any) }))
        .filter((u) => u.username?.toLowerCase().includes(lowerQuery))
        .slice(0, 10);

      const postsSnap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100)));
      const matchingPosts = postsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as Post)
        .filter((p) => p.text?.toLowerCase().includes(lowerQuery))
        .slice(0, 10);

      setSearchResults({ users: matchingUsers, posts: matchingPosts });
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleNavPress = (action: () => void, scale: Animated.Value) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.9, tension: 300, friction: 10, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 300, friction: 10, useNativeDriver: true }),
    ]).start();
    action();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]} edges={["top"]}>
      {theme.stanPhoto && (
        <>
          <ExpoImage
            source={theme.stanPhoto}
            style={styles.fixedBackground}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
          />
          <View style={styles.fixedBackgroundOverlay} />
        </>
      )}

      {/* Animated gradient background */}
      <AnimatedGradientBackground theme={theme} />

      <View style={[styles.wrap, { backgroundColor: theme.stanPhoto ? "transparent" : theme.backgroundColor }]}>
        {/* Header */}
        <View style={styles.topRow}>
          <Pressable style={styles.menuBtn} onPress={goMenu}>
            <Text style={[styles.menuText, { color: theme.textColor }]}>{"<"} MENU</Text>
          </Pressable>

          <Text style={[styles.h1, { color: theme.primaryColor }]}>STANSPACE</Text>

          <View style={styles.headerRight}>
            <Pressable
              style={styles.headerBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/messages");
              }}
            >
              <Text style={[styles.headerBtnText, { color: theme.textColor }]}>MSG</Text>
              {unreadDMCount > 0 && (
                <Animated.View style={[styles.pulsingDot, { backgroundColor: theme.primaryColor, opacity: dmPulse }]} />
              )}
            </Pressable>

            <Pressable
              style={styles.headerBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setNotificationsVisible(true);
              }}
            >
              <Text style={[styles.headerBtnText, { color: theme.textColor }]}>!</Text>
              {unreadCount > 0 && (
                <View style={styles.badgeContainer}>
                  <ReanimatedAnimated.View style={[styles.badgeRing, { borderColor: theme.primaryColor }, badgeRingAnimatedStyle]} />
                  <ReanimatedAnimated.View style={[styles.pulsingDot, { backgroundColor: theme.primaryColor }, badgeAnimatedStyle]}>
                    <Animated.View style={{ opacity: unreadPulse, position: 'absolute', width: '100%', height: '100%', backgroundColor: theme.primaryColor, borderRadius: 10 }} />
                  </ReanimatedAnimated.View>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Feed Tabs */}
        <View style={styles.feedTabs}>
          {["recent", "trending", "following"].map((mode) => (
            <Pressable
              key={mode}
              style={[
                styles.feedTab,
                { borderColor: sortMode === mode ? theme.primaryColor : theme.borderColor },
                sortMode === mode && { backgroundColor: theme.surfaceGlow }
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSortMode(mode as any);
              }}
            >
              <Text style={[
                styles.feedTabText,
                { color: sortMode === mode ? theme.primaryColor : theme.secondaryTextColor }
              ]}>
                {mode.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Game Filter */}
        <Pressable
          style={[
            styles.gameFilterChip,
            {
              backgroundColor: hideGamePosts ? theme.primaryColor : theme.surfaceColor,
              borderColor: theme.borderColor,
            }
          ]}
          onPress={toggleGamePosts}
        >
          <Text style={[
            styles.gameFilterText,
            { color: hideGamePosts ? theme.backgroundColor : theme.secondaryTextColor }
          ]}>
            {hideGamePosts ? "GAME POSTS HIDDEN" : "SHOW ALL"}
          </Text>
        </Pressable>

        {/* Posts List */}
        {loading ? (
          <View style={{ paddingBottom: 80 }}>
            <PostSkeleton theme={theme} />
            <PostSkeleton theme={theme} />
            <PostSkeleton theme={theme} />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: theme.textColor }]}>
              {sortMode === "following" ? "NO POSTS YET" : "EMPTY FEED"}
            </Text>
            <Text style={[styles.emptyStateText, { color: theme.secondaryTextColor }]}>
              {sortMode === "following"
                ? "FOLLOW USERS TO SEE THEIR POSTS"
                : "BE THE FIRST TO POST"}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={filteredPosts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={({ item, index }) => (
              <ReanimatedAnimated.View
                entering={FadeInDown.delay(index * 50).duration(300).springify()}
              >
                <PostCard post={item} theme={theme} />
              </ReanimatedAnimated.View>
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.primaryColor}
                colors={[theme.primaryColor]}
              />
            }
          />
        )}

        {/* Bottom Navigation */}
        <View style={[styles.bottomNav, { backgroundColor: theme.backgroundColor, borderTopColor: theme.borderColor }]}>
          <Pressable
            style={styles.navBtn}
            onPress={() => handleNavPress(() => {
              if (posts.length > 0) {
                flatListRef.current?.scrollToIndex({ index: 0, animated: true });
              }
            }, navHomeScale)}
          >
            <Animated.Text style={[styles.navIconTypo, { color: theme.textColor, transform: [{ scale: navHomeScale }] }]}>
              ⌂
            </Animated.Text>
            <Text style={[styles.navLabel, { color: theme.mutedTextColor }]}>HOME</Text>
          </Pressable>

          <Pressable
            style={styles.navBtn}
            onPress={() => handleNavPress(() => setComposerVisible(true), navNewScale)}
          >
            <Animated.Text style={[styles.navIconTypo, { color: theme.primaryColor, transform: [{ scale: navNewScale }] }]}>
              +
            </Animated.Text>
            <Text style={[styles.navLabel, { color: theme.mutedTextColor }]}>NEW</Text>
          </Pressable>

          <Pressable
            style={styles.navBtn}
            onPress={() => handleNavPress(() => setSearchVisible(true), navFindScale)}
          >
            <Animated.Text style={[styles.navIconTypo, { color: theme.textColor, transform: [{ scale: navFindScale }] }]}>
              ◎
            </Animated.Text>
            <Text style={[styles.navLabel, { color: theme.mutedTextColor }]}>FIND</Text>
          </Pressable>

          <Pressable
            style={styles.navBtn}
            onPress={() => handleNavPress(openMyProfile, navMeScale)}
          >
            <Animated.Text style={[styles.navIconTypo, { color: theme.textColor, transform: [{ scale: navMeScale }] }]}>
              ◯
            </Animated.Text>
            <Text style={[styles.navLabel, { color: theme.mutedTextColor }]}>ME</Text>
          </Pressable>
        </View>

        {/* Composer Modal */}
        <Modal visible={composerVisible} animationType="slide" transparent={true}>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <BlurView intensity={80} tint="dark" style={styles.modalOverlay}>
                <View style={[styles.composerModal, { backgroundColor: theme.surfaceColor }]}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: theme.textColor }]}>NEW POST</Text>
                    <Pressable onPress={() => setComposerVisible(false)}>
                      <Text style={[styles.modalClose, { color: theme.textColor }]}>x</Text>
                    </Pressable>
                  </View>

                  <TextInput
                    style={[styles.input, {
                      backgroundColor: theme.backgroundColor,
                      color: theme.textColor,
                      borderColor: theme.borderColor,
                    }]}
                    placeholder="TYPE SOMETHING..."
                    placeholderTextColor={theme.mutedTextColor}
                    value={text}
                    onChangeText={setText}
                    multiline
                    autoFocus
                  />

                  {selectedImage && (
                    <View style={styles.imagePreviewContainer}>
                      <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
                      <Pressable style={[styles.removeImageBtn, { backgroundColor: theme.surfaceColor }]} onPress={() => setSelectedImage(null)}>
                        <Text style={[styles.removeImageText, { color: theme.textColor }]}>x</Text>
                      </Pressable>
                    </View>
                  )}

                  <View style={styles.composerActions}>
                    <Pressable
                      style={[styles.imageBtn, { backgroundColor: theme.surfaceGlow, borderColor: theme.borderColor }]}
                      onPress={pickImage}
                    >
                      <Text style={[styles.imageBtnText, { color: theme.textColor }]}>+ IMG</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.btn, { backgroundColor: theme.primaryColor }, (!canPost || uploading) && styles.btnDisabled]}
                      onPress={createPost}
                      disabled={!canPost || uploading}
                    >
                      <Text style={[styles.btnText, { color: theme.backgroundColor }]}>
                        {uploading ? "..." : "POST"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </BlurView>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>

        {/* Search Modal */}
        <Modal visible={searchVisible} animationType="slide" transparent={true} onRequestClose={() => setSearchVisible(false)}>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
            <Pressable style={styles.modalOverlay} onPress={() => setSearchVisible(false)}>
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={[styles.searchModal, { backgroundColor: theme.surfaceColor }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.textColor }]}>FIND</Text>
                  <Pressable onPress={() => setSearchVisible(false)}>
                    <Text style={[styles.modalClose, { color: theme.textColor }]}>x</Text>
                  </Pressable>
                </View>

                <TextInput
                  style={[styles.searchInput, {
                    backgroundColor: theme.backgroundColor,
                    color: theme.textColor,
                    borderColor: theme.borderColor,
                  }]}
                  placeholder="SEARCH USERS OR POSTS..."
                  placeholderTextColor={theme.mutedTextColor}
                  value={searchQuery}
                  onChangeText={(t) => {
                    setSearchQuery(t);
                    performSearch(t);
                  }}
                  autoFocus
                  returnKeyType="search"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />

                {searching && <ActivityIndicator style={{ marginTop: 20 }} color={theme.primaryColor} />}

                {!searching && searchQuery.trim() && (
                  <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
                    {searchResults.users.length > 0 && (
                      <View style={styles.searchSection}>
                        <Text style={[styles.searchSectionTitle, { color: theme.secondaryTextColor }]}>USERS</Text>
                        {searchResults.users.map((user) => (
                          <Pressable
                            key={user.uid}
                            style={[styles.userResult, { borderColor: theme.borderColor, backgroundColor: theme.surfaceGlow }]}
                            onPress={() => {
                              setSearchVisible(false);
                              setSearchQuery("");
                              router.push(`/u/${user.uid}`);
                            }}
                          >
                            <Text style={[styles.userResultName, { color: theme.textColor }]}>@{user.username?.toUpperCase()}</Text>
                            {user.bio && <Text style={[styles.userResultBio, { color: theme.secondaryTextColor }]}>{user.bio}</Text>}
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {searchResults.posts.length > 0 && (
                      <View style={styles.searchSection}>
                        <Text style={[styles.searchSectionTitle, { color: theme.secondaryTextColor }]}>POSTS</Text>
                        {searchResults.posts.map((post) => (
                          <Pressable
                            key={post.id}
                            style={[styles.postResult, { borderColor: theme.borderColor, backgroundColor: theme.surfaceGlow }]}
                            onPress={() => {
                              setSearchVisible(false);
                              setSearchQuery("");
                              router.push({ pathname: "/post", params: { postId: post.id, text: post.text, imageUrl: post.imageUrl || "" } });
                            }}
                          >
                            <Text style={[styles.postResultText, { color: theme.textColor }]} numberOfLines={2}>
                              {post.text}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {searchResults.users.length === 0 && searchResults.posts.length === 0 && (
                      <Text style={[styles.noResults, { color: theme.mutedTextColor }]}>NO RESULTS</Text>
                    )}
                  </ScrollView>
                )}
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* Notifications Modal */}
        <Modal visible={notificationsVisible} animationType="slide" transparent={true} onRequestClose={() => setNotificationsVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setNotificationsVisible(false)}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.notificationsModal, { backgroundColor: theme.surfaceColor }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.textColor }]}>NOTIFICATIONS</Text>
                <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
                  {unreadCount > 0 && (
                    <Pressable onPress={markAllAsRead}>
                      <Text style={[styles.markAllRead, { color: theme.primaryColor }]}>MARK READ</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setNotificationsVisible(false)}>
                    <Text style={[styles.modalClose, { color: theme.textColor }]}>x</Text>
                  </Pressable>
                </View>
              </View>

              <ScrollView style={styles.notificationsList}>
                {notifications.length === 0 ? (
                  <Text style={[styles.noNotifications, { color: theme.mutedTextColor }]}>NO NOTIFICATIONS</Text>
                ) : (
                  notifications.map((notification) => (
                    <Pressable
                      key={notification.id}
                      style={[
                        styles.notificationItem,
                        { backgroundColor: theme.surfaceGlow, borderColor: theme.borderColor },
                        !notification.read && { borderColor: theme.primaryColor }
                      ]}
                      onPress={() => handleNotificationClick(notification)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.notificationText, { color: theme.textColor }]}>
                          {getNotificationText(notification)}
                        </Text>
                        <Text style={[styles.notificationTime, { color: theme.mutedTextColor }]}>
                          {getTimeAgo(notification.createdAt)}
                        </Text>
                      </View>
                      {!notification.read && (
                        <View style={[styles.unreadIndicator, { backgroundColor: theme.primaryColor }]} />
                      )}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        {/* Bookmarks Modal */}
        <Modal visible={bookmarksVisible} animationType="slide" transparent={true} onRequestClose={() => setBookmarksVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setBookmarksVisible(false)}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.bookmarksModal, { backgroundColor: theme.surfaceColor }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.textColor }]}>BOOKMARKS</Text>
                <Pressable onPress={() => setBookmarksVisible(false)}>
                  <Text style={[styles.modalClose, { color: theme.textColor }]}>x</Text>
                </Pressable>
              </View>

              {loadingBookmarks ? (
                <ActivityIndicator style={{ marginTop: 20 }} color={theme.primaryColor} />
              ) : (
                <ScrollView style={styles.bookmarksList}>
                  {bookmarkedPosts.length === 0 ? (
                    <Text style={[styles.noBookmarks, { color: theme.mutedTextColor }]}>NO BOOKMARKS</Text>
                  ) : (
                    bookmarkedPosts.map((post) => (
                      <View key={post.id} style={{ marginBottom: 12 }}>
                        <PostCard post={post} theme={theme} />
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </View>
          </Pressable>
        </Modal>

        {/* Trending Modal */}
        <Modal visible={trendingVisible} animationType="slide" transparent={true} onRequestClose={() => setTrendingVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setTrendingVisible(false)}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.trendingModal, { backgroundColor: theme.surfaceColor }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.textColor }]}>TRENDING #</Text>
                <Pressable onPress={() => setTrendingVisible(false)}>
                  <Text style={[styles.modalClose, { color: theme.textColor }]}>x</Text>
                </Pressable>
              </View>

              {loadingTrending ? (
                <ActivityIndicator style={{ marginTop: 20 }} color={theme.primaryColor} />
              ) : (
                <ScrollView style={styles.trendingList}>
                  {trendingHashtags.length === 0 ? (
                    <Text style={[styles.noTrending, { color: theme.mutedTextColor }]}>NO TRENDING TAGS</Text>
                  ) : (
                    trendingHashtags.map((item, index) => (
                      <Pressable
                        key={item.tag}
                        style={[styles.trendingItem, { backgroundColor: theme.surfaceGlow, borderColor: theme.borderColor }]}
                        onPress={() => {
                          setTrendingVisible(false);
                          router.push({ pathname: "/hashtag", params: { tag: item.tag } });
                        }}
                      >
                        <Text style={[styles.trendingRank, { color: theme.primaryColor }]}>{index + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.trendingTag, { color: theme.textColor }]}>#{item.tag.toUpperCase()}</Text>
                          <Text style={[styles.trendingCount, { color: theme.secondaryTextColor }]}>
                            {item.count} {item.count === 1 ? "POST" : "POSTS"}
                          </Text>
                        </View>
                        <Text style={[styles.trendingArrow, { color: theme.primaryColor }]}>{">"}</Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              )}
            </View>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1, padding: 16 },

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
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  animatedGradientContainer: {
    position: "absolute",
    top: -50,
    left: -50,
    right: -50,
    bottom: -50,
    overflow: "hidden",
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  h1: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },
  menuBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  menuText: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 12,
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: "row",
    gap: 12,
  },
  headerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerBtnText: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 12,
    letterSpacing: 1,
  },
  badgeContainer: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeRing: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  feedTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  feedTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  feedTabText: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 11,
    letterSpacing: 1,
  },

  gameFilterChip: {
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  gameFilterText: {
    fontSize: 11,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 1,
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 100,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontFamily: "SpaceMono-Bold",
    marginBottom: 8,
    letterSpacing: 2,
  },
  emptyStateText: {
    fontSize: 12,
    fontFamily: "SpaceMono",
    textAlign: "center",
    letterSpacing: 1,
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

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  composerModal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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

  input: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontFamily: "SpaceMono",
    textAlignVertical: "top",
  },
  composerActions: {
    flexDirection: "row",
    gap: 12,
  },
  imageBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  imageBtnText: {
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 1,
  },
  btn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },

  imagePreviewContainer: {
    position: "relative",
    width: "100%",
    height: 200,
    borderRadius: 8,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  removeImageBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  removeImageText: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 16,
  },

  searchModal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    height: "80%",
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontFamily: "SpaceMono",
    marginBottom: 16,
  },
  searchResults: {
    flex: 1,
    marginBottom: 20,
  },
  searchSection: {
    marginBottom: 20,
  },
  searchSectionTitle: {
    fontSize: 11,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
    marginBottom: 8,
  },
  userResult: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  userResultName: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
  },
  userResultBio: {
    fontSize: 12,
    fontFamily: "SpaceMono",
    marginTop: 4,
  },
  postResult: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  postResultText: {
    fontSize: 13,
    fontFamily: "SpaceMono",
  },
  noResults: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 12,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },

  notificationsModal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    height: "80%",
  },
  notificationsList: {
    flex: 1,
    marginTop: 16,
  },
  markAllRead: {
    fontSize: 11,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 1,
  },
  noNotifications: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 12,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },
  notificationItem: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  notificationText: {
    fontSize: 12,
    fontFamily: "SpaceMono",
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 10,
    fontFamily: "SpaceMono",
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  bookmarksModal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    height: "80%",
  },
  bookmarksList: {
    flex: 1,
    marginTop: 16,
  },
  noBookmarks: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 12,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },

  trendingModal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    height: "70%",
  },
  trendingList: {
    flex: 1,
    marginTop: 16,
  },
  noTrending: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 12,
    fontFamily: "SpaceMono",
    letterSpacing: 1,
  },
  trendingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  trendingRank: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
    width: 30,
  },
  trendingTag: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    marginBottom: 2,
  },
  trendingCount: {
    fontSize: 11,
    fontFamily: "SpaceMono",
  },
  trendingArrow: {
    fontSize: 20,
    fontFamily: "SpaceMono-Bold",
  },
});
