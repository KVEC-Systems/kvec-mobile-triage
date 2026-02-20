import { requireNativeModule } from 'expo-modules-core';

interface ExpoVoxtralNativeModule {
  loadModel(modelPath: string, threads: number, useGpu: boolean): Promise<boolean>;
  transcribe(audioPath: string): Promise<string>;
  releaseModel(): Promise<void>;
  isModelLoaded(): boolean;
}

const NativeModule = requireNativeModule<ExpoVoxtralNativeModule>('ExpoVoxtral');

/**
 * Load the Voxtral GGUF model from disk.
 * @param modelPath Absolute path to the .gguf file
 * @param options Optional config for threads and GPU
 * @returns true if model loaded successfully
 */
export async function loadModel(
  modelPath: string,
  options?: { threads?: number; useGpu?: boolean }
): Promise<boolean> {
  const threads = options?.threads ?? 4;
  const useGpu = options?.useGpu ?? true;
  return NativeModule.loadModel(modelPath, threads, useGpu);
}

/**
 * Transcribe an audio file.
 * @param audioPath Absolute path to a 16kHz mono WAV file
 * @returns Transcribed text
 */
export async function transcribe(audioPath: string): Promise<string> {
  // Strip file:// prefix if present — native code expects a filesystem path
  const cleanPath = audioPath.replace(/^file:\/\//, '');
  return NativeModule.transcribe(cleanPath);
}

/**
 * Release the loaded model and free memory.
 */
export async function releaseModel(): Promise<void> {
  return NativeModule.releaseModel();
}

/**
 * Check if a model is currently loaded.
 */
export function isModelLoaded(): boolean {
  return NativeModule.isModelLoaded();
}
