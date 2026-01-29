/**
 * Semantic Search Service
 * Offline protocol search using MedSigLIP embeddings
 * Uses ONNX Runtime for on-device inference
 */

import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
} from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

// Model paths in local storage
const MODELS_DIR = `${documentDirectory}models/`;
const MEDSIGLIP_ONNX = 'medsiglip-text-int8.onnx';
const TOKENIZER_FILE = 'medsiglip-tokenizer.json';

// ONNX Runtime is dynamically loaded to avoid crash on import
let InferenceSession: any = null;
let Tensor: any = null;
let onnxAvailable = false;

// State
let session: any = null;
let tokenizer: TokenizerData | null = null;
let protocols: Protocol[] = [];
let protocolEmbeddings: Float32Array[] = [];

interface TokenizerData {
  vocab: Record<string, number>;
  special_tokens: {
    pad_token: string;
    pad_token_id: number;
    eos_token: string;
    eos_token_id: number;
    unk_token: string;
    unk_token_id: number;
  };
  max_length: number;
}

interface Protocol {
  id: string;
  title: string;
  source: string;
  text: string;
  url: string;
  embedding: number[];
}

export interface SearchResult {
  id: string;
  title: string;
  source: string;
  text: string;
  url: string;
  score: number;
}

/**
 * Load ONNX Runtime dynamically
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
 * Check if semantic search models are available
 */
export async function areModelsAvailable(): Promise<boolean> {
  try {
    const [onnxInfo, tokenizerInfo] = await Promise.all([
      getInfoAsync(MODELS_DIR + MEDSIGLIP_ONNX),
      getInfoAsync(MODELS_DIR + TOKENIZER_FILE),
    ]);
    return onnxInfo.exists && tokenizerInfo.exists;
  } catch {
    return false;
  }
}

/**
 * Load tokenizer from JSON file
 */
async function loadTokenizer(): Promise<TokenizerData> {
  const content = await readAsStringAsync(MODELS_DIR + TOKENIZER_FILE);
  return JSON.parse(content);
}

/**
 * Load bundled protocols database
 */
async function loadProtocols(): Promise<Protocol[]> {
  try {
    // Try loading from bundled asset first
    const asset = Asset.fromModule(require('../assets/protocols.json'));
    await asset.downloadAsync();
    
    if (asset.localUri) {
      const content = await readAsStringAsync(asset.localUri);
      return JSON.parse(content);
    }
    
    throw new Error('Could not load bundled protocols');
  } catch (error) {
    console.error('Failed to load protocols:', error);
    return [];
  }
}

/**
 * Tokenize text using vocabulary
 * Simple word-based tokenization with UNK fallback
 */
function tokenize(text: string, maxLength: number = 64): { 
  inputIds: BigInt64Array; 
  attentionMask: BigInt64Array 
} {
  if (!tokenizer) {
    throw new Error('Tokenizer not loaded');
  }

  const vocab = tokenizer.vocab;
  const unkId = tokenizer.special_tokens.unk_token_id;
  const padId = tokenizer.special_tokens.pad_token_id;
  const eosId = tokenizer.special_tokens.eos_token_id;

  // Simple tokenization: lowercase, split on whitespace/punctuation
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  const tokenIds: number[] = [];

  for (const word of words) {
    if (tokenIds.length >= maxLength - 1) break;
    
    // Try exact match first
    if (vocab[word] !== undefined) {
      tokenIds.push(vocab[word]);
    } else {
      // Try with underscore prefix (SentencePiece style)
      const prefixed = `▁${word}`;
      if (vocab[prefixed] !== undefined) {
        tokenIds.push(vocab[prefixed]);
      } else {
        // Fallback to character-level tokenization
        let foundAny = false;
        for (const char of word) {
          if (vocab[char] !== undefined) {
            tokenIds.push(vocab[char]);
            foundAny = true;
          } else if (vocab[`▁${char}`] !== undefined) {
            tokenIds.push(vocab[`▁${char}`]);
            foundAny = true;
          }
          if (tokenIds.length >= maxLength - 1) break;
        }
        if (!foundAny) {
          tokenIds.push(unkId);
        }
      }
    }
  }

  // Add EOS token
  tokenIds.push(eosId);

  // Pad to max length
  while (tokenIds.length < maxLength) {
    tokenIds.push(padId);
  }

  // Truncate if needed
  const finalIds = tokenIds.slice(0, maxLength);

  // Create attention mask (1 for real tokens, 0 for padding)
  const attentionMask = finalIds.map(id => id !== padId ? BigInt(1) : BigInt(0));

  return {
    inputIds: BigInt64Array.from(finalIds.map(id => BigInt(id))),
    attentionMask: BigInt64Array.from(attentionMask),
  };
}

