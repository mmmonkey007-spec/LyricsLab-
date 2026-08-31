import { router } from "expo-router";
import React from "react";
import {
  Platform,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoomboxIcon } from "@/components/BoomboxIcon";
import { InlineIcon } from "@/components/InlineIcon";
import { useSound } from "@/context/SoundContext";
import { useColors } from "@/hooks/useColors";

export default function AudioSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sfxMuted, setSfxMuted, musicMuted, setMusicMuted } = useSound();

  const topPad    = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 10,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <InlineIcon name="arrow-left" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        <BoomboxIcon size={26} />
        <Text style={[styles.title, { color: colors.text }]}>Audio</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.content, { paddingBottom: bottomPad + 24 }]}>

        {/* Background music toggle */}
        <View
          style={[
            styles.row,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.rowLeft}>
            <View
              style={[
                styles.rowIconWrap,
                { backgroundColor: (musicMuted ? colors.textMuted : colors.accent) + "22" },
              ]}
            >
              <InlineIcon
                name={musicMuted ? "music" : "music"}
                size={18}
                color={musicMuted ? colors.textMuted : colors.accent}
              />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Background Music
              </Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Ambient loop on the home screen
              </Text>
            </View>
          </View>
          <Switch
            value={!musicMuted}
            onValueChange={(val) => setMusicMuted(!val)}
            trackColor={{ false: colors.border, true: colors.accent + "aa" }}
            thumbColor={!musicMuted ? colors.accent : colors.textMuted}
          />
        </View>

        {/* SFX toggle */}
        <View
          style={[
            styles.row,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.rowLeft}>
            <View
              style={[
                styles.rowIconWrap,
                { backgroundColor: (sfxMuted ? colors.textMuted : colors.cyan) + "22" },
              ]}
            >
              <InlineIcon
                name={sfxMuted ? "volume-x" : "volume-2"}
                size={18}
                color={sfxMuted ? colors.textMuted : colors.cyan}
              />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Sound Effects
              </Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Taps, scores, misses, quest rewards
              </Text>
            </View>
          </View>
          <Switch
            value={!sfxMuted}
            onValueChange={(val) => setSfxMuted(!val)}
            trackColor={{ false: colors.border, true: colors.cyan + "aa" }}
            thumbColor={!sfxMuted ? colors.cyan : colors.textMuted}
          />
        </View>

        <Text style={[styles.note, { color: colors.textMuted }]}>
          Changes take effect immediately — no restart needed.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
  },
  headerSpacer: { width: 40 },
  content: {
    padding: 20,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  rowSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 4,
  },
});
