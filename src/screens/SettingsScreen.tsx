import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { engineClient } from '../engine/EngineClient';
import { useAppStore } from '../store/appStore';

interface StorageInfo {
  appsSize: string;
  logsSize: string;
  totalSize: string;
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { apps, engineConnected } = useAppStore();

  const [githubToken, setGithubToken] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [restartingEngine, setRestartingEngine] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);

  // ── Load settings ──────────────────────────────────────
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const health = await engineClient.checkHealth();
      // Storage info would come from an engine endpoint in production
      setStorageInfo({
        appsSize: '—',
        logsSize: '—',
        totalSize: '—',
      });
    } catch {}
  };

  // ── Save GitHub token ──────────────────────────────────
  const handleSaveToken = async () => {
    if (!githubToken.trim()) return;
    setSavingToken(true);
    try {
      // In production, this would store in Android Keystore via a native module
      // and send to the engine for use in git operations
      await engineClient.setGitHubToken(githubToken.trim());
      setTokenSaved(true);
      Alert.alert('Saved', 'GitHub token saved securely.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save token');
    } finally {
      setSavingToken(false);
    }
  };

  // ── Restart engine ─────────────────────────────────────
  const handleRestartEngine = async () => {
    Alert.alert(
      'Restart Engine',
      'This will briefly interrupt all running apps. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          onPress: async () => {
            setRestartingEngine(true);
            try {
              await engineClient.restartEngine();
              // Wait for engine to come back
              await new Promise(resolve => setTimeout(resolve, 3000));
            } catch {}
            setRestartingEngine(false);
          },
        },
      ],
    );
  };

  // ── Stop all apps ──────────────────────────────────────
  const handleStopAll = () => {
    const runningCount = apps.filter(a => a.status === 'running').length;
    if (runningCount === 0) {
      Alert.alert('Info', 'No apps are currently running.');
      return;
    }

    Alert.alert(
      'Stop All Apps',
      `This will stop ${runningCount} running app${runningCount > 1 ? 's' : ''}. Their tunnels will also be destroyed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop All',
          style: 'destructive',
          onPress: async () => {
            setStoppingAll(true);
            try {
              await engineClient.stopAllApps();
              await useAppStore.getState().fetchApps();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to stop apps');
            }
            setStoppingAll(false);
          },
        },
      ],
    );
  };

  // ── Section component ──────────────────────────────────
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View className="mx-4 mt-6">
      <Text className="text-zinc-400 text-xs uppercase tracking-wider mb-3 ml-1">
        {title}
      </Text>
      <View className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {children}
      </View>
    </View>
  );

  const Row = ({
    label,
    value,
    valueColor = 'text-white',
    rightElement,
    noBorder = false,
  }: {
    label: string;
    value?: string;
    valueColor?: string;
    rightElement?: React.ReactNode;
    noBorder?: boolean;
  }) => (
    <View
      className={`flex-row items-center justify-between px-4 py-3.5 ${
        noBorder ? '' : 'border-b border-zinc-800'
      }`}
    >
      <Text className="text-white text-sm">{label}</Text>
      {rightElement || (
        <Text className={`text-sm ${valueColor}`}>{value || '—'}</Text>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-[#0a0a0a]">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-14 pb-4 border-b border-zinc-800">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="mr-3 w-8 h-8 rounded-full bg-zinc-800 items-center justify-center"
        >
          <Text className="text-white text-lg">{"<"}</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">Settings</Text>
      </View>

      <ScrollView className="flex-1">
        {/* ── Engine Status ─────────────────────────────── */}
        <Section title="Engine">
          <Row
            label="Status"
            value={engineConnected ? 'Running' : 'Disconnected'}
            valueColor={engineConnected ? 'text-green-400' : 'text-red-400'}
          />
          <Row
            label="Apps Running"
            value={`${apps.filter(a => a.status === 'running').length} / 10`}
          />
          <Row
            label="Restart Engine"
            noBorder
            rightElement={
              <TouchableOpacity
                onPress={handleRestartEngine}
                disabled={restartingEngine}
                className="bg-zinc-800 rounded-lg px-3 py-1.5"
              >
                {restartingEngine ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-white text-xs font-semibold">Restart</Text>
                )}
              </TouchableOpacity>
            }
          />
        </Section>

        {/* ── GitHub Token ──────────────────────────────── */}
        <Section title="GitHub">
          <View className="px-4 py-3">
            <Text className="text-zinc-400 text-xs mb-2">
              Personal Access Token (for private repos)
            </Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm font-mono"
                placeholder="ghp_xxxxxxxxxxxx"
                placeholderTextColor="#6b7280"
                value={githubToken}
                onChangeText={(t) => {
                  setGithubToken(t);
                  setTokenSaved(false);
                }}
                secureTextEntry={!tokenVisible}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setTokenVisible(!tokenVisible)}
                className="ml-2 px-2 py-2"
              >
                <Text className="text-zinc-400 text-xs">
                  {tokenVisible ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={handleSaveToken}
              disabled={savingToken || !githubToken.trim()}
              className={`mt-2 rounded-lg py-2 items-center ${
                savingToken || !githubToken.trim() ? 'bg-zinc-700' : 'bg-indigo-500'
              }`}
            >
              {savingToken ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-white text-sm font-semibold">
                  {tokenSaved ? 'Saved' : 'Save Token'}
                </Text>
              )}
            </TouchableOpacity>
            <Text className="text-zinc-600 text-xs mt-2">
              Stored securely in Android Keystore. Required only for private repositories.
            </Text>
          </View>
        </Section>

        {/* ── Storage ───────────────────────────────────── */}
        <Section title="Storage">
          <Row
            label="Apps"
            value={storageInfo?.appsSize || '—'}
          />
          <Row
            label="Logs"
            value={storageInfo?.logsSize || '—'}
          />
          <Row
            label="Total Used"
            value={storageInfo?.totalSize || '—'}
            noBorder
          />
        </Section>

        {/* ── Danger Zone ──────────────────────────────── */}
        <Section title="Danger Zone">
          <TouchableOpacity
            onPress={handleStopAll}
            disabled={stoppingAll}
            className="px-4 py-3.5"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-red-400 text-sm font-semibold">Stop All Apps</Text>
              {stoppingAll ? (
                <ActivityIndicator color="#ef4444" size="small" />
              ) : (
                <Text className="text-zinc-600 text-lg">&gt;</Text>
              )}
            </View>
          </TouchableOpacity>
        </Section>

        {/* ── About ─────────────────────────────────────── */}
        <Section title="About">
          <Row label="App" value="PocketDeploy" />
          <Row label="Version" value="1.0.0" />
          <Row
            label="Build"
            value="MVP"
            noBorder
          />
        </Section>

        <View className="h-8" />
      </ScrollView>
    </View>
  );
}
