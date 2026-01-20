export type ThemeId = "neon" | "retro" | "minimalist" | "dark" | "sunset" | "cyberpunk";

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;

  // Core colors (Nothing/TE inspired dark mode)
  backgroundColor: string;
  surfaceColor: string;
  surfaceGlow: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  secondaryTextColor: string;
  mutedTextColor: string;
  borderColor: string;

  // Glow colors
  glowColor: string;
  glowColorRgba: string;

  // Stan photo
  stanPhoto?: any; // require() path - optional until photos are added

  // Optional gradient
  gradient?: {
    colors: string[];
    start: { x: number; y: number };
    end: { x: number; y: number };
  };
}

export const themes: Record<ThemeId, Theme> = {
  neon: {
    id: "neon",
    name: "NEON",
    description: "Electric red glow",
    backgroundColor: "#0a0a0a",
    surfaceColor: "#141414",
    surfaceGlow: "#1a1a1a",
    primaryColor: "#ff3b30",
    accentColor: "#ff6b60",
    textColor: "#ffffff",
    secondaryTextColor: "#888888",
    mutedTextColor: "#555555",
    borderColor: "#2a2a2a",
    glowColor: "#ff3b30",
    glowColorRgba: "rgba(255, 59, 48, 0.3)",
    stanPhoto: require("../../assets/themes/neon.png"),
    gradient: {
      colors: ["#0a0a0a", "#141414", "#0d0d0d"],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
  },

  retro: {
    id: "retro",
    name: "RETRO",
    description: "Purple synthwave",
    backgroundColor: "#0a0a0a",
    surfaceColor: "#141414",
    surfaceGlow: "#1a1a1a",
    primaryColor: "#b366ff",
    accentColor: "#e699ff",
    textColor: "#ffffff",
    secondaryTextColor: "#888888",
    mutedTextColor: "#555555",
    borderColor: "#2a2a2a",
    glowColor: "#b366ff",
    glowColorRgba: "rgba(179, 102, 255, 0.3)",
    stanPhoto: require("../../assets/themes/retro.png"),
    gradient: {
      colors: ["#0a0a0a", "#0d0a14", "#0a0a0a"],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
  },

  minimalist: {
    id: "minimalist",
    name: "MINIMAL",
    description: "Clean monochrome",
    backgroundColor: "#0a0a0a",
    surfaceColor: "#141414",
    surfaceGlow: "#1a1a1a",
    primaryColor: "#ffffff",
    accentColor: "#888888",
    textColor: "#ffffff",
    secondaryTextColor: "#888888",
    mutedTextColor: "#555555",
    borderColor: "#2a2a2a",
    glowColor: "#ffffff",
    glowColorRgba: "rgba(255, 255, 255, 0.2)",
    stanPhoto: require("../../assets/themes/minimalist.png"),
  },

  dark: {
    id: "dark",
    name: "SHADOW",
    description: "Amber warmth",
    backgroundColor: "#0a0a0a",
    surfaceColor: "#141414",
    surfaceGlow: "#1a1a1a",
    primaryColor: "#ffaa00",
    accentColor: "#ffcc55",
    textColor: "#ffffff",
    secondaryTextColor: "#888888",
    mutedTextColor: "#555555",
    borderColor: "#2a2a2a",
    glowColor: "#ffaa00",
    glowColorRgba: "rgba(255, 170, 0, 0.3)",
    stanPhoto: require("../../assets/themes/dark.png"),
  },

  sunset: {
    id: "sunset",
    name: "SUNSET",
    description: "Cyber green",
    backgroundColor: "#0a0a0a",
    surfaceColor: "#141414",
    surfaceGlow: "#1a1a1a",
    primaryColor: "#00ff88",
    accentColor: "#66ffaa",
    textColor: "#ffffff",
    secondaryTextColor: "#888888",
    mutedTextColor: "#555555",
    borderColor: "#2a2a2a",
    glowColor: "#00ff88",
    glowColorRgba: "rgba(0, 255, 136, 0.3)",
    stanPhoto: require("../../assets/themes/sunset.png"),
    gradient: {
      colors: ["#0a0a0a", "#0a0d0a", "#0a0a0a"],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
  },

  cyberpunk: {
    id: "cyberpunk",
    name: "CYBER",
    description: "Electric blue",
    backgroundColor: "#0a0a0a",
    surfaceColor: "#141414",
    surfaceGlow: "#1a1a1a",
    primaryColor: "#00d4ff",
    accentColor: "#66e5ff",
    textColor: "#ffffff",
    secondaryTextColor: "#888888",
    mutedTextColor: "#555555",
    borderColor: "#2a2a2a",
    glowColor: "#00d4ff",
    glowColorRgba: "rgba(0, 212, 255, 0.3)",
    stanPhoto: require("../../assets/themes/cyberpunk.png"),
    gradient: {
      colors: ["#0a0a0a", "#0a0d14", "#0a0a0a"],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
  },
};

export const defaultTheme: ThemeId = "neon";

export function getTheme(themeId?: ThemeId | null): Theme {
  if (!themeId || !themes[themeId]) {
    return themes[defaultTheme];
  }
  return themes[themeId];
}

// Typography constants for Nothing/TE style
export const typography = {
  fontFamily: "SpaceMono",
  weights: {
    light: "300" as const,
    regular: "400" as const,
    medium: "500" as const,
    bold: "700" as const,
  },
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 1,
    extraWide: 2,
  },
};

// Common glow shadow styles
export function getGlowShadow(color: string, intensity: number = 10) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: intensity,
    elevation: intensity,
  };
}
