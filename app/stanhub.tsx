import React, { useEffect, useState, useRef, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Modal, Dimensions, Animated } from "react-native";
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
import { createPressAnimation, getGlowStyle } from "../src/lib/animations";

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
            style={[styles.backBtn, { backgroundColor: theme.surfaceColor }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            <Text style={[styles.backText, { color: theme.textColor }]}>{"<"} BACK</Text>
          </Pressable>
        </View>

        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: theme.primaryColor }]}>STANHUB</Text>
          <Text style={[styles.subtitle, { color: theme.secondaryTextColor }]}>
            EXCLUSIVE MUSIC VIDEOS
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
              <Text style={[styles.emptyText, { color: theme.mutedTextColor }]}>
                NO VIDEOS YET
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.mutedTextColor }]}>
                CHECK BACK SOON
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <VideoCard
              video={item}
              theme={theme}
              onPress={() => openVideo(item)}
              isNew={isNewVideo(item)}
            />
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
              <Pressable
                style={[styles.closeBtn, { backgroundColor: theme.surfaceColor }]}
                onPress={closeVideo}
              >
                <Text style={[styles.closeBtnText, { color: theme.textColor }]}>x</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Video Card Component with press animation
function VideoCard({ video, theme, onPress, isNew }: { video: MusicVideo; theme: any; onPress: () => void; isNew: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressHandlers = createPressAnimation(scale);

  return (
    <Animated.View style={[styles.videoCard, { transform: [{ scale }] }]}>
      <Pressable
        style={[styles.card, { backgroundColor: theme.surfaceColor }]}
        onPress={onPress}
        {...pressHandlers}
      >
        <Image
          source={{ uri: video.thumbnailUrl }}
          style={styles.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <View style={[styles.cardInfo, { backgroundColor: theme.surfaceColor }]}>
          <Text style={[styles.videoTitle, { color: theme.textColor }]} numberOfLines={2}>
            {video.title.toUpperCase()}
          </Text>
        </View>
        <View style={styles.playOverlay}>
          <View style={[styles.playButton, { backgroundColor: theme.primaryColor, ...getGlowStyle(theme.primaryColor, 12) }]}>
            <Text style={styles.playIcon}>{">"}</Text>
          </View>
        </View>
        {isNew && (
          <View style={[styles.newBadge, { backgroundColor: theme.primaryColor }]}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
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
    backgroundColor: "rgba(10, 10, 10, 0.8)",
  },

  header: { marginBottom: 16 },
  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  backText: {
    fontFamily: "SpaceMono-Bold",
    fontSize: 13,
    letterSpacing: 1,
  },

  titleSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 4,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    letterSpacing: 2,
    textAlign: "center",
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
  },
  thumbnail: {
    width: "100%",
    height: cardWidth * 1.2,
  },
  cardInfo: {
    padding: 12,
  },
  videoTitle: {
    fontSize: 11,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 0.5,
    lineHeight: 16,
  },
  playOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: cardWidth * 1.2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: {
    fontSize: 20,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    marginLeft: 4,
  },
  newBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 9,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    letterSpacing: 1,
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    textAlign: "center",
    letterSpacing: 2,
  },
  emptySubtext: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    textAlign: "center",
    letterSpacing: 1,
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
});
