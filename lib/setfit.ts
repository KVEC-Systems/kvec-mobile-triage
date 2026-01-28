/**
 * SetFit Classification Service
 * Fast symptom classification using ONNX Runtime
 * Note: ONNX Runtime currently has native module issues - this is a placeholder
 * that gracefully degrades to LLM fallback
 */

import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
} from 'expo-file-system/legacy';

// Model paths in local storage
const MODELS_DIR = `${documentDirectory}models/`;
const SPECIALTY_MODEL = 'specialty-model.onnx';
const CONDITION_MODEL = 'condition-model.onnx';
const SPECIALTY_TOKENIZER = 'specialty-tokenizer.json';
const CONDITION_TOKENIZER = 'condition-tokenizer.json';
const SPECIALTY_LABELS_FILE = 'specialty-labels.json';
const CONDITION_LABELS_FILE = 'condition-labels.json';
const SPECIALTY_HEAD = 'specialty-head.onnx';
const CONDITION_HEAD = 'condition-head.onnx';

// ONNX Runtime is dynamically loaded to avoid crash on import
let InferenceSession: any = null;
let Tensor: any = null;
let onnxAvailable = false;

// Sessions and data (lazy init)
let specialtySession: any = null;
let conditionSession: any = null;
let specialtyHeadSession: any = null;
let conditionHeadSession: any = null;
let specialtyTokenizer: TokenizerData | null = null;
let conditionTokenizer: TokenizerData | null = null;
let specialtyLabels: Record<string, string> = {};
let conditionLabels: Record<string, string> = {};

interface TokenizerData {
  model: {
    vocab: Record<string, number>;
  };
  added_tokens?: Array<{ id: number; content: string }>;
}

export interface SetFitResult {
  specialty: string;
  specialtyConfidence: number;
  conditions: string[];
  conditionConfidences: number[];
  inferenceTime: number;
}

/**
 * Try to load ONNX Runtime dynamically
 */
async function loadOnnxRuntime(): Promise<boolean> {
  if (onnxAvailable) return true;
  
  try {
    const onnx = require('onnxruntime-react-native');
    InferenceSession = onnx.InferenceSession;
    Tensor = onnx.Tensor;
    onnxAvailable = true;
    console.log('ONNX Runtime loaded successfully');
    return true;
  } catch (error) {
    console.warn('ONNX Runtime not available:', error);
    onnxAvailable = false;
    return false;
  }
}

/**
 * Check if SetFit models and supporting files are available
 */
export async function areSetFitModelsAvailable(): Promise<boolean> {
  try {
    const files = [
      SPECIALTY_MODEL,
      CONDITION_MODEL,
      SPECIALTY_TOKENIZER,
      CONDITION_TOKENIZER,
      SPECIALTY_LABELS_FILE,
      CONDITION_LABELS_FILE,
      SPECIALTY_HEAD,
      CONDITION_HEAD,
    ];
    
    const checks = await Promise.all(
      files.map(f => getInfoAsync(MODELS_DIR + f))
    );
    
    return checks.every(c => c.exists);
  } catch {
    return false;
  }
}

/**
 * Load tokenizer from JSON file
 */
async function loadTokenizer(filename: string): Promise<TokenizerData> {
  const content = await readAsStringAsync(MODELS_DIR + filename);
  return JSON.parse(content);
}

/**
 * Load label mapping from JSON file
 */
async function loadLabels(filename: string): Promise<Record<string, string>> {
  const content = await readAsStringAsync(MODELS_DIR + filename);
  const parsed = JSON.parse(content);
  // Handle both formats: {id2label: {...}} and flat {0: "label", ...}
  if (parsed.id2label) {
    return parsed.id2label;
  }
  return parsed;
}

/**
 * Initialize SetFit models
 */
