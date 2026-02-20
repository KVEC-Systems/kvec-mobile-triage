/**
 * Model Download Service
 * Downloads MedGemma GGUF + Voxtral GGUF for on-device inference
 */

import {
  createDownloadResumable,
  documentDirectory,
  makeDirectoryAsync,
  deleteAsync,
  getInfoAsync,
  type DownloadProgressData,
  type DownloadResumable,
} from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const DOWNLOAD_STATE_KEY = 'medgemma_download_state';

// Active download reference
let activeDownload: DownloadResumable | null = null;

// HuggingFace model URLs
const HF_BASE = 'https://huggingface.co';

// Model configuration
const MODELS = {
  medgemmaGguf: {
    repo: 'unsloth/medgemma-4b-it-GGUF',
    file: 'medgemma-4b-it-Q4_K_M.gguf',
    size: 2490000000, // ~2.49GB
  },
  medgemmaMmproj: {
    repo: 'unsloth/medgemma-4b-it-GGUF',
    file: 'mmproj-F16.gguf',
    size: 945000000, // ~945MB (F16 for mobile compatibility)
  },
  voxtralGguf: {
    repo: 'andrijdavid/Voxtral-Mini-4B-Realtime-2602-GGUF',
    file: 'Q4_0.gguf',
    size: 2500000000, // ~2.5GB
  },
};

export interface DownloadProgress {
  modelName: string;
  current: number;
  total: number;
  percent: number;
}

export interface ModelStatus {
  medgemma: {
    ggufExists: boolean;
    mmprojExists: boolean;
    ggufPath: string;
    mmprojPath: string;
  };
  voxtral: {
    ggufExists: boolean;
    ggufPath: string;
  };
}

/**
 * Get the local file path for a model
 */
function getModelPath(filename: string): string {
  return `${documentDirectory}models/${filename}`;
}

/**
 * Get the download URL for a model file from HuggingFace
 */
function getDownloadUrl(modelKey: keyof typeof MODELS): string {
  const model = MODELS[modelKey];
  return `${HF_BASE}/${model.repo}/resolve/main/${model.file}`;
}

/**
 * Check which models are already downloaded
 */
export async function checkModelStatus(): Promise<ModelStatus> {
  const ggufPath = getModelPath(MODELS.medgemmaGguf.file);
  const mmprojPath = getModelPath(MODELS.medgemmaMmproj.file);
  const voxtralPath = getModelPath(MODELS.voxtralGguf.file);
  
  try {
    const [ggufInfo, mmprojInfo, voxtralInfo] = await Promise.all([
      getInfoAsync(ggufPath),
      getInfoAsync(mmprojPath),
      getInfoAsync(voxtralPath),
    ]);
    
    // Validate file sizes (must be at least 80% of expected size)
    const isValidSize = (info: typeof ggufInfo, expectedSize: number) => {
      if (!info.exists) return false;
      const fileSize = (info as { size?: number }).size || 0;
      return fileSize >= expectedSize * 0.8;
    };
    
    return {
      medgemma: {
        ggufExists: isValidSize(ggufInfo, MODELS.medgemmaGguf.size),
        mmprojExists: isValidSize(mmprojInfo, MODELS.medgemmaMmproj.size),
        ggufPath,
        mmprojPath,
      },
      voxtral: {
        ggufExists: isValidSize(voxtralInfo, MODELS.voxtralGguf.size),
        ggufPath: voxtralPath,
      },
    };
  } catch {
    return {
      medgemma: {
        ggufExists: false,
        mmprojExists: false,
        ggufPath,
        mmprojPath,
      },
      voxtral: {
        ggufExists: false,
        ggufPath: voxtralPath,
      },
    };
  }
}

/**
 * Download a single file from HuggingFace with progress
 */
