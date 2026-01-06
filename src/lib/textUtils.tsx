import React from "react";
import { Text, Pressable } from "react-native";
import { router } from "expo-router";

/**
 * Extract hashtags from text
 * @param text The text to parse
 * @returns Array of unique hashtags (without # symbol)
 */
export function extractHashtags(text: string): string[] {
  const hashtagRegex = /#[a-zA-Z0-9_]+/g;
  const matches = text.match(hashtagRegex) || [];
  // Remove duplicates and # symbol
  return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
}

/**
 * Extract mentions from text
 * @param text The text to parse
 * @returns Array of unique mentions (without @ symbol)
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /@[a-zA-Z0-9_]+/g;
  const matches = text.match(mentionRegex) || [];
  // Remove duplicates and @ symbol
  return [...new Set(matches.map((mention) => mention.slice(1).toLowerCase()))];
}

/**
 * Render text with clickable hashtags and mentions
 * @param text The text to render
 * @param style Base text style
 * @param linkStyle Style for clickable links
 * @param isDarkTheme Whether dark theme is active
 */
export function renderTextWithLinks(
  text: string,
  style: any,
  linkStyle: any,
  isDarkTheme: boolean = false
): React.ReactNode {
  // Combined regex for hashtags and mentions
  const combinedRegex = /(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_]+)/g;
  const parts = text.split(combinedRegex);

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (part.startsWith("#")) {
          // Hashtag
          const tag = part.slice(1).toLowerCase();
          return (
            <Pressable
              key={`${part}-${index}`}
              onPress={() => router.push({ pathname: "/hashtag", params: { tag } })}
            >
              <Text style={linkStyle}>{part}</Text>
            </Pressable>
          );
        } else if (part.startsWith("@")) {
          // Mention
          const username = part.slice(1).toLowerCase();
          return (
            <Pressable
              key={`${part}-${index}`}
              onPress={async () => {
                // Look up user by username to get UID
                try {
                  const { getDocs, collection, query, where } = await import("firebase/firestore");
                  const { db } = await import("./firebase");

                  const usersRef = collection(db, "users");
                  const q = query(usersRef, where("username", "==", username));
                  const snap = await getDocs(q);

                  if (!snap.empty) {
                    const userDoc = snap.docs[0];
                    router.push(`/u/${userDoc.id}`);
                  }
                } catch (error) {
                  console.error("Error finding user:", error);
                }
              }}
            >
              <Text style={linkStyle}>{part}</Text>
            </Pressable>
          );
        } else {
          // Regular text
          return <Text key={`text-${index}`}>{part}</Text>;
        }
      })}
    </Text>
  );
}
