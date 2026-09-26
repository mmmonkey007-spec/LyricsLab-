import React from "react";
import {
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { RicoMotionFallback } from "./RicoMotionFallback";

type RicoMotionPortraitProps = {
  isRapping: boolean;
  source: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
};

export function RicoMotionPortrait({
  isRapping,
  source,
  style,
}: RicoMotionPortraitProps) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="RICO portrait"
      testID="rico-motion-portrait"
      style={style}
    >
      <RicoMotionFallback isRapping={isRapping} source={source} />
    </View>
  );
}