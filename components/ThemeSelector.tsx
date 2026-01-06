import React from "react";
import { View, Text, Modal, Pressable, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { themes, ThemeId, Theme } from "../src/lib/themes";

type ThemeSelectorProps = {
  visible: boolean;
  currentTheme: ThemeId;
  onClose: () => void;
  onSelectTheme: (themeId: ThemeId) => void;
};

export function ThemeSelector({ visible, currentTheme, onClose, onSelectTheme }: ThemeSelectorProps) {
  const themeList = Object.values(themes);

  const handleSelect = (themeId: ThemeId) => {
    onSelectTheme(themeId);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose Your Theme</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
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
  return (
    <Pressable
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={onSelect}
    >
      {/* Theme preview with gradient or solid background */}
      <View
        style={[
          styles.preview,
          { backgroundColor: theme.backgroundColor },
        ]}
      >
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
            <Text style={[styles.placeholderText, { color: theme.textColor }]}>
              Stan Photo
            </Text>
          </View>
        )}

        {/* Color swatches */}
        <View style={styles.swatches}>
          <View style={[styles.swatch, { backgroundColor: theme.primaryColor }]} />
          <View style={[styles.swatch, { backgroundColor: theme.accentColor }]} />
        </View>
      </View>

      {/* Theme info */}
      <View style={styles.cardInfo}>
        <Text style={styles.themeName}>{theme.name}</Text>
        <Text style={styles.themeDesc}>{theme.description}</Text>
        {isSelected && <Text style={styles.selectedBadge}>✓ Active</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    fontSize: 24,
    fontWeight: "900",
    color: "#111",
  },
  closeBtn: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111",
  },
  scrollView: {
    paddingHorizontal: 20,
  },
  grid: {
    gap: 16,
    paddingBottom: 40,
  },

  card: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#e0e0e0",
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  cardSelected: {
    borderColor: "#111",
    borderWidth: 3,
  },

  preview: {
    height: 200,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  stanImage: {
    width: "100%",
    height: "100%",
    opacity: 0.85,
  },
  stanPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.3,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: "700",
  },

  swatches: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#fff",
  },

  cardInfo: {
    padding: 16,
    gap: 4,
  },
  themeName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
  },
  themeDesc: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  selectedBadge: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    marginTop: 4,
  },
});