async function downloadFile(
  modelKey: keyof typeof MODELS,
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  const model = MODELS[modelKey];
  const url = getDownloadUrl(modelKey);
  const fileUri = getModelPath(model.file);
  const dirUri = `${documentDirectory}models`;
  
  // Create models directory
  try {
    await makeDirectoryAsync(dirUri, { intermediates: true });
  } catch {
    // Directory may already exist
  }
  
  // Check if already exists
  const info = await getInfoAsync(fileUri);
  if (info.exists) {
    console.log(`${model.file} already exists`);
    return true;
  }
  
  console.log(`Downloading ${model.file} from ${url}`);
  
  const downloadResumable = createDownloadResumable(
    url,
    fileUri,
    {},
    (downloadProgress: DownloadProgressData) => {
      if (onProgress) {
        const current = downloadProgress.totalBytesWritten;
        const total = downloadProgress.totalBytesExpectedToWrite || model.size;
        onProgress({
          modelName: model.file,
          current,
          total,
          percent: Math.round((current / total) * 100),
        });
      }
    }
  );
  
  activeDownload = downloadResumable;
  
  try {
    const result = await downloadResumable.downloadAsync();
    activeDownload = null;
    return result?.uri !== undefined;
  } catch (error) {
    console.error(`Failed to download ${model.file}:`, error);
    activeDownload = null;
    throw error;
  }
}

/**
 * Download MedGemma model and mmproj for vision
 */
export async function downloadMedGemmaModel(
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  try {
    // Download main model
    await downloadFile('medgemmaGguf', onProgress);
    console.log('MedGemma model download complete');
    
    // Download mmproj for vision support
    await downloadFile('medgemmaMmproj', onProgress);
    console.log('MedGemma mmproj download complete');
    
    return true;
  } catch (error) {
    console.error('Failed to download MedGemma models:', error);
    return false;
  }
}

/**
 * Download Voxtral ASR model
 */
export async function downloadVoxtralModel(
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  try {
    await downloadFile('voxtralGguf', onProgress);
    console.log('Voxtral model download complete');
    return true;
  } catch (error) {
    console.error('Failed to download Voxtral model:', error);
    return false;
  }
}

/**
 * Download all required models
 */
export async function downloadAllModels(
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  try {
    // Download Voxtral first (ASR — needed for core workflow)
    await downloadVoxtralModel(onProgress);
    // Then download MedGemma
    await downloadMedGemmaModel(onProgress);
    return true;
  } catch (error) {
    console.error('Failed to download all models:', error);
    return false;
  }
}

/**
 * Pause the active download
 */
export async function pauseDownload(): Promise<void> {
  if (activeDownload) {
    try {
      const savable = await activeDownload.pauseAsync();
      await AsyncStorage.setItem(DOWNLOAD_STATE_KEY, savable.resumeData || '');
      console.log('Download paused and state saved');
    } catch (error) {
      console.error('Failed to pause download:', error);
    }
  }
}

/**
 * Get total download size required
 */
export async function getRemainingDownloadSize(): Promise<number> {
  const status = await checkModelStatus();
  let size = 0;
  
  if (!status.voxtral.ggufExists) {
    size += MODELS.voxtralGguf.size;
  }
  if (!status.medgemma.ggufExists) {
    size += MODELS.medgemmaGguf.size;
  }
  if (!status.medgemma.mmprojExists) {
    size += MODELS.medgemmaMmproj.size;
  }
  
  return size;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Check if all required models are available
 */
export async function areModelsReady(): Promise<boolean> {
  const status = await checkModelStatus();
  return (
    status.medgemma.ggufExists &&
    status.medgemma.mmprojExists &&
    status.voxtral.ggufExists
  );
}

/**
 * Get the path to the downloaded GGUF model
 */
export function getGgufModelPath(): string {
  return `${documentDirectory}models/${MODELS.medgemmaGguf.file}`;
}

/**
 * Get the path to the mmproj file for multimodal vision
 */
export function getMmprojPath(): string {
  return `${documentDirectory}models/${MODELS.medgemmaMmproj.file}`;
}

/**
 * Get the path to the Voxtral ASR model
 */
export function getVoxtralModelPath(): string {
  return `${documentDirectory}models/${MODELS.voxtralGguf.file}`;
}