export async function initializeSetFit(): Promise<boolean> {
  try {
    // First check if ONNX runtime is available
    const onnxLoaded = await loadOnnxRuntime();
    if (!onnxLoaded) {
      console.log('ONNX Runtime not available, SetFit disabled');
      return false;
    }

    const available = await areSetFitModelsAvailable();
    if (!available) {
      console.log('SetFit models not downloaded');
      return false;
    }

    console.log('Loading SetFit models...');
    const startTime = Date.now();

    // Load everything in parallel
    const [
      specSession,
      condSession,
      specHeadSession,
      condHeadSession,
      specTokenizer,
      condTokenizer,
      specLabels,
      condLabels,
    ] = await Promise.all([
      InferenceSession.create(MODELS_DIR + SPECIALTY_MODEL),
      InferenceSession.create(MODELS_DIR + CONDITION_MODEL),
      InferenceSession.create(MODELS_DIR + SPECIALTY_HEAD),
      InferenceSession.create(MODELS_DIR + CONDITION_HEAD),
      loadTokenizer(SPECIALTY_TOKENIZER),
      loadTokenizer(CONDITION_TOKENIZER),
      loadLabels(SPECIALTY_LABELS_FILE),
      loadLabels(CONDITION_LABELS_FILE),
    ]);

    specialtySession = specSession;
    conditionSession = condSession;
    specialtyHeadSession = specHeadSession;
    conditionHeadSession = condHeadSession;
    specialtyTokenizer = specTokenizer;
    conditionTokenizer = condTokenizer;
    specialtyLabels = specLabels;
    conditionLabels = condLabels;

    console.log(`SetFit models loaded in ${Date.now() - startTime}ms`);
    return true;
  } catch (error) {
    console.error('Failed to initialize SetFit:', error);
    return false;
  }
}

/**
 * Tokenize text using loaded tokenizer vocab
 */
function tokenize(text: string, tokenizer: TokenizerData, maxLength = 128): { inputIds: BigInt64Array; attentionMask: BigInt64Array; tokenTypeIds: BigInt64Array } {
  const vocab = tokenizer.model.vocab;
  const unkTokenId = vocab['[UNK]'] ?? 0;
  const clsTokenId = vocab['[CLS]'] ?? 101;
  const sepTokenId = vocab['[SEP]'] ?? 102;
  const padTokenId = vocab['[PAD]'] ?? 0;

  // Simple word-piece tokenization (lowercase, split on whitespace/punctuation)
  const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
  
  // Start with [CLS]
  const tokenIds: number[] = [clsTokenId];
  
  for (const word of words) {
    // Try to find word in vocab, otherwise use [UNK]
    const wordId = vocab[word];
    if (wordId !== undefined) {
      tokenIds.push(wordId);
    } else {
      // Try subword tokenization with ## prefix
      let remaining = word;
      let first = true;
      while (remaining.length > 0) {
        let found = false;
        for (let len = remaining.length; len > 0; len--) {
          const piece = first ? remaining.slice(0, len) : `##${remaining.slice(0, len)}`;
          if (vocab[piece] !== undefined) {
            tokenIds.push(vocab[piece]);
            remaining = remaining.slice(len);
            found = true;
            first = false;
            break;
          }
        }
        if (!found) {
          tokenIds.push(unkTokenId);
          break;
        }
      }
    }
    
    if (tokenIds.length >= maxLength - 1) break;
  }
  
  // Add [SEP]
  tokenIds.push(sepTokenId);
  
  // Pad to maxLength
  while (tokenIds.length < maxLength) {
    tokenIds.push(padTokenId);
  }
  
  // Truncate if too long
  const finalIds = tokenIds.slice(0, maxLength);
  
  // Create attention mask (1 for real tokens, 0 for padding)
  const attentionMask = finalIds.map(id => id !== padTokenId ? BigInt(1) : BigInt(0));
  
  // token_type_ids are all zeros for single sentence
  const tokenTypeIds = new Array(maxLength).fill(BigInt(0));
  
  return {
    inputIds: BigInt64Array.from(finalIds.map(id => BigInt(id))),
    attentionMask: BigInt64Array.from(attentionMask),
    tokenTypeIds: BigInt64Array.from(tokenTypeIds),
  };
}

/**
 * Run SetFit classification
 */
