import React, { useCallback, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useRicoCourtBackflipAsset } from "@/hooks/useRicoCourtBackflipAsset";

type CourtBackflipPlayerProps = {
  playKey: number;
  onStarted?: () => void;
  onEnded: () => void;
  onError: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const videoStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "fill",
  backgroundColor: "transparent",
};

export function CourtBackflipPlayer({
  onStarted,
  onEnded,
  onError,
  style,
  testID,
}: CourtBackflipPlayerProps) {
  const { uri, error } = useRicoCourtBackflipAsset();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const errorSent = useRef(false);
  const [playing, setPlaying] = useState(false);

  const notifyError = useCallback(() => {
    if (errorSent.current) return;
    errorSent.current = true;
    onError();
  }, [onError]);

  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || errorSent.current) return;
    try {
      video.currentTime = 0;
      await video.play();
      const reveal = () => {
        setPlaying(true);
        onStarted?.();
      };
      const requestVideoFrame = (
        video as HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
        }
      ).requestVideoFrameCallback;

      if (requestVideoFrame) {
        requestVideoFrame.call(video, () => requestAnimationFrame(reveal));
      } else {
        requestAnimationFrame(() => requestAnimationFrame(reveal));
      }
    } catch {
      notifyError();
    }
  }, [notifyError, onStarted]);

  React.useEffect(() => {
    if (error) notifyError();
  }, [error, notifyError]);

  return (
    <View pointerEvents="none" style={[styles.player, style]}>
      {uri
        ? React.createElement("video", {
            ref: videoRef,
            src: uri,
            preload: "auto",
            muted: true,
            playsInline: true,
            controls: false,
            onLoadedData: () => void startPlayback(),
            onError: notifyError,
            onEnded,
            "aria-hidden": true,
            "data-testid": testID,
            style: { ...videoStyle, opacity: playing ? 1 : 0 },
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  player: {
    overflow: "hidden",
    backgroundColor: "transparent",
  },
});