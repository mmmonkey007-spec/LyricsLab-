import Constants, { ExecutionEnvironment } from "expo-constants";
import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { RicoMotionFallback } from "./RicoMotionFallback";

type NativeRiveRenderer = (typeof import("./RicoRiveNative"))["default"];

type RicoMotionPortraitProps = {
  isRapping: boolean;
  source: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
};

const canLoadNativeRive =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export function RicoMotionPortrait({
  isRapping,
  source,
  style,
}: RicoMotionPortraitProps) {
  const [NativeRive, setNativeRive] = useState<NativeRiveRenderer | null>(null);
  const [riveReady, setRiveReady] = useState(false);

  const handleRiveReady = useCallback(() => setRiveReady(true), []);
  const handleRiveError = useCallback((error: unknown) => {
    console.warn("[RICO Rive] Native renderer failed; keeping the Reanimated fallback.", error);
  }, []);

  useEffect(() => {
    if (!canLoadNativeRive) return;

    let cancelled = false;
    import("./RicoRiveNative")
      .then((module) => {
        if (!cancelled) setNativeRive(() => module.default);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn("[RICO Rive] Native renderer could not be loaded; keeping the Reanimated fallback.", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="RICO portrait"
      testID="rico-motion-portrait"
      style={style}
    >
      {NativeRive ? (
        <NativeRive
          isRapping={isRapping}
          onReady={handleRiveReady}
          onError={handleRiveError}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {!riveReady ? (
        <RicoMotionFallback isRapping={isRapping} source={source} />
      ) : null}
    </View>
  );
}