/**
 * Model Download Service
 * Downloads models from HuggingFace Hub on first app launch
 * Supports resuming downloads after app goes to background
 */

// Use legacy APIs for download functionality
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

// Storage key for resumable download state
const DOWNLOAD_STATE_KEY = 'litertlm_download_state';

// HuggingFace token for gated models (stored in AsyncStorage)
const HF_TOKEN_KEY = 'huggingface_token';
// Default token for development - user can override via setHuggingFaceToken()
let hfToken: string | null = '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';

/**
 * Set HuggingFace token for downloading gated models
 */
export async function setHuggingFaceToken(token: string): Promise<void> {
  hfToken = token;
  await AsyncStorage.setItem(HF_TOKEN_KEY, token);
}

/**
 * Get stored HuggingFace token
 */
export async function getHuggingFaceToken(): Promise<string | null> {
  if (hfToken) return hfToken;
  hfToken = await AsyncStorage.getItem(HF_TOKEN_KEY);
  return hfToken;
}

/**
 * Check if HuggingFace token is set
 */
export async function hasHuggingFaceToken(): Promise<boolean> {
  return (await getHuggingFaceToken()) !== null;
}

// Active download reference
let activeDownload: DownloadResumable | null = null;

// HuggingFace model URLs
const HF_BASE = 'https://huggingface.co';
const MODELS = {
  // Gemma 3n LiteRT model for MediaPipe (int4 quantized)
  litertlm: {
    repo: 'google/gemma-3n-E2B-it-litert-lm',
    file: 'gemma-3n-E2B-it-int4.litertlm',
    size: 3655827456, // 3.6GB actual size
  },
  // SetFit ONNX models for fast classification
  specialtyOnnx: {
    repo: 'ekim1394/setfit-specialty-onnx',
    file: 'body/model.onnx',
    size: 90400000, // 90.4 MB
  },
  conditionOnnx: {
    repo: 'ekim1394/setfit-condition-onnx',
    file: 'body/model.onnx',
    size: 90400000, // ~90 MB (assuming same size)
  },
  // Tokenizer files
  specialtyTokenizer: {
    repo: 'ekim1394/setfit-specialty-onnx',
    file: 'body/tokenizer.json',
    size: 712000, // 712 KB
  },
  conditionTokenizer: {
    repo: 'ekim1394/setfit-condition-onnx',
    file: 'body/tokenizer.json',
    size: 712000, // ~712 KB
  },
  // Label mappings
  specialtyLabels: {
    repo: 'ekim1394/setfit-specialty-onnx',
    file: 'label_mapping.json',
    size: 1150, // 1.15 KB
  },
  conditionLabels: {
    repo: 'ekim1394/setfit-condition-onnx',
    file: 'label_mapping.json',
    size: 1150, // ~1 KB
  },
  // Classification head models
  specialtyHead: {
    repo: 'ekim1394/setfit-specialty-onnx',
    file: 'model_head.onnx',
    size: 40000, // ~39 KB
  },
  conditionHead: {
    repo: 'ekim1394/setfit-condition-onnx',
    file: 'model_head.onnx',
    size: 40000, // ~39 KB
  },
};

export interface DownloadProgress {
  modelName: string;
  current: number;
  total: number;
  percent: number;
}

export interface ModelStatus {
  litertlm: {
    exists: boolean;
    size?: number;
    path: string;
  };
  setfit: {
    specialtyExists: boolean;
    conditionExists: boolean;
  };
}

/**
 * Get the local file path for a model (using legacy API)
 */
function getModelUri(modelName: keyof typeof MODELS): string {
  const model = MODELS[modelName];
  return `${documentDirectory}models/${model.file}`;
}

/**
 * Get the download URL for a model file from HuggingFace
 */
function getDownloadUrl(modelName: keyof typeof MODELS): string {
  const model = MODELS[modelName];
  return `${HF_BASE}/${model.repo}/resolve/main/${model.file}`;
}

/**
 * Check which models are already downloaded
 */
export async function checkModelStatus(): Promise<ModelStatus> {
  const litertlmPath = `${documentDirectory}models/gemma-3n-E2B-it-int4.litertlm`;
  const specialtyPath = getModelUri('specialtyOnnx');
  const conditionPath = getModelUri('conditionOnnx');
  
  try {
    const [litertlmInfo, specialtyInfo, conditionInfo] = await Promise.all([
      getInfoAsync(litertlmPath),
      getInfoAsync(specialtyPath),
      getInfoAsync(conditionPath),
    ]);
    
    return {
      litertlm: {
        exists: litertlmInfo.exists,
        size: litertlmInfo.exists ? (litertlmInfo as any).size : undefined,
        path: litertlmPath,
      },
      setfit: {
        specialtyExists: specialtyInfo.exists,
        conditionExists: conditionInfo.exists,
      },
    };
  } catch {
    return {
      litertlm: { exists: false, path: litertlmPath },
      setfit: { specialtyExists: false, conditionExists: false },
    };
  }
}

/**
 * Download the LiteRT LLM model with progress callback
 * Supports resuming after app goes to background
 */
