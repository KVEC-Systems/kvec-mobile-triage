/**
 * LLM Service for on-device inference using llama.rn
 * Uses quantized MedGemma 4B model (Q4_K_M) for clinical triage
 */

import { initLlama, LlamaContext } from 'llama.rn';
import { Paths, File } from 'expo-file-system';

// Model configuration
const MODEL_FILENAME = 'medgemma-4b-q2_k.gguf';

// Get model file reference (lazy init since Paths.document may not be ready at module load)
function getModelFile(): File {
  return new File(Paths.document, 'models', MODEL_FILENAME);
}

// Singleton context
let llamaContext: LlamaContext | null = null;
let isInitializing = false;
let initError: Error | null = null;

// Specialties for routing
const SPECIALTIES = [
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
  'Women\'s Health',
];

export type UrgencyLevel = 'emergency' | 'urgent' | 'routine';

export interface TriageResult {
  specialty: string;
  confidence: number;
  conditions: string[];
  guidance: string;
  inferenceTime: number;
  usedLLM: boolean;
  // Structured extraction fields
  urgency: UrgencyLevel;
  bodySystem: string;
  redFlags: string[];
  followUpTimeframe: string;
  suggestedQuestions: string[];
}

/**
 * Check if the model file exists in the app's document directory
 */
export async function isModelAvailable(): Promise<boolean> {
  try {
    const modelFile = getModelFile();
    return modelFile.exists;
  } catch {
    return false;
  }
}

/**
 * Get model download progress info
 */
export async function getModelInfo(): Promise<{
  exists: boolean;
  size?: number;
  path: string;
}> {
  try {
    const modelFile = getModelFile();
    return {
      exists: modelFile.exists,
      size: modelFile.exists ? modelFile.size : undefined,
      path: modelFile.uri,
    };
  } catch {
    return { exists: false, path: getModelFile().uri };
  }
}

/**
 * Initialize the LLM context (loads model into memory)
 * This is a heavy operation - only call once on app start
 */
export async function initializeLLM(): Promise<boolean> {
  if (llamaContext) {
    return true; // Already initialized
  }

  if (isInitializing) {
    // Wait for existing initialization
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return llamaContext !== null;
  }

  isInitializing = true;
  initError = null;

  try {
    // Check if model exists
    const modelFile = getModelFile();
    const modelExists = modelFile.exists;
    if (!modelExists) {
      throw new Error(
        `Model not found at ${modelFile.uri}. ` +
        `Please copy the model file to the device.`
      );
    }

    console.log('Loading MedGemma model...');
    const startTime = Date.now();

    llamaContext = await initLlama({
      model: modelFile.uri,
      n_ctx: 512,         // Minimal context for speed
      n_batch: 512,       // Batch size for prompt processing
      n_threads: 8,       // Max CPU threads
      n_gpu_layers: 99,   // Offload all layers to GPU
      use_mlock: true,    // Lock model in memory
      flash_attn: true,   // Flash attention for speed (if supported)
    });

    const loadTime = Date.now() - startTime;
    console.log(`Model loaded in ${loadTime}ms`);

    return true;
  } catch (error) {
    initError = error as Error;
    console.error('Failed to initialize LLM:', error);
    return false;
  } finally {
    isInitializing = false;
  }
}

/**
 * Run triage inference on symptom description
 */
export async function runTriage(symptom: string): Promise<TriageResult> {
  const startTime = Date.now();

  // If LLM not available, use fallback
  if (!llamaContext) {
    console.log('LLM not available, using fallback triage');
    return runFallbackTriage(symptom, Date.now() - startTime);
  }

  try {
    // Build prompt for MedGemma
    const prompt = buildTriagePrompt(symptom);
    
    // Run inference
    const response = await llamaContext.completion({
      prompt,
      n_predict: 80,       // Minimal tokens for structured output
      temperature: 0.1,    // Very low for deterministic output
      top_p: 0.85,
      stop: ['</s>', '\n\n', '4.'],  // Stop after conditions
    });

    const inferenceTime = Date.now() - startTime;
    
    // Parse the response
    const result = parseTriageResponse(response.text, symptom);
    return {
      ...result,
      inferenceTime,
      usedLLM: true,
    };
  } catch (error) {
    console.error('Inference error:', error);
    return runFallbackTriage(symptom, Date.now() - startTime);
  }
}

