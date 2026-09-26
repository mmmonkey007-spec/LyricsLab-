import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import { Buffer } from "buffer";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { downloadPerformanceShareVideo } from "@/services/api";

interface PerformanceShareButtonProps {
  performanceId: number;
  canShareScore: boolean;
}

export function PerformanceShareButton({
  performanceId,
  canShareScore,
}: PerformanceShareButtonProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareVideo = async (withScore: boolean) => {
    setVisible(false);
    setLoading(true);
    setError(null);
    const filename = `lyriclab-${performanceId}-${withScore ? "score" : "rap"}.mp4`;

    try {
      if (Platform.OS !== "web" && !(await Sharing.isAvailableAsync())) {
        throw new Error("The share sheet is not available on this device.");
      }

      const video = await downloadPerformanceShareVideo(performanceId, withScore);
      if (Platform.OS === "web") {
        if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
          throw new Error("Video downloads are not available in this browser.");
        }
        const url = URL.createObjectURL(new Blob([video], { type: "video/mp4" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const cacheDirectory = FileSystem.cacheDirectory;
        if (!cacheDirectory) throw new Error("Device storage is not available.");
        const uri = `${cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, Buffer.from(video).toString("base64"), {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(uri, {
          mimeType: "video/mp4",
          dialogTitle: "Share your verse",
          UTI: "public.movie",
        });
      }
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "We could not prepare the video.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Share your performance video"
        testID="performance-share-button"
        onPress={() => {
          setError(null);
          setVisible(true);
        }}
        disabled={loading}
        style={[
          styles.trigger,
          {
            borderColor: colors.cyan + "66",
            borderRadius: colors.radius,
            opacity: loading ? 0.65 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.cyan} />
        ) : (
          <Feather name="share-2" size={16} color={colors.cyan} />
        )}
        <Text style={[styles.triggerText, { color: colors.cyan }]}>
          {loading ? "Preparing video…" : "Share video"}
        </Text>
      </TouchableOpacity>
      {error && <Text style={[styles.errorText, { color: colors.red }]}>{error}</Text>}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close share options"
            style={styles.backdrop}
            onPress={() => setVisible(false)}
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderTopLeftRadius: colors.radius + 8,
                borderTopRightRadius: colors.radius + 8,
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.text }]}>Share your verse</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Choose what appears in the video.
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="share-rap-only"
              onPress={() => void shareVideo(false)}
              style={[styles.option, { borderColor: colors.border }]}
            >
              <View style={[styles.optionIcon, { backgroundColor: colors.cyan + "18" }]}>
                <Feather name="music" size={18} color={colors.cyan} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>Rap only</Text>
                <Text style={[styles.optionDescription, { color: colors.textMuted }]}>
                  Your verse and performance audio
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textMuted} />
            </Pressable>
            {canShareScore && (
              <Pressable
                accessibilityRole="button"
                testID="share-rap-with-score"
                onPress={() => void shareVideo(true)}
                style={[styles.option, { borderColor: colors.border }]}
              >
                <View style={[styles.optionIcon, { backgroundColor: colors.violet + "18" }]}>
                  <Feather name="award" size={18} color={colors.violet} />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>Rap + my score</Text>
                  <Text style={[styles.optionDescription, { color: colors.textMuted }]}>
                    Add your battle result and tier
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "flex-start",
    marginTop: 10,
  },
  trigger: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    maxWidth: 320,
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.64)",
  },
  sheet: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 5,
    marginBottom: 18,
    fontSize: 13,
  },
  option: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  optionCopy: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  optionDescription: {
    marginTop: 3,
    fontSize: 12,
  },
});