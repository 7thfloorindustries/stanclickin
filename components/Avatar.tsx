import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { type Theme, getTheme } from "../src/lib/themes";

type AvatarProps = {
  imageUrl?: string | null;
  username?: string;
  size?: number;
  theme?: Theme;
  showGlow?: boolean;
};

export function Avatar({ imageUrl, username = "User", size = 40, theme: providedTheme, showGlow = false }: AvatarProps) {
  const theme = providedTheme || getTheme();

  const getInitials = (name: string) => {
    const cleaned = name.replace("@", "").trim();
    const parts = cleaned.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleaned.substring(0, 2).toUpperCase();
  };

  const initials = getInitials(username);

  const glowStyle = showGlow ? {
    shadowColor: theme.glowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  } : {};

  if (imageUrl) {
    return (
      <View style={[
        styles.avatarContainer,
        { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 },
        glowStyle
      ]}>
        <Image
          source={{ uri: imageUrl }}
          style={[
            styles.avatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: theme.borderColor,
            }
          ]}
        />
      </View>
    );
  }

  return (
    <View style={[
      styles.avatarContainer,
      { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 },
      glowStyle
    ]}>
      <View style={[
        styles.defaultAvatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.surfaceGlow,
          borderColor: theme.borderColor,
        }
      ]}>
        <Text style={[
          styles.initials,
          {
            fontSize: size * 0.35,
            color: theme.primaryColor,
            fontFamily: "SpaceMono-Bold",
          }
        ]}>
          {initials}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    borderWidth: 2,
  },
  defaultAvatar: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  initials: {
    letterSpacing: 1,
  },
});
