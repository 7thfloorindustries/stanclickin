import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, ImageBackground, Platform, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { createPressAnimation } from "../src/lib/animations";

const { width, height } = Dimensions.get("window");

export default function Home() {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const backgroundMusic = useRef<Audio.Sound | null>(null);
  const musicStarted = useRef(false);

  // Load background music
  useEffect(() => {
    const loadMusic = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        const { sound } = await Audio.Sound.createAsync(
          require("../assets/music/rad beat.wav"),
          {
            isLooping: true,
            volume: 0.5,
          }
        );

        backgroundMusic.current = sound;

        try {
          await sound.playAsync();
          musicStarted.current = true;
        } catch (playError) {
          if (Platform.OS === "web") {
            setNeedsUserInteraction(true);
          }
          console.log("Autoplay blocked, waiting for user interaction");
        }
      } catch (error) {
        console.error("Error loading background music:", error);
      }
    };

    loadMusic();

    return () => {
      backgroundMusic.current?.unloadAsync();
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (musicStarted.current) {
        backgroundMusic.current?.playAsync();
      }

      return () => {
        backgroundMusic.current?.pauseAsync();
      };
    }, [])
  );

  const startMusicIfNeeded = async () => {
    if (needsUserInteraction && backgroundMusic.current && !musicStarted.current) {
      try {
        await backgroundMusic.current.playAsync();
        musicStarted.current = true;
        setNeedsUserInteraction(false);
      } catch (e) {
        console.log("Still cannot play audio");
      }
    }
  };

  const toggleMute = async () => {
    await startMusicIfNeeded();

    if (backgroundMusic.current) {
      if (isMuted) {
        await backgroundMusic.current.setVolumeAsync(0.5);
      } else {
        await backgroundMusic.current.setVolumeAsync(0);
      }
      setIsMuted(!isMuted);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePress = (route: string, buttonId: string) => {
    startMusicIfNeeded();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require("../assets/images/hero-stan.png")}
        style={styles.heroBackground}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(10,10,10,0)', 'rgba(10,10,10,0.5)', 'rgba(10,10,10,0.95)']}
          style={styles.gradient}
        />
      </ImageBackground>

      <Pressable style={styles.muteButton} onPress={toggleMute}>
        <Text style={styles.muteIcon}>{isMuted ? "[x]" : "[=]"}</Text>
      </Pressable>

      <View style={styles.content}>
        <View style={styles.logoSection}>
          <Text style={styles.logo}>STANCLICKIN</Text>
          <Text style={styles.tagline}>// THE OFFICIAL APP</Text>
        </View>

        <View style={styles.menu}>
          <MenuButton
            icon="◉"
            title="STANSPACE"
            subtitle="CONNECT WITH THE COMMUNITY"
            onPress={() => handlePress("/stanspace", "stanspace")}
            accentColor="#ff3b30"
          />

          <MenuButton
            icon="▶"
            title="STANHUB"
            subtitle="EXCLUSIVE MUSIC VIDEOS"
            onPress={() => handlePress("/stanhub", "stanhub")}
            accentColor="#00ff88"
          />

          <MenuButton
            icon="◆"
            title="FLAPPYCLICKIN"
            subtitle="CHALLENGE THE LEADERBOARD"
            onPress={() => handlePress("/flappyclickin", "flappyclickin")}
            accentColor="#00d4ff"
          />
        </View>

        <View style={styles.footer}>
          <Pressable
            style={styles.settingsBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings");
            }}
          >
            <Text style={styles.settingsBtnText}>[ SETTINGS ]</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const MenuButton = ({ icon, title, subtitle, onPress, accentColor }: any) => {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const pressHandlers = createPressAnimation(scale);

  const handlePressIn = () => {
    pressHandlers.onPressIn();
    Animated.timing(glow, {
      toValue: 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const handlePressOut = () => {
    pressHandlers.onPressOut();
    Animated.timing(glow, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={styles.menuButton}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View
          style={[
            styles.menuButtonGlow,
            {
              backgroundColor: accentColor,
              opacity: glowOpacity,
              shadowColor: accentColor,
              shadowRadius: 20,
              shadowOpacity: 0.8,
            }
          ]}
        />
        <View style={styles.menuButtonContent}>
          <Text style={[styles.menuButtonIcon, { color: accentColor }]}>{icon}</Text>
          <View style={styles.menuButtonText}>
            <Text style={[styles.menuButtonTitle, { textShadowColor: accentColor }]}>{title}</Text>
            <Text style={styles.menuButtonSubtitle}>{subtitle}</Text>
          </View>
          <Text style={[styles.menuButtonArrow, { color: accentColor }]}>→</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  heroBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradient: {
    flex: 1,
  },
  muteButton: {
    position: "absolute",
    top: 60,
    right: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(10, 10, 10, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
    zIndex: 10,
  },
  muteIcon: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    color: "#888",
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  logoSection: {
    alignItems: "center",
    gap: 8,
  },
  logo: {
    fontSize: 36,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    letterSpacing: 4,
    textAlign: "center",
    textShadowColor: "#ff3b30",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  tagline: {
    fontSize: 12,
    fontFamily: "SpaceMono",
    color: "rgba(255, 255, 255, 0.5)",
    letterSpacing: 4,
  },
  menu: {
    gap: 16,
  },
  menuButton: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(20, 20, 20, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
  },
  menuButtonGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
  },
  menuButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 16,
  },
  menuButtonIcon: {
    fontSize: 28,
    fontFamily: "SpaceMono-Bold",
    width: 36,
    textAlign: "center",
  },
  menuButtonText: {
    flex: 1,
    gap: 4,
  },
  menuButtonTitle: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    letterSpacing: 2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  menuButtonSubtitle: {
    fontSize: 10,
    fontFamily: "SpaceMono",
    color: "rgba(255, 255, 255, 0.4)",
    letterSpacing: 1,
  },
  menuButtonArrow: {
    fontSize: 24,
    fontFamily: "SpaceMono-Bold",
  },
  footer: {
    alignItems: "center",
  },
  settingsBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  settingsBtnText: {
    fontSize: 12,
    fontFamily: "SpaceMono",
    color: "rgba(255, 255, 255, 0.4)",
    letterSpacing: 2,
  },
});