/**
 * Build the prompt for MedGemma triage
 */
function buildTriagePrompt(symptom: string): string {
  // Structured prompt for comprehensive triage output
  return `<bos><start_of_turn>user
You are a medical triage assistant. Route symptoms to the appropriate specialty.

Specialties: ${SPECIALTIES.join(', ')}

Patient symptoms: "${symptom}"

Respond in this EXACT format:
1. SPECIALTY: [one specialty from the list]
2. CONFIDENCE: [high/medium/low]
3. URGENCY: [emergency/urgent/routine]
4. BODY_SYSTEM: [affected system, e.g. urinary, cardiovascular, neurological, musculoskeletal, dermatological, gastrointestinal, respiratory, psychiatric]
5. RED_FLAGS: [comma-separated warning signs, or "none"]
6. CONDITIONS: [comma-separated possible conditions]
7. TIMEFRAME: [when to be seen, e.g. "immediately", "within 24 hours", "within 1 week"]
8. QUESTIONS: [2-3 follow-up questions to ask]
<end_of_turn>
<start_of_turn>model
1. SPECIALTY:`;
}

/**
 * Parse the LLM response into structured result
 */
function parseTriageResponse(response: string, symptom: string): Omit<TriageResult, 'inferenceTime' | 'usedLLM'> {
  const lines = response.split('\n');
  
  let specialty = 'Primary Care';
  let confidence = 0.6;
  let urgency: UrgencyLevel = 'routine';
  let bodySystem = 'general';
  let redFlags: string[] = [];
  let conditions: string[] = [];
  let followUpTimeframe = 'within 1 week';
  let suggestedQuestions: string[] = [];
  let guidance = '';

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Parse each field with flexible matching
    if (/SPECIALTY:/i.test(trimmed)) {
      const value = trimmed.replace(/.*SPECIALTY:\s*/i, '').trim();
      specialty = findClosestSpecialty(value);
    } else if (/CONFIDENCE:/i.test(trimmed)) {
      const value = trimmed.replace(/.*CONFIDENCE:\s*/i, '').toLowerCase();
      confidence = value.includes('high') ? 0.9 : value.includes('medium') ? 0.75 : 0.6;
    } else if (/URGENCY:/i.test(trimmed)) {
      const value = trimmed.replace(/.*URGENCY:\s*/i, '').toLowerCase();
      if (value.includes('emergency')) urgency = 'emergency';
      else if (value.includes('urgent')) urgency = 'urgent';
      else urgency = 'routine';
    } else if (/BODY_SYSTEM:/i.test(trimmed)) {
      bodySystem = trimmed.replace(/.*BODY_SYSTEM:\s*/i, '').trim().toLowerCase() || 'general';
    } else if (/RED_FLAGS:/i.test(trimmed)) {
      const value = trimmed.replace(/.*RED_FLAGS:\s*/i, '').trim();
      if (value.toLowerCase() !== 'none' && value.length > 0) {
        redFlags = value.split(',').map(f => f.trim()).filter(f => f.length > 0);
      }
    } else if (/CONDITIONS:/i.test(trimmed)) {
      const value = trimmed.replace(/.*CONDITIONS:\s*/i, '');
      conditions = value.split(',').map(c => c.trim()).filter(c => c.length > 0);
    } else if (/TIMEFRAME:/i.test(trimmed)) {
      followUpTimeframe = trimmed.replace(/.*TIMEFRAME:\s*/i, '').trim() || 'within 1 week';
    } else if (/QUESTIONS:/i.test(trimmed)) {
      const value = trimmed.replace(/.*QUESTIONS:\s*/i, '');
      suggestedQuestions = value.split(/[,;]/).map(q => q.trim()).filter(q => q.length > 0);
    }
  }

  // Fallbacks for required fields
  if (conditions.length === 0) {
    conditions = ['Further evaluation needed'];
  }
  if (!guidance) {
    guidance = `Recommend evaluation by ${specialty} specialist for the described symptoms.`;
  }
  if (suggestedQuestions.length === 0) {
    suggestedQuestions = ['How long have you had these symptoms?', 'Have you tried any treatments?'];
  }

  return { 
    specialty, 
    confidence, 
    conditions, 
    guidance,
    urgency,
    bodySystem,
    redFlags,
    followUpTimeframe,
    suggestedQuestions,
  };
}

