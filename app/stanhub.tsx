import React, { useEffect, useState, useRef, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, Dimensions } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { VideoView, useVideoPlayer } from "expo-video";
import { collection, doc, onSnapshot, query } from "firebase/firestore";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ScreenOrientation from "expo-screen-orientation";
import { auth, db } from "../src/lib/firebase";
import { type ThemeId, getTheme } from "../src/lib/themes";

type MusicVideo = {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  createdAt?: any;
  featured?: boolean;
};

const { width } = Dimensions.get("window");
const cardWidth = (width - 48) / 2; // 2 columns with padding

export default function StanHub() {
  const me = auth.currentUser?.uid;
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null);
  const [videos, setVideos] = useState<MusicVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<MusicVideo | null>(null);

  const theme = getTheme(userTheme);

  // Create video player
  const videoUrl = selectedVideo?.videoUrl || "";
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = false;

    // Add error listener
    player.addListener('playbackError', (error) => {
      console.error('Playback error:', error);
    });

    player.addListener('statusChange', (status) => {
      console.log('Player status:', status);
    });
  });

  // Lock to portrait when entering this screen
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

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

  // Load videos from Firestore
  useEffect(() => {
    const q = query(collection(db, "videos"));
    return onSnapshot(q, (snap) => {
      const videoData = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as MusicVideo[];
      setVideos(videoData);
    });
  }, []);

  const openVideo = async (video: MusicVideo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedVideo(video);
    // Allow all orientations for video playback
    await ScreenOrientation.unlockAsync();
  };

  const closeVideo = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.pause();
    setSelectedVideo(null);
    // Lock back to portrait when closing video
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  };

  // Play video when selected
  useEffect(() => {
    if (selectedVideo?.videoUrl && player) {
      console.log('Attempting to play video:', selectedVideo.videoUrl);
      console.log('Video title:', selectedVideo.title);
      player.play();
    }
  }, [selectedVideo, player]);

  const isNewVideo = (video: MusicVideo) => {
    if (!video.createdAt?.seconds) return false;
    const daysSinceUpload = (Date.now() - video.createdAt.seconds * 1000) / (1000 * 60 * 60 * 24);
    return daysSinceUpload < 7; // "NEW" badge for videos uploaded in last 7 days
  };

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
          <Text style={[styles.title, theme.stanPhoto && styles.titleWithBanner]}>STANHUB</Text>
          <Text style={[styles.subtitle, theme.stanPhoto && styles.subtitleWithBanner]}>
            Exclusive Music Videos
          </Text>
        </View>

        <FlatList
          data={videos}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, theme.stanPhoto && styles.emptyTextWithBanner]}>
                No videos yet. Check back soon! 🎵
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.videoCard}
              onPress={() => openVideo(item)}
            >
              {theme.stanPhoto ? (
                <BlurView intensity={80} tint="light" style={styles.cardBlur}>
                  <Image
                    source={{ uri: item.thumbnailUrl }}
                    style={styles.thumbnail}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.cardInfo}>
                    <Text style={styles.videoTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                  <View style={styles.playOverlay}>
                    <Text style={styles.playIcon}>▶</Text>
                  </View>
                </BlurView>
              ) : (
                <View style={styles.card}>
                  <Image
                    source={{ uri: item.thumbnailUrl }}
                    style={styles.thumbnail}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.cardInfo}>
                    <Text style={styles.videoTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                  <View style={styles.playOverlay}>
                    <Text style={styles.playIcon}>▶</Text>
                  </View>
                </View>
              )}
            </Pressable>
          )}
        />
      </View>

      {/* Full Screen Video Player Modal */}
      <Modal
        visible={selectedVideo !== null}
        animationType="fade"
        transparent={false}
        onRequestClose={closeVideo}
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      >
        <View style={styles.videoModal}>
          {selectedVideo && (
            <>
              <VideoView
                player={player}
                style={styles.video}
                nativeControls
                contentFit="contain"
                allowsPictureInPicture
              />
              <Pressable style={styles.closeBtn} onPress={closeVideo}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
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

  titleSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#111",
    marginBottom: 4,
    textAlign: "center",
  },
  titleWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#666",
    textAlign: "center",
  },
  subtitleWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  grid: {
    paddingBottom: 100,
  },
  row: {
    justifyContent: "space-between",
  },

  videoCard: {
    width: cardWidth,
    marginBottom: 16,
  },
  card: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#fff",
  },
  cardBlur: {
    borderRadius: 12,
    overflow: "hidden",
  },
  thumbnail: {
    width: "100%",
    height: cardWidth * 1.2,
  },
  cardInfo: {
    padding: 12,
  },
  videoTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    lineHeight: 18,
  },
  playOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  playIcon: {
    fontSize: 48,
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  newBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#ff3b30",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#fff",
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  emptyTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  videoModal: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "#fff",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111",
  },
});
