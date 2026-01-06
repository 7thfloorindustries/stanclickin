import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";

const { width, height } = Dimensions.get("window");

export default function Home() {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const backgroundMusic = useRef<Audio.Sound | null>(null);

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
      } catch (error) {
        console.error("Error loading background music:", error);
      }
    };

    loadMusic();

    return () => {
      backgroundMusic.current?.unloadAsync();
    };
  }, []);

  // Play/pause based on screen focus
  useFocusEffect(
    React.useCallback(() => {
      // Play when screen is focused
      backgroundMusic.current?.playAsync();

      return () => {
        // Pause when screen loses focus
        backgroundMusic.current?.pauseAsync();
      };
    }, [])
  );

  const toggleMute = async () => {
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      {/* Hero Background */}
      <ImageBackground
        source={require("../assets/images/hero-stan.png")}
        style={styles.heroBackground}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']}
          style={styles.gradient}
        />
      </ImageBackground>

      {/* Mute Button */}
      <Pressable style={styles.muteButton} onPress={toggleMute}>
        <Text style={styles.muteIcon}>{isMuted ? "🔇" : "🔊"}</Text>
      </Pressable>

      {/* Content */}
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoSection}>
          <Text style={styles.logo}>STANCLICKIN</Text>
          <Text style={styles.tagline}>THE OFFICIAL APP</Text>
        </View>

        {/* Menu Buttons */}
        <View style={styles.menu}>
          <MenuButton
            title="STANSPACE"
            subtitle="Connect with the community"
            onPress={() => handlePress("/stanspace", "stanspace")}
          />

          <MenuButton
            title="STANHUB"
            subtitle="Exclusive music videos"
            onPress={() => handlePress("/stanhub", "stanhub")}
          />

          <MenuButton
            title="FLAPPYCLICKIN"
            subtitle="Challenge the leaderboard"
            onPress={() => handlePress("/flappyclickin", "flappyclickin")}
          />

          <MenuButton
            title="GIF MAKER"
            subtitle="Turn videos into GIFs"
            onPress={() => handlePress("/gifmaker", "gifmaker")}
          />
        </View>
      </View>
    </View>
  );
}

const MenuButton = ({ title, subtitle, onPress }: any) => {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      style={[styles.menuButton, pressed && styles.menuButtonPressed]}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }}
      onPressOut={() => setPressed(false)}
    >
      <LinearGradient
        colors={pressed ? ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.15)'] : ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.menuButtonGradient}
      >
        <View style={styles.menuButtonContent}>
          <Text style={styles.menuButtonTitle}>{title}</Text>
          <Text style={styles.menuButtonSubtitle}>{subtitle}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  muteIcon: {
    fontSize: 16,
    opacity: 0.8,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: 50,
    paddingHorizontal: 20,
  },
  logoSection: {
    alignItems: "center",
    gap: 8,
  },
  logo: {
    fontSize: 42,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 2,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  tagline: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  menu: {
    gap: 12,
  },
  menuButton: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  menuButtonPressed: {
    opacity: 0.8,
  },
  menuButtonGradient: {
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  menuButtonContent: {
    gap: 4,
  },
  menuButtonTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
  },
  menuButtonSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.6)",
  },
});