/**
 * Find the closest matching specialty from our list
 */
function findClosestSpecialty(input: string): string {
  const normalized = input.toLowerCase().trim();
  
  for (const specialty of SPECIALTIES) {
    if (specialty.toLowerCase().includes(normalized) || 
        normalized.includes(specialty.toLowerCase())) {
      return specialty;
    }
  }
  
  // Common aliases
  const aliases: Record<string, string> = {
    'mental health': 'Behavioral Health',
    'psychiatry': 'Behavioral Health',
    'psychology': 'Behavioral Health',
    'heart': 'Cardiology',
    'cardiac': 'Cardiology',
    'skin': 'Dermatology',
    'gi': 'Gastroenterology',
    'digestive': 'Gastroenterology',
    'neuro': 'Neurology',
    'brain': 'Neurology',
    'cancer': 'Oncology',
    'ortho': 'Orthopedic Surgery',
    'bone': 'Orthopedic Surgery',
    'joint': 'Orthopedic Surgery',
    'lung': 'Pulmonology',
    'breathing': 'Pulmonology',
    'bladder': 'Urology',
    'kidney': 'Urology',
    'urinary': 'Urology',
    'gynecology': 'Women\'s Health',
    'ob/gyn': 'Women\'s Health',
    'obgyn': 'Women\'s Health',
  };

  for (const [alias, specialty] of Object.entries(aliases)) {
    if (normalized.includes(alias)) {
      return specialty;
    }
  }

  return 'Primary Care';
}

/**
 * Fallback triage when LLM is not available
 * Uses simple keyword matching
 */
