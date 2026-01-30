/**
 * ASR (Automatic Speech Recognition) Service
 * Uses MedASR ONNX model for medical speech-to-text
 */

import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { getAsrModelPaths } from './download';

let asrSession: InferenceSession | null = null;
let vocabulary: string[] = [];
let isInitialized = false;

/**
 * Initialize the ASR model
 */
export async function initializeASR(): Promise<boolean> {
  if (isInitialized) {
    return true;
  }

  try {
    console.log('[ASR] Starting initialization...');
    const { onnxPath, tokensPath } = getAsrModelPaths();

    // Load vocabulary
    console.log('[ASR] Loading vocabulary...');
    const tokensContent = await readAsStringAsync(tokensPath);
    vocabulary = tokensContent.split('\n').map(line => {
      // Format: "token index" or just "token"
      const parts = line.split(' ');
      return parts[0] || '';
    }).filter(t => t.length > 0);
    console.log(`[ASR] Loaded ${vocabulary.length} tokens`);

    // Load ONNX model
    console.log('[ASR] Loading ONNX model...');
    asrSession = await InferenceSession.create(onnxPath);
    console.log('[ASR] ONNX model loaded');
    console.log('[ASR] Input names:', asrSession.inputNames);
    console.log('[ASR] Output names:', asrSession.outputNames);

    isInitialized = true;
    console.log('[ASR] Initialization complete');
    return true;
  } catch (error) {
    console.error('[ASR] Initialization failed:', error);
    return false;
  }
}

/**
 * CTC greedy decode - convert logits to text
 */
function ctcGreedyDecode(logits: Float32Array, vocabSize: number, seqLength: number): string {
  const result: number[] = [];
  let prevToken = -1;
  const blankToken = 0; // Usually blank is token 0 in CTC

  for (let t = 0; t < seqLength; t++) {
    // Find argmax for this timestep
    let maxIdx = 0;
    let maxVal = logits[t * vocabSize];
    for (let v = 1; v < vocabSize; v++) {
      const val = logits[t * vocabSize + v];
      if (val > maxVal) {
        maxVal = val;
        maxIdx = v;
      }
    }

    // CTC: skip blanks and repeated tokens
    if (maxIdx !== blankToken && maxIdx !== prevToken) {
      result.push(maxIdx);
    }
    prevToken = maxIdx;
  }

  // Convert token indices to string
  return result.map(idx => vocabulary[idx] || '').join('');
}

/**
 * Transcribe audio from a file URI
 * Note: Audio should be 16kHz mono WAV
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  if (!isInitialized || !asrSession) {
    throw new Error('ASR not initialized. Call initializeASR() first.');
  }

  try {
    console.log('[ASR] Transcribing audio:', audioUri);
    
    // Import dynamically to avoid circular dependency
    const { preprocessAudioForASR } = await import('./audio');
    
    // Load and preprocess audio
    const audioData = await preprocessAudioForASR(audioUri);
    console.log('[ASR] Audio preprocessed, samples:', audioData.length);
    
    // Create input tensors
    // MedASR expects 'x' [batch, time, 1] and 'mask' [batch, time, 1]
    const inputTensor = new Tensor('float32', audioData, [1, audioData.length, 1]);
    
    // Create mask tensor (all 1s = all samples are valid)
    const maskData = new Float32Array(audioData.length).fill(1);
    const maskTensor = new Tensor('float32', maskData, [1, audioData.length, 1]);
    
    console.log('[ASR] Running inference with inputs:', asrSession.inputNames);
    
    // Run inference with both required inputs
    const feeds: Record<string, Tensor> = { 
      'x': inputTensor,
      'mask': maskTensor,
    };
    const results = await asrSession.run(feeds);
    
    // Get output
    const outputName = asrSession.outputNames[0];
    const outputTensor = results[outputName];
    const logits = outputTensor.data as Float32Array;
    
    // Get dimensions - typically [batch, time, vocab]
    const dims = outputTensor.dims;
    console.log('[ASR] Output dims:', dims);
    
    const seqLength = dims.length === 3 ? dims[1] : dims[0];
    const vocabSize = dims.length === 3 ? dims[2] : vocabulary.length;
    
    // Decode with CTC
    const transcript = ctcGreedyDecode(logits, vocabSize as number, seqLength as number);
    console.log('[ASR] Transcription complete:', transcript.substring(0, 50) + '...');
    
    return transcript || '[No speech detected]';
  } catch (error) {
    console.error('[ASR] Transcription failed:', error);
    throw error;
  }
}

/**
 * Check if ASR is ready
 */
export function isASRReady(): boolean {
  return isInitialized;
}

/**
 * Release ASR resources
 */
export async function releaseASR(): Promise<void> {
  if (asrSession) {
    // Note: onnxruntime-react-native may not have explicit release
    asrSession = null;
  }
  vocabulary = [];
  isInitialized = false;
  console.log('[ASR] Resources released');
}
