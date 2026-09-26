import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type ScreenState = "checking" | "private" | "error" | "signIn";

interface PrelaunchAccessScreenProps {
  state: ScreenState;
  onRetry?: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

const COPY: Record<ScreenState, { title: string; message: string; icon: keyof typeof Feather.glyphMap }> = {
  checking: {
    title: "Checking access",
    message: "Please wait while we verify this account.",
    icon: "shield",
  },
  private: {
    title: "Coming soon — private testing",
    message: "LyricLab is in private testing. This account does not have access yet.",
    icon: "lock",
  },
  error: {
    title: "Access check unavailable",
    message: "We could not verify access. Please try again before continuing.",
    icon: "alert-circle",
  },
  signIn: {
    title: "Private testing",
    message: "Sign in with an approved tester account to continue.",
    icon: "lock",
  },
};

export function PrelaunchAccessScreen({
  state,
  onRetry,
  onSignIn,
  onSignOut,
}: PrelaunchAccessScreenProps) {
  const colors = useColors();
  const copy = COPY[state];
  const action = onSignIn ?? onRetry ?? onSignOut;
  const actionLabel = onSignIn ? "Sign in" : onRetry ? "Try again" : "Sign out";
  const actionIcon = onSignIn ? "log-in" : onRetry ? "refresh-cw" : "log-out";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.icon,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name={copy.icon} size={25} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
        <Text style={[styles.message, { color: colors.textMuted }]}>{copy.message}</Text>

        {action ? (
          <Pressable
            accessibilityRole="button"
            onPress={action}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <Feather name={actionIcon as keyof typeof Feather.glyphMap} size={17} color={colors.primaryForeground} />
            <Text style={[styles.actionText, { color: colors.primaryForeground }]}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  icon: {
    width: 58,
    height: 58,
    borderWidth: 1,
    borderRadius: 29,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 22,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 25,
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
  },
  action: {
    minHeight: 48,
    minWidth: 148,
    paddingHorizontal: 18,
    marginTop: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  actionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});