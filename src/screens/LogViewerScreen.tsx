import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Switch,
  ListRenderItem,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppStore } from '../store/appStore';
import { engineClient } from '../engine/EngineClient';
import type { LogLine } from '../types';

type ParamList = { LogViewer: { appId: string; appName: string } };

export default function LogViewerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'LogViewer'>>();
  const { appId, appName } = route.params;

  const { activeLogs } = useAppStore();
  const [historicalLogs, setHistoricalLogs] = useState<LogLine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  // ── Load historical logs on mount ──────────────────────
  useEffect(() => {
    (async () => {
      try {
        const logs = await engineClient.getLogs(appId);
        setHistoricalLogs(logs);
      } catch {}
    })();
  }, [appId]);

  // ── Combine historical + live logs ─────────────────────
  const liveLogs = activeLogs[appId] || [];
  const allLogs = [...historicalLogs, ...liveLogs];

  // ── Filter logs by search query ────────────────────────
  const filteredLogs = searchQuery.trim()
    ? allLogs.filter(l =>
        l.message.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allLogs;

  // ── Auto-scroll to bottom on new logs ──────────────────
  useEffect(() => {
    if (autoScroll && filteredLogs.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [filteredLogs.length, autoScroll]);

  // ── Clear logs ─────────────────────────────────────────
  const handleClear = () => {
    setHistoricalLogs([]);
  };

  // ── Get text color based on log type ───────────────────
  const getLogColor = (type: LogLine['type']) => {
    switch (type) {
      case 'stderr': return 'text-red-400';
      case 'system': return 'text-indigo-400';
      default:       return 'text-zinc-300';
    }
  };

  // ── Render log line ────────────────────────────────────
  const renderLogLine: ListRenderItem<LogLine> = useCallback(
    ({ item, index }) => (
      <View className="flex-row px-3 py-0.5" key={index}>
        <Text className="text-zinc-600 font-mono text-xs w-20" numberOfLines={1}>
          {formatTimestamp(item.timestamp)}
        </Text>
        <Text
          className={`flex-1 font-mono text-xs ${getLogColor(item.type)}`}
          selectable
        >
          {item.message}
        </Text>
      </View>
    ),
    [],
  );

  return (
    <View className="flex-1 bg-[#0a0a0a]">
      {/* Header */}
      <View className="px-4 pt-14 pb-3 border-b border-zinc-800">
        <View className="flex-row items-center mb-3">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="mr-3 w-8 h-8 rounded-full bg-zinc-800 items-center justify-center"
          >
            <Text className="text-white text-lg">{"<"}</Text>
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold">{appName}</Text>
            <Text className="text-zinc-500 text-xs">Logs</Text>
          </View>
          <TouchableOpacity onPress={handleClear} className="px-3 py-1">
            <Text className="text-zinc-400 text-sm">Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Search + Auto-scroll */}
        <View className="flex-row items-center">
          <TextInput
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm font-mono"
            placeholder="Search logs..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View className="flex-row items-center ml-3">
            <Text className="text-zinc-500 text-xs mr-1">Auto</Text>
            <Switch
              value={autoScroll}
              onValueChange={setAutoScroll}
              trackColor={{ false: '#27272a', true: '#6366f1' }}
              thumbColor="#ffffff"
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
            />
          </View>
        </View>
      </View>

      {/* Log List */}
      {filteredLogs.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-zinc-600 font-mono text-sm">
            {searchQuery ? 'No matching logs' : 'Waiting for logs...'}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredLogs}
          renderItem={renderLogLine}
          keyExtractor={(_, i) => i.toString()}
          className="flex-1 pt-2"
          initialNumToRender={50}
          maxToRenderPerBatch={30}
          windowSize={10}
          onScrollBeginDrag={() => setAutoScroll(false)}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      {/* Footer: log count */}
      <View className="px-4 py-2 border-t border-zinc-800 flex-row items-center justify-between">
        <Text className="text-zinc-600 text-xs font-mono">
          {filteredLogs.length} line{filteredLogs.length !== 1 ? 's' : ''}
          {searchQuery ? ` (filtered)` : ''}
        </Text>
        {!autoScroll && (
          <TouchableOpacity
            onPress={() => {
              setAutoScroll(true);
              flatListRef.current?.scrollToEnd({ animated: true });
            }}
          >
            <Text className="text-indigo-400 text-xs">Jump to bottom</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Helper ───────────────────────────────────────────────
function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}
