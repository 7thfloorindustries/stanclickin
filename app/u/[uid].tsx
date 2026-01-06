import React, { useEffect, useMemo, useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, Alert, Modal, TextInput, ActivityIndicator, ScrollView, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Platform, RefreshControl, ActionSheetIOS, Image as RNImage, PanResponder, Animated } from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  doc,
  getDoc,
  getCountFromServer,
  orderBy,
  query,
  where,
  onSnapshot,
  writeBatch,
  getDocs,
  limit,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, storage } from "../../src/lib/firebase";
import { PostCard, type Post } from "../../components/PostCard";
import { Avatar } from "../../components/Avatar";
import { createNotification } from "../../src/lib/notifications";
import { PostSkeleton } from "../../components/PostSkeleton";
import { ThemeSelector } from "../../components/ThemeSelector";
import { type ThemeId, getTheme, themes } from "../../src/lib/themes";

export default function Profile() {
  const navigation = useNavigation<any>();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const profileUid = uid;

  const me = auth.currentUser?.uid;
  const isMe = useMemo(() => !!me && me === profileUid, [me, profileUid]);

  const [username, setUsername] = useState<string>("…");
  const [bio, setBio] = useState<string>("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [followers, setFollowers] = useState<number>(0);
  const [following, setFollowing] = useState<number>(0);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<"all" | "text" | "media">("all");
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ users: any[]; posts: Post[] }>({ users: [], posts: [] });
  const [searching, setSearching] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followListVisible, setFollowListVisible] = useState(false);
  const [followListType, setFollowListType] = useState<"followers" | "following">("followers");
  const [followList, setFollowList] = useState<any[]>([]);
  const [loadingFollowList, setLoadingFollowList] = useState(false);
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null);
  const [themeSelectorVisible, setThemeSelectorVisible] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);
  const [text, setText] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const theme = getTheme(userTheme);
  const canPost = useMemo(() => text.trim().length > 0 || selectedImage !== null, [text, selectedImage]);

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

  // ✅ Correct back animation when possible; safe fallback when not
  const goBack = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else router.replace("/stanspace");
  };

  const loadUserData = async () => {
    if (!profileUid) return;
    const snap = await getDoc(doc(db, "users", profileUid));
    if (snap.exists()) {
      const data = snap.data() as any;
      setUsername(data?.username || "user");
      setProfilePicture(data?.profilePictureUrl || null);
      setBio(data?.bio || "");
      setUserTheme(data?.theme || null);
    } else {
      setUsername("user");
    }
  };

  useEffect(() => {
    loadUserData();
  }, [profileUid]);

  // Reload user data when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadUserData();
    });
    return unsubscribe;
  }, [navigation, profileUid]);

  useEffect(() => {
    if (!profileUid) return;
    setLoadingPosts(true);

    const loadPostsAndReposts = async () => {
      try {
        // Fetch user's own posts
        const postsQuery = query(collection(db, "posts"), where("uid", "==", profileUid), orderBy("createdAt", "desc"));
        const postsSnap = await getDocs(postsQuery);
        const userPosts = postsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Post[];

        // Fetch all posts to check for reposts (inefficient but works for MVP)
        // In production, you'd want a better data structure for this
        const allPostsSnap = await getDocs(collection(db, "posts"));
        const repostedPosts: Post[] = [];

        for (const postDoc of allPostsSnap.docs) {
          const repostDoc = await getDoc(doc(db, "posts", postDoc.id, "reposts", profileUid));
          if (repostDoc.exists()) {
            const post = { id: postDoc.id, ...(postDoc.data() as any) } as Post;
            // Skip if user is reposting their own post (already in userPosts)
            if (post.uid === profileUid) continue;
            // Add repost metadata
            post.repostedBy = username;
            post.repostedByUid = profileUid;
            repostedPosts.push(post);
          }
        }

        // Merge and sort by creation time
        const allPosts = [...userPosts, ...repostedPosts];

        // Remove duplicates by ID (in case of any data inconsistencies)
        const uniquePosts = allPosts.filter((post, index, self) =>
          index === self.findIndex((p) => p.id === post.id)
        );

        uniquePosts.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setPosts(uniquePosts);
        setLoadingPosts(false);
      } catch (error) {
        console.error("Error loading posts and reposts:", error);
        setLoadingPosts(false);
      }
    };

    loadPostsAndReposts();
  }, [profileUid, username]);

  const refreshCounts = async () => {
    if (!profileUid) return;
    const followersCol = collection(db, "follows", profileUid, "followers");
    const followingCol = collection(db, "follows", profileUid, "following");
    const [f1, f2] = await Promise.all([getCountFromServer(followersCol), getCountFromServer(followingCol)]);
    setFollowers(f1.data().count);
    setFollowing(f2.data().count);
  };

  useEffect(() => {
    refreshCounts();
  }, [profileUid]);

  useEffect(() => {
    if (!me || !profileUid || isMe) return;
    const ref = doc(db, "follows", me, "following", profileUid);
    return onSnapshot(ref, (snap) => setIsFollowing(snap.exists()));
  }, [me, profileUid, isMe]);

  // Listen to block state
  useEffect(() => {
    if (!me || !profileUid || isMe) return;
    const blockRef = doc(db, "blocks", me, "blocked", profileUid);
    return onSnapshot(blockRef, (snap) => setIsBlocked(snap.exists()));
  }, [me, profileUid, isMe]);

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

    setUploading(true);
    try {
      let imageUrl: string | undefined;

      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
      }

      const postData: any = {
        uid: user.uid,
        text: trimmed,
        likeCount: 0,
        commentCount: 0,
        engagementCount: 0,
        createdAt: serverTimestamp(),
      };

      if (imageUrl) {
        postData.imageUrl = imageUrl;
      }

      await addDoc(collection(db, "posts"), postData);

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

      // Determine if it's an upload error or post creation error
      const isUploadError = error?.message?.includes("storage") || error?.message?.includes("upload");
      const errorTitle = isUploadError ? "Image Upload Failed" : "Post Failed";
      const errorMessage = isUploadError
        ? "Failed to upload image. Your text and image are saved. Check your connection and try again."
        : (error?.message || "Failed to create post. Your content is saved. Please try again.");

      // Show error with retry option - DON'T clear content!
      Alert.alert(
        errorTitle,
        errorMessage,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              // Keep composer open with content intact
            }
          },
          {
            text: "Retry",
            onPress: () => {
              // Retry immediately
              createPost();
            }
          }
        ]
      );
    } finally {
      setUploading(false);
    }
  };

  const toggleFollow = async () => {
    if (!me) return Alert.alert("Not logged in");
    if (!profileUid) return;
    if (isMe) return;

    const batch = writeBatch(db);
    const myFollowingRef = doc(db, "follows", me, "following", profileUid);
    const theirFollowersRef = doc(db, "follows", profileUid, "followers", me);

    const willFollow = !isFollowing;

    if (isFollowing) {
      batch.delete(myFollowingRef);
      batch.delete(theirFollowersRef);
    } else {
      batch.set(myFollowingRef, { uid: profileUid, createdAt: Date.now() });
      batch.set(theirFollowersRef, { uid: me, createdAt: Date.now() });
    }

    await batch.commit();
    refreshCounts();

    // Create notification for new follows
    if (willFollow) {
      const userDoc = await getDoc(doc(db, "users", me));
      const myUsername = userDoc.exists() ? userDoc.data()?.username : "user";

      await createNotification({
        recipientUid: profileUid,
        type: "follow",
        fromUid: me,
        fromUsername: myUsername,
      });
    }
  };

  const toggleBlock = async () => {
    if (!me) return Alert.alert("Not logged in");
    if (!profileUid) return;
    if (isMe) return;

    const willBlock = !isBlocked;

    Alert.alert(
      willBlock ? "Block user?" : "Unblock user?",
      willBlock
        ? `@${username} will no longer be able to see your posts or interact with you.`
        : `@${username} will be able to see your posts and interact with you again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: willBlock ? "Block" : "Unblock",
          style: willBlock ? "destructive" : "default",
          onPress: async () => {
            try {
              const batch = writeBatch(db);
              const myBlockRef = doc(db, "blocks", me, "blocked", profileUid);

              if (isBlocked) {
                // Unblock: remove block document
                batch.delete(myBlockRef);
              } else {
                // Block: add block document and also unfollow
                batch.set(myBlockRef, { uid: profileUid, createdAt: Date.now() });

                // Also unfollow if currently following
                if (isFollowing) {
                  const myFollowingRef = doc(db, "follows", me, "following", profileUid);
                  const theirFollowersRef = doc(db, "follows", profileUid, "followers", me);
                  batch.delete(myFollowingRef);
                  batch.delete(theirFollowersRef);
                }
              }

              await batch.commit();

              if (!isBlocked) {
                Alert.alert("Blocked", `You've blocked @${username}`);
              }
            } catch (error) {
              console.error("Error toggling block:", error);
              Alert.alert("Error", "Failed to update block status");
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);

    // Refresh counts
    await refreshCounts();

    // Posts are already real-time with listener, just show the animation
    await new Promise((resolve) => setTimeout(resolve, 500));

    setRefreshing(false);
  };

  const loadFollowList = async (type: "followers" | "following") => {
    if (!profileUid) return;

    setLoadingFollowList(true);
    setFollowListType(type);
    setFollowListVisible(true);

    try {
      const collectionPath = type === "followers"
        ? collection(db, "follows", profileUid, "followers")
        : collection(db, "follows", profileUid, "following");

      const snapshot = await getDocs(collectionPath);
      const uids = snapshot.docs.map((d) => d.id);

      // Remove duplicates
      const uniqueUids = [...new Set(uids)];

      // Fetch user details for each uid
      const userDetails = await Promise.all(
        uniqueUids.map(async (uid) => {
          const userDoc = await getDoc(doc(db, "users", uid));
          if (userDoc.exists()) {
            return { uid, ...userDoc.data() };
          }
          return null;
        })
      );

      setFollowList(userDetails.filter((u) => u !== null));
    } catch (error) {
      console.error("Error loading follow list:", error);
      setFollowList([]);
    } finally {
      setLoadingFollowList(false);
    }
  };

  const handleThemeSelect = async (themeId: ThemeId) => {
    if (!me) return;

    // Optimistic update - change theme immediately
    const previousTheme = userTheme;
    setUserTheme(themeId);

    // Save to Firestore in background
    try {
      await import("firebase/firestore").then((m) =>
        m.updateDoc(doc(db, "users", me), { theme: themeId })
      );
    } catch (error) {
      console.error("Error updating theme:", error);
      // Revert on error
      setUserTheme(previousTheme);
      Alert.alert("Error", "Failed to update theme");
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

  const filteredPosts = useMemo(() => {
    if (filter === "all") return posts;
    if (filter === "text") return posts.filter((p) => !p.imageUrl);
    if (filter === "media") return posts.filter((p) => p.imageUrl);
    return posts;
  }, [posts, filter]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]} edges={["top"]}>
      {/* Fixed background image */}
      {theme.stanPhoto && (
        <>
          <Image
            source={theme.stanPhoto}
            style={styles.fixedBackground}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
          />
          <View style={styles.fixedBackgroundOverlay} />
        </>
      )}

      <View style={[styles.wrap, !theme.stanPhoto && { backgroundColor: theme.backgroundColor }]}>
        <View style={styles.nav}>
          <Pressable
            style={[
              styles.backBtn,
              theme.stanPhoto
                ? styles.backBtnWithBanner
                : { borderColor: theme.borderColor }
            ]}
            onPress={goBack}
          >
            <Text style={[styles.backText, theme.stanPhoto ? styles.backTextWithBanner : { color: theme.textColor }]}>
              ‹ Back
            </Text>
          </Pressable>

          {isMe && (
            <Pressable
              style={[
                styles.settingsBtn,
                theme.stanPhoto
                  ? styles.settingsBtnWithBanner
                  : { borderColor: theme.borderColor }
              ]}
              onPress={() => {
                const options = ["Settings", "Choose Theme", "Cancel"];
                const cancelButtonIndex = 2;

                if (Platform.OS === "ios") {
                  ActionSheetIOS.showActionSheetWithOptions(
                    { options, cancelButtonIndex },
                    (buttonIndex) => {
                      if (buttonIndex === 0) router.push("/settings");
                      if (buttonIndex === 1) setThemeSelectorVisible(true);
                    }
                  );
                } else {
                  Alert.alert("Profile Settings", "Choose an option", [
                    { text: "Settings", onPress: () => router.push("/settings") },
                    { text: "Choose Theme", onPress: () => setThemeSelectorVisible(true) },
                    { text: "Cancel", style: "cancel" },
                  ]);
                }
              }}
            >
              <Text style={[styles.settingsText, theme.stanPhoto ? styles.settingsTextWithBanner : { color: theme.textColor }]}>
                ⚙️
              </Text>
            </Pressable>
          )}

          {!isMe && (
            <Pressable
              style={[
                styles.settingsBtn,
                theme.stanPhoto
                  ? styles.settingsBtnWithBanner
                  : { borderColor: theme.borderColor }
              ]}
              onPress={() => {
                const options = [isBlocked ? "Unblock" : "Block", "Cancel"];
                const cancelButtonIndex = 1;
                const destructiveButtonIndex = isBlocked ? undefined : 0;

                if (Platform.OS === "ios") {
                  ActionSheetIOS.showActionSheetWithOptions(
                    { options, cancelButtonIndex, destructiveButtonIndex },
                    (buttonIndex) => {
                      if (buttonIndex === 0) toggleBlock();
                    }
                  );
                } else {
                  Alert.alert(`@${username}`, "Choose an option", [
                    { text: isBlocked ? "Unblock" : "Block", onPress: toggleBlock, style: isBlocked ? "default" : "destructive" },
                    { text: "Cancel", style: "cancel" },
                  ]);
                }
              }}
            >
              <Text style={[styles.settingsText, theme.stanPhoto ? styles.settingsTextWithBanner : { color: theme.textColor }]}>
                ⋯
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.profileSection}>
          <View style={styles.profileContent}>
            <Avatar imageUrl={profilePicture} username={username} size={100} />
            <View style={styles.profileInfo}>
              <Text style={[styles.handle, theme.stanPhoto ? styles.handleWithBanner : { color: theme.textColor }]}>
                @{username}
              </Text>
              {bio ? (
                <Text style={[styles.bio, theme.stanPhoto ? styles.bioWithBanner : { color: theme.secondaryTextColor }]}>
                  {bio}
                </Text>
              ) : null}
              {!isMe && !isBlocked && (
                <Pressable
                  style={[
                    styles.followBtn,
                    isFollowing
                      ? { backgroundColor: theme.primaryColor, borderColor: theme.primaryColor }
                      : { backgroundColor: `${theme.primaryColor}15`, borderColor: theme.primaryColor, borderWidth: 2 },
                  ]}
                  onPress={toggleFollow}
                >
                  <Text style={[styles.followText, { color: isFollowing ? "#fff" : theme.primaryColor, fontWeight: "700" }]}>
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                </Pressable>
              )}
              {!isMe && isBlocked && (
                <Text style={[styles.blockedIndicator, theme.stanPhoto && styles.blockedIndicatorWithBanner]}>
                  Blocked
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.stats}>
          <Pressable style={styles.statBox} onPress={() => loadFollowList("followers")}>
            <Text style={[styles.statNum, theme.stanPhoto ? styles.statNumWithBanner : { color: theme.textColor }]}>
              {followers}
            </Text>
            <Text style={[styles.statLabel, theme.stanPhoto ? styles.statLabelWithBanner : { color: theme.secondaryTextColor }]}>
              Followers
            </Text>
          </Pressable>
          <Pressable style={styles.statBox} onPress={() => loadFollowList("following")}>
            <Text style={[styles.statNum, theme.stanPhoto ? styles.statNumWithBanner : { color: theme.textColor }]}>
              {following}
            </Text>
            <Text style={[styles.statLabel, theme.stanPhoto ? styles.statLabelWithBanner : { color: theme.secondaryTextColor }]}>
              Following
            </Text>
          </Pressable>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, theme.stanPhoto ? styles.statNumWithBanner : { color: theme.textColor }]}>
              {posts.length}
            </Text>
            <Text style={[styles.statLabel, theme.stanPhoto ? styles.statLabelWithBanner : { color: theme.secondaryTextColor }]}>
              Posts
            </Text>
          </View>
        </View>

        <View style={styles.filterTabs}>
          <Pressable
            style={[
              styles.filterTab,
              theme.stanPhoto
                ? filter === "all"
                  ? styles.filterTabActiveWithBanner
                  : styles.filterTabWithBanner
                : { borderColor: theme.borderColor },
              !theme.stanPhoto && filter === "all" && { backgroundColor: theme.primaryColor, borderColor: theme.primaryColor },
            ]}
            onPress={() => setFilter("all")}
          >
            <Text
              style={[
                styles.filterTabText,
                theme.stanPhoto
                  ? styles.filterTabTextWithBanner
                  : { color: filter === "all" ? "#fff" : theme.textColor },
              ]}
            >
              All
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.filterTab,
              theme.stanPhoto
                ? filter === "text"
                  ? styles.filterTabActiveWithBanner
                  : styles.filterTabWithBanner
                : { borderColor: theme.borderColor },
              !theme.stanPhoto && filter === "text" && { backgroundColor: theme.primaryColor, borderColor: theme.primaryColor },
            ]}
            onPress={() => setFilter("text")}
          >
            <Text
              style={[
                styles.filterTabText,
                theme.stanPhoto
                  ? styles.filterTabTextWithBanner
                  : { color: filter === "text" ? "#fff" : theme.textColor },
              ]}
            >
              Text
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.filterTab,
              theme.stanPhoto
                ? filter === "media"
                  ? styles.filterTabActiveWithBanner
                  : styles.filterTabWithBanner
                : { borderColor: theme.borderColor },
              !theme.stanPhoto && filter === "media" && { backgroundColor: theme.primaryColor, borderColor: theme.primaryColor },
            ]}
            onPress={() => setFilter("media")}
          >
            <Text
              style={[
                styles.filterTabText,
                theme.stanPhoto
                  ? styles.filterTabTextWithBanner
                  : { color: filter === "media" ? "#fff" : theme.textColor },
              ]}
            >
              Media
            </Text>
          </Pressable>
        </View>

        {loadingPosts ? (
          <View style={{ paddingBottom: 80 }}>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </View>
        ) : filteredPosts.length === 0 ? (
          <View style={styles.emptyPosts}>
            <Text
              style={[
                styles.emptyPostsTitle,
                theme.stanPhoto && {
                  color: "#fff",
                  textShadowColor: "rgba(0, 0, 0, 0.9)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 8,
                },
              ]}
            >
              {isMe ? "You haven't posted yet" : `@${username} hasn't posted yet`}
            </Text>
            <Text
              style={[
                styles.emptyPostsText,
                theme.stanPhoto && {
                  color: "#fff",
                  textShadowColor: "rgba(0, 0, 0, 0.9)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 6,
                },
              ]}
            >
              {isMe ? "Tap the Post button below to share something!" : "Check back later for new posts"}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={filteredPosts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingBottom: 80 }}
            renderItem={({ item }) =>
              theme.stanPhoto ? (
                <BlurView
                  intensity={80}
                  tint={userTheme === "cyberpunk" || userTheme === "retro" || userTheme === "dark" ? "dark" : "light"}
                  style={styles.postCardWithBanner}
                >
                  <PostCard
                    post={item}
                    username={username}
                    isDarkTheme={userTheme === "cyberpunk" || userTheme === "retro" || userTheme === "dark"}
                  />
                </BlurView>
              ) : (
                <PostCard post={item} username={username} />
              )
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#111" colors={["#111"]} />
            }
          />
        )}

        <View style={styles.bottomNav}>
          <Pressable style={styles.navBtn} onPress={() => {
            if (navigation?.canGoBack?.()) {
              navigation.goBack();
            } else {
              router.replace("/stanspace");
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

          <Pressable style={styles.navBtn} onPress={() => {
            if (me && profileUid !== me) {
              // Navigate to our profile if viewing someone else's
              router.push(`/u/${me}`);
            } else if (filteredPosts.length > 0) {
              // Already on our profile, scroll to top
              flatListRef.current?.scrollToIndex({ index: 0, animated: true });
            }
          }}>
            <Text style={styles.navIcon}>👤</Text>
            <Text style={styles.navLabel}>Profile</Text>
          </Pressable>
        </View>

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
                  <Image
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

        <Modal visible={followListVisible} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.followListModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {followListType === "followers" ? "Followers" : "Following"}
                </Text>
                <Pressable onPress={() => setFollowListVisible(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </Pressable>
              </View>

              {loadingFollowList ? (
                <ActivityIndicator style={{ marginTop: 20 }} />
              ) : followList.length === 0 ? (
                <Text style={styles.noResults}>
                  {followListType === "followers"
                    ? "No followers yet"
                    : "Not following anyone yet"}
                </Text>
              ) : (
                <ScrollView style={styles.followListScroll} showsVerticalScrollIndicator={true}>
                  {followList.map((user) => (
                    <Pressable
                      key={user.uid}
                      style={styles.followListItem}
                      onPress={() => {
                        setFollowListVisible(false);
                        router.push(`/u/${user.uid}`);
                      }}
                    >
                      <Avatar
                        imageUrl={user.profilePictureUrl}
                        username={user.username}
                        size={44}
                      />
                      <View style={styles.followListInfo}>
                        <Text style={styles.followListName}>@{user.username}</Text>
                        {user.bio && <Text style={styles.followListBio} numberOfLines={1}>{user.bio}</Text>}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        <Modal visible={composerVisible} animationType="slide" transparent={true}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.modalOverlay}>
                {theme.stanPhoto && (
                  <>
                    <Image
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
                        <RNImage source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
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

        <ThemeSelector
          visible={themeSelectorVisible}
          currentTheme={userTheme || "minimalist"}
          onClose={() => setThemeSelectorVisible(false)}
          onSelectTheme={handleThemeSelect}
        />
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
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },

  nav: { marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  backBtnWithBanner: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  backText: { fontWeight: "900" },
  backTextWithBanner: { fontWeight: "900", color: "#ffffff" },

  settingsBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  settingsBtnWithBanner: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  settingsText: { fontWeight: "900", fontSize: 18 },
  settingsTextWithBanner: { fontWeight: "900", fontSize: 18 },

  profileSection: {
    marginBottom: 0,
    borderRadius: 16,
    overflow: "hidden",
  },
  profileContent: { flexDirection: "row", gap: 16, alignItems: "flex-start", padding: 16, paddingBottom: 8 },
  profileInfo: { flex: 1, gap: 8 },
  handle: { fontSize: 22, fontWeight: "900" },
  handleWithBanner: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  bio: { fontSize: 14, lineHeight: 20 },
  bioWithBanner: {
    fontSize: 14,
    lineHeight: 20,
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  followBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  followText: { fontWeight: "900" },

  blockedIndicator: {
    fontSize: 14,
    fontWeight: "900",
    color: "#999",
    paddingVertical: 10,
  },
  blockedIndicatorWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  sectionWithBanner: {
    borderRadius: 16,
    padding: 16,
    overflow: "hidden",
  },

  stats: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  statBox: { flex: 1, alignItems: "center" },
  statNum: { fontWeight: "900", fontSize: 18 },
  statNumWithBanner: {
    fontWeight: "900",
    fontSize: 18,
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  statLabel: { opacity: 0.6 },
  statLabelWithBanner: {
    opacity: 1,
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  filterTabs: { flexDirection: "row", gap: 8, marginBottom: 16 },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
  },
  filterTabWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.5)",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  filterTabActiveWithBanner: {
    borderColor: "#fff",
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  filterTabText: { fontWeight: "900", fontSize: 14 },
  filterTabTextWithBanner: {
    fontWeight: "900",
    fontSize: 14,
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#111" },
  modalClose: { fontSize: 24, fontWeight: "900", color: "#111" },
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

  postCardWithBanner: {
    borderRadius: 16,
    padding: 8,
    marginBottom: 10,
    overflow: "hidden",
  },

  emptyPosts: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: 60,
    paddingBottom: 100,
  },
  emptyPostsTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
    marginBottom: 10,
    textAlign: "center",
  },
  emptyPostsText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },

  followListModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: "80%",
  },
  followListScroll: {
    flex: 1,
    marginTop: 10,
  },
  followListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    marginBottom: 8,
  },
  followListInfo: {
    flex: 1,
  },
  followListName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111",
  },
  followListBio: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Composer modal styles
  composerModal: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  composerModalWithBanner: { backgroundColor: "transparent" },
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
  modalTitleWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
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
  imagePreviewContainer: { position: "relative", width: "100%", height: 200, borderRadius: 12, overflow: "hidden" },
  imagePreview: { width: "100%", height: "100%", borderRadius: 12 },
  imagePreviewBlur: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  removeImageBtn: { position: "absolute", top: 8, right: 8, backgroundColor: "#111", width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  removeImageText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  composerActions: { flexDirection: "row", gap: 10 },
  imageBtn: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#111", padding: 12, borderRadius: 12, alignItems: "center" },
  imageBtnText: { color: "#111", fontWeight: "900" },
  btn: { flex: 1, backgroundColor: "#111", padding: 12, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  btnDisabled: { opacity: 0.35 },
});
