/**
 * Model Download Service
 * Downloads MedSigLIP text encoder for semantic search
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
const DOWNLOAD_STATE_KEY = 'medsiglip_download_state';

// Active download reference
let activeDownload: DownloadResumable | null = null;

// HuggingFace model URLs
const HF_BASE = 'https://huggingface.co';

// Model configuration
// Using INT8 quantized model for smaller download (~434MB vs 1.7GB)
const MODELS = {
  medsiglipOnnx: {
    repo: 'ekim1394/medsiglip-text-onnx',
    file: 'medsiglip-text-int8.onnx',
    size: 434000000, // ~434MB (INT8 quantized)
  },
  medsiglipTokenizer: {
    repo: 'ekim1394/medsiglip-text-onnx',
    file: 'medsiglip-tokenizer.json',
    size: 700000, // ~700KB
  },
};

export interface DownloadProgress {
  modelName: string;
  current: number;
  total: number;
  percent: number;
}

export interface ModelStatus {
  medsiglip: {
    onnxExists: boolean;
    tokenizerExists: boolean;
    onnxPath: string;
    tokenizerPath: string;
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
  const onnxPath = getModelPath('medsiglip-text-int8.onnx');
  const tokenizerPath = getModelPath('medsiglip-tokenizer.json');
  
  try {
    const [onnxInfo, tokenizerInfo] = await Promise.all([
      getInfoAsync(onnxPath),
      getInfoAsync(tokenizerPath),
    ]);
    
    return {
      medsiglip: {
        onnxExists: onnxInfo.exists,
        tokenizerExists: tokenizerInfo.exists,
        onnxPath,
        tokenizerPath,
      },
    };
  } catch {
    return {
      medsiglip: {
        onnxExists: false,
        tokenizerExists: false,
        onnxPath,
        tokenizerPath,
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
 * Download MedSigLIP models
 */
export async function downloadMedSigLIPModels(
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  try {
    // Download ONNX model
    await downloadFile('medsiglipOnnx', onProgress);
    
    // Download tokenizer
    await downloadFile('medsiglipTokenizer', onProgress);
    
    console.log('MedSigLIP models download complete');
    return true;
  } catch (error) {
    console.error('Failed to download MedSigLIP models:', error);
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
  let total = 0;
  
  if (!status.medsiglip.onnxExists) {
    total += MODELS.medsiglipOnnx.size;
  }
  if (!status.medsiglip.tokenizerExists) {
    total += MODELS.medsiglipTokenizer.size;
  }
  
  return total;
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
  return status.medsiglip.onnxExists && status.medsiglip.tokenizerExists;
}
