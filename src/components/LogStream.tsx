import React, { useRef, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LogLine } from '../types';

interface LogStreamProps {
  logs: LogLine[];
  maxHeight?: number;
}

export default function LogStream({ logs, maxHeight = 400 }: LogStreamProps) {
  const flatListRef = useRef<FlatList>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && logs.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [logs.length, autoScroll]);

  function getLineColor(type: string): string {
    switch (type) {
      case 'stderr': return '#ef4444';
      case 'system': return '#6366f1';
      default: return '#d1d5db';
    }
  }

  function renderLogLine({ item, index }: { item: LogLine; index: number }) {
    return (
      <View className="flex-row px-3 py-0.5">
        <Text className="text-[#4b5563] text-xs font-mono w-20" numberOfLines={1}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
        <Text
          className="flex-1 text-xs font-mono ml-2"
          style={{ color: getLineColor(item.type) }}
          selectable
        >
          {item.message}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl overflow-hidden"
      style={{ maxHeight }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
        <Text className="text-[#9ca3af] text-xs font-semibold">LOGS</Text>
        <TouchableOpacity onPress={() => setAutoScroll(!autoScroll)}>
          <View className="flex-row items-center">
            <Icon
              name={autoScroll ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
              size={14}
              color={autoScroll ? '#6366f1' : '#9ca3af'}
            />
            <Text className="text-[#9ca3af] text-xs ml-1">
              {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Log Lines */}
      {logs.length === 0 ? (
        <View className="py-8 items-center">
          <Text className="text-[#4b5563] text-xs">Waiting for logs...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={logs}
          keyExtractor={(_, index) => index.toString()}
          renderItem={renderLogLine}
          style={{ maxHeight: maxHeight - 40 }}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => setAutoScroll(false)}
        />
      )}
    </View>
  );
}
