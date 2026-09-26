import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useRicoCourtBackflipAsset } from "@/hooks/useRicoCourtBackflipAsset";

type CourtBackflipPlayerProps = {
  playKey: number;
  onStarted?: () => void;
  onEnded: () => void;
  onError: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function CourtBackflipPlayer({
  onStarted,
  onEnded,
  onError,
  style,
  testID,
}: CourtBackflipPlayerProps) {
  const { uri, error } = useRicoCourtBackflipAsset();
  const errorSent = useRef(false);

  const notifyError = useCallback(() => {
    if (errorSent.current) return;
    errorSent.current = true;
    onError();
  }, [onError]);

  useEffect(() => {
    if (error) notifyError();
  }, [error, notifyError]);

  const baseUrl = uri ? uri.slice(0, uri.lastIndexOf("/") + 1) : "";
  const html = useMemo(() => {
    if (!uri) return "";
    const source = escapeHtml(uri);
    return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
video{display:block;position:absolute;inset:0;width:100%;height:100%;object-fit:fill;background:transparent}
</style></head><body>
<video id="move" src="${source}" preload="auto" muted playsinline></video>
<script>
const video=document.getElementById("move");
let started=false;
const send=(message)=>window.ReactNativeWebView.postMessage(message);
video.addEventListener("loadeddata",async()=>{
  if(started)return;
  started=true;
  try{
    video.currentTime=0;
    await video.play();
    send("started");
  }catch{send("error");}
});
video.addEventListener("ended",()=>{video.pause();send("ended");});
video.addEventListener("error",()=>send("error"));
</script></body></html>`;
  }, [uri]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = event.nativeEvent.data;
      if (message === "started") onStarted?.();
      else if (message === "ended") onEnded();
      else if (message === "error") notifyError();
    },
    [notifyError, onEnded, onStarted],
  );

  if (!uri || error) {
    return <View testID={testID} pointerEvents="none" style={[styles.player, style]} />;
  }

  return (
    <View testID={testID} pointerEvents="none" style={[styles.player, style]}>
      <WebView
        key={uri}
        originWhitelist={["*"]}
        source={{ html, baseUrl }}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowingReadAccessToURL={baseUrl}
        androidLayerType="hardware"
        onMessage={handleMessage}
        onError={notifyError}
        style={styles.webView}
        containerStyle={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  player: {
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  webView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
});