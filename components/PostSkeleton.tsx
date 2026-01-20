import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { type Theme, getTheme } from "../src/lib/themes";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SHIMMER_WIDTH = SCREEN_WIDTH * 0.8;

type PostSkeletonProps = {
  theme?: Theme;
};

export function PostSkeleton({ theme: providedTheme }: PostSkeletonProps) {
  const theme = providedTheme || getTheme();
  const shimmerX = useSharedValue(-SHIMMER_WIDTH);

  useEffect(() => {
    shimmerX.value = withRepeat(
      withSequence(
        withTiming(-SHIMMER_WIDTH, { duration: 0 }),
        withTiming(SCREEN_WIDTH + SHIMMER_WIDTH, {
          duration: 1500,
          easing: Easing.linear,
        })
      ),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  const ShimmerOverlay = () => (
    <Animated.View style={[styles.shimmerOverlay, shimmerStyle]}>
      <LinearGradient
        colors={[
          "transparent",
          `${theme.surfaceGlow}40`,
          `${theme.primaryColor}20`,
          `${theme.surfaceGlow}40`,
          "transparent",
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.shimmerGradient}
      />
    </Animated.View>
  );

  return (
    <View style={[styles.post, { backgroundColor: theme.surfaceColor }]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.surfaceGlow }]}>
          <ShimmerOverlay />
        </View>
        <View style={styles.headerText}>
          <View style={[styles.nameSkeleton, { backgroundColor: theme.surfaceGlow }]}>
            <ShimmerOverlay />
          </View>
          <View style={[styles.timeSkeleton, { backgroundColor: theme.surfaceGlow }]}>
            <ShimmerOverlay />
          </View>
        </View>
      </View>

      <View style={[styles.textSkeleton1, { backgroundColor: theme.surfaceGlow }]}>
        <ShimmerOverlay />
      </View>
      <View style={[styles.textSkeleton2, { backgroundColor: theme.surfaceGlow }]}>
        <ShimmerOverlay />
      </View>

      <View style={[styles.actions, { borderTopColor: theme.borderColor }]}>
        <View style={[styles.actionSkeleton, { backgroundColor: theme.surfaceGlow }]}>
          <ShimmerOverlay />
        </View>
        <View style={[styles.actionSkeleton, { backgroundColor: theme.surfaceGlow }]}>
          <ShimmerOverlay />
        </View>
        <View style={[styles.actionSkeleton, { backgroundColor: theme.surfaceGlow }]}>
          <ShimmerOverlay />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
  nameSkeleton: {
    width: 100,
    height: 12,
    borderRadius: 4,
    overflow: "hidden",
  },
  timeSkeleton: {
    width: 50,
    height: 10,
    borderRadius: 4,
    overflow: "hidden",
  },
  textSkeleton1: {
    width: "90%",
    height: 14,
    borderRadius: 4,
    marginBottom: 8,
    overflow: "hidden",
  },
  textSkeleton2: {
    width: "70%",
    height: 14,
    borderRadius: 4,
    marginBottom: 12,
    overflow: "hidden",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionSkeleton: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    overflow: "hidden",
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: SHIMMER_WIDTH,
  },
  shimmerGradient: {
    flex: 1,
    width: "100%",
  },
});
