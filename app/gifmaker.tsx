import React, { useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ScrollView, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import { FFmpegKit, ReturnCode } from "ffmpeg-kit-react-native";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db, storage } from "../src/lib/firebase";
import Slider from "@react-native-community/slider";

const MAX_DURATION = 15; // Max GIF duration in seconds

export default function GifMaker() {
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [gifUri, setGifUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const videoRef = useRef<Video>(null);

  const pickVideo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert("Permission needed", "Please allow access to your photo library");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
      const duration = result.assets[0].duration ? result.assets[0].duration / 1000 : 0;
      const maxDuration = Math.min(duration, MAX_DURATION);
      setVideoDuration(duration);
      setTrimStart(0);
      setTrimEnd(maxDuration);
      setGifUri(null);
    }
  };

  const createGif = async () => {
    if (!videoUri) return;

    // Validate trim duration
    const trimDuration = trimEnd - trimStart;
    if (trimDuration < 0.5) {
      Alert.alert("Too short", "GIF must be at least 0.5 seconds long");
      return;
    }
    if (trimDuration > MAX_DURATION) {
      Alert.alert("Too long", `GIF cannot be longer than ${MAX_DURATION} seconds`);
      return;
    }

    setProcessing(true);
    setProgress("Converting video to GIF...");

    try {
      // Create output path
      const outputPath = `${FileSystem.cacheDirectory}stanclickin_${Date.now()}.gif`;

      // FFmpeg command to create high-quality GIF with watermark
      // Two-pass approach for better color palette
      const command = `-i "${videoUri}" -ss ${trimStart} -t ${trimDuration} -vf "scale=480:-1:flags=lanczos,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='STANCLICKIN':fontsize=24:fontcolor=white:bordercolor=black:borderw=2:x=(w-text_w)/2:y=h-50,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer" -loop 0 "${outputPath}"`;

      console.log("FFmpeg command:", command);

      // Execute FFmpeg
      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        console.log("GIF created successfully:", outputPath);
        setGifUri(outputPath);
        setProgress("GIF created!");
        Alert.alert("Success!", "Your GIF is ready!");
      } else {
        const output = await session.getOutput();
        console.error("FFmpeg failed:", output);
        Alert.alert("Error", "Failed to create GIF. Please try a shorter video.");
      }
    } catch (error) {
      console.error("Error creating GIF:", error);
      Alert.alert("Error", "Failed to process video");
    } finally {
      setProcessing(false);
      setProgress("");
    }
  };

  const saveToPhone = async () => {
    if (!gifUri) return;

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow access to save to your photo library");
        return;
      }

      await MediaLibrary.saveToLibraryAsync(gifUri);
      Alert.alert("Saved!", "GIF saved to your photo library");
    } catch (error) {
      console.error("Error saving GIF:", error);
      Alert.alert("Error", "Failed to save GIF to library");
    }
  };

  const postToStanspace = async () => {
    if (!gifUri) return;

    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Not logged in", "Please log in to post to STANSPACE");
      return;
    }

    setProcessing(true);
    setProgress("Uploading to STANSPACE...");

    try {
      // Read GIF file
      const gifContent = await FileSystem.readAsStringAsync(gifUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert to blob
      const response = await fetch(`data:image/gif;base64,${gifContent}`);
      const blob = await response.blob();

      const filename = `${Date.now()}.gif`;
      const storageRef = ref(storage, `posts/${user.uid}/${filename}`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "posts"), {
        uid: user.uid,
        text: "Check out my STANCLICKIN GIF! 🎬",
        imageUrl: downloadUrl,
        likeCount: 0,
        commentCount: 0,
        engagementCount: 0,
        createdAt: serverTimestamp(),
      });

      Alert.alert("Posted!", "Your GIF has been shared to STANSPACE", [
        { text: "OK", onPress: () => router.push("/stanspace") },
      ]);
    } catch (error) {
      console.error("Error posting GIF:", error);
      Alert.alert("Error", "Failed to post GIF to STANSPACE");
    } finally {
      setProcessing(false);
      setProgress("");
    }
  };

  const reset = () => {
    setVideoUri(null);
    setGifUri(null);
    setVideoDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setProgress("");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.h1}>GIF MAKER</Text>
          <View style={{ width: 70 }} />
        </View>

        <Text style={styles.subtitle}>Turn videos into STANCLICKIN-branded GIFs</Text>
        <Text style={styles.note}>⚠️ Requires development build or production app (not Expo Go)</Text>

        {!videoUri && !gifUri && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎬</Text>
            <Text style={styles.emptyText}>Select a video to get started</Text>
            <Pressable style={styles.primaryBtn} onPress={pickVideo}>
              <Text style={styles.primaryBtnText}>📹 Select Video</Text>
            </Pressable>
          </View>
        )}

        {videoUri && !gifUri && (
          <View style={styles.videoSection}>
            <Video
              ref={videoRef}
              source={{ uri: videoUri }}
              style={styles.videoPreview}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              isLooping
            />

            <View style={styles.trimSection}>
              <Text style={styles.trimTitle}>Trim Video (max {MAX_DURATION}s)</Text>

              <View style={styles.timeDisplay}>
                <Text style={styles.timeText}>Start: {formatTime(trimStart)}</Text>
                <Text style={styles.durationText}>
                  Duration: {formatTime(trimEnd - trimStart)}
                </Text>
                <Text style={styles.timeText}>End: {formatTime(trimEnd)}</Text>
              </View>

              <Text style={styles.sliderLabel}>Start Time</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={Math.max(0, videoDuration - 0.5)}
                value={trimStart}
                onValueChange={setTrimStart}
                minimumTrackTintColor="#111"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#111"
                step={0.1}
              />

              <Text style={styles.sliderLabel}>End Time</Text>
              <Slider
                style={styles.slider}
                minimumValue={trimStart + 0.5}
                maximumValue={Math.min(videoDuration, trimStart + MAX_DURATION)}
                value={trimEnd}
                onValueChange={setTrimEnd}
                minimumTrackTintColor="#111"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#111"
                step={0.1}
              />
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.secondaryBtn} onPress={reset}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, styles.flexBtn]}
                onPress={createGif}
                disabled={processing}
              >
                <Text style={styles.primaryBtnText}>
                  {processing ? "Processing..." : "✨ Create GIF"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {gifUri && (
          <View style={styles.gifSection}>
            <Text style={styles.successText}>✅ GIF Ready!</Text>
            <Text style={styles.info}>
              Duration: {formatTime(trimEnd - trimStart)} • STANCLICKIN watermark added
            </Text>

            {/* GIF preview */}
            <View style={styles.gifPreviewContainer}>
              <Text style={styles.gifPreviewText}>
                GIF created successfully!{'\n'}
                Tap buttons below to save or share.
              </Text>
            </View>

            <View style={styles.actionButtons}>
              <Pressable style={styles.actionBtn} onPress={saveToPhone}>
                <Text style={styles.actionBtnText}>💾 Save to Phone</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={postToStanspace}>
                <Text style={styles.actionBtnText}>📤 Post to STANSPACE</Text>
              </Pressable>
            </View>
            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetBtnText}>Create Another GIF</Text>
            </Pressable>
          </View>
        )}

        {processing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#111" />
            <Text style={styles.processingText}>{progress}</Text>
            <Text style={styles.processingSubtext}>This may take a minute...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  backBtn: { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: "#111", borderRadius: 999 },
  backText: { fontWeight: "900", color: "#111" },
  h1: { fontSize: 22, fontWeight: "900", color: "#111" },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 4, textAlign: "center" },
  note: { fontSize: 11, color: "#ff6b6b", marginBottom: 20, textAlign: "center", fontStyle: "italic" },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 16, color: "#666", marginBottom: 24 },

  videoSection: { gap: 16 },
  videoPreview: { width: "100%", height: 300, backgroundColor: "#000", borderRadius: 12 },

  trimSection: {
    backgroundColor: "#f9f9f9",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    gap: 12,
  },
  trimTitle: { fontSize: 16, fontWeight: "900", color: "#111", textAlign: "center" },
  timeDisplay: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  timeText: { fontSize: 13, fontWeight: "700", color: "#111" },
  durationText: { fontSize: 13, fontWeight: "900", color: "#111" },
  sliderLabel: { fontSize: 12, fontWeight: "700", color: "#666", marginTop: 8 },
  slider: { width: "100%", height: 40 },

  info: { fontSize: 13, color: "#666", textAlign: "center" },
  successText: { fontSize: 18, fontWeight: "900", color: "#111", textAlign: "center" },

  gifSection: { gap: 16 },
  gifPreviewContainer: {
    width: "100%",
    height: 300,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#111",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  gifPreviewText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#666",
    textAlign: "center",
  },

  actions: { flexDirection: "row", gap: 10 },
  primaryBtn: { backgroundColor: "#111", padding: 16, borderRadius: 12, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  secondaryBtn: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#111", padding: 16, borderRadius: 12, alignItems: "center" },
  secondaryBtnText: { color: "#111", fontWeight: "900", fontSize: 16 },
  flexBtn: { flex: 1 },

  actionButtons: { width: "100%", gap: 10 },
  actionBtn: { backgroundColor: "#111", padding: 16, borderRadius: 12, alignItems: "center" },
  actionBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  resetBtn: { marginTop: 8, padding: 12 },
  resetBtnText: { color: "#666", fontWeight: "900", textDecorationLine: "underline", textAlign: "center" },

  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  processingText: { fontSize: 16, fontWeight: "900", color: "#111" },
  processingSubtext: { fontSize: 13, fontWeight: "600", color: "#666" },
});
