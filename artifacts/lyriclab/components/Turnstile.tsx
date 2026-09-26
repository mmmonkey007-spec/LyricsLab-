import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useColors } from "@/hooks/useColors";

const TURNSTILE_PATH = "/api/turnstile";
const TURNSTILE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}${TURNSTILE_PATH}`
  : TURNSTILE_PATH;

type TurnstileMessage =
  | { type: "turnstile"; token: string }
  | { type: "turnstile-expired" }
  | { type: "turnstile-error" };

interface TurnstileProps {
  onToken: (token: string | null) => void;
  resetKey: number;
}

function parseMessage(raw: unknown): TurnstileMessage | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.type === "turnstile" && typeof message.token === "string" && message.token.length > 0) {
    return { type: "turnstile", token: message.token };
  }
  if (message.type === "turnstile-expired") return { type: "turnstile-expired" };
  if (message.type === "turnstile-error") return { type: "turnstile-error" };
  return null;
}

function expectedApiOrigin(): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    return new URL(TURNSTILE_URL, window.location.href).origin;
  } catch {
    return null;
  }
}

export function Turnstile({ onToken, resetKey }: TurnstileProps) {
  const colors = useColors();
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const apiOrigin = expectedApiOrigin();

  useEffect(() => {
    setFailed(false);
    onToken(null);
  }, [onToken, resetKey]);

  const handleMessage = useCallback(
    (raw: unknown) => {
      const message = parseMessage(raw);
      if (!message) return;
      if (message.type === "turnstile") {
        setFailed(false);
        onToken(message.token);
      } else if (message.type === "turnstile-expired") {
        onToken(null);
      } else {
        onToken(null);
        setFailed(true);
      }
    },
    [onToken],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handleWindowMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!apiOrigin || event.origin !== apiOrigin || !iframeWindow || event.source !== iframeWindow) {
        return;
      }
      handleMessage(event.data);
    };

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, [apiOrigin, handleMessage, resetKey]);

  const retry = useCallback(() => {
    onToken(null);
    setFailed(false);
    setReloadKey((value) => value + 1);
  }, [onToken]);

  if (failed) {
    return (
      <View style={styles.failure}>
        <Text style={[styles.failureText, { color: colors.textMuted }]}>
          Verification couldn&apos;t load, check your connection and retry
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry verification"
          onPress={retry}
          style={[styles.retryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.retryText, { color: colors.accent }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (Platform.OS === "web") {
    const iframe = React.createElement("iframe", {
      key: `${resetKey}-${reloadKey}`,
      ref: iframeRef,
      title: "Security verification",
      src: TURNSTILE_URL,
      onLoad: () => setFailed(false),
      onError: () => {
        onToken(null);
        setFailed(true);
      },
      style: { width: "100%", height: 82, border: 0, background: "transparent" },
    });

    return (
      <View style={styles.container}>
        {React.createElement(
          React.Fragment,
          null,
          iframe,
        )}
      </View>
    );
  }

  const handleNativeMessage = (event: WebViewMessageEvent) => {
    const messageUrl = event.nativeEvent.url;
    if (messageUrl && apiOrigin) {
      try {
        if (new URL(messageUrl).origin !== apiOrigin) return;
      } catch {
        return;
      }
    }
    handleMessage(event.nativeEvent.data);
  };

  return (
    <View style={styles.container}>
      <WebView
        key={`${resetKey}-${reloadKey}`}
        source={{ uri: TURNSTILE_URL }}
        originWhitelist={["https://*"]}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleNativeMessage}
        onError={() => {
          onToken(null);
          setFailed(true);
        }}
        onHttpError={(event) => {
          if (event.nativeEvent.statusCode >= 400) {
            onToken(null);
            setFailed(true);
          }
        }}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", minHeight: 82, overflow: "hidden" },
  webView: { width: "100%", height: 82, backgroundColor: "transparent" },
  failure: { alignItems: "center", gap: 8, minHeight: 82, justifyContent: "center", paddingHorizontal: 8 },
  failureText: { fontSize: 12, textAlign: "center" },
  retryButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  retryText: { fontSize: 12, fontWeight: "700" },
});