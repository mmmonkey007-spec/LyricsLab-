import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InlineIcon } from "@/components/InlineIcon";
import { PRIVACY_POLICY_LAST_UPDATED, PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_TITLE } from "@/constants/privacyPolicy";
import { useColors } from "@/hooks/useColors";

export default function PrivacyPolicyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 36 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
          <InlineIcon name="arrow-left" size={19} color={colors.text} />
          <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.accent }]}>{PRIVACY_POLICY_TITLE}</Text>
        <Text style={[styles.updated, { color: colors.textMuted }]}>Last updated: {PRIVACY_POLICY_LAST_UPDATED}</Text>
        {PRIVACY_POLICY_SECTIONS.map(({ heading, body }) => (
          <View key={heading} style={styles.section}>
            <Text style={[styles.heading, { color: colors.text }]}>{heading}</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 22 },
  back: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, marginBottom: 24 },
  backText: { fontSize: 15, fontWeight: "600" },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 8 },
  updated: { fontSize: 13, marginBottom: 20 },
  section: { marginTop: 18 },
  heading: { fontSize: 17, fontWeight: "700", marginBottom: 7 },
  body: { fontSize: 14, lineHeight: 22 },
});