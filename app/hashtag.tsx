import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { collection, query, where, getDocs, onSnapshot, doc } from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";
import { PostCard, type Post } from "../components/PostCard";
import { PostSkeleton } from "../components/PostSkeleton";
import { type ThemeId, getTheme } from "../src/lib/themes";
import { BlurView } from "expo-blur";

export default function HashtagFeed() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const hashtag = tag?.toLowerCase() || "";

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null);

  const me = auth.currentUser?.uid;
  const theme = getTheme(userTheme);

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

  // Load posts with this hashtag
  useEffect(() => {
    if (!hashtag) return;

    setLoading(true);

    const loadPosts = async () => {
      try {
        // Query posts that contain this hashtag
        const q = query(
          collection(db, "posts"),
          where("hashtags", "array-contains", hashtag)
        );

        const snapshot = await getDocs(q);
        const postsData = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as Post[];

        // Sort by creation time (newest first)
        postsData.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setPosts(postsData);
      } catch (error) {
        console.error("Error loading hashtag posts:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPosts();
  }, [hashtag]);

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

      <View style={styles.wrap}>
        <View style={styles.header}>
          <Pressable
            style={[
              styles.backBtn,
              theme.stanPhoto && styles.backBtnWithBanner
            ]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backText, theme.stanPhoto && styles.backTextWithBanner]}>‹ Back</Text>
          </Pressable>
        </View>

        <View style={styles.titleSection}>
          <Text style={[styles.hashtag, theme.stanPhoto && styles.hashtagWithBanner]}>
            #{hashtag}
          </Text>
          <Text style={[styles.postCount, theme.stanPhoto && styles.postCountWithBanner]}>
            {posts.length} {posts.length === 1 ? "post" : "posts"}
          </Text>
        </View>

        {loading ? (
          <View style={{ paddingBottom: 80 }}>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, theme.stanPhoto && styles.emptyStateTextWithBanner]}>
              No posts found with #{hashtag}
            </Text>
          </View>
        ) : (
          <FlatList
            data={posts}
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
                    isDarkTheme={userTheme === "cyberpunk" || userTheme === "retro" || userTheme === "dark"}
                  />
                </BlurView>
              ) : (
                <PostCard post={item} />
              )
            }
          />
        )}
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

  header: { marginBottom: 12 },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#111",
    alignSelf: "flex-start",
  },
  backBtnWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  backText: { fontWeight: "900", color: "#111" },
  backTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  titleSection: { marginBottom: 20, gap: 4 },
  hashtag: { fontSize: 32, fontWeight: "900", color: "#111" },
  hashtagWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  postCount: { fontSize: 14, color: "#666", fontWeight: "700" },
  postCountWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  postCardWithBanner: {
    borderRadius: 16,
    padding: 8,
    marginBottom: 10,
    overflow: "hidden",
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  emptyStateTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
});