function runFallbackTriage(symptom: string, elapsedMs: number): TriageResult {
  const symptomLower = symptom.toLowerCase();
  
  // Keyword-based routing with full structured data
  if (symptomLower.includes('burn') && (symptomLower.includes('pee') || symptomLower.includes('urin'))) {
    return {
      specialty: 'Urology',
      confidence: 0.85,
      conditions: ['Urinary Tract Infection', 'Cystitis'],
      guidance: 'Patient presents with dysuria. Recommend urinalysis and urine culture.',
      inferenceTime: elapsedMs,
      usedLLM: false,
      urgency: 'routine',
      bodySystem: 'urinary',
      redFlags: [],
      followUpTimeframe: 'within 48 hours',
      suggestedQuestions: ['Do you have a fever?', 'Is there blood in your urine?', 'Any back or flank pain?'],
    };
  }
  
  if (symptomLower.includes('chest') && (symptomLower.includes('eat') || symptomLower.includes('food') || symptomLower.includes('meal'))) {
    return {
      specialty: 'Gastroenterology',
      confidence: 0.82,
      conditions: ['GERD', 'Esophagitis', 'Peptic Ulcer'],
      guidance: 'Postprandial chest discomfort suggests acid reflux. Consider PPI trial.',
      inferenceTime: elapsedMs,
      usedLLM: false,
      urgency: 'routine',
      bodySystem: 'gastrointestinal',
      redFlags: [],
      followUpTimeframe: 'within 1 week',
      suggestedQuestions: ['Does it worsen when lying down?', 'Any difficulty swallowing?', 'Any weight loss?'],
    };
  }
  
  if (symptomLower.includes('sad') || symptomLower.includes('depress') || symptomLower.includes('anxious') || symptomLower.includes('panic')) {
    return {
      specialty: 'Behavioral Health',
      confidence: 0.80,
      conditions: ['Depression', 'Anxiety', 'Adjustment Disorder'],
      guidance: 'Screen with PHQ-9/GAD-7. Assess for suicidal ideation.',
      inferenceTime: elapsedMs,
      usedLLM: false,
      urgency: 'urgent',
      bodySystem: 'psychiatric',
      redFlags: ['Assess for suicidal ideation'],
      followUpTimeframe: 'within 48-72 hours',
      suggestedQuestions: ['How long have you felt this way?', 'Any thoughts of self-harm?', 'How is your sleep?'],
    };
  }
  
  if (symptomLower.includes('mole') || symptomLower.includes('rash') || symptomLower.includes('skin') || symptomLower.includes('itch')) {
    return {
      specialty: 'Dermatology',
      confidence: 0.78,
      conditions: ['Dermatitis', 'Skin Lesion', 'Allergic Reaction'],
      guidance: 'Visual examination needed. Document lesion characteristics.',
      inferenceTime: elapsedMs,
      usedLLM: false,
      urgency: 'routine',
      bodySystem: 'dermatological',
      redFlags: [],
      followUpTimeframe: 'within 1-2 weeks',
      suggestedQuestions: ['Is the area spreading?', 'Any new products or exposures?', 'Is it painful or just itchy?'],
    };
  }
  
  if (symptomLower.includes('heart') || symptomLower.includes('chest pain') || symptomLower.includes('palpitation')) {
    return {
      specialty: 'Cardiology',
      confidence: 0.75,
      conditions: ['Cardiac evaluation needed'],
      guidance: 'Rule out cardiac causes. Consider ECG and cardiac workup.',
      inferenceTime: elapsedMs,
      usedLLM: false,
      urgency: 'emergency',
      bodySystem: 'cardiovascular',
      redFlags: ['Chest pain', 'Possible cardiac event'],
      followUpTimeframe: 'immediately',
      suggestedQuestions: ['Any shortness of breath?', 'Pain radiating to arm or jaw?', 'Any dizziness or sweating?'],
    };
  }

  // Default fallback
  return {
    specialty: 'Primary Care',
    confidence: 0.50,
    conditions: ['General evaluation needed'],
    guidance: 'Unable to determine specific specialty. Recommend primary care evaluation.',
    inferenceTime: elapsedMs,
    usedLLM: false,
    urgency: 'routine',
    bodySystem: 'general',
    redFlags: [],
    followUpTimeframe: 'within 1 week',
    suggestedQuestions: ['How long have you had these symptoms?', 'Have you tried any treatments?'],
  };
}

/**
 * Release LLM resources
 */
export async function releaseLLM(): Promise<void> {
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
  }
}

/**
 * Get LLM status
 */
export function getLLMStatus(): {
  initialized: boolean;
  initializing: boolean;
  error: string | null;
} {
  return {
    initialized: llamaContext !== null,
    initializing: isInitializing,
    error: initError?.message ?? null,
  };
}

/**
 * Send a freeform message to the LLM and get a response
 */
export async function sendMessage(prompt: string): Promise<string> {
  if (!llamaContext) {
    throw new Error('LLM not initialized');
  }

  try {
    const result = await llamaContext.completion({
      prompt,
      n_predict: 200,
      temperature: 0.3,
      stop: ['</s>', 'User:', 'Patient:'],
    });

    return result.text.trim();
  } catch (error) {
    console.error('LLM completion error:', error);
    throw error;
  }
}