export async function downloadLLMModel(
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  const fileUri = `${documentDirectory}models/gemma-3n-E2B-it-int4.litertlm`;
  const dirUri = `${documentDirectory}models`;
  
  // Create models directory if needed
  try {
    await makeDirectoryAsync(dirUri, { intermediates: true });
  } catch {
    // Directory may already exist
  }

  // Check if already exists and complete
  const info = await getInfoAsync(fileUri);
  const minSize = 100000000; // At least 100MB for valid model
  
  if (info.exists) {
    const fileSize = (info as any).size || 0;
    if (fileSize >= MODELS.litertlm.size * 0.99) {
      console.log('LiteRT model already downloaded');
      await AsyncStorage.removeItem(DOWNLOAD_STATE_KEY);
      return true;
    } else {
      // File is corrupted or incomplete - delete it
      console.log(`Deleting corrupted model file (${fileSize} bytes)`);
      await deleteAsync(fileUri, { idempotent: true });
      await AsyncStorage.removeItem(DOWNLOAD_STATE_KEY); // Clear resume state too
    }
  }

  const url = `${HF_BASE}/${MODELS.litertlm.repo}/resolve/main/${MODELS.litertlm.file}`;
  const expectedSize = MODELS.litertlm.size;

  try {
    // Check for saved resumable state
    const savedState = await AsyncStorage.getItem(DOWNLOAD_STATE_KEY);
    
    const progressCallback = (downloadProgress: DownloadProgressData) => {
      if (onProgress) {
        const current = downloadProgress.totalBytesWritten;
        const total = downloadProgress.totalBytesExpectedToWrite || expectedSize;
        onProgress({
          modelName: 'Gemma 3n LiteRT',
          current,
          total,
          percent: Math.round((current / total) * 100),
        });
      }
    };

    let result;
    
    if (savedState) {
      // Resume from saved state
      console.log('Resuming LiteRT model download...');
      activeDownload = createDownloadResumable(
        url,
        fileUri,
        {},
        progressCallback,
        savedState
      );
      result = await activeDownload.resumeAsync();
    } else {
      // Start fresh download
      console.log(`Downloading LiteRT model from ${url}`);
      
      // Add HF token for gated models
      const token = await getHuggingFaceToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      activeDownload = createDownloadResumable(
        url,
        fileUri,
        { headers },
        progressCallback
      );
      result = await activeDownload.downloadAsync();
    }
    
    if (result?.uri) {
      console.log('LiteRT model download complete');
      await AsyncStorage.removeItem(DOWNLOAD_STATE_KEY);
      activeDownload = null;
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Download interrupted or failed:', error);
    
    // Save state for resume
    if (activeDownload) {
      try {
        const savable = await activeDownload.savable();
        await AsyncStorage.setItem(DOWNLOAD_STATE_KEY, savable.resumeData || '');
        console.log('Download state saved for resume');
      } catch {
        // Couldn't save state
      }
    }
    
    throw error;
  }
}

// Keep old function name as alias for backward compatibility
export const downloadGGUFModel = downloadLLMModel;

/**
 * Pause the active download (call before app goes to background)
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
 * Check if there's a download to resume
 */
export async function hasResumableDownload(): Promise<boolean> {
  const state = await AsyncStorage.getItem(DOWNLOAD_STATE_KEY);
  return state !== null;
}

/**
 * Download a single file from HuggingFace
 */
async function downloadFile(
  modelKey: keyof typeof MODELS,
  localFilename: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  const url = getDownloadUrl(modelKey);
  const fileUri = `${documentDirectory}models/${localFilename}`;
  const dirUri = `${documentDirectory}models`;
  
  try {
    await makeDirectoryAsync(dirUri, { intermediates: true });
  } catch {
    // Directory may already exist
  }
  
  // Check if already exists
  const info = await getInfoAsync(fileUri);
  if (info.exists) {
    return true;
  }
  
  console.log(`Downloading ${localFilename} from ${url}`);
  
  const downloadResumable = createDownloadResumable(
    url,
    fileUri,
    {},
    (downloadProgress: DownloadProgressData) => {
      if (onProgress) {
        const current = downloadProgress.totalBytesWritten;
        const total = downloadProgress.totalBytesExpectedToWrite || MODELS[modelKey].size;
        onProgress({
          modelName: localFilename,
          current,
          total,
          percent: Math.round((current / total) * 100),
        });
      }
    }
  );
  
  const result = await downloadResumable.downloadAsync();
  return result?.uri !== undefined;
}

/**
 * Download all SetFit models and supporting files
 */
export async function downloadSetFitModels(
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  try {
    // Download specialty model and files
    await downloadFile('specialtyOnnx', 'specialty-model.onnx', onProgress);
    await downloadFile('specialtyTokenizer', 'specialty-tokenizer.json', onProgress);
    await downloadFile('specialtyLabels', 'specialty-labels.json', onProgress);
    await downloadFile('specialtyHead', 'specialty-head.onnx', onProgress);
    
    // Download condition model and files
    await downloadFile('conditionOnnx', 'condition-model.onnx', onProgress);
    await downloadFile('conditionTokenizer', 'condition-tokenizer.json', onProgress);
    await downloadFile('conditionLabels', 'condition-labels.json', onProgress);
    await downloadFile('conditionHead', 'condition-head.onnx', onProgress);
    
    console.log('SetFit models download complete');
    return true;
  } catch (error) {
    console.error('Failed to download SetFit models:', error);
    return false;
  }
}

/**
 * Get total download size required (for models not yet downloaded)
 */
export async function getRemainingDownloadSize(): Promise<number> {
  const status = await checkModelStatus();
  let total = 0;
  
  if (!status.litertlm.exists) {
    total += MODELS.litertlm.size;
  }
  
  // Add SetFit files if not present
  if (!status.setfit.specialtyExists) {
    total += MODELS.specialtyOnnx.size + MODELS.specialtyTokenizer.size + MODELS.specialtyLabels.size;
  }
  if (!status.setfit.conditionExists) {
    total += MODELS.conditionOnnx.size + MODELS.conditionTokenizer.size + MODELS.conditionLabels.size;
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
 * Get model file path for LLM loading
 */
export function getLLMModelPath(): string {
  return `${documentDirectory}models/gemma-3n-E2B-it-int4.litertlm`;
}

// Keep old function name as alias
export const getGGUFModelPath = getLLMModelPath;
