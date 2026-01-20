import { Animated, Easing } from "react-native";
import {
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  Easing as ReanimatedEasing,
  interpolate,
  SharedValue,
  runOnJS,
} from "react-native-reanimated";

// ===========================================
// LEGACY ANIMATED API (for backwards compatibility)
// ===========================================

// Spring configuration for button presses
export const springConfig = {
  tension: 300,
  friction: 20,
  useNativeDriver: true,
};

// Create a spring animation that scales down and back
export function createPressAnimation(scale: Animated.Value) {
  return {
    onPressIn: () => {
      Animated.spring(scale, {
        toValue: 0.95,
        ...springConfig,
      }).start();
    },
    onPressOut: () => {
      Animated.spring(scale, {
        toValue: 1,
        ...springConfig,
      }).start();
    },
  };
}

// Button bounce animation (scale up then back)
export function animateBounce(scale: Animated.Value) {
  Animated.sequence([
    Animated.spring(scale, {
      toValue: 1.15,
      tension: 400,
      friction: 10,
      useNativeDriver: true,
    }),
    Animated.spring(scale, {
      toValue: 1,
      ...springConfig,
    }),
  ]).start();
}

// Glow pulse animation for unread indicators
export function createGlowPulse(opacity: Animated.Value) {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 1000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.3,
        duration: 1000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ])
  );
}

// Breathing animation (subtle scale pulse)
export function createBreathingAnimation(scale: Animated.Value) {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.02,
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ])
  );
}

// Fade in animation
export function fadeIn(opacity: Animated.Value, duration = 300) {
  return Animated.timing(opacity, {
    toValue: 1,
    duration,
    easing: Easing.out(Easing.ease),
    useNativeDriver: true,
  });
}

// Fade out animation
export function fadeOut(opacity: Animated.Value, duration = 300) {
  return Animated.timing(opacity, {
    toValue: 0,
    duration,
    easing: Easing.in(Easing.ease),
    useNativeDriver: true,
  });
}

// Slide up animation for modals
export function slideUp(translateY: Animated.Value, duration = 300) {
  return Animated.spring(translateY, {
    toValue: 0,
    tension: 100,
    friction: 15,
    useNativeDriver: true,
  });
}

// Slide down animation for modal dismiss
export function slideDown(translateY: Animated.Value, toValue: number, duration = 200) {
  return Animated.timing(translateY, {
    toValue,
    duration,
    easing: Easing.in(Easing.ease),
    useNativeDriver: true,
  });
}

// Stagger animation for list items
export function staggerFadeIn(animations: Animated.CompositeAnimation[], stagger = 50) {
  return Animated.stagger(stagger, animations);
}

// Glow effect styles helper
export function getGlowStyle(color: string, intensity: number = 10) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: intensity,
    elevation: intensity,
  };
}

// Text glow style helper
export function getTextGlowStyle(color: string, radius: number = 8) {
  return {
    textShadowColor: color,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: radius,
  };
}

// ===========================================
// REANIMATED UTILITIES (new premium animations)
// ===========================================

// Spring configurations for different interaction types
export const reanimatedSpringConfigs = {
  // Snappy response for button presses
  snappy: {
    damping: 15,
    stiffness: 400,
    mass: 0.8,
  },
  // Bouncy feel for celebrations
  bouncy: {
    damping: 8,
    stiffness: 350,
    mass: 0.6,
  },
  // Smooth for transitions
  smooth: {
    damping: 20,
    stiffness: 150,
    mass: 1,
  },
  // Gentle for subtle effects
  gentle: {
    damping: 25,
    stiffness: 100,
    mass: 1,
  },
};

// Premium bounce animation
export function reanimatedBounce(value: SharedValue<number>, toValue: number = 1) {
  "worklet";
  return withSequence(
    withSpring(toValue * 1.2, reanimatedSpringConfigs.bouncy),
    withSpring(toValue * 0.95, reanimatedSpringConfigs.snappy),
    withSpring(toValue, reanimatedSpringConfigs.smooth)
  );
}

