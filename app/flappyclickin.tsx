import React, { useEffect, useState, useRef } from "react";
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
import { doc, onSnapshot, collection, query, orderBy, limit, setDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { auth, db } from "../src/lib/firebase";
import { type ThemeId, getTheme } from "../src/lib/themes";
import * as IAP from "react-native-iap";

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
  const scoreRef = useRef(0); // Track score in game loop for difficulty calculations
  const invincibilityInterval = useRef<NodeJS.Timeout | null>(null);
  const isInvincibleRef = useRef(false); // Track invincibility for immediate access in collision detection
  const sessionDocIdRef = useRef<string | null>(null); // Track the leaderboard document ID for this session

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
        await sound.playAsync();
      } catch (error) {
        console.error("Error loading background music:", error);
      }
    };

    loadMusic();

    return () => {
      backgroundMusic.current?.unloadAsync();
    };
  }, []);

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
    setGameState("playing");
  };

  // Jump
  const jump = () => {
    if (gameState === "ready") {
      startGame();
      return;
    }

    if (gameState !== "playing") return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    birdVelocity.current = JUMP_VELOCITY;

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

      // Check scoring
      pipes.current.forEach((pipe) => {
        if (!pipe.scored && pipe.x + PIPE_WIDTH < SCREEN_WIDTH / 2 - BIRD_SIZE / 2) {
          pipe.scored = true;
          setScore((s) => {
            const newScore = s + 1;
            scoreRef.current = newScore; // Sync ref for difficulty calculations
            return newScore;
          });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

        // Pipe collision
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

    // Clear invincibility timer if it exists
    if (invincibilityInterval.current) {
      clearInterval(invincibilityInterval.current);
      invincibilityInterval.current = null;
    }

    // Consume life and go to game over
    setLives(0); // You lose your life when you die
    setGameState("gameOver");

    // Use scoreRef.current (synchronous) instead of score state (async)
    const finalScore = scoreRef.current;

    // DEBUG: Log score info
    console.log("🎮 GAME OVER - Score from state:", score, "| Score from ref:", finalScore, "| Personal Best:", highScore);
    console.log("🎮 User ID:", me, "| Username:", username);

    // Update state to match ref
    setScore(finalScore);

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

    // Resume game (keep score!)
    setGameState("playing");

    // Invincibility countdown
    invincibilityInterval.current = setInterval(() => {
      setInvincibilityTimeLeft((prev) => {
        if (prev <= 1) {
          setIsInvincible(false);
          isInvincibleRef.current = false;
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
            <View style={styles.invincibleGlow} />
          )}
        </Animated.View>

        {/* Ground */}
        <View style={[styles.ground, { backgroundColor: theme.secondaryTextColor, borderColor: theme.borderColor }]} />

        {/* Score and Lives */}
        {gameState === "playing" && (
          <>
            <View style={styles.scoreContainer}>
              <Text style={[styles.score, { color: theme.textColor }]}>{score}</Text>
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

      </Pressable>

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
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  gameArea: {
    flex: 1,
    position: "relative",
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
    shadowColor: "#FFD700",
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
    backgroundColor: "rgba(255, 215, 0, 0.3)",
    borderWidth: 3,
    borderColor: "#FFD700",
  },
  building: {
    position: "absolute",
    width: PIPE_WIDTH,
    borderWidth: 3,
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
    borderTopWidth: 3,
  },
  scoreContainer: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
  },
  score: {
    fontSize: 72,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  livesContainer: {
    position: "absolute",
    top: 60,
    right: 20,
  },
  livesText: {
    fontSize: 24,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  invincibilityContainer: {
    position: "absolute",
    top: 140,
    alignSelf: "center",
    backgroundColor: "#FFD700",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#111",
  },
  invincibilityText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
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
    fontSize: 48,
    fontWeight: "900",
    color: "#fff",
    textShadowColor: "#111",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  highScore: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFD700",
  },
  gameOverTitle: {
    fontSize: 48,
    fontWeight: "900",
    color: "#FF6B6B",
    textShadowColor: "#111",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0,
  },
  finalScore: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
  },
  newHighScore: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFD700",
    textShadowColor: "#111",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  verificationSeal: {
    marginTop: 20,
    backgroundColor: "rgba(0, 200, 100, 0.15)",
    borderWidth: 2,
    borderColor: "#00C864",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  verificationIcon: {
    fontSize: 32,
    fontWeight: "900",
    color: "#00C864",
  },
  verificationText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#00C864",
    letterSpacing: 2,
  },
  verificationSubtext: {
    fontSize: 10,
    fontWeight: "700",
    color: "#666",
  },
  leaderboardContainer: {
    marginTop: 20,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
    padding: 16,
    width: "90%",
    maxWidth: 350,
  },
  leaderboardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
    textAlign: "center",
    marginBottom: 12,
  },
  leaderboardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  leaderboardRowHighlight: {
    backgroundColor: "#FFD700",
  },
  leaderboardRank: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    width: 40,
  },
  leaderboardName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
    flex: 1,
  },
  leaderboardScore: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111",
  },
  leaderboardExpandHint: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    textAlign: "center",
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111",
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseBtnText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
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
    fontSize: 16,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },
  fullLeaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e0e0e0",
    gap: 12,
  },
  fullLeaderboardRowHighlight: {
    backgroundColor: "#FFF9E6",
    borderColor: "#FFD700",
    borderWidth: 3,
  },
  firstPlace: {
    borderColor: "#FFD700",
    borderWidth: 3,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  secondPlace: {
    borderColor: "#C0C0C0",
    borderWidth: 3,
  },
  thirdPlace: {
    borderColor: "#CD7F32",
    borderWidth: 3,
  },
  rankBadge: {
    width: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  fullLeaderboardRank: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
  },
  topThreeRank: {
    fontSize: 28,
  },
  fullLeaderboardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  fullLeaderboardScore: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111",
  },
  postBtn: {
    marginTop: 16,
    backgroundColor: "#00d95f",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#111",
  },
  postBtnText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
  },
  continueBtn: {
    marginTop: 16,
    backgroundColor: "#00d95f",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#111",
  },
  continueBtnText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
  },
  purchaseBtn: {
    marginTop: 16,
    backgroundColor: "#FFD700",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#111",
    alignItems: "center",
  },
  purchaseBtnText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111",
  },
  purchaseSubtext: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111",
    marginTop: 4,
  },
  playAgainBtn: {
    marginTop: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#111",
  },
  playAgainText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111",
  },
});
