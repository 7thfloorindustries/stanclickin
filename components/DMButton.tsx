import React, { useState, useRef } from "react";
import { Pressable, Text, StyleSheet, Alert, ActivityIndicator, Animated } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { auth } from "../src/lib/firebase";
import { getOrCreateConversation } from "../src/lib/messaging";
import { type Theme, getTheme } from "../src/lib/themes";
import { createPressAnimation } from "../src/lib/animations";

interface DMButtonProps {
  recipientUid: string;
  recipientUsername: string;
  theme?: Theme;
}

export function DMButton({ recipientUid, recipientUsername, theme: providedTheme }: DMButtonProps) {
  const theme = providedTheme || getTheme();
  const [loading, setLoading] = useState(false);
  const myUid = auth.currentUser?.uid;

  const scale = useRef(new Animated.Value(1)).current;
  const pressHandlers = createPressAnimation(scale);

  const handlePress = async () => {
    if (!myUid) {
      Alert.alert("Not logged in", "Please log in to send messages");
      return;
    }

    if (myUid === recipientUid) {
      Alert.alert("Cannot message yourself");
      return;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {}

    setLoading(true);

    try {
      const { conversationId, blocked } = await getOrCreateConversation(myUid, recipientUid);

      if (blocked) {
        Alert.alert(
          "Cannot send message",
          "You cannot message this user."
        );
        return;
      }

      router.push(`/messages/${conversationId}`);
    } catch (error) {
      console.error("Error opening DM:", error);
      Alert.alert("Error", "Failed to open conversation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[
          styles.dmButton,
          {
            backgroundColor: theme.surfaceColor,
            borderColor: theme.borderColor,
            shadowColor: theme.glowColor,
          }
        ]}
        onPress={handlePress}
        disabled={loading}
        {...pressHandlers}
      >
        {loading ? (
          <ActivityIndicator size="small" color={theme.primaryColor} />
        ) : (
          <Text style={[styles.dmButtonText, { color: theme.textColor }]}>MSG</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dmButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  dmButtonText: {
    fontSize: 13,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },
});
