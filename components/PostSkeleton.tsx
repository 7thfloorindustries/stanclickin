import React from "react";
import { View, StyleSheet } from "react-native";

export function PostSkeleton() {
  return (
    <View style={styles.post}>
      <View style={styles.header}>
        <View style={styles.avatar} />
        <View style={styles.headerText}>
          <View style={styles.nameSkeleton} />
          <View style={styles.timeSkeleton} />
        </View>
      </View>

      <View style={styles.textSkeleton1} />
      <View style={styles.textSkeleton2} />

      <View style={styles.actions}>
        <View style={styles.actionSkeleton} />
        <View style={styles.actionSkeleton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fafafa",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e0e0e0",
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  nameSkeleton: {
    width: 100,
    height: 12,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
  },
  timeSkeleton: {
    width: 60,
    height: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
  },
  textSkeleton1: {
    width: "90%",
    height: 14,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    marginBottom: 6,
  },
  textSkeleton2: {
    width: "70%",
    height: 14,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  actionSkeleton: {
    flex: 1,
    height: 36,
    backgroundColor: "#e0e0e0",
    borderRadius: 999,
  },
});
