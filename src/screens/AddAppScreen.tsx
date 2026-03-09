import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store/appStore';
import { engineClient } from '../engine/EngineClient';
import { wsClient } from '../engine/WebSocketClient';
import { LogStream } from '../components/LogStream';
import { DeployProgress } from '../components/DeployProgress';
import type { AppStatus, LogLine, DetectedConfig } from '../types';

type Step = 'input' | 'review' | 'deploying';

const STEP_LABELS = ['Repo URL', 'Review', 'Deploy'];

export default function AddAppScreen() {
  const navigation = useNavigation<any>();
  const { addApp } = useAppStore();

  const [step, setStep] = useState<Step>('input');
  const stepIndex = step === 'input' ? 0 : step === 'review' ? 1 : 2;

  const [repoUrl, setRepoUrl] = useState('');
  const [appName, setAppName] = useState('');
  const [branch, setBranch] = useState('main');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [config, setConfig] = useState<DetectedConfig | null>(null);
  const [installCmd, setInstallCmd] = useState('');
  const [buildCmd, setBuildCmd] = useState('');
  const [startCmd, setStartCmd] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);

  const [deployAppId, setDeployAppId] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<AppStatus>('idle');
  const [deployLogs, setDeployLogs] = useState<LogLine[]>([]);
  const [deployDone, setDeployDone] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!repoUrl) return;
    try {
      const parts = repoUrl.replace(/\.git$/, '').split('/');
      const name = parts[parts.length - 1];
      if (name && !appName) setAppName(name);
    } catch {}
  }, [repoUrl]);

  useEffect(() => {
    if (step !== 'deploying' || !deployAppId) return;

    const handleLog = (appId: string, line: LogLine) => {
      if (appId === deployAppId) {
        setDeployLogs(prev => [...prev.slice(-500), line]);
      }
    };
    const handleStatus = (appId: string, status: AppStatus) => {
      if (appId === deployAppId) setDeployStatus(status);
    };
    const handleDone = (appId: string, success: boolean, error?: string) => {
      if (appId === deployAppId) {
        setDeployDone(true);
        setDeploySuccess(success);
        if (error) setDeployError(error);
      }
    };
    const handleTunnel = (appId: string, url: string) => {
      if (appId === deployAppId) setTunnelUrl(url);
    };

    wsClient.onLog(handleLog);
    wsClient.onStatusChange(handleStatus);
    wsClient.onDeployComplete(handleDone);
    wsClient.onTunnelReady(handleTunnel);
  }, [step, deployAppId]);

  const handleScan = async () => {
    if (!repoUrl.trim()) return;
    setScanning(true);
    setScanError(null);
    try {
      const urlPattern = /^https?:\/\/(github\.com|gitlab\.com)\/[\w.-]+\/[\w.-]+/;
      if (!urlPattern.test(repoUrl.trim())) {
        throw new Error('Please enter a valid GitHub or GitLab repository URL');
      }
      const result = await engineClient.scanRepo(repoUrl.trim(), branch);
      setConfig(result);
      setInstallCmd(result.installCommand || '');
      setBuildCmd(result.buildCommand || '');
      setStartCmd(result.startCommand || '');
      setStep('review');
    } catch (err: any) {
      setScanError(err.message || 'Failed to scan repository');
    } finally {
      setScanning(false);
    }
  };

  const handleDeploy = async () => {
    setStep('deploying');
    setDeployLogs([]);
    setDeployDone(false);
    setDeploySuccess(false);
    setDeployError(null);
    setTunnelUrl(null);
    setDeployStatus('cloning');

    try {
      const app = await engineClient.createApp(
        repoUrl.trim(),
        appName.trim() || 'my-app',
        branch,
      );
      setDeployAppId(app.id);
    } catch (err: any) {
      setDeployDone(true);
      setDeploySuccess(false);
      setDeployError(err.message || 'Failed to start deploy');
    }
  };

  const getProjectIcon = (type: string) => {
    const icons: Record<string, string> = {
      nextjs: 'N', cra: 'R', vite: 'V', express: 'Ex',
      nestjs: 'Ns', remix: 'Rx', django: 'Dj', flask: 'Fl',
      fastapi: 'FA', go: 'Go', rust: 'Rs', node: 'Nd',
    };
    return icons[type] || '?';
  };

  const getProjectLabel = (type: string) => {
    const labels: Record<string, string> = {
      nextjs: 'Next.js', cra: 'Create React App', vite: 'Vite',
      express: 'Express', nestjs: 'NestJS', remix: 'Remix',
      django: 'Django', flask: 'Flask', fastapi: 'FastAPI',
      go: 'Go', rust: 'Rust', node: 'Node.js', unknown: 'Unknown',
    };
    return labels[type] || type;
  };

  const renderStepIndicator = () => (
    <View className="flex-row items-center justify-center mb-6 px-4">
      {STEP_LABELS.map((label, i) => (
        <React.Fragment key={label}>
          <View className="items-center">
            <View
              className={`w-8 h-8 rounded-full items-center justify-center ${
                i <= stepIndex ? 'bg-indigo-500' : 'bg-zinc-800'
              }`}
            >
              <Text className={`text-sm font-bold ${
                i <= stepIndex ? 'text-white' : 'text-zinc-500'
              }`}>
                {i < stepIndex ? '\u2713' : i + 1}
              </Text>
            </View>
            <Text className={`text-xs mt-1 ${
              i <= stepIndex ? 'text-white' : 'text-zinc-500'
            }`}>
              {label}
            </Text>
          </View>
          {i < STEP_LABELS.length - 1 && (
            <View
              className={`flex-1 h-0.5 mx-2 mb-4 ${
                i < stepIndex ? 'bg-indigo-500' : 'bg-zinc-800'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  const renderCommandRow = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    fieldKey: string,
  ) => (
    <View className="mb-3">
      <Text className="text-zinc-400 text-xs mb-1">{label}</Text>
      <View className="flex-row items-center bg-zinc-900 rounded-lg border border-zinc-800 px-3 py-2">
        {editingField === fieldKey ? (
          <TextInput
            className="flex-1 text-white font-mono text-sm"
            value={value}
            onChangeText={onChange}
            onBlur={() => setEditingField(null)}
            autoFocus
            placeholderTextColor="#6b7280"
          />
        ) : (
          <Text className="flex-1 text-green-400 font-mono text-sm">
            {value || '(none)'}
          </Text>
        )}
        <TouchableOpacity
          onPress={() => setEditingField(editingField === fieldKey ? null : fieldKey)}
          className="ml-2 px-2 py-1"
        >
          <Text className="text-indigo-400 text-xs">
            {editingField === fieldKey ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-[#0a0a0a]">
      <View className="flex-row items-center px-4 pt-14 pb-4 border-b border-zinc-800">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="mr-3 w-8 h-8 rounded-full bg-zinc-800 items-center justify-center"
        >
          <Text className="text-white text-lg">{"<"}</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">Add New App</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {renderStepIndicator()}

          {step === 'input' && (
            <View>
              <Text className="text-zinc-400 text-sm mb-4">
                Paste a GitHub repository URL to get started.
              </Text>
              <Text className="text-zinc-400 text-xs mb-1 ml-1">Repository URL</Text>
              <TextInput
                className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-base mb-4"
                placeholder="https://github.com/user/repo"
                placeholderTextColor="#6b7280"
                value={repoUrl}
                onChangeText={setRepoUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text className="text-zinc-400 text-xs mb-1 ml-1">App Name</Text>
              <TextInput
                className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-base mb-4"
                placeholder="my-app"
                placeholderTextColor="#6b7280"
                value={appName}
                onChangeText={setAppName}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text className="text-zinc-400 text-xs mb-1 ml-1">Branch</Text>
              <TextInput
                className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-base mb-6"
                placeholder="main"
                placeholderTextColor="#6b7280"
                value={branch}
                onChangeText={setBranch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {scanError && (
                <View className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                  <Text className="text-red-400 text-sm">{scanError}</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={handleScan}
                disabled={scanning || !repoUrl.trim()}
                className={`rounded-xl py-4 items-center ${
                  scanning || !repoUrl.trim() ? 'bg-zinc-700' : 'bg-indigo-500'
                }`}
              >
                {scanning ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text className="text-white font-semibold text-base ml-2">Scanning...</Text>
                  </View>
                ) : (
                  <Text className="text-white font-semibold text-base">Scan Repository</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 'review' && config && (
            <View>
              <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
                <View className="flex-row items-center mb-3">
                  <View className="w-12 h-12 rounded-xl bg-indigo-500/20 items-center justify-center mr-3">
                    <Text className="text-indigo-400 font-bold text-lg">
                      {getProjectIcon(config.projectType)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-bold text-lg">
                      {getProjectLabel(config.projectType)}
                    </Text>
                    <Text className="text-zinc-400 text-sm">
                      {config.language} project | Confidence: {config.confidence}
                    </Text>
                  </View>
                </View>
                {config.envVarsDetected && (
                  <View className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                    <Text className="text-yellow-400 text-xs">
                      .env file detected - you may need to set environment variables after deploy
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-white font-semibold text-base mb-3">Build Commands</Text>
              {renderCommandRow('Install', installCmd, setInstallCmd, 'install')}
              {renderCommandRow('Build', buildCmd, setBuildCmd, 'build')}
              {renderCommandRow('Start', startCmd, setStartCmd, 'start')}
              <TouchableOpacity
                onPress={handleDeploy}
                className="bg-indigo-500 rounded-xl py-4 items-center mt-4 mb-2"
              >
                <Text className="text-white font-bold text-base">Deploy Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStep('input')}
                className="py-3 items-center"
              >
                <Text className="text-zinc-400 text-sm">Back to Edit</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'deploying' && (
            <View className="flex-1">
              <DeployProgress currentStatus={deployStatus} />
              {deployDone && deploySuccess && (
                <View className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-4">
                  <Text className="text-green-400 font-bold text-lg mb-1">Your app is live!</Text>
                  {tunnelUrl ? (
                    <TouchableOpacity onPress={() => Linking.openURL(tunnelUrl)}>
                      <View className="bg-green-500/20 rounded-lg px-3 py-2 mt-2">
                        <Text className="text-green-300 text-sm font-mono">{tunnelUrl}</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <Text className="text-zinc-400 text-sm">Tunnel is starting...</Text>
                  )}
                </View>
              )}
              {deployDone && !deploySuccess && (
                <View className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
                  <Text className="text-red-400 font-bold text-base mb-1">Deploy Failed</Text>
                  <Text className="text-red-300 text-sm">{deployError || 'Unknown error occurred'}</Text>
                </View>
              )}
              <View className="mt-2 flex-1" style={{ minHeight: 300 }}>
                <Text className="text-zinc-400 text-xs mb-2 ml-1">Build Output</Text>
                <LogStream logs={deployLogs} />
              </View>
              {deployDone && (
                <View className="mt-4 mb-8">
                  <TouchableOpacity
                    onPress={() => {
                      if (deploySuccess && deployAppId) {
                        navigation.replace('AppDetail', { appId: deployAppId });
                      } else {
                        navigation.goBack();
                      }
                    }}
                    className="bg-indigo-500 rounded-xl py-4 items-center"
                  >
                    <Text className="text-white font-semibold text-base">
                      {deploySuccess ? 'View App' : 'Go Back'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}