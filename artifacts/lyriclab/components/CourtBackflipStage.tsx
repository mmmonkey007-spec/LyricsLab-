import React from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { CourtBackflipPlayer } from "@/components/CourtBackflipPlayer";

const COURT_ART = require("../assets/court/court-with-cast.png");

type CourtBackflipStageProps = {
  playKey: number;
  playbackActive: boolean;
  onStarted?: () => void;
  onEnded: () => void;
  onError: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function CourtBackflipStage({
  playKey,
  playbackActive,
  onStarted,
  onEnded,
  onError,
  style,
  testID = "rico-court-backflip",
}: CourtBackflipStageProps) {
  return (
    <View
      pointerEvents="none"
      testID={testID}
      style={[styles.frame, style]}
    >
      <Image
        source={COURT_ART}
        accessibilityLabel="Night basketball court with BEEF, BUZZ, CHILL and RICO"
        resizeMode="stretch"
        fadeDuration={0}
        style={StyleSheet.absoluteFill}
      />
      {playbackActive ? (
        <CourtBackflipPlayer
          key={playKey}
          playKey={playKey}
          onStarted={onStarted}
          onEnded={onEnded}
          onError={onError}
          testID={`${testID}-video`}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
  },
});