import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { supabase } from "@/services/supabase";
import { getOrCreateInstallId } from "@/services/installId";
import { validateUsername, USERNAME_ERROR } from "@/services/usernameValidation";

const GUEST_KEY = "lyriclab_is_guest";
const USERNAME_KEY = "lyriclab_username";
const API_BASE = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : "/api";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  username: string | null;
  isGuest: boolean;
  isLoading: boolean;
  signUp: (
    email: string,
    password: string,
    username: string,
    captchaToken: string,
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signIn: (
    email: string,
    password: string,
    captchaToken: string,
  ) => Promise<{ error: string | null }>;
  signInAnonymously: (captchaToken: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        await getOrCreateInstallId();
        const guestRaw = await AsyncStorage.getItem(GUEST_KEY);
        const {
          data: { session: existing },
        } = await supabase.auth.getSession();

        if (existing) {
          const anonymous = existing.user.is_anonymous === true;
          setSession(existing);
          setUser(existing.user);
          const storedName = anonymous ? null : await AsyncStorage.getItem(USERNAME_KEY);
          const uname = anonymous
            ? "Guest"
            : storedName ??
              ((existing.user.user_metadata?.username as string | undefined) ?? null);
          setUsername(uname);
          setIsGuest(anonymous);
          await AsyncStorage.setItem(GUEST_KEY, anonymous ? "true" : "false");
        } else if (guestRaw === "true") {
          setIsGuest(true);
          setUsername(null);
        }
      } catch {
        setIsGuest(true);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      const anonymous = s?.user?.is_anonymous === true;
      setSession(s);
      setUser(s?.user ?? null);
      if (anonymous) {
        setIsGuest(true);
        setUsername("Guest");
        void AsyncStorage.setItem(GUEST_KEY, "true");
      } else if (s?.user) {
        setIsGuest(false);
        const uname = (s.user.user_metadata?.username as string | undefined) ?? null;
        setUsername(uname);
        void AsyncStorage.setItem(GUEST_KEY, "false");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      uname: string,
      captchaToken: string,
    ): Promise<{ error: string | null; needsConfirmation?: boolean }> => {
      try {
        const localError = validateUsername(uname);
        if (localError) return { error: USERNAME_ERROR };
        const validation = await fetch(`${API_BASE}/username/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: uname }),
        });
        if (!validation.ok) {
          const body = (await validation.json().catch(() => ({}))) as { error?: string };
          return { error: body.error ?? USERNAME_ERROR };
        }
        // Supabase must create a separate normal account, not upgrade/link the
        // anonymous identity. Local game data remains on the device.
        if (user?.is_anonymous) {
          await supabase.auth.signOut();
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: uname }, captchaToken },
        });
        if (error) return { error: error.message };
        if (!data.session) {
          return { error: null, needsConfirmation: true };
        }
        setUsername(uname);
        await AsyncStorage.multiSet([
          [USERNAME_KEY, uname],
          [GUEST_KEY, "false"],
        ]);
        setIsGuest(false);
        return { error: null };
      } catch {
        return { error: "Network error. Please try again." };
      }
    },
    [user]
  );

  const signIn = useCallback(
    async (
      email: string,
      password: string,
      captchaToken: string,
    ): Promise<{ error: string | null }> => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
        if (error) return { error: error.message };
        const uname =
          ((data.user?.user_metadata?.username as string | undefined) ?? null);
        if (uname) {
          setUsername(uname);
          await AsyncStorage.setItem(USERNAME_KEY, uname);
        }
        await AsyncStorage.removeItem(GUEST_KEY);
        setIsGuest(false);
        return { error: null };
      } catch {
        return { error: "Network error. Please try again." };
      }
    },
    []
  );

  const signInAnonymously = useCallback(
    async (captchaToken: string): Promise<{ error: string | null }> => {
      try {
        const { data, error } = await supabase.auth.signInAnonymously({
          options: { captchaToken },
        });
        if (error) return { error: error.message };
        if (!data.session) return { error: "Guest play isn't available right now. Sign up to play." };
        setSession(data.session);
        setUser(data.user);
        setUsername("Guest");
        setIsGuest(true);
        await AsyncStorage.setItem(GUEST_KEY, "true");
        return { error: null };
      } catch {
        return { error: "Guest play isn't available right now. Sign up to play." };
      }
    },
    [],
  );

  const signInWithGoogle = useCallback(
    async (): Promise<{ error: string | null }> => {
      try {
        const redirectTo = Linking.createURL("/");
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) return { error: error.message };
        if (!data.url) return { error: "Could not start Google sign-in." };

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === "success") {
          const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
          if (sessionError) return { error: sessionError.message };
          await AsyncStorage.removeItem(GUEST_KEY);
          setIsGuest(false);
        }
        return { error: null };
      } catch {
        return { error: "Google sign-in failed. Please try again." };
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    setSession(null);
    setUsername(null);
    setIsGuest(true);
    try {
      await AsyncStorage.setItem(GUEST_KEY, "true");
    } catch {}
  }, []);

  const continueAsGuest = useCallback(async () => {
    setIsGuest(true);
    try {
      await AsyncStorage.setItem(GUEST_KEY, "true");
    } catch {}
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        username,
        isGuest,
        isLoading,
        signUp,
        signIn,
        signInAnonymously,
        signInWithGoogle,
        signOut,
        continueAsGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
