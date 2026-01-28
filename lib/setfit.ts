/**
 * SetFit Classification Service
 * Fast symptom classification using ONNX Runtime
 */

import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import {
  documentDirectory,
  getInfoAsync,
} from 'expo-file-system/legacy';

// Model paths
const MODELS_DIR = `${documentDirectory}models/`;
const SPECIALTY_MODEL = 'symptom-to-specialty.onnx';
const CONDITION_MODEL = 'symptom-to-condition.onnx';

// Specialty labels (must match training order)
const SPECIALTY_LABELS = [
  'Behavioral Health',
  'Cardiology',
  'Dermatology',
  'Gastroenterology',
  'Neurology',
  'Oncology',
  'Orthopedic Surgery',
  'Pain Management',
  'Primary Care',
  'Pulmonology',
  'Rheumatology',
  'Sports Medicine',
  'Urology',
  'Vascular Medicine',
  "Women's Health",
];

// Sessions (lazy init)
let specialtySession: InferenceSession | null = null;
let conditionSession: InferenceSession | null = null;

export interface SetFitResult {
  specialty: string;
  specialtyConfidence: number;
  conditions: string[];
  conditionConfidences: number[];
  inferenceTime: number;
}

/**
 * Check if SetFit models are available
 */
export async function areSetFitModelsAvailable(): Promise<boolean> {
  try {
    const [specialty, condition] = await Promise.all([
      getInfoAsync(MODELS_DIR + SPECIALTY_MODEL),
      getInfoAsync(MODELS_DIR + CONDITION_MODEL),
    ]);
    return specialty.exists && condition.exists;
  } catch {
    return false;
  }
}

/**
 * Initialize SetFit models
 */
export async function initializeSetFit(): Promise<boolean> {
  try {
    const available = await areSetFitModelsAvailable();
    if (!available) {
      console.log('SetFit models not available');
      return false;
    }

    console.log('Loading SetFit models...');
    const startTime = Date.now();

    [specialtySession, conditionSession] = await Promise.all([
      InferenceSession.create(MODELS_DIR + SPECIALTY_MODEL),
      InferenceSession.create(MODELS_DIR + CONDITION_MODEL),
    ]);

    console.log(`SetFit models loaded in ${Date.now() - startTime}ms`);
    return true;
  } catch (error) {
    console.error('Failed to initialize SetFit:', error);
    return false;
  }
}

/**
 * Simple tokenizer for sentence embeddings
 * Note: For production, load the actual tokenizer vocab
 */
function tokenize(text: string): Float32Array {
  // Placeholder - real implementation needs sentence-transformers tokenizer
  // For now, we'll need to bundle the tokenizer or use a simpler approach
  const tokens = text.toLowerCase().split(/\s+/).slice(0, 128);
  const ids = new Float32Array(128).fill(0);
  // This is a simplified version - real tokenizer needed
  tokens.forEach((token, i) => {
    ids[i] = token.charCodeAt(0) % 30000; // Placeholder hash
  });
  return ids;
}

/**
 * Run SetFit classification
 */
export async function classifySymptom(symptom: string): Promise<SetFitResult> {
  const startTime = Date.now();

  if (!specialtySession || !conditionSession) {
    throw new Error('SetFit models not initialized');
  }

  // Tokenize input
  const inputIds = tokenize(symptom);
  const inputTensor = new Tensor('float32', inputIds, [1, 128]);

  // Run specialty classification
  const specialtyOutput = await specialtySession.run({ input: inputTensor });
  const specialtyLogits = specialtyOutput.logits?.data as Float32Array;
  
  // Get top specialty
  let maxIdx = 0;
  let maxVal = specialtyLogits[0];
  for (let i = 1; i < specialtyLogits.length; i++) {
    if (specialtyLogits[i] > maxVal) {
      maxVal = specialtyLogits[i];
      maxIdx = i;
    }
  }

  // Run condition classification
  const conditionOutput = await conditionSession.run({ input: inputTensor });
  const conditionLogits = conditionOutput.logits?.data as Float32Array;

  // Get top 3 conditions (placeholder - need condition labels)
  const conditions = ['Condition evaluation needed'];
  const conditionConfidences = [0.8];

  return {
    specialty: SPECIALTY_LABELS[maxIdx] || 'Primary Care',
    specialtyConfidence: Math.min(maxVal, 1),
    conditions,
    conditionConfidences,
    inferenceTime: Date.now() - startTime,
  };
}

/**
 * Check if SetFit is ready
 */
export function isSetFitReady(): boolean {
  return specialtySession !== null && conditionSession !== null;
}
