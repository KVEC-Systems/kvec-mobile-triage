/**
 * LLM Service for on-device inference using llama.rn
 * Uses quantized MedGemma 4B model (Q4_K_M) for clinical triage
 */

import { initLlama, LlamaContext } from 'llama.rn';
import { Paths, File } from 'expo-file-system';

// Model configuration
const MODEL_FILENAME = 'medgemma-4b-q4_k_m.gguf';

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

export interface TriageResult {
  specialty: string;
  confidence: number;
  conditions: string[];
  guidance: string;
  inferenceTime: number;
  usedLLM: boolean;
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
      n_ctx: 1024,        // Reduced context for faster inference
      n_batch: 512,       // Batch size for prompt processing
      n_threads: 6,       // CPU threads for parallel processing
      n_gpu_layers: 32,   // GPU acceleration (Metal on iOS, Vulkan on Android)
      use_mlock: true,    // Lock model in memory
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
      n_predict: 150,      // Reduced for faster inference (output is structured)
      temperature: 0.2,    // Lower for more deterministic triage
      top_p: 0.9,
      stop: ['</s>', '\n\n\n', '5.'],  // Stop after guidance section
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
  return `<bos><start_of_turn>user
You are a medical triage assistant. Based on the patient's symptoms, determine the most appropriate medical specialty to route them to.

Available specialties: ${SPECIALTIES.join(', ')}

Patient symptoms: "${symptom}"

Respond with:
1. SPECIALTY: [specialty name]
2. CONFIDENCE: [high/medium/low]
3. CONDITIONS: [comma-separated list of possible conditions]
4. GUIDANCE: [brief clinical guidance for triage]
<end_of_turn>
<start_of_turn>model
Based on the symptoms described, here is my triage assessment:

1. SPECIALTY:`;
}

/**
 * Parse the LLM response into structured result
 */
function parseTriageResponse(response: string, symptom: string): Omit<TriageResult, 'inferenceTime' | 'usedLLM'> {
  const lines = response.split('\n');
  
  let specialty = 'Primary Care';
  let confidence = 0.6;
  let conditions: string[] = [];
  let guidance = '';

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('SPECIALTY:') || line.includes('1. SPECIALTY:')) {
      const value = trimmed.replace(/.*SPECIALTY:\s*/i, '').trim();
      specialty = findClosestSpecialty(value);
    } else if (trimmed.startsWith('CONFIDENCE:') || line.includes('2. CONFIDENCE:')) {
      const value = trimmed.replace(/.*CONFIDENCE:\s*/i, '').toLowerCase();
      confidence = value.includes('high') ? 0.9 : value.includes('medium') ? 0.75 : 0.6;
    } else if (trimmed.startsWith('CONDITIONS:') || line.includes('3. CONDITIONS:')) {
      const value = trimmed.replace(/.*CONDITIONS:\s*/i, '');
      conditions = value.split(',').map(c => c.trim()).filter(c => c.length > 0);
    } else if (trimmed.startsWith('GUIDANCE:') || line.includes('4. GUIDANCE:')) {
      guidance = trimmed.replace(/.*GUIDANCE:\s*/i, '');
    }
  }

  // Fallback if parsing failed
  if (conditions.length === 0) {
    conditions = ['Further evaluation needed'];
  }
  if (!guidance) {
    guidance = `Recommend evaluation by ${specialty} specialist for the described symptoms.`;
  }

  return { specialty, confidence, conditions, guidance };
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
  
  // Keyword-based routing
  if (symptomLower.includes('burn') && (symptomLower.includes('pee') || symptomLower.includes('urin'))) {
    return {
      specialty: 'Urology',
      confidence: 0.85,
      conditions: ['Urinary Tract Infection', 'Cystitis'],
      guidance: 'Patient presents with dysuria. Recommend urinalysis and urine culture.',
      inferenceTime: elapsedMs,
      usedLLM: false,
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
