/**
 * ASR (Automatic Speech Recognition) Service
 * Uses Voxtral Realtime 4B via expo-voxtral native module
 */

import { loadModel, transcribe, releaseModel, isModelLoaded } from '../modules/expo-voxtral';
import { getVoxtralModelPath } from './download';

/**
 * Initialize the ASR model
 */
export async function initializeASR(): Promise<boolean> {
  if (isModelLoaded()) {
    console.log('[ASR] Model already loaded');
    return true;
  }

  try {
    console.log('[ASR] Starting Voxtral initialization...');
    const modelPath = getVoxtralModelPath();
    console.log('[ASR] Model path:', modelPath);

    const success = await loadModel(modelPath, { threads: 4, useGpu: true });

    if (success) {
      console.log('[ASR] Voxtral model loaded successfully');
    } else {
      console.error('[ASR] Failed to load Voxtral model');
    }
    return success;
  } catch (error) {
    console.error('[ASR] Initialization failed:', error);
    return false;
  }
}

/**
 * Transcribe audio from a file URI
 * Note: Audio should be 16kHz mono PCM WAV (expo-audio-studio default)
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  if (!isModelLoaded()) {
    throw new Error('ASR not initialized. Call initializeASR() first.');
  }

  try {
    console.log('[ASR] Transcribing audio:', audioUri);
    const text = await transcribe(audioUri);
    console.log('[ASR] Transcription complete:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
    return text || '[No speech detected]';
  } catch (error) {
    console.error('[ASR] Transcription failed:', error);
    throw error;
  }
}

/**
 * Check if ASR is ready
 */
export function isASRReady(): boolean {
  return isModelLoaded();
}

/**
 * Release ASR resources
 */
export async function releaseASR(): Promise<void> {
  await releaseModel();
  console.log('[ASR] Resources released');
}
