import { Fit, RiveView, useRiveFile } from "@rive-app/react-native";
import React, { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const RICO_RIVE_FILE = require("../assets/rive/rico-parts/build/rico-parts.riv");

type RicoRiveNativeProps = {
  isRapping: boolean;
  onReady: () => void;
  onError: (error: unknown) => void;
  style?: StyleProp<ViewStyle>;
};

export default function RicoRiveNative({
  isRapping,
  onReady,
  onError,
  style,
}: RicoRiveNativeProps) {
  const { riveFile, error } = useRiveFile(RICO_RIVE_FILE);

  useEffect(() => {
    if (error) onError(error);
    else if (riveFile) onReady();
  }, [error, onError, onReady, riveFile]);

  return (
    <View pointerEvents="none" style={[styles.fill, style]}>
      {riveFile ? (
        <RiveView
          key={isRapping ? "rapping" : "idle"}
          testID="rico-rive-view"
          file={riveFile}
          artboardName="RICO"
          stateMachineName={isRapping ? "RICO Rapping" : "RICO Idle"}
          fit={Fit.Contain}
          autoPlay
          style={styles.fill}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});