import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  ScrollView,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { doc, onSnapshot, collection, query, orderBy, limit, setDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import ReanimatedAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  runOnJS,
  Easing as ReanimatedEasing,
  interpolateColor,
  cancelAnimation,
} from "react-native-reanimated";
import { Canvas, Circle, Group, BlurMask, vec, Path, Skia } from "@shopify/react-native-skia";
import { auth, db } from "../src/lib/firebase";
import { type ThemeId, getTheme } from "../src/lib/themes";
import { getGlowStyle, reanimatedSpringConfigs } from "../src/lib/animations";
import * as IAP from "react-native-iap";

// Particle types
type DustParticle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  size: number;
};

type SparkParticle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  size: number;
  color: string;
};

type TrailPoint = {
  x: number;
  y: number;
  opacity: number;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// In-app purchase product IDs
const PRODUCT_IDS = Platform.select({
  ios: ['com.stanclickin.app.extralife'],
  android: ['extralife'],
}) || [];

// Game constants - tuned for fun gameplay
const GRAVITY = 0.4;
const JUMP_VELOCITY = -8;
const BIRD_SIZE = 60;
const BIRD_HITBOX = 50; // Smaller hitbox than visual size for forgiveness
const PIPE_WIDTH = 70;
const PIPE_GAP = 220;
const PIPE_SPEED = 3;
const PIPE_SPACING = 250; // Distance between pipes
const GROUND_HEIGHT = 100;

// Progressive difficulty system - brutally hard in the 90s to make 100 impossible
const getDifficultySpeed = (score: number): number => {
  if (score < 20) return PIPE_SPEED; // 3 - Easy
  if (score < 50) return PIPE_SPEED * 1.2; // 3.6 - Medium
  if (score < 70) return PIPE_SPEED * 1.5; // 4.5 - Hard
  if (score < 85) return PIPE_SPEED * 1.8; // 5.4 - Very Hard
  if (score < 92) return PIPE_SPEED * 2.2; // 6.6 - Extremely Hard
  if (score < 97) return PIPE_SPEED * 2.7; // 8.1 - Brutal
  return PIPE_SPEED * 3.5; // 10.5 - Genuinely Impossible
};

const getDifficultyGap = (score: number): number => {
  if (score < 20) return PIPE_GAP; // 220 - Easy
  if (score < 50) return 195; // Medium
  if (score < 70) return 170; // Hard
  if (score < 85) return 145; // Very Hard
  if (score < 92) return 125; // Extremely Hard - very tight
  if (score < 97) return 110; // Brutal - barely fits
  return 95; // Impossible - smaller than bird feels comfortable
};

const getDifficultySpacing = (score: number): number => {
  if (score < 20) return PIPE_SPACING; // 250 - Easy
  if (score < 50) return 230; // Medium
  if (score < 70) return 210; // Hard
  if (score < 85) return 185; // Very Hard
  if (score < 92) return 165; // Extremely Hard - very frequent
  if (score < 97) return 145; // Brutal - relentless
  return 130; // Impossible - constant obstacles
};

type Pipe = {
  id: number;
  x: number;
  topHeight: number;
  gap: number; // Store gap for each pipe since it changes with difficulty
  scored: boolean;
};

type GameState = "ready" | "playing" | "gameOver";

export default function FlappyClickin() {
  const me = auth.currentUser?.uid;
  const [gameState, setGameState] = useState<GameState>("ready");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [visiblePipes, setVisiblePipes] = useState<Pipe[]>([]);
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null);
  const [lives, setLives] = useState(1);
  const [isInvincible, setIsInvincible] = useState(false);
  const [invincibilityTimeLeft, setInvincibilityTimeLeft] = useState(0);
  const [username, setUsername] = useState("");
  const [leaderboard, setLeaderboard] = useState<Array<{ uid: string; username: string; score: number; createdAt: any }>>([]);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);

  const theme = getTheme(userTheme);

  // Use Animated values for smooth updates
  const birdY = useRef(new Animated.Value(SCREEN_HEIGHT / 3)).current;
  const birdRotation = useRef(new Animated.Value(0)).current;

  // Use refs for game state
  const birdVelocity = useRef(0);
  const pipes = useRef<Pipe[]>([]);
  const frameCount = useRef(0);
  const animationFrame = useRef<number>();
  const backgroundMusic = useRef<Audio.Sound | null>(null);
  const musicStarted = useRef(false);
  const scoreRef = useRef(0); // Track score in game loop for difficulty calculations
  const invincibilityInterval = useRef<NodeJS.Timeout | null>(null);
  const isInvincibleRef = useRef(false); // Track invincibility for immediate access in collision detection
  const sessionDocIdRef = useRef<string | null>(null); // Track the leaderboard document ID for this session

  // Reanimated animation values
  const screenShakeX = useSharedValue(0);
  const screenShakeY = useSharedValue(0);
  const gameContainerScale = useSharedValue(1);
  const gameContainerOpacity = useSharedValue(1);
  const glowRadius = useSharedValue(10);
  const glowOpacity = useSharedValue(0);
  const glowHue = useSharedValue(120); // Start at green
  const scorePopY = useSharedValue(0);
  const scorePopOpacity = useSharedValue(0);
  const scorePopScale = useSharedValue(1);
  const [showScorePop, setShowScorePop] = useState(false);

  // Skia particle state
  const [dustParticles, setDustParticles] = useState<DustParticle[]>([]);
  const [sparkParticles, setSparkParticles] = useState<SparkParticle[]>([]);
  const [trailPoints, setTrailPoints] = useState<TrailPoint[]>([]);
  const particleIdRef = useRef(0);
  const trailUpdateRef = useRef(0);

  // Near-miss zoom state
  const nearMissScale = useSharedValue(1);
  const isNearMiss = useRef(false);

  // Achievement system
  type Achievement = {
    score: number;
    title: string;
    emoji: string;
    color: string;
  };

  const ACHIEVEMENTS: Achievement[] = [
    { score: 10, title: "BRONZE FLAPPER", emoji: "🥉", color: "#cd7f32" },
    { score: 25, title: "SILVER FLAPPER", emoji: "🥈", color: "#c0c0c0" },
    { score: 50, title: "GOLD FLAPPER", emoji: "🥇", color: "#ffd700" },
    { score: 75, title: "PLATINUM FLAPPER", emoji: "💎", color: "#e5e4e2" },
    { score: 100, title: "LEGENDARY", emoji: "👑", color: "#ff3b30" },
  ];

  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null);
  const achievedScores = useRef<Set<number>>(new Set());

  // Achievement animation values
  const achievementScale = useSharedValue(0);
  const achievementOpacity = useSharedValue(0);
  const achievementY = useSharedValue(-100);
  const achievementGlow = useSharedValue(0);

  // Near-miss animated style
  const nearMissStyle = useAnimatedStyle(() => ({
    transform: [{ scale: nearMissScale.value }],
  }));

  // Game container animated style (for shake and slow-mo zoom)
  const gameContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: screenShakeX.value },
      { translateY: screenShakeY.value },
      { scale: gameContainerScale.value },
    ],
    opacity: gameContainerOpacity.value,
  }));

  // Invincibility glow animated style
  const invincibleGlowStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      glowHue.value,
      [0, 60, 120, 180, 240, 300, 360],
      ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']
    );
    return {
      shadowColor: color,
      shadowRadius: glowRadius.value,
      shadowOpacity: glowOpacity.value,
      borderColor: color,
    };
  });

  // Score pop-up animated style
  const scorePopStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: scorePopY.value },
      { scale: scorePopScale.value },
    ],
    opacity: scorePopOpacity.value,
  }));

  // Achievement animated style
  const achievementStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: achievementY.value },
      { scale: achievementScale.value },
    ],
    opacity: achievementOpacity.value,
  }));

  const achievementGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: achievementGlow.value,
    shadowRadius: 20 + achievementGlow.value * 15,
  }));

  // Trigger achievement popup
  const triggerAchievement = useCallback((achievement: Achievement) => {
    setCurrentAchievement(achievement);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Animate in
    achievementY.value = -100;
    achievementScale.value = 0;
    achievementOpacity.value = 0;
    achievementGlow.value = 0;

    achievementY.value = withSpring(60, { damping: 12, stiffness: 150 });
    achievementScale.value = withSequence(
      withSpring(1.2, { damping: 8, stiffness: 200 }),
      withSpring(1, { damping: 15, stiffness: 150 })
    );
    achievementOpacity.value = withTiming(1, { duration: 200 });

    // Pulsing glow effect
    achievementGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 500 }),
        withTiming(0.4, { duration: 500 })
      ),
      3,
      true
    );

    // Animate out after 2.5 seconds
    setTimeout(() => {
      achievementY.value = withTiming(-100, { duration: 300 });
      achievementOpacity.value = withTiming(0, { duration: 300 }, () => {
        runOnJS(setCurrentAchievement)(null);
      });
    }, 2500);
  }, []);

  // Check for achievements
  const checkAchievement = useCallback((newScore: number) => {
    for (const achievement of ACHIEVEMENTS) {
      if (newScore >= achievement.score && !achievedScores.current.has(achievement.score)) {
        achievedScores.current.add(achievement.score);
        triggerAchievement(achievement);
        break; // Only show one at a time
      }
    }
  }, [triggerAchievement]);

  // Trigger screen shake
  const triggerScreenShake = useCallback((intensity: number = 10) => {
    const duration = 50;
    screenShakeX.value = withSequence(
      withTiming(-intensity, { duration }),
      withTiming(intensity, { duration }),
      withTiming(-intensity * 0.7, { duration }),
      withTiming(intensity * 0.7, { duration }),
      withTiming(-intensity * 0.4, { duration }),
      withTiming(0, { duration })
    );
    screenShakeY.value = withSequence(
      withTiming(intensity * 0.5, { duration }),
      withTiming(-intensity * 0.5, { duration }),
      withTiming(intensity * 0.3, { duration }),
      withTiming(-intensity * 0.3, { duration }),
      withTiming(0, { duration })
    );
  }, []);

  // Trigger slow motion death effect
  const triggerSlowMoDeath = useCallback((onComplete: () => void) => {
    gameContainerScale.value = withTiming(1.15, { duration: 600, easing: ReanimatedEasing.out(ReanimatedEasing.ease) });
    gameContainerOpacity.value = withTiming(0.5, { duration: 800, easing: ReanimatedEasing.in(ReanimatedEasing.ease) }, () => {
      runOnJS(onComplete)();
    });
  }, []);

  // Reset game visuals
  const resetGameVisuals = useCallback(() => {
    gameContainerScale.value = 1;
    gameContainerOpacity.value = 1;
    screenShakeX.value = 0;
    screenShakeY.value = 0;
  }, []);

  // Start invincibility glow animation
  const startInvincibilityGlow = useCallback(() => {
    glowOpacity.value = withTiming(0.8, { duration: 200 });
    // Pulsing radius
    glowRadius.value = withRepeat(
      withSequence(
        withTiming(25, { duration: 400, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
        withTiming(10, { duration: 400, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) })
      ),
      -1,
      true
    );
    // Rainbow color cycling
    glowHue.value = 120; // Reset to green
    glowHue.value = withRepeat(
      withTiming(480, { duration: 2000, easing: ReanimatedEasing.linear }), // Go through colors twice
      -1,
      false
    );
  }, []);

  // Stop invincibility glow animation
  const stopInvincibilityGlow = useCallback(() => {
    glowOpacity.value = withTiming(0, { duration: 300 });
    cancelAnimation(glowRadius);
    cancelAnimation(glowHue);
    glowRadius.value = 10;
    glowHue.value = 120;
  }, []);

  // Trigger score pop animation
  const triggerScorePop = useCallback(() => {
    setShowScorePop(true);
    scorePopY.value = 0;
    scorePopOpacity.value = 1;
    scorePopScale.value = 1.5;

    scorePopY.value = withTiming(-50, { duration: 600, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) });
    scorePopScale.value = withTiming(1, { duration: 200 });
    scorePopOpacity.value = withDelay(300, withTiming(0, { duration: 300 }, () => {
      runOnJS(setShowScorePop)(false);
    }));
  }, []);

  // Spawn dust particles on jump
  const spawnDustParticles = useCallback((birdYPosition: number) => {
    const newParticles: DustParticle[] = [];
    const birdCenterX = SCREEN_WIDTH / 2;
    const birdBottom = birdYPosition + BIRD_SIZE;

    for (let i = 0; i < 5; i++) {
      particleIdRef.current++;
      const angle = -60 + Math.random() * 120; // -60 to 60 degrees (downward fan)
      const speed = 2 + Math.random() * 3;
      const radians = ((angle + 90) * Math.PI) / 180;

      newParticles.push({
        id: particleIdRef.current,
        x: birdCenterX + (Math.random() - 0.5) * 20,
        y: birdBottom,
        vx: Math.cos(radians) * speed,
        vy: Math.sin(radians) * speed + 2, // Bias downward
        opacity: 0.8,
        size: 4 + Math.random() * 4,
      });
    }

    setDustParticles(prev => [...prev, ...newParticles]);
  }, []);

  // Spawn spark particles on collision
  const spawnSparkParticles = useCallback((birdYPosition: number) => {
    const newParticles: SparkParticle[] = [];
    const birdCenterX = SCREEN_WIDTH / 2;
    const birdCenterY = birdYPosition + BIRD_SIZE / 2;
    const sparkColors = ['#ff3b30', '#ff9500', '#ffcc00', '#ff6b6b', '#ffffff'];

    for (let i = 0; i < 12; i++) {
      particleIdRef.current++;
      const angle = (i / 12) * 360 + Math.random() * 30;
      const speed = 5 + Math.random() * 8;
      const radians = (angle * Math.PI) / 180;

      newParticles.push({
        id: particleIdRef.current,
        x: birdCenterX,
        y: birdCenterY,
        vx: Math.cos(radians) * speed,
        vy: Math.sin(radians) * speed,
        opacity: 1,
        size: 3 + Math.random() * 5,
        color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
      });
    }

    setSparkParticles(prev => [...prev, ...newParticles]);
  }, []);

  // Update trail points
  const updateTrail = useCallback((birdYPosition: number) => {
    trailUpdateRef.current++;
    if (trailUpdateRef.current % 2 !== 0) return; // Update every other frame

    const birdCenterX = SCREEN_WIDTH / 2;
    const birdCenterY = birdYPosition + BIRD_SIZE / 2;

    setTrailPoints(prev => {
      const newPoints = [
        { x: birdCenterX - 15, y: birdCenterY, opacity: 0.6 },
        ...prev.map(p => ({ ...p, opacity: p.opacity * 0.85 })),
      ].filter(p => p.opacity > 0.05).slice(0, 8);
      return newPoints;
    });
  }, []);

  // Update particles each frame
  const updateParticles = useCallback(() => {
    // Update dust particles
    setDustParticles(prev =>
      prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.15, // Gravity
          opacity: p.opacity - 0.025,
          size: p.size * 0.97,
        }))
        .filter(p => p.opacity > 0)
    );

    // Update spark particles
    setSparkParticles(prev =>
      prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vx: p.vx * 0.96, // Friction
          vy: p.vy * 0.96 + 0.1, // Friction + light gravity
          opacity: p.opacity - 0.03,
          size: p.size * 0.95,
        }))
        .filter(p => p.opacity > 0)
    );
  }, []);

  // Clear all particles
  const clearParticles = useCallback(() => {
    setDustParticles([]);
    setSparkParticles([]);
    setTrailPoints([]);
  }, []);

  // Trigger near-miss zoom effect
  const triggerNearMiss = useCallback(() => {
    if (!isNearMiss.current) {
      isNearMiss.current = true;
      nearMissScale.value = withSequence(
        withTiming(1.03, { duration: 100 }),
        withSpring(1, { damping: 15, stiffness: 150 })
      );
      setTimeout(() => {
        isNearMiss.current = false;
      }, 300);
    }
  }, []);

  // Load and play background music
  useEffect(() => {
    const loadMusic = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        const { sound } = await Audio.Sound.createAsync(
          require("../assets/music/man wit da plan.wav"),
          {
            isLooping: true,
            volume: 0.4,
          }
        );

        backgroundMusic.current = sound;
        try {
          await sound.playAsync();
          musicStarted.current = true;
        } catch (playError) {
          // Web browsers block autoplay - music will start on first tap
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

  // Pause/resume music based on screen focus
  useFocusEffect(
    useCallback(() => {
      // Only resume if music was already started (avoids web autoplay issues)
      if (musicStarted.current) {
        backgroundMusic.current?.playAsync();
      }

      return () => {
        // Pause when screen loses focus
        backgroundMusic.current?.pauseAsync();
      };
    }, [])
  );

  // Start music on first tap (for web autoplay policy)
  const startMusicIfNeeded = async () => {
    if (backgroundMusic.current && !musicStarted.current) {
      try {
        await backgroundMusic.current.playAsync();
        musicStarted.current = true;
      } catch (e) {
        // Still blocked
      }
    }
  };

  // Initialize IAP connection and set up listeners
  // CRITICAL: Listeners MUST be set up BEFORE any purchase can be initiated
  useEffect(() => {
    const initIAP = async () => {
      try {
        await IAP.initConnection();
        // @ts-ignore - react-native-iap types may be incorrect
        const products = await IAP.getProducts(PRODUCT_IDS);

        // DEBUG ALERT for TestFlight (production builds strip console.log)
        if (products.length === 0) {
          Alert.alert("IAP Debug", `No products found!\nSearched for: ${PRODUCT_IDS[0]}`);
        } else {
          Alert.alert("IAP Debug", `Found ${products.length} product(s):\n${products.map((p: any) => p.title).join(', ')}`);
        }
      } catch (error) {
        Alert.alert("IAP Init Error", `${error}`);
      }
    };

    initIAP();

    // CRITICAL: Set up purchase listeners BEFORE any purchase can happen
    const purchaseUpdateSubscription = IAP.purchaseUpdatedListener(async (purchase: any) => {
      const receipt = purchase.transactionReceipt || purchase.transactionId;
      if (receipt) {
        try {
          if (Platform.OS === 'android' && purchase.purchaseToken) {
            await IAP.acknowledgePurchaseAndroid(purchase.purchaseToken);
          }
          await IAP.finishTransaction({ purchase, isConsumable: true });

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            "Purchase Successful! 💰",
            "Extra life granted with 3s invincibility!",
            [{ text: "Let's Go!", onPress: () => grantLife() }]
          );
        } catch (ackErr) {
          Alert.alert("Purchase Error", `Could not finish purchase: ${ackErr}`);
        }
      }
    });

    const purchaseErrorSubscription = IAP.purchaseErrorListener((error: any) => {
      if (error.code !== 'E_USER_CANCELLED') {
        Alert.alert("Purchase Failed", `${error.message || error}`);
      }
    });

    return () => {
      purchaseUpdateSubscription.remove();
      purchaseErrorSubscription.remove();
      IAP.endConnection();
    };
  }, []);

  // Load user data (theme and username)
  useEffect(() => {
    if (!me) return;

    const userRef = doc(db, "users", me);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserTheme(data?.theme || null);
        setUsername(data?.username || "Player");
      }
    });
  }, [me]);

  // Load user's personal high score from leaderboard (real-time)
  useEffect(() => {
    if (!me) {
      console.log("⚠️ Personal best listener not set up - no user ID");
      return;
    }

    console.log("🔔 Setting up personal best listener for user:", me);
    // Query for user's highest score
    const q = query(
      collection(db, "leaderboard"),
      orderBy("score", "desc"),
      limit(100) // Get top 100 to find user's best
    );

    return onSnapshot(q, (snapshot) => {
      console.log("🔔 Personal best listener triggered!");
      const allScores = snapshot.docs.map((doc) => doc.data() as any);
      const myScores = allScores.filter((s) => s.uid === me);

      if (myScores.length > 0) {
        const personalBest = Math.max(...myScores.map((s) => s.score));
        console.log("📊 PERSONAL BEST UPDATED:", personalBest, "(from", myScores.length, "games)");
        setHighScore(personalBest);
      } else {
        console.log("📊 No scores found for this user yet");
        setHighScore(0);
      }
    }, (error) => {
      console.error("❌ Personal best listener error:", error);
    });
  }, [me]);

  // Load global leaderboard (real-time updates)
  useEffect(() => {
    console.log("🔔 Setting up global leaderboard listener");
    const q = query(
      collection(db, "leaderboard"),
      orderBy("score", "desc"),
      limit(50) // Get top 50 scores (can include multiple from same player)
    );

    return onSnapshot(q, (snapshot) => {
      console.log("🔔 Global leaderboard listener triggered!");
      const leaders = snapshot.docs.map((doc) => ({
        id: doc.id, // Document ID
        ...(doc.data() as any), // Includes uid, username, score, createdAt
      }));
      console.log("📊 GLOBAL LEADERBOARD UPDATED:", leaders.length, "entries");
      if (leaders.length > 0) {
        console.log("📊 Top 5:", leaders.slice(0, 5).map((l, i) => `${i+1}. ${l.username}: ${l.score}`).join(", "));
      }
      setLeaderboard(leaders);
    }, (error) => {
      console.error("❌ Global leaderboard listener error:", error);
    });
  }, []); // Only set up listener once

  // Generate initial pipes based on current difficulty
  const generateInitialPipes = (currentScore: number = 0) => {
    const initialPipes: Pipe[] = [];
    const currentGap = getDifficultyGap(currentScore);
    const currentSpacing = getDifficultySpacing(currentScore);

    for (let i = 0; i < 3; i++) {
      const minHeight = 150;
      const maxHeight = SCREEN_HEIGHT - GROUND_HEIGHT - currentGap - 150;
      const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;

      initialPipes.push({
        id: Date.now() + i,
        x: SCREEN_WIDTH + 200 + (i * currentSpacing),
        topHeight,
        gap: currentGap, // Use difficulty-based gap
        scored: false,
      });
    }
    return initialPipes;
  };

  // Start game
  const startGame = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    birdY.setValue(SCREEN_HEIGHT / 3);
    birdRotation.setValue(0);
    birdVelocity.current = 0;
    pipes.current = generateInitialPipes();
    frameCount.current = 0;
    setScore(0);
    scoreRef.current = 0; // Reset score ref for difficulty calculations
    setVisiblePipes([...pipes.current]);
    setLives(1); // Reset to 1 life
    setIsInvincible(false);
    isInvincibleRef.current = false; // Reset invincibility
    sessionDocIdRef.current = null; // Reset session document ID for new game
    clearParticles(); // Clear any leftover particles
    achievedScores.current.clear(); // Reset achievements for new game
    setGameState("playing");
  };

  // Jump
  const jump = () => {
    // Start music on first tap (web autoplay policy)
    startMusicIfNeeded();

    if (gameState === "ready") {
      startGame();
      return;
    }

    if (gameState !== "playing") return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    birdVelocity.current = JUMP_VELOCITY;

    // Spawn dust particles on jump
    const currentBirdY = (birdY as any)._value;
    spawnDustParticles(currentBirdY);

    // Animate bird rotation
    Animated.sequence([
      Animated.timing(birdRotation, {
        toValue: -20,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Game loop
  useEffect(() => {
    if (gameState !== "playing" || lives === 0) {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      return;
    }

    const gameLoop = () => {
      frameCount.current++;

      // Update bird physics
      birdVelocity.current += GRAVITY;
      const currentY = (birdY as any)._value + birdVelocity.current;
      birdY.setValue(currentY);

      // Rotate bird based on velocity
      const rotation = Math.min(Math.max(birdVelocity.current * 3, -30), 90);
      birdRotation.setValue(rotation);

      // Update pipes - use difficulty-based speed
      const currentSpeed = getDifficultySpeed(scoreRef.current);
      pipes.current = pipes.current
        .map((pipe) => ({
          ...pipe,
          x: pipe.x - currentSpeed,
        }))
        .filter((pipe) => pipe.x > -PIPE_WIDTH);

      // Generate new pipe when last pipe is far enough - use difficulty-based spacing and gap
      const currentSpacing = getDifficultySpacing(scoreRef.current);
      const currentGap = getDifficultyGap(scoreRef.current);
      const lastPipe = pipes.current[pipes.current.length - 1];
      if (!lastPipe || lastPipe.x < SCREEN_WIDTH - currentSpacing) {
        const minHeight = 150;
        const maxHeight = SCREEN_HEIGHT - GROUND_HEIGHT - currentGap - 150;
        const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;

        pipes.current.push({
          id: Date.now(),
          x: SCREEN_WIDTH,
          topHeight,
          gap: currentGap, // Store current difficulty gap
          scored: false,
        });
      }

      // Update visible pipes every few frames for rendering
      if (frameCount.current % 2 === 0) {
        setVisiblePipes([...pipes.current]);
      }

      // Update trail effect
      updateTrail(currentY);

      // Update particles
      updateParticles();

      // Check scoring
      pipes.current.forEach((pipe) => {
        if (!pipe.scored && pipe.x + PIPE_WIDTH < SCREEN_WIDTH / 2 - BIRD_SIZE / 2) {
          pipe.scored = true;
          setScore((s) => {
            const newScore = s + 1;
            scoreRef.current = newScore; // Sync ref for difficulty calculations
            checkAchievement(newScore); // Check for achievement milestones
            return newScore;
          });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Trigger score pop animation
          triggerScorePop();
        }
      });

      // Check collisions (use smaller hitbox for forgiveness)
      const hitboxOffset = (BIRD_SIZE - BIRD_HITBOX) / 2;
      const birdLeft = SCREEN_WIDTH / 2 - BIRD_HITBOX / 2;
      const birdRight = SCREEN_WIDTH / 2 + BIRD_HITBOX / 2;
      const birdTop = currentY + hitboxOffset;
      const birdBottom = currentY + BIRD_SIZE - hitboxOffset;

      // Skip collision detection if invincible
      if (!isInvincibleRef.current) {
        // Ground/ceiling collision
        if (birdBottom > SCREEN_HEIGHT - GROUND_HEIGHT || birdTop < 0) {
          endGame();
          return;
        }

        // Pipe collision and near-miss detection
        for (const pipe of pipes.current) {
          const pipeLeft = pipe.x;
          const pipeRight = pipe.x + PIPE_WIDTH;

          // Check if bird is in pipe's x range
          if (birdRight > pipeLeft && birdLeft < pipeRight) {
            // Check if bird hit top or bottom pipe - use pipe's specific gap
            if (birdTop < pipe.topHeight || birdBottom > pipe.topHeight + pipe.gap) {
              endGame();
              return;
            }

            // Near-miss detection (within 15px of pipe edge)
            const distanceFromTop = birdTop - pipe.topHeight;
            const distanceFromBottom = (pipe.topHeight + pipe.gap) - birdBottom;

            if (distanceFromTop < 15 || distanceFromBottom < 15) {
              triggerNearMiss();
            }
          }
        }
      }

      // Continue loop
      animationFrame.current = requestAnimationFrame(gameLoop);
    };

    animationFrame.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [gameState, lives]);

  const endGame = () => {
    if (isInvincibleRef.current) {
      return; // Don't die if invincible
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    // Trigger screen shake effect
    triggerScreenShake(15);

    // Spawn collision spark particles
    const currentBirdY = (birdY as any)._value;
    spawnSparkParticles(currentBirdY);

    // Clear invincibility timer if it exists
    if (invincibilityInterval.current) {
      clearInterval(invincibilityInterval.current);
      invincibilityInterval.current = null;
    }

    // Stop the game loop immediately to pause the bird
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }

    // Use scoreRef.current (synchronous) instead of score state (async)
    const finalScore = scoreRef.current;

    // DEBUG: Log score info
    console.log("🎮 GAME OVER - Score from state:", score, "| Score from ref:", finalScore, "| Personal Best:", highScore);
    console.log("🎮 User ID:", me, "| Username:", username);

    // Update state to match ref
    setScore(finalScore);

    // Trigger slow-motion death effect, then show game over
    triggerSlowMoDeath(() => {
      // Consume life and go to game over
      setLives(0);
      setGameState("gameOver");

      // Reset visual effects for next game
      resetGameVisuals();

      // Save score immediately (replace old entry if bought life)
      if (finalScore > 0) {
        console.log("🎮 Saving score:", finalScore);

        // If we already saved a score this session, delete it first
        if (sessionDocIdRef.current) {
          console.log("🎮 Deleting old session entry (bought life and improved/died again)");
          deleteOldSessionScore(sessionDocIdRef.current);
        }

        // Save the new score and track the document ID
        saveToLeaderboard(finalScore);

        // Update personal best if this is a new high score
        if (finalScore > highScore) {
          console.log("🎮 NEW PERSONAL BEST!", finalScore);
          setHighScore(finalScore);
        }
      } else {
        console.log("🎮 Score is 0, not saving");
      }
    });
  };

  // Delete old session score from leaderboard
  const deleteOldSessionScore = async (docId: string) => {
    try {
      await deleteDoc(doc(db, "leaderboard", docId));
      console.log("✅ Deleted old session entry:", docId);
    } catch (error) {
      console.error("❌ Error deleting old entry:", error);
    }
  };

  // Save score to global leaderboard (creates new entry and tracks doc ID)
  const saveToLeaderboard = async (finalScore: number) => {
    console.log("💾 saveToLeaderboard called with score:", finalScore);
    console.log("💾 User ID:", me);
    console.log("💾 Username:", username);

    if (!me || !username) {
      console.log("❌ BLOCKED: Cannot save to leaderboard - missing user data:", { me, username });
      return;
    }

    try {
      console.log("💾 Attempting to add new score entry to leaderboard");
      const docRef = await addDoc(collection(db, "leaderboard"), {
        uid: me,
        username,
        score: finalScore,
        createdAt: serverTimestamp(),
      });
      sessionDocIdRef.current = docRef.id; // Track this document ID for potential deletion
      console.log("✅ FIRESTORE WRITE SUCCESSFUL! Doc ID:", docRef.id, "| Score:", finalScore);
      console.log("✅ Waiting for real-time listener to update state...");
    } catch (error) {
      console.error("❌ FIRESTORE WRITE FAILED:", error);
      console.error("❌ Error details:", JSON.stringify(error, null, 2));
    }
  };

  // Purchase a life ($0.99)
  const purchaseLife = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // @ts-ignore - react-native-iap types may be incorrect
      await IAP.requestPurchase(PRODUCT_IDS[0]);
    } catch (error) {
      Alert.alert("Purchase Error", "Could not start purchase. Please try again.");
    }
  };

  // Grant life after successful purchase
  const grantLife = () => {
    // Set invincibility FIRST before resuming game
    setLives(1);
    setIsInvincible(true);
    isInvincibleRef.current = true;
    setInvincibilityTimeLeft(3);

    // Start invincibility glow animation
    startInvincibilityGlow();

    // Clear any existing invincibility timer
    if (invincibilityInterval.current) {
      clearInterval(invincibilityInterval.current);
    }

    // Reset bird position and velocity
    birdY.setValue(SCREEN_HEIGHT / 3);
    birdRotation.setValue(0);
    birdVelocity.current = 0;

    // Generate new pipes at current difficulty level
    pipes.current = generateInitialPipes(scoreRef.current);
    setVisiblePipes([...pipes.current]);
    frameCount.current = 0;

    // Reset any death effects
    resetGameVisuals();

    // Resume game (keep score!)
    setGameState("playing");

    // Invincibility countdown
    invincibilityInterval.current = setInterval(() => {
      setInvincibilityTimeLeft((prev) => {
        if (prev <= 1) {
          setIsInvincible(false);
          isInvincibleRef.current = false;
          // Stop invincibility glow animation
          stopInvincibilityGlow();
          if (invincibilityInterval.current) {
            clearInterval(invincibilityInterval.current);
            invincibilityInterval.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Post high score to STANSPACE - NO SCREENSHOT for now, just text verification
  const postToStanspace = async () => {
    if (!me || !username) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Get top 5 leaderboard for verification text
      const top5 = leaderboard.slice(0, 5).map((l, i) => `${i + 1}. ${l.username}: ${l.score}`).join('\n');

      // Post to STANSPACE with text-based verification
      const postData = {
        uid: me,
        text: `🎮 FLAPPYCLICKIN VERIFIED SCORE 🎮

SCORE: ${score}
PLAYER: ${username}
DATE: ${new Date().toLocaleDateString()}

✅ VERIFIED ✅

TOP 5 LEADERBOARD:
${top5}

#flappyclickin #gaming`,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        engagementCount: 0,
        hashtags: ["flappyclickin", "gaming"],
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "posts"), postData);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Posted! 🎉", "Your verified score is now on STANSPACE");
    } catch (error) {
      console.error("Error posting to STANSPACE:", error);
      Alert.alert("Error", "Failed to post. Try again!");
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={["top"]}>
      {/* Theme background image */}
      {theme.stanPhoto && (
        <>
          <Image
            source={theme.stanPhoto}
            style={styles.backgroundImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
          />
          <View style={styles.backgroundOverlay} />
        </>
      )}

      <ReanimatedAnimated.View style={[styles.gameAreaWrapper, gameContainerStyle, nearMissStyle]}>
        <Pressable
          style={styles.gameArea}
          onPress={jump}
          pointerEvents={gameState === "gameOver" ? "none" : "auto"}
        >
          {/* Sky background */}
          <View style={[styles.sky, { backgroundColor: theme.stanPhoto ? "transparent" : theme.backgroundColor }]} />

        {/* Atlanta Buildings */}
        {visiblePipes.map((pipe) => (
          <View key={pipe.id}>
            {/* Top building */}
            <View
              style={[
                styles.building,
                {
                  left: pipe.x,
                  top: 0,
                  height: pipe.topHeight,
                  backgroundColor: theme.primaryColor,
                  borderColor: theme.borderColor,
                },
              ]}
            >
              {/* Windows */}
              <View style={styles.windowsContainer}>
                {Array.from({ length: Math.floor(pipe.topHeight / 30) }).map((_, i) => (
                  <View key={i} style={styles.windowRow}>
                    <View style={[styles.window, { backgroundColor: theme.accentColor }]} />
                    <View style={[styles.window, { backgroundColor: theme.accentColor }]} />
                    <View style={[styles.window, { backgroundColor: theme.accentColor }]} />
                  </View>
                ))}
              </View>
            </View>
            {/* Bottom building */}
            <View
              style={[
                styles.building,
                {
                  left: pipe.x,
                  top: pipe.topHeight + pipe.gap,
                  height: SCREEN_HEIGHT - pipe.topHeight - pipe.gap - GROUND_HEIGHT,
                  backgroundColor: theme.primaryColor,
                  borderColor: theme.borderColor,
                },
              ]}
            >
              {/* Windows */}
              <View style={styles.windowsContainer}>
                {Array.from({ length: Math.floor((SCREEN_HEIGHT - pipe.topHeight - pipe.gap - GROUND_HEIGHT) / 30) }).map((_, i) => (
                  <View key={i} style={styles.windowRow}>
                    <View style={[styles.window, { backgroundColor: theme.accentColor }]} />
                    <View style={[styles.window, { backgroundColor: theme.accentColor }]} />
                    <View style={[styles.window, { backgroundColor: theme.accentColor }]} />
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}

        {/* Stan Character */}
        <Animated.View
          style={[
            styles.character,
            isInvincible && styles.characterInvincible,
            {
              transform: [
                { translateY: birdY },
                { rotate: birdRotation.interpolate({
                  inputRange: [-30, 90],
                  outputRange: ['-30deg', '90deg'],
                })
              }],
            },
          ]}
        >
          <Image
            source={require("../assets/game/stan-character.png")}
            style={styles.characterImage}
            contentFit="contain"
          />
          {isInvincible && (
            <ReanimatedAnimated.View style={[styles.invincibleGlow, invincibleGlowStyle]} />
          )}
        </Animated.View>

        {/* Ground */}
        <View style={[styles.ground, { backgroundColor: theme.secondaryTextColor, borderColor: theme.borderColor }]} />

        {/* Score and Lives */}
        {gameState === "playing" && (
          <>
            <View style={styles.scoreContainer}>
              <Text style={[styles.score, { color: theme.textColor }]}>{score}</Text>
              {/* Score pop-up animation */}
              {showScorePop && (
                <ReanimatedAnimated.View style={[styles.scorePop, scorePopStyle]}>
                  <Text style={[styles.scorePopText, { color: theme.primaryColor }]}>+1</Text>
                </ReanimatedAnimated.View>
              )}
            </View>
            <View style={styles.livesContainer}>
              <Text style={[styles.livesText, { color: theme.textColor }]}>
                ❤️ {lives}
              </Text>
            </View>
            {isInvincible && (
              <View style={styles.invincibilityContainer}>
                <Text style={styles.invincibilityText}>
                  INVINCIBLE: {invincibilityTimeLeft}s
                </Text>
              </View>
            )}
          </>
        )}

        {/* Achievement Popup */}
        {currentAchievement && (
          <ReanimatedAnimated.View
            style={[
              styles.achievementContainer,
              achievementStyle,
              achievementGlowStyle,
              { shadowColor: currentAchievement.color },
            ]}
          >
            <View style={[styles.achievementBadge, { backgroundColor: currentAchievement.color }]}>
              <Text style={styles.achievementEmoji}>{currentAchievement.emoji}</Text>
            </View>
            <View style={styles.achievementTextContainer}>
              <Text style={styles.achievementUnlocked}>ACHIEVEMENT UNLOCKED</Text>
              <Text style={[styles.achievementTitle, { color: currentAchievement.color }]}>
                {currentAchievement.title}
              </Text>
              <Text style={styles.achievementScore}>Score {currentAchievement.score}+</Text>
            </View>
          </ReanimatedAnimated.View>
        )}

        {/* Skia Particle Canvas - Native only (Skia requires CanvasKit setup for web) */}
        {Platform.OS !== 'web' && (dustParticles.length > 0 || sparkParticles.length > 0 || trailPoints.length > 0) && (
          <Canvas style={styles.particleCanvas} pointerEvents="none">
            {/* Trail effect */}
            {trailPoints.map((point, index) => (
              <Group key={`trail-${index}`}>
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={8 - index * 0.8}
                  color={`rgba(255, 255, 255, ${point.opacity * 0.5})`}
                >
                  <BlurMask blur={4} style="normal" />
                </Circle>
              </Group>
            ))}

            {/* Dust particles */}
            {dustParticles.map((particle) => (
              <Group key={`dust-${particle.id}`}>
                <Circle
                  cx={particle.x}
                  cy={particle.y}
                  r={particle.size}
                  color={`rgba(180, 160, 140, ${particle.opacity})`}
                />
                <Circle
                  cx={particle.x}
                  cy={particle.y}
                  r={particle.size * 0.6}
                  color={`rgba(220, 200, 180, ${particle.opacity * 0.8})`}
                />
              </Group>
            ))}

            {/* Spark particles */}
            {sparkParticles.map((particle) => (
              <Group key={`spark-${particle.id}`}>
                <Circle
                  cx={particle.x}
                  cy={particle.y}
                  r={particle.size}
                  color={particle.color}
                  opacity={particle.opacity}
                >
                  <BlurMask blur={3} style="solid" />
                </Circle>
                <Circle
                  cx={particle.x}
                  cy={particle.y}
                  r={particle.size * 0.5}
                  color="#ffffff"
                  opacity={particle.opacity * 0.9}
                />
              </Group>
            ))}
          </Canvas>
        )}

        </Pressable>
      </ReanimatedAnimated.View>

      {/* Ready screen */}
      {gameState === "ready" && (
        <Pressable style={styles.overlay} onPress={startGame}>
          <Text style={styles.title}>FLAPPYCLICKIN</Text>
          <Text style={styles.subtitle}>Tap to Start</Text>
          {highScore > 0 && (
            <Text style={styles.highScore}>High Score: {highScore}</Text>
          )}
        </Pressable>
      )}

      {/* Game over screen */}
      {(gameState === "gameOver" || lives === 0) && (
        <View style={styles.overlay} pointerEvents="box-none">
          <ScrollView
            contentContainerStyle={styles.gameOverContent}
            showsVerticalScrollIndicator={false}
            pointerEvents="auto"
          >
            <Text style={styles.gameOverTitle}>Game Over!</Text>
            <Text style={styles.finalScore}>Score: {score}</Text>
            {score === highScore && score > 0 && (
              <Text style={styles.newHighScore}>New High Score!</Text>
            )}

            {/* Global Leaderboard */}
            <Pressable
              style={styles.leaderboardContainer}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowFullLeaderboard(true);
              }}
            >
              <Text style={styles.leaderboardTitle}>🏆 Top Scores</Text>
              {leaderboard.slice(0, 5).map((leader, index) => (
                <View
                  key={leader.id}
                  style={[
                    styles.leaderboardRow,
                    leader.uid === me && styles.leaderboardRowHighlight,
                  ]}
                >
                  <Text style={styles.leaderboardRank}>#{index + 1}</Text>
                  <Text style={styles.leaderboardName}>{leader.username}</Text>
                  <Text style={styles.leaderboardScore}>{leader.score}</Text>
                </View>
              ))}
              <Text style={styles.leaderboardExpandHint}>Tap to view full leaderboard ›</Text>
            </Pressable>

            {/* Post to STANSPACE */}
            {score > 0 && (
              <Pressable style={styles.postBtn} onPress={postToStanspace}>
                <Text style={styles.postBtnText}>📢 Post to STANSPACE</Text>
              </Pressable>
            )}

            {/* Buy Life Button */}
            <Pressable style={styles.purchaseBtn} onPress={purchaseLife}>
              <Text style={styles.purchaseBtnText}>💰 Buy Life - $0.99</Text>
              <Text style={styles.purchaseSubtext}>Get 3s invincibility!</Text>
            </Pressable>

            <Pressable style={styles.playAgainBtn} onPress={startGame}>
              <Text style={styles.playAgainText}>Start Over</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {/* Full Leaderboard Modal */}
      <Modal
        visible={showFullLeaderboard}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFullLeaderboard(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={["top"]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🏆 Top Scores</Text>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowFullLeaderboard(false);
              }}
            >
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalContent}
            contentContainerStyle={styles.modalContentContainer}
          >
            {leaderboard.length === 0 ? (
              <View style={styles.emptyLeaderboard}>
                <Text style={styles.emptyLeaderboardText}>No scores yet. Be the first!</Text>
              </View>
            ) : (
              leaderboard.map((leader, index) => (
                <View
                  key={leader.id}
                  style={[
                    styles.fullLeaderboardRow,
                    leader.uid === me && styles.fullLeaderboardRowHighlight,
                    index === 0 && styles.firstPlace,
                    index === 1 && styles.secondPlace,
                    index === 2 && styles.thirdPlace,
                  ]}
                >
                  <View style={styles.rankBadge}>
                    <Text style={[
                      styles.fullLeaderboardRank,
                      index < 3 && styles.topThreeRank
                    ]}>
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                    </Text>
                  </View>
                  <Text style={styles.fullLeaderboardName}>{leader.username}</Text>
                  <Text style={styles.fullLeaderboardScore}>{leader.score}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  backgroundOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10, 10, 10, 0.6)",
  },
  gameAreaWrapper: {
    flex: 1,
  },
  gameArea: {
    flex: 1,
    position: "relative",
  },
  particleCanvas: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  scorePop: {
    position: "absolute",
    top: -30,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scorePopText: {
    fontSize: 36,
    fontFamily: "SpaceMono-Bold",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  sky: {
    ...StyleSheet.absoluteFillObject,
  },
  character: {
    position: "absolute",
    top: 0,
    left: SCREEN_WIDTH / 2 - BIRD_SIZE / 2,
    width: BIRD_SIZE,
    height: BIRD_SIZE,
  },
  characterInvincible: {
    shadowColor: "#00ff88",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  characterImage: {
    width: "100%",
    height: "100%",
  },
  invincibleGlow: {
    position: "absolute",
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: (BIRD_SIZE + 20) / 2,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 3,
    // borderColor and shadow* are animated via invincibleGlowStyle
    shadowOffset: { width: 0, height: 0 },
  },
  building: {
    position: "absolute",
    width: PIPE_WIDTH,
  },
  windowsContainer: {
    flex: 1,
    padding: 8,
    gap: 6,
  },
  windowRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 4,
  },
  window: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  ground: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: GROUND_HEIGHT,
  },
  scoreContainer: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
  },
  score: {
    fontSize: 72,
    fontFamily: "SpaceMono-Bold",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  livesContainer: {
    position: "absolute",
    top: 60,
    right: 20,
  },
  livesText: {
    fontSize: 20,
    fontFamily: "SpaceMono-Bold",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  invincibilityContainer: {
    position: "absolute",
    top: 140,
    alignSelf: "center",
    backgroundColor: "#00ff88",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  invincibilityText: {
    fontSize: 13,
    fontFamily: "SpaceMono-Bold",
    color: "#0a0a0a",
    letterSpacing: 2,
  },
  achievementContainer: {
    position: "absolute",
    top: 0,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 16,
    gap: 16,
    shadowOffset: { width: 0, height: 0 },
    borderWidth: 2,
    borderColor: "#2a2a2a",
  },
  achievementBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  achievementEmoji: {
    fontSize: 32,
  },
  achievementTextContainer: {
    flex: 1,
  },
  achievementUnlocked: {
    fontSize: 10,
    fontFamily: "SpaceMono",
    color: "#888",
    letterSpacing: 2,
  },
  achievementTitle: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 1,
    marginTop: 2,
  },
  achievementScore: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    color: "#666",
    marginTop: 2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 10, 10, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  gameOverContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 16,
  },
  title: {
    fontSize: 36,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    letterSpacing: 2,
    textShadowColor: "#ff3b30",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "SpaceMono",
    color: "#888",
    letterSpacing: 2,
  },
  highScore: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    color: "#00ff88",
    letterSpacing: 1,
  },
  gameOverTitle: {
    fontSize: 32,
    fontFamily: "SpaceMono-Bold",
    color: "#ff3b30",
    letterSpacing: 2,
  },
  finalScore: {
    fontSize: 28,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    letterSpacing: 1,
  },
  newHighScore: {
    fontSize: 16,
    fontFamily: "SpaceMono-Bold",
    color: "#00ff88",
    letterSpacing: 2,
  },
  verificationSeal: {
    marginTop: 20,
    backgroundColor: "rgba(0, 255, 136, 0.1)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  verificationIcon: {
    fontSize: 24,
    fontFamily: "SpaceMono-Bold",
    color: "#00ff88",
  },
  verificationText: {
    fontSize: 12,
    fontFamily: "SpaceMono-Bold",
    color: "#00ff88",
    letterSpacing: 2,
  },
  verificationSubtext: {
    fontSize: 10,
    fontFamily: "SpaceMono",
    color: "#555",
  },
  leaderboardContainer: {
    marginTop: 20,
    backgroundColor: "#141414",
    borderRadius: 12,
    padding: 16,
    width: "90%",
    maxWidth: 350,
  },
  leaderboardTitle: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: 2,
  },
  leaderboardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: "#1a1a1a",
  },
  leaderboardRowHighlight: {
    backgroundColor: "rgba(0, 255, 136, 0.2)",
  },
  leaderboardRank: {
    fontSize: 12,
    fontFamily: "SpaceMono-Bold",
    color: "#888",
    width: 40,
  },
  leaderboardName: {
    fontSize: 13,
    fontFamily: "SpaceMono",
    color: "#fff",
    flex: 1,
  },
  leaderboardScore: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    color: "#00ff88",
  },
  leaderboardExpandHint: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    color: "#555",
    textAlign: "center",
    marginTop: 12,
    letterSpacing: 0.5,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#141414",
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    letterSpacing: 2,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseBtnText: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: 16,
    gap: 8,
  },
  emptyLeaderboard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyLeaderboardText: {
    fontSize: 14,
    fontFamily: "SpaceMono",
    color: "#555",
    textAlign: "center",
    letterSpacing: 1,
  },
  fullLeaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#141414",
    borderRadius: 12,
    gap: 12,
  },
  fullLeaderboardRowHighlight: {
    backgroundColor: "rgba(0, 255, 136, 0.15)",
  },
  firstPlace: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  secondPlace: {
    backgroundColor: "rgba(192, 192, 192, 0.1)",
  },
  thirdPlace: {
    backgroundColor: "rgba(205, 127, 50, 0.1)",
  },
  rankBadge: {
    width: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  fullLeaderboardRank: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    color: "#888",
  },
  topThreeRank: {
    fontSize: 24,
  },
  fullLeaderboardName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "SpaceMono",
    color: "#fff",
  },
  fullLeaderboardScore: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
    color: "#00ff88",
  },
  postBtn: {
    marginTop: 16,
    backgroundColor: "#00ff88",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  postBtnText: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    color: "#0a0a0a",
    textAlign: "center",
    letterSpacing: 1,
  },
  continueBtn: {
    marginTop: 16,
    backgroundColor: "#00ff88",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  continueBtnText: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    color: "#0a0a0a",
    textAlign: "center",
    letterSpacing: 1,
  },
  purchaseBtn: {
    marginTop: 16,
    backgroundColor: "#00d4ff",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  purchaseBtnText: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    color: "#0a0a0a",
    letterSpacing: 1,
  },
  purchaseSubtext: {
    fontSize: 10,
    fontFamily: "SpaceMono",
    color: "#0a0a0a",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  playAgainBtn: {
    marginTop: 12,
    backgroundColor: "#141414",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  playAgainText: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    letterSpacing: 1,
  },
});
