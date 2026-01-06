export type ThemeId = "neon" | "retro" | "minimalist" | "dark" | "sunset" | "cyberpunk";

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;

  // Colors
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  secondaryTextColor: string;
  borderColor: string;

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
    name: "Neon Dreams",
    description: "Electric vibes with bold neon colors",
    backgroundColor: "#c8b5e6",
    primaryColor: "#ff0000",
    accentColor: "#ffeb3b",
    textColor: "#1a0a2e",
    secondaryTextColor: "#5c4a7a",
    borderColor: "#ff0000",
    stanPhoto: require("../../assets/themes/neon.png"),
    gradient: {
      colors: ["#e6d9f5", "#c8b5e6", "#b39ddb"],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
  },

  retro: {
    id: "retro",
    name: "Retro Wave",
    description: "Cosmic purple dreamscape",
    backgroundColor: "#1a0033",
    primaryColor: "#b366ff",
    accentColor: "#e699ff",
    textColor: "#ffffff",
    secondaryTextColor: "#d4b3ff",
    borderColor: "#b366ff",
    stanPhoto: require("../../assets/themes/retro.png"),
    gradient: {
      colors: ["#0d001a", "#2b0052", "#4d0099"],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
  },

  minimalist: {
    id: "minimalist",
    name: "Minimalist",
    description: "Clean geometric elegance",
    backgroundColor: "#f5f1ed",
    primaryColor: "#1a1a1a",
    accentColor: "#c9b8a8",
    textColor: "#1a1a1a",
    secondaryTextColor: "#736b5e",
    borderColor: "#c9b8a8",
    stanPhoto: require("../../assets/themes/minimalist.png"),
  },

  dark: {
    id: "dark",
    name: "Dark Mode",
    description: "Moody shadows and solitude",
    backgroundColor: "#3d3020",
    primaryColor: "#d4c4a8",
    accentColor: "#8c7a5e",
    textColor: "#f5ead6",
    secondaryTextColor: "#a89985",
    borderColor: "#8c7a5e",
    stanPhoto: require("../../assets/themes/dark.png"),
  },

  sunset: {
    id: "sunset",
    name: "Sunset Vibes",
    description: "Golden hour streetwear",
    backgroundColor: "#d9d1c7",
    primaryColor: "#2a2a2a",
    accentColor: "#7a8c5c",
    textColor: "#1a1a1a",
    secondaryTextColor: "#5c5449",
    borderColor: "#7a8c5c",
    stanPhoto: require("../../assets/themes/sunset.png"),
    gradient: {
      colors: ["#e8e0d5", "#d9d1c7", "#cfc4b5"],
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    },
  },

  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "Neon-lit urban nights",
    backgroundColor: "#0a1014",
    primaryColor: "#ff1493",
    accentColor: "#00d9ff",
    textColor: "#00d9ff",
    secondaryTextColor: "#ff69b4",
    borderColor: "#ff1493",
    stanPhoto: require("../../assets/themes/cyberpunk.png"),
    gradient: {
      colors: ["#0a1014", "#1a1f28", "#0d1a26"],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
  },
};

export const defaultTheme: ThemeId = "minimalist";

export function getTheme(themeId?: ThemeId | null): Theme {
  if (!themeId || !themes[themeId]) {
    return themes[defaultTheme];
  }
  return themes[themeId];
}