/**
 * Normalize a vector for cosine similarity
 */
function normalize(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  const result = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    result[i] = vec[i] / norm;
  }
  return result;
}

/**
 * Compute cosine similarity between two normalized vectors
 */
function cosineSimilarity(a: Float32Array, b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Initialize semantic search
 */
export async function initializeSemanticSearch(): Promise<boolean> {
  try {
    // Load ONNX Runtime
    const onnxLoaded = await loadOnnxRuntime();
    if (!onnxLoaded) {
      console.log('ONNX Runtime not available');
      return false;
    }

    // Check if models exist
    const available = await areModelsAvailable();
    if (!available) {
      console.log('Semantic search models not downloaded');
      return false;
    }

    console.log('Loading semantic search models...');
    const startTime = Date.now();

    // Load everything in parallel
    const [onnxSession, tokenizerData, protocolsData] = await Promise.all([
      InferenceSession.create(MODELS_DIR + MEDSIGLIP_ONNX),
      loadTokenizer(),
      loadProtocols(),
    ]);

    session = onnxSession;
    tokenizer = tokenizerData;
    protocols = protocolsData;

    // Pre-convert embeddings to Float32Array for faster comparison
    protocolEmbeddings = protocols.map(p => new Float32Array(p.embedding));

    console.log(`Semantic search loaded in ${Date.now() - startTime}ms`);
    console.log(`Loaded ${protocols.length} protocols`);
    
    return true;
  } catch (error) {
    console.error('Failed to initialize semantic search:', error);
    return false;
  }
}

/**
 * Embed a query using MedSigLIP
 */
export async function embedQuery(text: string): Promise<Float32Array> {
  if (!session) {
    throw new Error('Semantic search not initialized');
  }

  const { inputIds, attentionMask } = tokenize(text);
  const maxLen = tokenizer?.max_length || 64;

  // Create input tensors
  const inputIdsTensor = new Tensor('int64', inputIds, [1, maxLen]);
  const attentionMaskTensor = new Tensor('int64', attentionMask, [1, maxLen]);

  // Run inference
  const output = await session.run({
    input_ids: inputIdsTensor,
    attention_mask: attentionMaskTensor,
  });

  // Get embeddings from output
  const embeddings = (Object.values(output)[0] as any)?.data as Float32Array;
  
  // Normalize for cosine similarity
  return normalize(embeddings);
}

/**
 * Search protocols by semantic similarity
 */
export async function searchProtocols(
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  const startTime = Date.now();

  // Embed query
  const queryEmbedding = await embedQuery(query);

  // Compute similarities
  const scores = protocols.map((protocol, i) => ({
    index: i,
    score: cosineSimilarity(queryEmbedding, protocol.embedding),
  }));

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Get top K results
  const results: SearchResult[] = scores.slice(0, topK).map(({ index, score }) => ({
    id: protocols[index].id,
    title: protocols[index].title,
    source: protocols[index].source,
    text: protocols[index].text,
    url: protocols[index].url,
    score,
  }));

  console.log(`Search completed in ${Date.now() - startTime}ms`);
  return results;
}

/**
 * Check if semantic search is ready
 */
export function isSemanticSearchReady(): boolean {
  return onnxAvailable && session !== null && protocols.length > 0;
}

/**
 * Get stats about loaded protocols
 */
export function getProtocolStats(): { 
  count: number; 
  sources: string[] 
} {
  const sources = [...new Set(protocols.map(p => p.source))];
  return {
    count: protocols.length,
    sources,
  };
}