export async function classifySymptom(symptom: string): Promise<SetFitResult> {
  const startTime = Date.now();

  if (!specialtySession || !conditionSession || !specialtyHeadSession || !conditionHeadSession || !specialtyTokenizer || !conditionTokenizer) {
    throw new Error('SetFit models not initialized');
  }

  // === SPECIALTY CLASSIFICATION ===
  // Tokenize input for specialty model
  const specTokenized = tokenize(symptom, specialtyTokenizer);
  const specInputIds = new Tensor('int64', specTokenized.inputIds, [1, 128]);
  const specAttentionMask = new Tensor('int64', specTokenized.attentionMask, [1, 128]);
  const specTokenTypeIds = new Tensor('int64', specTokenized.tokenTypeIds, [1, 128]);

  // Run body model to get embeddings
  const specialtyOutput = await specialtySession.run({
    input_ids: specInputIds,
    attention_mask: specAttentionMask,
    token_type_ids: specTokenTypeIds,
  });
  
  // Get last_hidden_state: [1, 128, 384]
  const specHiddenState = (Object.values(specialtyOutput)[0] as any)?.data as Float32Array;
  const hiddenDim = 384; // MiniLM hidden dimension
  const seqLen = 128;
  
  // Mean pooling with attention mask
  const specEmbedding = new Float32Array(hiddenDim);
  let tokenCount = 0;
  for (let t = 0; t < seqLen; t++) {
    const attnVal = specTokenized.attentionMask[t];
    if (attnVal === BigInt(1)) {
      tokenCount++;
      for (let d = 0; d < hiddenDim; d++) {
        specEmbedding[d] += specHiddenState[t * hiddenDim + d];
      }
    }
  }
  for (let d = 0; d < hiddenDim; d++) {
    specEmbedding[d] /= tokenCount || 1;
  }
  
  // Run head model
  const specEmbeddingTensor = new Tensor('float32', specEmbedding, [1, hiddenDim]);
  const specHeadOutput = await specialtyHeadSession.run({
    input: specEmbeddingTensor,
  });
  
  const specLogits = (Object.values(specHeadOutput)[0] as any)?.data as Float32Array;
  console.log('Specialty head output keys:', Object.keys(specHeadOutput));
  console.log('Specialty logits length:', specLogits?.length);
  
  // Find top specialty
  let maxIdx = 0;
  let maxVal = specLogits[0];
  for (let i = 1; i < specLogits.length; i++) {
    if (specLogits[i] > maxVal) {
      maxVal = specLogits[i];
      maxIdx = i;
    }
  }
  
  console.log('Top specialty idx:', maxIdx, 'label:', specialtyLabels[String(maxIdx)]);
  
  // Softmax for confidence
  const expSum = Array.from(specLogits).reduce((sum, v) => sum + Math.exp(v), 0);
  const confidence = Math.exp(maxVal) / expSum;

  // === CONDITION CLASSIFICATION ===
  const condTokenized = tokenize(symptom, conditionTokenizer);
  const condInputIds = new Tensor('int64', condTokenized.inputIds, [1, 128]);
  const condAttentionMask = new Tensor('int64', condTokenized.attentionMask, [1, 128]);
  const condTokenTypeIds = new Tensor('int64', condTokenized.tokenTypeIds, [1, 128]);

  // Run body model
  const conditionOutput = await conditionSession.run({
    input_ids: condInputIds,
    attention_mask: condAttentionMask,
    token_type_ids: condTokenTypeIds,
  });
  
  const condHiddenState = (Object.values(conditionOutput)[0] as any)?.data as Float32Array;
  
  // Mean pooling
  const condEmbedding = new Float32Array(hiddenDim);
  tokenCount = 0;
  for (let t = 0; t < seqLen; t++) {
    const attnVal = condTokenized.attentionMask[t];
    if (attnVal === BigInt(1)) {
      tokenCount++;
      for (let d = 0; d < hiddenDim; d++) {
        condEmbedding[d] += condHiddenState[t * hiddenDim + d];
      }
    }
  }
  for (let d = 0; d < hiddenDim; d++) {
    condEmbedding[d] /= tokenCount || 1;
  }
  
  // Run head model
  const condEmbeddingTensor = new Tensor('float32', condEmbedding, [1, hiddenDim]);
  const condHeadOutput = await conditionHeadSession.run({
    input: condEmbeddingTensor,
  });
  
  const condLogits = (Object.values(condHeadOutput)[0] as any)?.data as Float32Array;
  console.log('Condition logits length:', condLogits?.length);
  
  // Get top 3 conditions
  const condIndices = Array.from(condLogits)
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);
  
  console.log('Top 3 conditions:', condIndices.map(c => conditionLabels[String(c.i)]));
  
  const condExpSum = Array.from(condLogits).reduce((sum, v) => sum + Math.exp(v), 0);

  return {
    specialty: specialtyLabels[String(maxIdx)] || 'Primary Care',
    specialtyConfidence: confidence,
    conditions: condIndices.map(c => conditionLabels[String(c.i)] || 'Unknown'),
    conditionConfidences: condIndices.map(c => Math.exp(c.v) / condExpSum),
    inferenceTime: Date.now() - startTime,
  };
}

/**
 * Check if SetFit is ready
 */
export function isSetFitReady(): boolean {
  return onnxAvailable && specialtySession !== null && conditionSession !== null && specialtyHeadSession !== null && conditionHeadSession !== null;
}
