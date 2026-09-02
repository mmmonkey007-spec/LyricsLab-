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

const GUEST_KEY = "lyriclab_is_guest";
const USERNAME_KEY = "lyriclab_username";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  username: string | null;
  isGuest: boolean;
  isLoading: boolean;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
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
        const guestRaw = await AsyncStorage.getItem(GUEST_KEY);
        if (guestRaw === "true") {
          setIsGuest(true);
          setIsLoading(false);
          return;
        }

        const {
          data: { session: existing },
        } = await supabase.auth.getSession();

        if (existing) {
          setSession(existing);
          setUser(existing.user);
          const storedName = await AsyncStorage.getItem(USERNAME_KEY);
          const uname =
            storedName ??
            ((existing.user.user_metadata?.username as string | undefined) ?? null);
          setUsername(uname);
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
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      uname: string
    ): Promise<{ error: string | null; needsConfirmation?: boolean }> => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: uname } },
        });
        if (error) return { error: error.message };

        // ⛔ Supabase returns NO SESSION when the project requires email
        // confirmation. The account exists but cannot sign in yet, and
        // signInWithPassword answers "Invalid login credentials" until the
        // address is confirmed. Treating that as a successful sign-up told the
        // player he was in, flipped him out of guest mode, and left him unable
        // to log in with the credentials he had just chosen.
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
    []
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
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
