import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { router, Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { InlineIcon } from "@/components/InlineIcon";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { GameProvider, useGame } from "@/context/GameContext";
import { OnboardingProvider, useOnboarding } from "@/context/OnboardingContext";
import { SoundProvider } from "@/context/SoundContext";
import { syncCurrencies, syncLeaderboard, syncSession } from "@/services/supabaseSync";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
setBaseUrl(process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : null);

// ── Background Supabase sync — renders null, runs effects ─────────────────────
function SupabaseSyncBridge() {
  const { sessions } = useGame();
  const { user, username } = useAuth();
  const { chosenClass, skillz } = useOnboarding();
  const lastSyncedId = useRef<string | null>(null);
  const lastSyncedSkillz = useRef<number>(-1);

  useEffect(() => {
    if (!user || sessions.length === 0) return;
    const latest = sessions[0];
    if (!latest || latest.id === lastSyncedId.current || latest.isWeaknessCoach) return;
    lastSyncedId.current = latest.id;

    const nonCoach = sessions.filter((s) => !s.isWeaknessCoach);
    const bestScore = nonCoach.length ? Math.max(...nonCoach.map((s) => s.finalScore)) : 0;

    syncSession(latest, user.id).catch(() => {});
    syncLeaderboard(
      bestScore,
      nonCoach.length,
      user.id,
      username ?? "Anonymous",
      chosenClass
    ).catch(() => {});
  }, [sessions, user, username, chosenClass]);

  useEffect(() => {
    if (!user || skillz === lastSyncedSkillz.current) return;
    lastSyncedSkillz.current = skillz;
    syncCurrencies(user.id, skillz).catch(() => {});
  }, [skillz, user]);

  return null;
}

// ── Navigation stack with auth gating ─────────────────────────────────────────
function RootLayoutNav() {
  const { user, isGuest, isLoading: authLoading } = useAuth();
  const pathname = usePathname();
  const hasHandledInitialRoute = useRef(false);

  useEffect(() => {
    if (authLoading || hasHandledInitialRoute.current) return;

    hasHandledInitialRoute.current = true;
    if (!isGuest && !user) {
      router.replace("/auth" as never);
    } else if (pathname === "/") {
      router.replace("/main" as never);
    }
  }, [authLoading, isGuest, pathname, user]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="write" options={{ headerShown: false, animation: "slide_from_bottom" }} />
      <Stack.Screen name="result" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="battle-result" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="class-selection" options={{ headerShown: false, animation: "slide_from_bottom" }} />
      <Stack.Screen name="class-intro" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="leaderboard" options={{ headerShown: false, animation: "slide_from_right" }} />
    </Stack>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <SoundProvider>
                <AuthProvider>
                  <GameProvider>
                    <OnboardingProvider>
                      <SupabaseSyncBridge />
                      <RootLayoutNav />
                    </OnboardingProvider>
                  </GameProvider>
                </AuthProvider>
              </SoundProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
