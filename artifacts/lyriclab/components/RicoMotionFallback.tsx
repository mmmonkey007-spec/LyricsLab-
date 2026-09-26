import React, { useEffect } from "react";
import {
  StyleSheet,
  type ImageSourcePropType,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

type RicoMotionFallbackProps = {
  isRapping: boolean;
  source: ImageSourcePropType;
};

export function RicoMotionFallback({ isRapping, source }: RicoMotionFallbackProps) {
  const translateY = useSharedValue(0);
  const scaleY = useSharedValue(1.03);

  const motionStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scaleY: scaleY.value }],
  }));

  useEffect(() => {
    cancelAnimation(translateY);
    cancelAnimation(scaleY);

    if (isRapping) {
      translateY.value = withRepeat(
        withSequence(
          withTiming(-1.5, { duration: 140, easing: Easing.inOut(Easing.quad) }),
          withTiming(1.5, { duration: 180, easing: Easing.inOut(Easing.quad) }),
          withTiming(-1, { duration: 160, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 140, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
      scaleY.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 140, easing: Easing.inOut(Easing.quad) }),
          withTiming(1.035, { duration: 180, easing: Easing.inOut(Easing.quad) }),
          withTiming(1.06, { duration: 160, easing: Easing.inOut(Easing.quad) }),
          withTiming(1.03, { duration: 140, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    } else {
      translateY.value = withRepeat(
        withSequence(
          withTiming(-0.7, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
      scaleY.value = withRepeat(
        withSequence(
          withTiming(1.045, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1.03, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    }

    return () => {
      cancelAnimation(translateY);
      cancelAnimation(scaleY);
    };
  }, [isRapping, scaleY, translateY]);

  return (
    <Animated.Image
      testID="rico-reanimated-fallback"
      source={source}
      resizeMode="contain"
      style={[StyleSheet.absoluteFill, motionStyle]}
    />
  );
}