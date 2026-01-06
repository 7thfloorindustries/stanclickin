import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";

type AvatarProps = {
  imageUrl?: string | null;
  username?: string;
  size?: number;
};

export function Avatar({ imageUrl, username = "User", size = 40 }: AvatarProps) {
  // Get initials from username
  const getInitials = (name: string) => {
    const cleaned = name.replace("@", "").trim();
    const parts = cleaned.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleaned.substring(0, 2).toUpperCase();
  };

  const initials = getInitials(username);

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <View style={[styles.defaultAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: "#f0f0f0",
  },
  defaultAvatar: {
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
  },
  initials: {
    color: "#fff",
    fontWeight: "900",
  },
});