// Heart burst animation for likes
export function heartBurstAnimation(scale: SharedValue<number>, opacity: SharedValue<number>) {
  "worklet";
  scale.value = withSequence(
    withTiming(0, { duration: 0 }),
    withSpring(1.3, reanimatedSpringConfigs.bouncy),
    withTiming(1, { duration: 100 })
  );
  opacity.value = withSequence(
    withTiming(1, { duration: 0 }),
    withDelay(400, withTiming(0, { duration: 300 }))
  );
}

// Particle burst animation (for like particles)
export function particleBurstAnimation(
  translateX: SharedValue<number>,
  translateY: SharedValue<number>,
  scale: SharedValue<number>,
  opacity: SharedValue<number>,
  angle: number,
  distance: number = 50
) {
  "worklet";
  const radians = (angle * Math.PI) / 180;
  const targetX = Math.cos(radians) * distance;
  const targetY = Math.sin(radians) * distance;

  translateX.value = withSequence(
    withTiming(0, { duration: 0 }),
    withTiming(targetX, { duration: 400, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) })
  );
  translateY.value = withSequence(
    withTiming(0, { duration: 0 }),
    withTiming(targetY, { duration: 400, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) })
  );
  scale.value = withSequence(
    withTiming(1, { duration: 0 }),
    withTiming(0, { duration: 400 })
  );
  opacity.value = withSequence(
    withTiming(1, { duration: 0 }),
    withTiming(0, { duration: 400 })
  );
}

