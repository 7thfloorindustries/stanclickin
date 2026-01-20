import React, { useRef } from "react";
import { View, Text, Modal, Pressable, StyleSheet, ScrollView, Animated } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { themes, ThemeId, Theme } from "../src/lib/themes";
import { createPressAnimation, getGlowStyle } from "../src/lib/animations";

type ThemeSelectorProps = {
  visible: boolean;
  currentTheme: ThemeId;
  onClose: () => void;
  onSelectTheme: (themeId: ThemeId) => void;
};

export function ThemeSelector({ visible, currentTheme, onClose, onSelectTheme }: ThemeSelectorProps) {
  const themeList = Object.values(themes);

  const handleSelect = (themeId: ThemeId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectTheme(themeId);
    onClose();
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>THEMES</Text>
            <Pressable onPress={handleClose}>
              <Text style={styles.closeBtn}>x</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {themeList.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isSelected={theme.id === currentTheme}
                  onSelect={() => handleSelect(theme.id)}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type ThemeCardProps = {
  theme: Theme;
  isSelected: boolean;
  onSelect: () => void;
};

function ThemeCard({ theme, isSelected, onSelect }: ThemeCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressHandlers = createPressAnimation(scale);

  const glowShadow = isSelected ? getGlowStyle(theme.glowColor, 12) : {};

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[
          styles.card,
          { borderColor: isSelected ? theme.primaryColor : "#2a2a2a" },
          isSelected && glowShadow,
        ]}
        onPress={onSelect}
        {...pressHandlers}
      >
        <View style={[styles.preview, { backgroundColor: theme.backgroundColor }]}>
          {theme.stanPhoto && (
            <Image
              source={theme.stanPhoto}
              style={styles.stanImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={200}
            />
          )}
          {!theme.stanPhoto && (
            <View style={styles.stanPlaceholder}>
              <Text style={[styles.placeholderText, { color: theme.textColor }]}>STAN</Text>
            </View>
          )}

          <View style={[styles.previewOverlay, { backgroundColor: theme.backgroundColor }]} />

          <View style={styles.swatches}>
            <View style={[styles.swatch, { backgroundColor: theme.primaryColor, ...getGlowStyle(theme.primaryColor, 6) }]} />
          </View>
        </View>

        <View style={[styles.cardInfo, { backgroundColor: theme.surfaceColor }]}>
          <Text style={[styles.themeName, { color: theme.textColor }]}>{theme.name}</Text>
          <Text style={[styles.themeDesc, { color: theme.secondaryTextColor }]}>{theme.description}</Text>
          {isSelected && (
            <Text style={[styles.selectedBadge, { color: theme.primaryColor }]}>[ ACTIVE ]</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: "#0a0a0a",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "85%",
    paddingTop: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
    letterSpacing: 2,
  },
  closeBtn: {
    fontSize: 24,
    fontFamily: "SpaceMono-Bold",
    color: "#fff",
  },
  scrollView: {
    paddingHorizontal: 20,
  },
  grid: {
    gap: 16,
    paddingBottom: 40,
  },

  card: {
    borderRadius: 12,
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: "#141414",
  },

  preview: {
    height: 160,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  previewOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  stanImage: {
    width: "100%",
    height: "100%",
    opacity: 0.7,
  },
  stanPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.3,
  },
  placeholderText: {
    fontSize: 24,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 4,
  },

  swatches: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },

  cardInfo: {
    padding: 14,
    gap: 4,
  },
  themeName: {
    fontSize: 14,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 2,
  },
  themeDesc: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    letterSpacing: 0.5,
  },
  selectedBadge: {
    fontSize: 11,
    fontFamily: "SpaceMono-Bold",
    letterSpacing: 1,
    marginTop: 6,
  },
});
