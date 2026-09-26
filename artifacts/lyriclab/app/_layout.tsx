import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { router, Stack, useGlobalSearchParams, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform } from "react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { InlineIcon } from "@/components/InlineIcon";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { GameProvider, useGame } from "@/context/GameContext";
import { OnboardingProvider } from "@/context/OnboardingContext";
import { SoundProvider } from "@/context/SoundContext";
import { supabase } from "@/services/supabase";
import { RewardPopup } from "@/components/RewardPopup";
import { PrelaunchAccessScreen } from "@/components/PrelaunchAccessScreen";
import { usePrelaunchAccess } from "@/hooks/usePrelaunchAccess";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const FONT_LOAD_TIMEOUT_MS = 8_000;
const WEB_SYSTEM_FONT_FALLBACK = `
@font-face {
  font-family: "Inter_400Regular";
  src: local("Arial"), local("Helvetica Neue"), local("Segoe UI"), local("Roboto"), local("Liberation Sans"), local("DejaVu Sans");
  font-style: normal;
  font-weight: 400;
}
@font-face {
  font-family: "Inter_500Medium";
  src: local("Arial"), local("Helvetica Neue"), local("Segoe UI"), local("Roboto"), local("Liberation Sans"), local("DejaVu Sans");
  font-style: normal;
  font-weight: 500;
}
@font-face {
  font-family: "Inter_600SemiBold";
  src: local("Arial Bold"), local("Helvetica Neue Bold"), local("Segoe UI Semibold"), local("Roboto Medium"), local("Liberation Sans Bold"), local("DejaVu Sans Bold"), local("Arial");
  font-style: normal;
  font-weight: 600;
}
@font-face {
  font-family: "Inter_700Bold";
  src: local("Arial Bold"), local("Helvetica Neue Bold"), local("Segoe UI Bold"), local("Roboto Bold"), local("Liberation Sans Bold"), local("DejaVu Sans Bold"), local("Arial");
  font-style: normal;
  font-weight: 700;
}
`;
setBaseUrl(process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : null);
setAuthTokenGetter(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
});

// ── Navigation stack with auth gating ─────────────────────────────────────────
function RootLayoutNav() {
  const { user, session, isGuest, isLoading: authLoading, signOut } = useAuth();
  const { streakReward, dismissStreakReward } = useGame();
  const pathname = usePathname();
  const routeParams = useGlobalSearchParams<{ previewStep?: string }>();
  const isStoryPreview =
    __DEV__ &&
    ["scene_1", "scene_2", "scene_3", "hook"].includes(routeParams.previewStep ?? "");
  const hasHandledInitialRoute = useRef(false);
  const prelaunch = usePrelaunchAccess();
  const isPublicRoute =
    pathname === "/privacy" ||
    (pathname === "/auth" && !session) ||
    isStoryPreview;

  useEffect(() => {
    if (isStoryPreview && pathname !== "/story") {
      router.replace({ pathname: "/story", params: { previewStep: routeParams.previewStep } } as never);
      return;
    }
    if (
      prelaunch.mode === "on" &&
      prelaunch.needsSignIn &&
      !isPublicRoute
    ) {
      router.replace("/auth" as never);
    }
  }, [isPublicRoute, isStoryPreview, pathname, prelaunch.mode, prelaunch.needsSignIn]);

  useEffect(() => {
    if (authLoading || hasHandledInitialRoute.current) return;

    hasHandledInitialRoute.current = true;
    if (!isGuest && !user && pathname !== "/privacy" && !isStoryPreview) {
      router.replace("/auth" as never);
    } else if (pathname === "/" && !isStoryPreview) {
      router.replace("/main" as never);
    }
  }, [authLoading, isGuest, isStoryPreview, pathname, user]);

  if (!isPublicRoute && prelaunch.mode === "checking") {
    return <PrelaunchAccessScreen state="checking" />;
  }

  if (!isPublicRoute && prelaunch.mode === "error") {
    return <PrelaunchAccessScreen state="error" onRetry={prelaunch.retry} />;
  }

  if (!isPublicRoute && prelaunch.mode === "on") {
    if (!session) {
      return (
        <PrelaunchAccessScreen
          state="signIn"
          onSignIn={() => router.replace("/auth" as never)}
        />
      );
    }
    if (prelaunch.access === "checking") {
      return <PrelaunchAccessScreen state="checking" />;
    }
    if (prelaunch.access === "error") {
      return <PrelaunchAccessScreen state="error" onRetry={prelaunch.retry} />;
    }
    if (prelaunch.access === "blocked") {
      return (
        <PrelaunchAccessScreen
          state="private"
          onSignOut={() => {
            void signOut().then(() => router.replace("/auth" as never));
          }}
        />
      );
    }
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="write" options={{ headerShown: false, animation: "slide_from_bottom" }} />
      <Stack.Screen name="result" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="battle-result" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="class-selection" options={{ headerShown: false, animation: "slide_from_bottom" }} />
      <Stack.Screen name="class-intro" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="leaderboard" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="privacy" options={{ headerShown: false, animation: "slide_from_right" }} />
      </Stack>
      {streakReward ? <RewardPopup reward={streakReward} onDismiss={dismissStreakReward} /> : null}
    </>
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
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false);
  const hasHiddenSplash = useRef(false);
  const useSystemFontFallback = Boolean(fontError) || (fontLoadTimedOut && !fontsLoaded);

  useEffect(() => {
    if (Platform.OS !== "web" || fontsLoaded || fontError) return;

    const timeout = setTimeout(() => {
      console.warn(
        `LyricLab fonts did not load within ${FONT_LOAD_TIMEOUT_MS}ms; continuing with system fonts.`,
      );
      setFontLoadTimedOut(true);
    }, FONT_LOAD_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    if (fontError) {
      console.warn("LyricLab font loading failed; continuing with system fonts.", fontError);
    }
  }, [fontError]);

  useEffect(() => {
    if (Platform.OS !== "web" || !useSystemFontFallback || typeof document === "undefined") return;

    const style = document.createElement("style");
    style.dataset.lyriclabFontFallback = "true";
    style.textContent = WEB_SYSTEM_FONT_FALLBACK;
    document.head.appendChild(style);

    return () => style.remove();
  }, [useSystemFontFallback]);

  useEffect(() => {
    if (hasHiddenSplash.current || (!fontsLoaded && !fontError && !fontLoadTimedOut)) return;

    hasHiddenSplash.current = true;
    void SplashScreen.hideAsync().catch((error: unknown) => {
      console.warn("LyricLab could not hide the splash screen after font loading.", error);
    });
  }, [fontError, fontLoadTimedOut, fontsLoaded]);

  if (!fontsLoaded && !fontError && !fontLoadTimedOut) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <SoundProvider>
                <AuthProvider>
                  <OnboardingProvider>
                    <GameProvider>
                      <RootLayoutNav />
                    </GameProvider>
                  </OnboardingProvider>
                </AuthProvider>
              </SoundProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