// Pulsing glow animation (for invincibility)
export function pulsingGlow(
  glowRadius: SharedValue<number>,
  glowOpacity: SharedValue<number>,
  minRadius: number = 10,
  maxRadius: number = 25
) {
  "worklet";
  glowRadius.value = withRepeat(
    withSequence(
      withTiming(maxRadius, { duration: 500, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
      withTiming(minRadius, { duration: 500, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) })
    ),
    -1,
    true
  );
  glowOpacity.value = withRepeat(
    withSequence(
      withTiming(1, { duration: 500, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
      withTiming(0.5, { duration: 500, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) })
    ),
    -1,
    true
  );
}

// Rainbow color cycling (returns hue value 0-360)
export function rainbowCycle(hue: SharedValue<number>, duration: number = 2000) {
  "worklet";
  hue.value = withRepeat(
    withTiming(360, { duration, easing: ReanimatedEasing.linear }),
    -1,
    false
  );
}

// Screen shake animation
export function screenShake(
  translateX: SharedValue<number>,
  translateY: SharedValue<number>,
  intensity: number = 10
) {
  "worklet";
  const duration = 50;
  translateX.value = withSequence(
    withTiming(-intensity, { duration }),
    withTiming(intensity, { duration }),
    withTiming(-intensity * 0.7, { duration }),
    withTiming(intensity * 0.7, { duration }),
    withTiming(-intensity * 0.4, { duration }),
    withTiming(0, { duration })
  );
  translateY.value = withSequence(
    withTiming(intensity * 0.5, { duration }),
    withTiming(-intensity * 0.5, { duration }),
    withTiming(intensity * 0.3, { duration }),
    withTiming(-intensity * 0.3, { duration }),
    withTiming(0, { duration })
  );
}

// Slow motion effect
export function slowMotion(
  scale: SharedValue<number>,
  opacity: SharedValue<number>,
  onComplete?: () => void
) {
  "worklet";
  scale.value = withTiming(1.2, { duration: 800, easing: ReanimatedEasing.out(ReanimatedEasing.ease) });
  opacity.value = withTiming(0, { duration: 800, easing: ReanimatedEasing.in(ReanimatedEasing.ease) }, () => {
    if (onComplete) {
      runOnJS(onComplete)();
    }
  });
}

// Score pop-up animation (+1 floating up)
export function scorePopAnimation(
  translateY: SharedValue<number>,
  opacity: SharedValue<number>,
  scale: SharedValue<number>
) {
  "worklet";
  translateY.value = withSequence(
    withTiming(0, { duration: 0 }),
    withTiming(-50, { duration: 600, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) })
  );
  scale.value = withSequence(
    withTiming(1.5, { duration: 100 }),
    withTiming(1, { duration: 500 })
  );
  opacity.value = withSequence(
    withTiming(1, { duration: 100 }),
    withDelay(300, withTiming(0, { duration: 300 }))
  );
}

// Near-miss camera zoom
export function nearMissZoom(scale: SharedValue<number>) {
  "worklet";
  scale.value = withSequence(
    withTiming(1.05, { duration: 100 }),
    withSpring(1, reanimatedSpringConfigs.smooth)
  );
}

// Staggered fade-in for list items
export function staggeredFadeIn(
  opacity: SharedValue<number>,
  translateY: SharedValue<number>,
  index: number,
  staggerDelay: number = 50
) {
  "worklet";
  opacity.value = withDelay(
    index * staggerDelay,
    withTiming(1, { duration: 300, easing: ReanimatedEasing.out(ReanimatedEasing.ease) })
  );
  translateY.value = withDelay(
    index * staggerDelay,
    withSpring(0, reanimatedSpringConfigs.smooth)
  );
}

// Notification badge bounce
export function badgeBounce(scale: SharedValue<number>) {
  "worklet";
  scale.value = withSequence(
    withTiming(1.3, { duration: 150 }),
    withSpring(1, reanimatedSpringConfigs.bouncy)
  );
}

// Ring expansion effect (for notification badge)
export function ringExpansion(scale: SharedValue<number>, opacity: SharedValue<number>) {
  "worklet";
  scale.value = withSequence(
    withTiming(1, { duration: 0 }),
    withTiming(2, { duration: 400, easing: ReanimatedEasing.out(ReanimatedEasing.ease) })
  );
  opacity.value = withSequence(
    withTiming(1, { duration: 0 }),
    withTiming(0, { duration: 400, easing: ReanimatedEasing.out(ReanimatedEasing.ease) })
  );
}

// Tab indicator slide animation
export function tabIndicatorSlide(translateX: SharedValue<number>, toX: number) {
  "worklet";
  translateX.value = withSpring(toX, reanimatedSpringConfigs.snappy);
}

// Press feedback animation (scale down with color shift)
export function pressFeedback(
  scale: SharedValue<number>,
  backgroundColor: SharedValue<string>,
  pressedColor: string,
  normalColor: string,
  pressed: boolean
) {
  "worklet";
  if (pressed) {
    scale.value = withSpring(0.98, reanimatedSpringConfigs.snappy);
    backgroundColor.value = pressedColor;
  } else {
    scale.value = withSpring(1, reanimatedSpringConfigs.smooth);
    backgroundColor.value = normalColor;
  }
}

// Shimmer animation for skeleton loading
export function shimmerAnimation(translateX: SharedValue<number>, width: number) {
  "worklet";
  translateX.value = withRepeat(
    withSequence(
      withTiming(-width, { duration: 0 }),
      withTiming(width * 2, { duration: 1500, easing: ReanimatedEasing.linear })
    ),
    -1,
    false
  );
}

// Dust particle animation (for jump effect)
export function dustParticle(
  translateX: SharedValue<number>,
  translateY: SharedValue<number>,
  opacity: SharedValue<number>,
  angle: number,
  distance: number = 20
) {
  "worklet";
  const radians = ((angle - 90) * Math.PI) / 180; // -90 to make particles go down
  const targetX = Math.cos(radians) * distance;
  const targetY = Math.sin(radians) * distance + 30; // Add downward bias

  translateX.value = withTiming(targetX, { duration: 300, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) });
  translateY.value = withTiming(targetY, { duration: 300, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) });
  opacity.value = withSequence(
    withTiming(0.8, { duration: 50 }),
    withTiming(0, { duration: 250 })
  );
}

// Gradient position animation
export function animateGradientPosition(
  x: SharedValue<number>,
  y: SharedValue<number>,
  duration: number = 10000
) {
  "worklet";
  x.value = withRepeat(
    withSequence(
      withTiming(0, { duration: duration / 4, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
      withTiming(1, { duration: duration / 4, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
      withTiming(0.5, { duration: duration / 4, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
      withTiming(0, { duration: duration / 4, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) })
    ),
    -1,
    false
  );
  y.value = withRepeat(
    withSequence(
      withTiming(0.5, { duration: duration / 4, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
      withTiming(0, { duration: duration / 4, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
      withTiming(1, { duration: duration / 4, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
      withTiming(0.5, { duration: duration / 4, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) })
    ),
    -1,
    false
  );
}
