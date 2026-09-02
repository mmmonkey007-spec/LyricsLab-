import * as WebBrowser from "expo-web-browser";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { InlineIcon } from "@/components/InlineIcon";
import { useColors } from "@/hooks/useColors";
import { useSound } from "@/context/SoundContext";

WebBrowser.maybeCompleteAuthSession();

type EmailTab = "signin" | "signup";

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithGoogle, continueAsGuest } = useAuth();

  const [emailExpanded, setEmailExpanded] = useState(false);
  const [emailTab, setEmailTab] = useState<EmailTab>("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { playBgMusic, stopBgMusicFade } = useSound();

  // Calm music on the auth/loading screen — shares the same Stars/Dreamer
  // channel as the home screen, so returning users get seamless continuation.
  useFocusEffect(
    useCallback(() => {
      playBgMusic(900, "intro");
      return () => { stopBgMusicFade(400); };
    }, [playBgMusic, stopBgMusicFade])
  );

  const isSignUp = emailTab === "signup";

  const handleGoogle = () => {
    // Google OAuth not yet configured — button is disabled
  };

  const handleGuest = async () => {
    await continueAsGuest();
    router.replace("/main");
  };

  const handleEmailSubmit = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) { setError("Email is required."); return; }
    if (isSignUp && !username.trim()) { setError("Username is required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setLoading("email");
    try {
      const result = isSignUp
        ? await signUp(email.trim(), password, username.trim())
        : await signIn(email.trim(), password);

      if (result.error) {
        setError(result.error);
      } else if ("needsConfirmation" in result && result.needsConfirmation) {
        setNotice(`Account created. Confirm your email at ${email.trim()}, then sign in.`);
        setEmailTab("signin");
      } else {
        router.replace("/main");
      }
    } finally {
      setLoading(null);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: topPad + 52, paddingBottom: bottomPad + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoWrap}>
            <Text style={[styles.logo, { color: colors.accent }]}>LYRICLAB</Text>
            <Text style={[styles.logoSub, { color: colors.textMuted }]}>
              Craft. Score. Improve.
            </Text>
          </View>

          {/* Primary — Google (disabled until OAuth credentials configured) */}
          <TouchableOpacity
            onPress={handleGoogle}
            disabled
            activeOpacity={1}
            style={[styles.googleBtn, styles.googleBtnDisabled]}
          >
            <View style={styles.gLetter}>
              <Text style={styles.gLetterText}>G</Text>
            </View>
            <Text style={styles.googleTextDisabled}>Google Sign-In (Coming Soon)</Text>
          </TouchableOpacity>

          {/* Secondary — Guest */}
          <TouchableOpacity
            onPress={handleGuest}
            activeOpacity={0.7}
            style={styles.guestBtn}
          >
            <Text style={[styles.guestText, { color: colors.textMuted }]}>
              Play as Guest
            </Text>
            <Text style={[styles.guestSub, { color: colors.textMuted + "77" }]}>
              Progress saved locally · no account needed
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textMuted }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Tertiary — Email expandable */}
          <TouchableOpacity
            onPress={() => setEmailExpanded((v) => !v)}
            activeOpacity={0.75}
            style={[
              styles.emailToggle,
              { borderColor: emailExpanded ? colors.accent + "55" : colors.border },
            ]}
          >
            <InlineIcon
              name="mail"
              size={15}
              color={emailExpanded ? colors.accent : colors.textMuted}
            />
            <Text
              style={[
                styles.emailToggleText,
                { color: emailExpanded ? colors.accent : colors.textMuted },
              ]}
            >
              Sign in with email
            </Text>
            <InlineIcon
              name={emailExpanded ? "chevron-up" : "chevron-down"}
              size={15}
              color={emailExpanded ? colors.accent : colors.textMuted}
            />
          </TouchableOpacity>

          {emailExpanded && (
            <View style={[styles.emailSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Sign in / Sign up tabs */}
              <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
                {(["signin", "signup"] as EmailTab[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => { setEmailTab(t); setError(null); setNotice(null); }}
                    style={[
                      styles.tabBtn,
                      emailTab === t && { borderBottomColor: colors.accent, borderBottomWidth: 2 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabLabel,
                        { color: emailTab === t ? colors.accent : colors.textMuted },
                      ]}
                    >
                      {t === "signin" ? "Sign In" : "Sign Up"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Fields */}
              <View style={styles.form}>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>EMAIL</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.textMuted + "55"}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>

                {isSignUp && (
                  <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.inputLabel, { color: colors.textMuted }]}>USERNAME</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      value={username}
                      onChangeText={setUsername}
                      placeholder="your_handle"
                      placeholderTextColor={colors.textMuted + "55"}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                    />
                  </View>
                )}

                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>PASSWORD</Text>
                  <TextInput
                    style={[styles.input, styles.inputWithReveal, { color: colors.text }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textMuted + "55"}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleEmailSubmit}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    hitSlop={12}
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.revealBtn}
                  >
                    <Text style={[styles.revealText, { color: colors.textMuted }]}>
                      {showPassword ? "HIDE" : "SHOW"}
                    </Text>
                  </Pressable>
                </View>

                {notice ? (
                  <View style={[styles.errorBox, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "44" }]}>
                    <Text style={[styles.errorText, { color: colors.accent }]}>{notice}</Text>
                  </View>
                ) : null}

                {error ? (
                  <View style={[styles.errorBox, { backgroundColor: colors.red + "18", borderColor: colors.red + "44" }]}>
                    <Text style={[styles.errorText, { color: colors.red }]}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={handleEmailSubmit}
                  disabled={loading !== null}
                  activeOpacity={0.85}
                  style={[styles.submitBtn, { backgroundColor: colors.accent, opacity: loading === "email" ? 0.7 : 1 }]}
                >
                  {loading === "email" ? (
                    <ActivityIndicator color={colors.background} size="small" />
                  ) : (
                    <Text style={[styles.submitText, { color: colors.background }]}>
                      {isSignUp ? "Create Account" : "Sign In"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 24 },
  logoWrap: { alignItems: "center", marginBottom: 48 },
  logo: { fontSize: 32, fontWeight: "800", letterSpacing: 5 },
  logoSub: { fontSize: 12, letterSpacing: 1, marginTop: 8 },

  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 14,
  },
  googleBtnDisabled: {
    backgroundColor: "#2A2A35",
    borderWidth: 1,
    borderColor: "#3A3A48",
  },
  gLetter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.45,
  },
  gLetterText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  googleText: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "700",
  },
  googleTextDisabled: {
    color: "#666680",
    fontSize: 15,
    fontWeight: "600",
  },

  guestBtn: { alignItems: "center", gap: 4, paddingVertical: 10, marginBottom: 8 },
  guestText: { fontSize: 15, fontWeight: "500" },
  guestSub: { fontSize: 12 },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12 },

  emailToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 2,
  },
  emailToggleText: { flex: 1, fontSize: 14, fontWeight: "500" },

  emailSection: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginRight: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 14, fontWeight: "600" },
  form: { gap: 10, padding: 16 },
  inputWrap: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 11,
  },
  inputLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  input: { fontSize: 15, padding: 0 },
  inputWithReveal: { paddingRight: 54 },
  revealBtn: { position: "absolute", right: 12, bottom: 9, paddingHorizontal: 4, paddingVertical: 2 },
  revealText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  errorBox: { borderRadius: 10, borderWidth: 1, padding: 11 },
  errorText: { fontSize: 13, fontWeight: "500", lineHeight: 18 },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 2 },
  submitText: { fontSize: 15, fontWeight: "700" },
});
