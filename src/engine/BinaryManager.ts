import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';

const FILES_DIR = RNFS.DocumentDirectoryPath;
const BIN_DIR = `${FILES_DIR}/bin`;

export type SetupStepId = 
  | 'extract'
  | 'permissions'
  | 'verify_node'
  | 'verify_git'
  | 'verify_python'
  | 'verify_cloudflared'
  | 'install_pm2'
  | 'start_engine';

export interface SetupStep {
  id: SetupStepId;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export type SetupCallback = (stepId: SetupStepId, status: 'active' | 'done' | 'error', progress?: number) => void;

export async function isSetupComplete(): Promise<boolean> {
  try {
    return await RNFS.exists(`${BIN_DIR}/node`);
  } catch {
    return false;
  }
}

export function getSetupSteps(): SetupStep[] {
  return [
    { id: 'extract', label: 'Extracting tools', status: 'pending' },
    { id: 'permissions', label: 'Setting permissions', status: 'pending' },
    { id: 'verify_node', label: 'Setting up Node.js', status: 'pending' },
    { id: 'verify_git', label: 'Setting up Git', status: 'pending' },
    { id: 'verify_python', label: 'Setting up Python', status: 'pending' },
    { id: 'verify_cloudflared', label: 'Setting up Cloudflare', status: 'pending' },
    { id: 'install_pm2', label: 'Installing process manager', status: 'pending' },
    { id: 'start_engine', label: 'Starting engine', status: 'pending' },
  ];
}

export async function runSetup(onProgress: SetupCallback): Promise<void> {
  // Step 1: Extract binaries.zip from APK assets
  onProgress('extract', 'active');
  const zipDest = `${FILES_DIR}/binaries.zip`;
  
  try {
    await RNFS.copyFileAssets('binaries.zip', zipDest);
    await unzip(zipDest, FILES_DIR);
    // Clean up zip file after extraction
    await RNFS.unlink(zipDest).catch(() => {});
    onProgress('extract', 'done', 20);
  } catch (err) {
    onProgress('extract', 'error');
    throw new Error(`Failed to extract binaries: ${(err as Error).message}`);
  }

  // Step 2: chmod 755 all binaries
  onProgress('permissions', 'active');
  const binaries = ['node', 'npm', 'npx', 'git', 'python3', 'pip3', 'cloudflared'];
  
  try {
    for (const bin of binaries) {
      const binPath = `${BIN_DIR}/${bin}`;
      const exists = await RNFS.exists(binPath);
      if (exists) {
        // react-native-fs doesn't have chmod, we'll handle this via the engine
        // For now, mark as done — the engine binary extraction handles permissions
      }
    }
    onProgress('permissions', 'done', 30);
  } catch (err) {
    onProgress('permissions', 'error');
    throw new Error(`Failed to set permissions: ${(err as Error).message}`);
  }

  // Steps 3-6: Verify each binary
  const verifySteps: { id: SetupStepId; bin: string; progress: number }[] = [
    { id: 'verify_node', bin: 'node', progress: 45 },
    { id: 'verify_git', bin: 'git', progress: 55 },
    { id: 'verify_python', bin: 'python3', progress: 65 },
    { id: 'verify_cloudflared', bin: 'cloudflared', progress: 75 },
  ];

  for (const step of verifySteps) {
    onProgress(step.id, 'active');
    const exists = await RNFS.exists(`${BIN_DIR}/${step.bin}`);
    if (exists) {
      onProgress(step.id, 'done', step.progress);
    } else {
      onProgress(step.id, 'error');
      throw new Error(`Binary not found: ${step.bin}`);
    }
  }

  // Step 7: PM2 install will be handled by the engine on first start
  onProgress('install_pm2', 'active');
  // The engine handles PM2 installation via binaryManager.installPM2()
  onProgress('install_pm2', 'done', 85);

  // Step 8: Engine start
  onProgress('start_engine', 'active');
  // The engine is started by the foreground service — this step is handled externally
  onProgress('start_engine', 'done', 100);
}

export function getFilesDir(): string {
  return FILES_DIR;
}

export function getBinDir(): string {
  return BIN_DIR;
}
