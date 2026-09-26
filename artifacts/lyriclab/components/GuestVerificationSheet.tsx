import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Turnstile } from "@/components/Turnstile";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const GUEST_SIGNUP_ERROR = "Guest play isn't available right now. Sign up to play.";

interface GuestVerificationSheetProps {
  visible: boolean;
  onClose: () => void;
  onVerified: () => void;
}

export function GuestVerificationSheet({
  visible,
  onClose,
  onVerified,
}: GuestVerificationSheetProps) {
  const colors = useColors();
  const { signInAnonymously } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToken = useCallback(
    async (nextToken: string | null) => {
      setToken(nextToken);
      setError(null);
      if (!nextToken || loading) return;

      setLoading(true);
      const result = await signInAnonymously(nextToken);
      setLoading(false);
      if (result.error) {
        if (__DEV__) {
          console.warn("[LyricLab] anonymous sign-in failed:", result.error);
        }
        setToken(null);
        setError(GUEST_SIGNUP_ERROR);
        setResetKey((value) => value + 1);
        return;
      }
      onVerified();
    },
    [loading, onVerified, signInAnonymously],
  );

  const close = () => {
    if (loading) return;
    setToken(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>One quick check</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            Verify once to start your free guest turns. Your local progress stays on this device.
          </Text>
          <Turnstile onToken={handleToken} resetKey={resetKey} />
          {loading ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.statusText, { color: colors.textMuted }]}>
                Starting guest play…
              </Text>
            </View>
          ) : null}
          {error ? (
            <View style={[styles.errorBox, { borderColor: colors.red, backgroundColor: colors.red + "18" }]}>
              <Text style={[styles.errorText, { color: colors.red }]}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  close();
                  router.replace("/auth");
                }}
                style={[styles.signupButton, { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.signupText, { color: colors.background }]}>Sign up</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue without guest play"
            disabled={loading}
            onPress={close}
            style={styles.cancelButton}
          >
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Not now</Text>
          </Pressable>
          {token && !loading && !error ? (
            <Text style={[styles.helperText, { color: colors.textMuted }]}>
              Verification complete.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 12,
  },
  grabber: {
    alignSelf: "center",
    borderRadius: 3,
    height: 5,
    width: 42,
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: "800" },
  description: { fontSize: 14, lineHeight: 20 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { fontSize: 13 },
  errorBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  errorText: { fontSize: 13, lineHeight: 18 },
  signupButton: { borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  signupText: { fontSize: 14, fontWeight: "800" },
  cancelButton: { alignItems: "center", paddingVertical: 6 },
  cancelText: { fontSize: 14, fontWeight: "600" },
  helperText: { fontSize: 12, textAlign: "center" },
});