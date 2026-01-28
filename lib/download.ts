/**
 * Model Download Service
 * Downloads models from HuggingFace Hub on first app launch
 */

// Use legacy APIs for download functionality
import {
  createDownloadResumable,
  documentDirectory,
  makeDirectoryAsync,
  deleteAsync,
  getInfoAsync,
  type DownloadProgressData,
} from 'expo-file-system/legacy';

// HuggingFace model URLs
const HF_BASE = 'https://huggingface.co';
const MODELS = {
  gguf: {
    repo: 'ekim1394/medgemma-4b-gguf',
    file: 'medgemma-4b-q4_k_m.gguf',
    size: 2489894368, // 2.3GB
  },
  // SetFit models can be added later for ONNX runtime
};

export interface DownloadProgress {
  modelName: string;
  current: number;
  total: number;
  percent: number;
}

export interface ModelStatus {
  gguf: {
    exists: boolean;
    size?: number;
    path: string;
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
  const ggufPath = getModelUri('gguf');
  
  try {
    const info = await getInfoAsync(ggufPath);
    return {
      gguf: {
        exists: info.exists,
        size: info.exists ? (info as any).size : undefined,
        path: ggufPath,
      },
    };
  } catch {
    return {
      gguf: { exists: false, path: ggufPath },
    };
  }
}

/**
 * Download the GGUF model with progress callback
 */
export async function downloadGGUFModel(
  onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
  const fileUri = getModelUri('gguf');
  const dirUri = `${documentDirectory}models`;
  
  // Create models directory if needed
  try {
    await makeDirectoryAsync(dirUri, { intermediates: true });
  } catch {
    // Directory may already exist
  }

  // Check if already exists
  const info = await getInfoAsync(fileUri);
  if (info.exists) {
    console.log('GGUF model already downloaded');
    return true;
  }

  const url = getDownloadUrl('gguf');
  const expectedSize = MODELS.gguf.size;

  console.log(`Downloading GGUF model from ${url}`);

  try {
    // Use createDownloadResumable for progress tracking
    const downloadResumable = createDownloadResumable(
      url,
      fileUri,
      {},
      (downloadProgress: DownloadProgressData) => {
        if (onProgress) {
          const current = downloadProgress.totalBytesWritten;
          const total = downloadProgress.totalBytesExpectedToWrite || expectedSize;
          onProgress({
            modelName: 'MedGemma Q4_K_M',
            current,
            total,
            percent: Math.round((current / total) * 100),
          });
        }
      }
    );

    const result = await downloadResumable.downloadAsync();
    
    if (result?.uri) {
      console.log('GGUF model download complete');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to download GGUF model:', error);
    
    // Clean up partial download
    try {
      await deleteAsync(fileUri, { idempotent: true });
    } catch {
      // Ignore cleanup errors
    }
    
    return false;
  }
}

/**
 * Get total download size required (for models not yet downloaded)
 */
export async function getRemainingDownloadSize(): Promise<number> {
  const status = await checkModelStatus();
  let total = 0;
  
  if (!status.gguf.exists) {
    total += MODELS.gguf.size;
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
export function getGGUFModelPath(): string {
  return getModelUri('gguf');
}
