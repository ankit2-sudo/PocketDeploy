import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { getStatusColor, getStatusLabel } from '../utils/commandMap';

interface StatusBadgeProps {
  status: string;
  animated?: boolean;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, animated = false, size = 'sm' }: StatusBadgeProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (animated) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [animated]);

  const color = getStatusColor(status);
  const label = getStatusLabel(status);
  const isSmall = size === 'sm';

  return (
    <View
      className={`flex-row items-center rounded-full ${isSmall ? 'px-2.5 py-1' : 'px-3 py-1.5'}`}
      style={{ backgroundColor: color + '20' }}
    >
      <Animated.View
        style={{
          width: isSmall ? 6 : 8,
          height: isSmall ? 6 : 8,
          borderRadius: 999,
          backgroundColor: color,
          opacity: pulseAnim,
          marginRight: 6,
        }}
      />
      <Text
        style={{ color, fontSize: isSmall ? 11 : 13, fontWeight: '600' }}
      >
        {label}
      </Text>
    </View>
  );
}
