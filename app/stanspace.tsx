import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, Image, Modal, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Platform, ScrollView, RefreshControl, PanResponder, Animated } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { BlurView } from "expo-blur";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
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
import { auth, db, storage } from "../src/lib/firebase";
import { PostCard, type Post } from "../components/PostCard";
import { PostSkeleton } from "../components/PostSkeleton";
import { type ThemeId, getTheme } from "../src/lib/themes";
import { extractHashtags, extractMentions } from "../src/lib/textUtils";

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

export default function StanSpace() {
  const navigation = useNavigation<any>();
  const me = auth.currentUser?.uid;

  const flatListRef = useRef<FlatList>(null);

  const [sortMode, setSortMode] = useState<"recent" | "trending" | "following">("recent");
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

  const theme = getTheme(userTheme);

  // Swipe down to dismiss search modal
  const searchModalPan = useRef(new Animated.Value(0)).current;
  const searchPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to downward swipes
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow downward movement
        if (gestureState.dy > 0) {
          searchModalPan.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped down enough or with enough velocity, close the modal
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.timing(searchModalPan, {
            toValue: 500,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setSearchVisible(false);
            searchModalPan.setValue(0);
          });
        } else {
          // Snap back to original position
          Animated.spring(searchModalPan, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;


  const goMenu = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else router.replace("/");
  };

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

  useEffect(() => {
    if (!me) return;

    setLoading(true);

    if (sortMode === "following") {
      // Following feed: fetch posts from people you follow
      const fetchFollowingFeed = async () => {
        try {
          // Get list of users you follow
          const followingSnap = await getDocs(collection(db, "follows", me, "following"));
          const followingUids = followingSnap.docs.map((d) => d.id);

          if (followingUids.length === 0) {
            setPosts([]);
            setLoading(false);
            return;
          }

          // Firestore 'in' queries are limited to 10 items, so batch if needed
          const batches: string[][] = [];
          for (let i = 0; i < followingUids.length; i += 10) {
            batches.push(followingUids.slice(i, i + 10));
          }

          // Fetch posts from each batch
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

          // Sort all posts by createdAt
          allPosts.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });

          setPosts(allPosts.slice(0, 50)); // Limit to 50 total
          setLoading(false);
        } catch (error) {
          console.error("Error fetching following feed:", error);
          setPosts([]);
          setLoading(false);
        }
      };

      fetchFollowingFeed();

      // Set up real-time listener for following feed
      const followingRef = collection(db, "follows", me, "following");
      return onSnapshot(followingRef, () => {
        fetchFollowingFeed(); // Refetch when following list changes
      });
    } else {
      // Recent or Trending feeds
      let q;

      if (sortMode === "recent") {
        q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
      } else {
        // Trending: most engagement first
        q = query(collection(db, "posts"), orderBy("engagementCount", "desc"), orderBy("createdAt", "desc"), limit(50));
      }

      return onSnapshot(q, (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Post[];
        setPosts(rows);
        setLoading(false);
      });
    }
  }, [sortMode, me]);

  // Listen for unread notifications count
  useEffect(() => {
    if (!me) return;

    const q = query(
      collection(db, "notifications", me, "items"),
      where("read", "==", false)
    );

    return onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    });
  }, [me]);

  // Load all notifications when modal opens
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

    // Minimal content filter - only blocks extreme harmful content (violence, illegal, hate speech)
    // Does NOT filter regular profanity - respects free expression
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

      // Extract hashtags and mentions from text
      const hashtags = extractHashtags(trimmed);
      const mentions = extractMentions(trimmed);

      const postData: any = {
        uid: user.uid,
        text: trimmed,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        engagementCount: 0,
        createdAt: serverTimestamp(),
        hashtags: hashtags.length > 0 ? hashtags : [],
        mentions: mentions.length > 0 ? mentions : [],
      };

      // Only add imageUrl if it exists
      if (imageUrl) {
        postData.imageUrl = imageUrl;
      }

      const postRef = await addDoc(collection(db, "posts"), postData);

      // Create notifications for mentioned users
      if (mentions.length > 0) {
        const { createNotification } = await import("../src/lib/notifications");
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const username = userDoc.exists() ? userDoc.data()?.username : "user";

        // Look up each mentioned user and create notification
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
                text: trimmed.substring(0, 100), // Preview of post
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

      // Scroll to top to show the new post
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 500);
    } catch (error: any) {
      console.error("Error creating post:", error);
      Alert.alert("Error", error?.message || "Failed to create post");
    } finally {
      setUploading(false);
    }
  };

  const openMyProfile = () => {
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

    // Navigate based on notification type
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
        return `@${username} liked your post`;
      case "post_comment":
        return `@${username} commented: "${notification.text || "..."}"`;
      case "follow":
        return `@${username} started following you`;
      case "comment_like":
        return `@${username} liked your comment`;
      case "post_repost":
        return `@${username} reposted your post`;
      case "post_mention":
        return `@${username} mentioned you: "${notification.text || "..."}"`;
      default:
        return "New notification";
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

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(notifTime).toLocaleDateString();
  };

  const onRefresh = async () => {
    setRefreshing(true);

    if (sortMode === "following") {
      // Refetch following feed
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
      // For Recent/Trending, the real-time listener handles updates
      // Just wait a moment to show the refresh animation
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setRefreshing(false);
  };

  const loadBookmarks = async () => {
    if (!me) return;

    setLoadingBookmarks(true);
    try {
      const bookmarksSnap = await getDocs(collection(db, "bookmarks", me, "posts"));

      // Use the bookmark data directly (which contains the post snapshot)
      const posts: Post[] = bookmarksSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.postId,
          uid: data.uid,
          text: data.text,
          imageUrl: data.imageUrl,
          createdAt: data.createdAt,
          likeCount: 0, // Will be updated by real-time listener in PostCard
          commentCount: 0,
          repostCount: 0,
          engagementCount: 0,
        } as Post;
      });

      // Sort by bookmarked time (most recent first)
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
      // Get recent posts (last 100)
      const postsSnap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100)));

      // Count hashtag usage
      const hashtagCount: Record<string, number> = {};
      postsSnap.docs.forEach((doc) => {
        const data = doc.data();
        const hashtags = data.hashtags || [];
        hashtags.forEach((tag: string) => {
          hashtagCount[tag] = (hashtagCount[tag] || 0) + 1;
        });
      });

      // Convert to array and sort by count
      const trending = Object.entries(hashtagCount)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10

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
      // Remove @ if present for username search
      const lowerQuery = searchTerm.toLowerCase().replace(/^@/, "");

      // Search users by username
      const usersSnap = await getDocs(collection(db, "users"));
      const matchingUsers = usersSnap.docs
        .map((d) => ({ uid: d.id, ...(d.data() as any) }))
        .filter((u) => u.username?.toLowerCase().includes(lowerQuery))
        .slice(0, 10);

      // Search posts by text content
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]} edges={["top"]}>
      {/* Fixed background image */}
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

      <View style={[styles.wrap, theme.stanPhoto ? { backgroundColor: "transparent" } : { backgroundColor: theme.backgroundColor }]}>
        <View style={styles.topRow}>
          <View style={{ flexDirection: "row", gap: 8, position: "absolute", left: 0 }}>
            <Pressable
              style={[
                styles.menuBtn,
                theme.stanPhoto && styles.menuBtnWithBanner
              ]}
              onPress={goMenu}
            >
              <Text style={[styles.menuText, theme.stanPhoto && styles.menuTextWithBanner]}>‹ Menu</Text>
            </Pressable>

            <Pressable
              style={[
                styles.trendingBtn,
                theme.stanPhoto && styles.trendingBtnWithBanner
              ]}
              onPress={() => {
                loadTrendingHashtags();
                setTrendingVisible(true);
              }}
            >
              <Text style={[styles.trendingIcon, theme.stanPhoto && styles.trendingIconWithBanner]}>#</Text>
            </Pressable>
          </View>

          <Text style={[styles.h1, theme.stanPhoto && styles.h1WithBanner]}>STANSPACE</Text>

          <View style={{ flexDirection: "row", gap: 8, position: "absolute", right: 0 }}>
            <Pressable
              style={[
                styles.bookmarksBtn,
                theme.stanPhoto && styles.bookmarksBtnWithBanner
              ]}
              onPress={() => {
                loadBookmarks();
                setBookmarksVisible(true);
              }}
            >
              <Text style={[styles.bookmarksIcon, theme.stanPhoto && styles.bookmarksIconWithBanner]}>🔖</Text>
            </Pressable>

            <Pressable
              style={[
                styles.notificationsBtn,
                theme.stanPhoto && styles.notificationsBtnWithBanner
              ]}
              onPress={() => setNotificationsVisible(true)}
            >
              <Text style={[styles.notificationsIcon, theme.stanPhoto && styles.notificationsIconWithBanner]}>🔔</Text>
              {unreadCount > 0 && <Text style={styles.notificationsBadge}>{unreadCount}</Text>}
            </Pressable>
          </View>
        </View>

        <View style={styles.feedTabs}>
          <Pressable
            style={[
              styles.feedTab,
              theme.stanPhoto
                ? sortMode === "recent"
                  ? styles.feedTabActiveWithBanner
                  : styles.feedTabWithBanner
                : { borderColor: theme.borderColor },
              !theme.stanPhoto && sortMode === "recent" && styles.feedTabActive,
            ]}
            onPress={() => setSortMode("recent")}
          >
            <Text
              style={[
                styles.feedTabText,
                theme.stanPhoto
                  ? styles.feedTabTextWithBanner
                  : sortMode === "recent" && styles.feedTabTextActive,
              ]}
            >
              Recent
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.feedTab,
              theme.stanPhoto
                ? sortMode === "trending"
                  ? styles.feedTabActiveWithBanner
                  : styles.feedTabWithBanner
                : { borderColor: theme.borderColor },
              !theme.stanPhoto && sortMode === "trending" && styles.feedTabActive,
            ]}
            onPress={() => setSortMode("trending")}
          >
            <Text
              style={[
                styles.feedTabText,
                theme.stanPhoto
                  ? styles.feedTabTextWithBanner
                  : sortMode === "trending" && styles.feedTabTextActive,
              ]}
            >
              Trending
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.feedTab,
              theme.stanPhoto
                ? sortMode === "following"
                  ? styles.feedTabActiveWithBanner
                  : styles.feedTabWithBanner
                : { borderColor: theme.borderColor },
              !theme.stanPhoto && sortMode === "following" && styles.feedTabActive,
            ]}
            onPress={() => setSortMode("following")}
          >
            <Text
              style={[
                styles.feedTabText,
                theme.stanPhoto
                  ? styles.feedTabTextWithBanner
                  : sortMode === "following" && styles.feedTabTextActive,
              ]}
            >
              Following
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={{ paddingBottom: 80 }}>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text
              style={[
                styles.emptyStateTitle,
                theme.stanPhoto && styles.emptyStateTitleWithBanner,
              ]}
            >
              {sortMode === "following" ? "No posts yet" : "No posts to show"}
            </Text>
            <Text
              style={[
                styles.emptyStateText,
                theme.stanPhoto && styles.emptyStateTextWithBanner,
              ]}
            >
              {sortMode === "following"
                ? "You're not following anyone yet.\nTap Search to find people to follow!"
                : sortMode === "trending"
                ? "No trending posts right now.\nBe the first to post something!"
                : "No posts yet.\nTap Post to share something!"}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={posts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingBottom: 80 }}
            renderItem={({ item }) =>
              theme.stanPhoto ? (
                <BlurView
                  intensity={100}
                  tint="light"
                  style={styles.postCardWithBanner}
                >
                  <PostCard
                    post={item}
                    isDarkTheme={false}
                  />
                </BlurView>
              ) : (
                <PostCard post={item} />
              )
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#111"
                colors={["#111"]}
              />
            }
          />
        )}

        <View style={styles.bottomNav}>
          <Pressable style={styles.navBtn} onPress={() => {
            // We're already on stanspace, scroll to top every time
            if (posts.length > 0) {
              flatListRef.current?.scrollToIndex({ index: 0, animated: true });
            }
          }}>
            <Text style={styles.navIcon}>🏠</Text>
            <Text style={styles.navLabel}>Home</Text>
          </Pressable>

          <Pressable style={styles.navBtn} onPress={() => setComposerVisible(true)}>
            <Text style={styles.navIcon}>✎</Text>
            <Text style={styles.navLabel}>Post</Text>
          </Pressable>

          <Pressable style={styles.navBtn} onPress={() => setSearchVisible(true)}>
            <Text style={styles.navIcon}>🔍</Text>
            <Text style={styles.navLabel}>Search</Text>
          </Pressable>

          <Pressable style={styles.navBtn} onPress={openMyProfile}>
            <Text style={styles.navIcon}>👤</Text>
            <Text style={styles.navLabel}>Profile</Text>
          </Pressable>
        </View>

        <Modal visible={composerVisible} animationType="slide" transparent={true}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.modalOverlay}>
                {theme.stanPhoto && (
                  <>
                    <ExpoImage
                      source={theme.stanPhoto}
                      style={styles.modalBackground}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    <View style={styles.modalBackgroundOverlay} />
                  </>
                )}
                <View style={[styles.composerModal, theme.stanPhoto && styles.composerModalWithBanner]}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, theme.stanPhoto && styles.modalTitleWithBanner]}>Create Post</Text>
                    <Pressable onPress={() => setComposerVisible(false)}>
                      <Text style={[styles.modalClose, theme.stanPhoto && styles.modalCloseWithBanner]}>✕</Text>
                    </Pressable>
                  </View>

                  {theme.stanPhoto ? (
                    <BlurView
                      intensity={40}
                      tint={userTheme === "cyberpunk" || userTheme === "retro" || userTheme === "dark" ? "dark" : "light"}
                      style={styles.inputBlur}
                    >
                      <TextInput
                        style={[styles.input, styles.inputWithBanner]}
                        placeholder="Post something…"
                        placeholderTextColor={userTheme === "cyberpunk" || userTheme === "retro" || userTheme === "dark" ? "#ddd" : "#666"}
                        value={text}
                        onChangeText={setText}
                        multiline
                        autoFocus
                      />
                    </BlurView>
                  ) : (
                    <TextInput
                      style={styles.input}
                      placeholder="Post something…"
                      value={text}
                      onChangeText={setText}
                      multiline
                      autoFocus
                    />
                  )}

                  {selectedImage && (
                    <BlurView
                      intensity={40}
                      tint={userTheme === "cyberpunk" || userTheme === "retro" || userTheme === "dark" ? "dark" : "light"}
                      style={styles.imagePreviewBlur}
                    >
                      <View style={styles.imagePreviewContainer}>
                        <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
                        <Pressable style={styles.removeImageBtn} onPress={() => setSelectedImage(null)}>
                          <Text style={styles.removeImageText}>✕</Text>
                        </Pressable>
                      </View>
                    </BlurView>
                  )}

                  <View style={styles.composerActions}>
                    <Pressable style={styles.imageBtn} onPress={pickImage}>
                      <Text style={styles.imageBtnText}>📷 Photo/GIF</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.btn, (!canPost || uploading) && styles.btnDisabled]}
                      onPress={createPost}
                      disabled={!canPost || uploading}
                    >
                      <Text style={styles.btnText}>{uploading ? "Posting..." : "Post"}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={searchVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setSearchVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
            keyboardVerticalOffset={0}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setSearchVisible(false)}>
              {theme.stanPhoto && (
                <>
                  <ExpoImage
                    source={theme.stanPhoto}
                    style={styles.modalBackground}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.modalBackgroundOverlay} />
                </>
              )}
              <Animated.View
                style={[
                  styles.searchModal,
                  theme.stanPhoto && styles.searchModalWithBanner,
                  { transform: [{ translateY: searchModalPan }] },
                ]}
                {...searchPanResponder.panHandlers}
              >
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, theme.stanPhoto && styles.modalTitleWithBanner]}>Search</Text>
                  <Pressable onPress={() => setSearchVisible(false)}>
                    <Text style={[styles.modalClose, theme.stanPhoto && styles.modalCloseWithBanner]}>✕</Text>
                  </Pressable>
                </View>

                <TextInput
                  style={styles.searchInput}
                  placeholder="Search users or posts..."
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    performSearch(text);
                  }}
                  autoFocus
                  returnKeyType="search"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />

                {searching && <ActivityIndicator style={{ marginTop: 20 }} />}

                {!searching && searchQuery.trim() && (
                  <ScrollView
                    style={styles.searchResults}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={true}
                  >
                    {searchResults.users.length > 0 && (
                      <View style={styles.searchSection}>
                        <Text style={styles.searchSectionTitle}>Users</Text>
                        {searchResults.users.map((user) => (
                          <Pressable
                            key={user.uid}
                            style={styles.userResult}
                            onPress={() => {
                              setSearchVisible(false);
                              setSearchQuery("");
                              router.push(`/u/${user.uid}`);
                            }}
                          >
                            <Text style={styles.userResultName}>@{user.username}</Text>
                            {user.bio && <Text style={styles.userResultBio}>{user.bio}</Text>}
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {searchResults.posts.length > 0 && (
                      <View style={styles.searchSection}>
                        <Text style={styles.searchSectionTitle}>Posts</Text>
                        {searchResults.posts.map((post) => (
                          <Pressable
                            key={post.id}
                            style={styles.postResult}
                            onPress={() => {
                              setSearchVisible(false);
                              setSearchQuery("");
                              router.push({
                                pathname: "/post",
                                params: {
                                  postId: post.id,
                                  text: post.text,
                                  imageUrl: post.imageUrl || "",
                                },
                              });
                            }}
                          >
                            <Text style={styles.postResultText} numberOfLines={2}>
                              {post.text}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {searchResults.users.length === 0 && searchResults.posts.length === 0 && (
                      <Text style={styles.noResults}>No results found</Text>
                    )}
                  </ScrollView>
                )}
              </Animated.View>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        <Modal visible={notificationsVisible} animationType="slide" transparent={true} onRequestClose={() => setNotificationsVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setNotificationsVisible(false)}>
            {theme.stanPhoto && (
              <>
                <ExpoImage
                  source={theme.stanPhoto}
                  style={styles.modalBackground}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View style={styles.modalBackgroundOverlay} />
              </>
            )}
            <View style={[styles.notificationsModal, theme.stanPhoto && styles.notificationsModalWithBanner]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, theme.stanPhoto && styles.modalTitleWithBanner]}>Notifications</Text>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  {unreadCount > 0 && (
                    <Pressable onPress={markAllAsRead}>
                      <Text style={[styles.markAllRead, theme.stanPhoto && styles.markAllReadWithBanner]}>Mark all read</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setNotificationsVisible(false)}>
                    <Text style={[styles.modalClose, theme.stanPhoto && styles.modalCloseWithBanner]}>✕</Text>
                  </Pressable>
                </View>
              </View>

              <ScrollView style={styles.notificationsList} showsVerticalScrollIndicator={true}>
                {notifications.length === 0 ? (
                  <Text style={styles.noNotifications}>No notifications yet</Text>
                ) : (
                  notifications.map((notification) => (
                    <Pressable
                      key={notification.id}
                      style={[styles.notificationItem, !notification.read && styles.notificationItemUnread]}
                      onPress={() => handleNotificationClick(notification)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.notificationText}>{getNotificationText(notification)}</Text>
                        <Text style={styles.notificationTime}>{getTimeAgo(notification.createdAt)}</Text>
                      </View>
                      {!notification.read && <View style={styles.unreadDot} />}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        <Modal visible={bookmarksVisible} animationType="slide" transparent={true} onRequestClose={() => setBookmarksVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setBookmarksVisible(false)}>
            {theme.stanPhoto && (
              <>
                <ExpoImage
                  source={theme.stanPhoto}
                  style={styles.modalBackground}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View style={styles.modalBackgroundOverlay} />
              </>
            )}
            <View style={[styles.bookmarksModal, theme.stanPhoto && styles.bookmarksModalWithBanner]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, theme.stanPhoto && styles.modalTitleWithBanner]}>Bookmarks</Text>
                <Pressable onPress={() => setBookmarksVisible(false)}>
                  <Text style={[styles.modalClose, theme.stanPhoto && styles.modalCloseWithBanner]}>✕</Text>
                </Pressable>
              </View>

              {loadingBookmarks ? (
                <ActivityIndicator style={{ marginTop: 20 }} />
              ) : (
                <ScrollView style={styles.bookmarksList} showsVerticalScrollIndicator={true}>
                  {bookmarkedPosts.length === 0 ? (
                    <Text style={styles.noBookmarks}>No bookmarks yet</Text>
                  ) : (
                    bookmarkedPosts.map((post) => (
                      <View key={post.id} style={{ marginBottom: 10 }}>
                        {theme.stanPhoto ? (
                          <BlurView
                            intensity={50}
                            tint={userTheme === "cyberpunk" || userTheme === "retro" || userTheme === "dark" ? "dark" : "light"}
                            style={styles.postCardWithBanner}
                          >
                            <PostCard
                              post={post}
                              isDarkTheme={userTheme === "cyberpunk" || userTheme === "retro" || userTheme === "dark"}
                            />
                          </BlurView>
                        ) : (
                          <PostCard post={post} />
                        )}
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </View>
          </Pressable>
        </Modal>

        <Modal visible={trendingVisible} animationType="slide" transparent={true} onRequestClose={() => setTrendingVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setTrendingVisible(false)}>
            {theme.stanPhoto && (
              <>
                <ExpoImage
                  source={theme.stanPhoto}
                  style={styles.modalBackground}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View style={styles.modalBackgroundOverlay} />
              </>
            )}
            <View style={[styles.trendingModal, theme.stanPhoto && styles.trendingModalWithBanner]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, theme.stanPhoto && styles.modalTitleWithBanner]}>Trending Hashtags</Text>
                <Pressable onPress={() => setTrendingVisible(false)}>
                  <Text style={[styles.modalClose, theme.stanPhoto && styles.modalCloseWithBanner]}>✕</Text>
                </Pressable>
              </View>

              {loadingTrending ? (
                <ActivityIndicator style={{ marginTop: 20 }} />
              ) : (
                <ScrollView style={styles.trendingList} showsVerticalScrollIndicator={true}>
                  {trendingHashtags.length === 0 ? (
                    <Text style={styles.noTrending}>No trending hashtags yet</Text>
                  ) : (
                    trendingHashtags.map((item, index) => (
                      <Pressable
                        key={item.tag}
                        style={styles.trendingItem}
                        onPress={() => {
                          setTrendingVisible(false);
                          router.push({ pathname: "/hashtag", params: { tag: item.tag } });
                        }}
                      >
                        <View style={styles.trendingRank}>
                          <Text style={styles.trendingRankText}>{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.trendingTag}>#{item.tag}</Text>
                          <Text style={styles.trendingCount}>
                            {item.count} {item.count === 1 ? "post" : "posts"}
                          </Text>
                        </View>
                        <Text style={styles.trendingArrow}>›</Text>
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
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { flex: 1, padding: 16, backgroundColor: "#fff" },

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
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },

  postCardWithBanner: {
    borderRadius: 16,
    padding: 8,
    marginBottom: 10,
    overflow: "hidden",
  },

  topRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 12, position: "relative" },
  h1: { fontSize: 22, fontWeight: "900", color: "#111", textAlign: "center" },
  h1WithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },

  feedTabs: { flexDirection: "row", gap: 8, marginBottom: 14 },
  feedTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  feedTabActive: { backgroundColor: "#111" },
  feedTabText: { fontWeight: "900", color: "#111", fontSize: 13 },
  feedTabTextActive: { color: "#fff" },
  feedTabWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.5)",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  feedTabActiveWithBanner: {
    borderColor: "#fff",
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  feedTabTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  menuBtn: { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: "#111", borderRadius: 999 },
  menuBtnWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  menuText: { fontWeight: "900", color: "#111" },
  menuTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  trendingBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 999,
  },
  trendingBtnWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  trendingIcon: { fontSize: 20, fontWeight: "900", color: "#111" },
  trendingIconWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111",
    marginBottom: 12,
  },
  emptyStateTitleWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyStateTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  bookmarksBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 999,
  },
  bookmarksBtnWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  bookmarksIcon: { fontWeight: "900", fontSize: 16 },
  bookmarksIconWithBanner: {
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  notificationsBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  notificationsBtnWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  notificationsIcon: { fontWeight: "900", fontSize: 16 },
  notificationsIconWithBanner: {
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  notificationsBadge: {
    color: "#ff0000",
    fontWeight: "900",
    fontSize: 14,
  },

  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#111",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  navBtn: { flex: 1, alignItems: "center", gap: 4, justifyContent: "center" },
  navIcon: { fontSize: 24 },
  navLabel: { fontSize: 11, fontWeight: "900", color: "#111" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  modalBackgroundOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  composerModal: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  composerModalWithBanner: {
    backgroundColor: "transparent",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#111" },
  modalTitleWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  modalClose: { fontSize: 24, fontWeight: "900", color: "#111" },
  modalCloseWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  input: { minHeight: 70, borderWidth: 1, borderColor: "#111", borderRadius: 12, padding: 12, textAlignVertical: "top" },
  inputBlur: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  inputWithBanner: {
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "#111",
  },
  imagePreviewBlur: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  composerActions: { flexDirection: "row", gap: 10 },
  imageBtn: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#111", padding: 12, borderRadius: 12, alignItems: "center" },
  imageBtnText: { color: "#111", fontWeight: "900" },
  btn: { flex: 1, backgroundColor: "#111", padding: 12, borderRadius: 12, alignItems: "center" },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: "#fff", fontWeight: "900" },

  imagePreviewContainer: { position: "relative", width: "100%", height: 200, borderRadius: 12, overflow: "hidden" },
  imagePreview: { width: "100%", height: "100%", borderRadius: 12 },
  removeImageBtn: { position: "absolute", top: 8, right: 8, backgroundColor: "#111", width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  removeImageText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  searchModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: "80%",
  },
  searchModalWithBanner: {
    backgroundColor: "transparent",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  searchResults: {
    flex: 1,
    marginBottom: 20,
  },
  searchSection: { marginBottom: 20 },
  searchSectionTitle: { fontSize: 14, fontWeight: "900", color: "#666", marginBottom: 8 },
  userResult: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    marginBottom: 8,
  },
  userResultName: { fontSize: 16, fontWeight: "900", color: "#111" },
  userResultBio: { fontSize: 13, color: "#666", marginTop: 4 },
  postResult: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    marginBottom: 8,
  },
  postResultText: { fontSize: 14, color: "#111" },
  noResults: { textAlign: "center", color: "#999", marginTop: 20, fontSize: 14 },

  notificationsModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: "80%",
  },
  notificationsModalWithBanner: {
    backgroundColor: "transparent",
  },
  notificationsList: {
    flex: 1,
    marginBottom: 20,
  },
  markAllRead: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    opacity: 0.7,
  },
  markAllReadWithBanner: {
    color: "#fff",
    opacity: 1,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  noNotifications: {
    textAlign: "center",
    color: "#999",
    marginTop: 40,
    fontSize: 14,
  },

  bookmarksModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: "80%",
  },
  bookmarksModalWithBanner: {
    backgroundColor: "transparent",
  },
  bookmarksList: {
    flex: 1,
    marginBottom: 20,
  },
  noBookmarks: {
    textAlign: "center",
    color: "#999",
    marginTop: 40,
    fontSize: 14,
  },

  trendingModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: "70%",
  },
  trendingModalWithBanner: {
    backgroundColor: "transparent",
  },
  trendingList: {
    flex: 1,
    marginTop: 10,
  },
  noTrending: {
    textAlign: "center",
    color: "#999",
    marginTop: 40,
    fontSize: 14,
  },
  trendingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  trendingRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
  },
  trendingRankText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
  trendingTag: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
    marginBottom: 2,
  },
  trendingCount: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  trendingArrow: {
    fontSize: 24,
    color: "#111",
    fontWeight: "900",
  },

  notificationItem: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  notificationItemUnread: {
    borderColor: "#111",
    backgroundColor: "#f9f9f9",
  },
  notificationText: {
    fontSize: 14,
    color: "#111",
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: "#999",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff0000",
  },
});
