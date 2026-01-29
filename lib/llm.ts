/**
 * LLM Service for on-device inference using llama.rn
 * Uses quantized MedGemma 4B model (Q4_K_M) for clinical triage
 */

import { initLlama, LlamaContext } from 'llama.rn';
import { Paths, File } from 'expo-file-system';

// Model configuration
const MODEL_FILENAME = 'medgemma-4b-iq2_xxs.gguf';

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

// Specialty-specific follow-up questions
const SPECIALTY_QUESTIONS: Record<string, string[]> = {
  'Behavioral Health': [
    'How long have you been experiencing these feelings?',
    'Have these symptoms affected your sleep or appetite?',
    'Are you currently taking any medications for mental health?',
    'Have you experienced thoughts of self-harm?',
  ],
  'Cardiology': [
    'Do you experience chest pain or pressure?',
    'Do symptoms occur during physical activity or at rest?',
    'Do you have a history of heart disease or high blood pressure?',
    'Have you noticed any swelling in your legs or ankles?',
  ],
  'Dermatology': [
    'How long have you had this skin condition?',
    'Is the affected area itchy, painful, or spreading?',
    'Have you recently changed soaps, detergents, or skincare products?',
    'Do you have a history of skin conditions or allergies?',
  ],
  'Gastroenterology': [
    'Have you noticed any changes in bowel habits?',
    'Do you experience pain before or after eating?',
    'Have you had any nausea, vomiting, or blood in stool?',
    'Have you recently traveled or eaten unusual foods?',
  ],
  'Neurology': [
    'Have you experienced headaches, dizziness, or vision changes?',
    'Do you have any numbness, tingling, or weakness?',
    'Have you had any seizures or loss of consciousness?',
    'Is there a family history of neurological conditions?',
  ],
  'Oncology': [
    'Have you noticed any unexplained weight loss?',
    'Do you have any lumps or masses that have changed in size?',
    'Do you have a family history of cancer?',
    'Have you experienced unusual fatigue or night sweats?',
  ],
  'Orthopedic Surgery': [
    'Did an injury cause your symptoms?',
    'Does the pain limit your range of motion?',
    'Have you tried any treatments like ice, rest, or medication?',
    'Does the pain radiate to other areas?',
  ],
  'Pain Management': [
    'How would you rate your pain on a scale of 1-10?',
    'Is the pain constant or does it come and go?',
    'What makes the pain better or worse?',
    'How long have you been experiencing this pain?',
  ],
  'Primary Care': [
    'How long have you had these symptoms?',
    'Have you tried any treatments or medications?',
    'Do you have any chronic medical conditions?',
    'Are you up to date on your vaccinations?',
  ],
  'Pulmonology': [
    'Do you experience shortness of breath or wheezing?',
    'Do you have a cough, and if so, is it productive?',
    'Do you smoke or have exposure to secondhand smoke?',
    'Have symptoms worsened at night or during exercise?',
  ],
  'Rheumatology': [
    'Do you have joint pain, stiffness, or swelling?',
    'Is the stiffness worse in the morning?',
    'Do symptoms affect multiple joints?',
    'Do you have a family history of autoimmune conditions?',
  ],
  'Sports Medicine': [
    'How did the injury occur?',
    'Can you bear weight on the affected area?',
    'Have you noticed any swelling or bruising?',
    'Have you had similar injuries before?',
  ],
  'Urology': [
    'Do you have pain or burning when urinating?',
    'Have you noticed changes in urinary frequency?',
    'Have you seen blood in your urine?',
    'For men: do you have difficulty starting or maintaining urine flow?',
  ],
  'Vascular Medicine': [
    'Do you have pain or cramping in your legs when walking?',
    'Have you noticed color changes in your extremities?',
    'Do you have a history of blood clots?',
    'Do you have diabetes or smoke?',
  ],
  'Women\'s Health': [
    'When was your last menstrual period?',
    'Are you experiencing any unusual bleeding or discharge?',
    'Could you be pregnant?',
    'Have you had any changes in your menstrual cycle?',
  ],
};

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
 * Enrichment result from LLM for structured fields only
 */
export interface EnrichmentResult {
  urgency: UrgencyLevel;
  bodySystem: string;
  redFlags: string[];
  followUpTimeframe: string;
  suggestedQuestions: string[];
  enrichmentTime: number;
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
      n_ctx: 256,         // Minimal context for speed
      n_batch: 256,       // Smaller batch for faster processing
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
    console.log('=== LLM TRIAGE ===');
    console.log('Input symptom:', symptom);
    console.log('Prompt:', prompt.substring(0, 200) + '...');
    
    // Run inference
    const response = await llamaContext.completion({
      prompt,
      n_predict: 1024,     // High token limit for complete output
      temperature: 0.1,    // Very low for deterministic output
      top_p: 0.85,
      stop: ['</s>', '\n\n', '4.'],  // Stop after conditions
    });

    const inferenceTime = Date.now() - startTime;
    console.log('Raw LLM response:', response.text);
    console.log('Inference time:', inferenceTime, 'ms');
    
    // Parse the response
    const result = parseTriageResponse(response.text, symptom);
    console.log('Parsed result:', JSON.stringify(result, null, 2));
    console.log('=== END TRIAGE ===');
    
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
 * Build the prompt for MedGemma triage - COMPACT version for speed
 */
function buildTriagePrompt(symptom: string): string {
  return `<bos><start_of_turn>user
Triage: "${symptom}"
Format: SPECIALTY|CONFIDENCE|URGENCY|BODY_SYSTEM|RED_FLAGS|CONDITIONS|TIMEFRAME|QUESTIONS
<end_of_turn>
<start_of_turn>model
`;
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
      n_predict: 1024,
      temperature: 0.3,
      stop: ['</s>', 'User:', 'Patient:'],
    });

    return result.text.trim();
  } catch (error) {
    console.error('LLM completion error:', error);
    throw error;
  }
}

/**
 * Enrich SetFit classification results with LLM-generated structured fields
 * This is the second stage of hybrid inference
 */
export async function enrichWithLLM(
  symptom: string,
  specialty: string,
  conditions: string[]
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  
  // Get specialty-specific questions as default
  const specialtyQuestions = SPECIALTY_QUESTIONS[specialty] || SPECIALTY_QUESTIONS['Primary Care'];
  
  // Default result for failures - uses specialty-specific questions
  const defaultResult: EnrichmentResult = {
    urgency: 'routine',
    bodySystem: 'general',
    redFlags: [],
    followUpTimeframe: 'within 1 week',
    suggestedQuestions: specialtyQuestions,
    enrichmentTime: 0,
  };

  // Try cloud inference first (faster)
  try {
    console.log('=== TRYING CLOUD INFERENCE ===');
    const { cloudInference, buildCloudEnrichmentPrompt, isCloudAvailable } = await import('./cloud');
    
    const cloudAvailable = await isCloudAvailable();
    if (cloudAvailable) {
      const prompt = buildCloudEnrichmentPrompt(symptom, specialty, conditions);
      const response = await cloudInference(prompt);
      
      const enrichmentTime = Date.now() - startTime;
      console.log('Cloud response:', response);
      console.log('Cloud enrichment time:', enrichmentTime, 'ms');
      
      const parsed = parseEnrichmentResponse(response);
      
      // Merge with specialty questions
      let finalQuestions = [...specialtyQuestions];
      if (parsed.suggestedQuestions.length > 0) {
        const llmUnique = parsed.suggestedQuestions.filter(q => 
          !specialtyQuestions.some(sq => sq.toLowerCase().includes(q.toLowerCase().slice(0, 20)))
        );
        finalQuestions = [...specialtyQuestions.slice(0, 3), ...llmUnique.slice(0, 2)];
      }
      
      console.log('=== END CLOUD INFERENCE ===');
      return { ...parsed, suggestedQuestions: finalQuestions, enrichmentTime };
    }
  } catch (error) {
    console.log('Cloud inference failed, falling back to on-device:', error);
  }

  // Fall back to on-device inference
  if (!llamaContext) {
    console.log('LLM not available for enrichment, using defaults');
    return { ...defaultResult, enrichmentTime: Date.now() - startTime };
  }

  try {
    // Compact enrichment prompt
    const prompt = `<bos><start_of_turn>user
${symptom}|${specialty}|${conditions.join(',')}
URGENCY|RED_FLAGS|TIMEFRAME|QUESTIONS
<end_of_turn>
<start_of_turn>model
`;

    console.log('=== LLM ENRICHMENT ===');
    console.log('Enriching for:', specialty);

    const response = await llamaContext.completion({
      prompt,
      n_predict: 1024,     // High token limit
      temperature: 0.1,    // Deterministic
      top_p: 0.85,
      stop: ['</s>', '\n\n'],
    });

    const enrichmentTime = Date.now() - startTime;
    console.log('Raw enrichment response:', response.text);
    
    const parsed = parseEnrichmentResponse(response.text);
    
    // Merge: specialty questions first, then any unique LLM-generated questions
    let finalQuestions = [...specialtyQuestions];
    if (parsed.suggestedQuestions.length > 0) {
      // Add LLM questions that aren't duplicates
      const llmUnique = parsed.suggestedQuestions.filter(q => 
        !specialtyQuestions.some(sq => sq.toLowerCase().includes(q.toLowerCase().slice(0, 20)))
      );
      finalQuestions = [...specialtyQuestions.slice(0, 3), ...llmUnique.slice(0, 2)];
    }
    
    console.log('Final questions:', finalQuestions);
    console.log('Enrichment time:', enrichmentTime, 'ms');
    console.log('=== END ENRICHMENT ===');
    
    return { ...parsed, suggestedQuestions: finalQuestions, enrichmentTime };
  } catch (error) {
    console.error('LLM enrichment error:', error);
    return { ...defaultResult, enrichmentTime: Date.now() - startTime };
  }
}

/**
 * Parse enrichment response from LLM
 */
function parseEnrichmentResponse(response: string): Omit<EnrichmentResult, 'enrichmentTime'> {
  const lines = response.split('\n');
  
  let urgency: UrgencyLevel = 'routine';
  let bodySystem = 'general';
  let redFlags: string[] = [];
  let followUpTimeframe = 'within 1 week';
  let suggestedQuestions: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (/URGENCY:/i.test(trimmed)) {
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
    } else if (/TIMEFRAME:/i.test(trimmed)) {
      followUpTimeframe = trimmed.replace(/.*TIMEFRAME:\s*/i, '').trim() || 'within 1 week';
    } else if (/QUESTIONS:/i.test(trimmed)) {
      const value = trimmed.replace(/.*QUESTIONS:\s*/i, '');
      suggestedQuestions = value.split(/[,;]/).map(q => q.trim()).filter(q => q.length > 0);
    }
  }

  // Use specialty-specific questions as base, add LLM questions if any
  // Note: specialty is not available in this context, caller should handle
  if (suggestedQuestions.length === 0) {
    // Parser found no questions, will use default from caller
    suggestedQuestions = [];
  }

  return { urgency, bodySystem, redFlags, followUpTimeframe, suggestedQuestions };
}

/**
 * Input for generating an action plan
 */
export interface ActionPlanInput {
  symptom: string;
  specialty: string;
  conditions: string[];
  urgency: UrgencyLevel;
  redFlags: string[];
  qaPairs: { question: string; answer: string }[];
  assessmentSummary?: string;
}

/**
 * Generate an action plan with next steps for the user
 */
export async function generateActionPlan(input: ActionPlanInput): Promise<string> {
  const { urgency, specialty, redFlags } = input;

  // Get urgency-specific action steps
  const urgencyActions = getUrgencyActions(urgency, redFlags.length > 0);
  
  // Get specialty-specific preparation tips
  const specialtyTips = getSpecialtyTips(specialty);

  return formatActionPlan(input, urgencyActions, specialtyTips);
}

function getUrgencyActions(urgency: UrgencyLevel, hasRedFlags: boolean): string[] {
  if (urgency === 'emergency' || hasRedFlags) {
    return [
      '🚨 Seek immediate medical attention',
      'Go to the nearest emergency room or call 911',
      'Do not drive yourself if symptoms are severe',
      'Bring a list of current medications',
    ];
  } else if (urgency === 'urgent') {
    return [
      '⚡ Schedule an appointment within 24-48 hours',
      'Call your doctor\'s office first thing in the morning',
      'If symptoms worsen, go to urgent care or ER',
      'Monitor your symptoms and note any changes',
    ];
  } else {
    return [
      '📅 Schedule an appointment within 1-2 weeks',
      'Consider telehealth for initial consultation',
      'Track your symptoms in a journal before your visit',
      'Prepare questions to ask your provider',
    ];
  }
}

function getSpecialtyTips(specialty: string): string[] {
  const tips: Record<string, string[]> = {
    'Behavioral Health': [
      'Write down your main concerns and how long you\'ve had them',
      'Note any triggers or patterns you\'ve noticed',
      'List any medications including supplements',
    ],
    'Cardiology': [
      'Note when symptoms occur (activity, rest, eating)',
      'Track blood pressure if you have a monitor',
      'Avoid caffeine and strenuous activity until seen',
    ],
    'Dermatology': [
      'Take photos of the affected area to show changes over time',
      'Note any products you\'ve used on the area',
      'Avoid scratching or applying new products',
    ],
    'Gastroenterology': [
      'Keep a food diary noting what triggers symptoms',
      'Stay hydrated with clear fluids',
      'Avoid spicy, fatty, or dairy foods until seen',
    ],
    'Pain Management': [
      'Rate your pain daily on a 1-10 scale',
      'Note what makes it better or worse',
      'List all pain medications you\'ve tried',
    ],
    'Primary Care': [
      'List all your current symptoms',
      'Bring a list of medications and allergies',
      'Note any recent changes in health or lifestyle',
    ],
  };

  return tips[specialty] || tips['Primary Care'];
}

function formatActionPlan(
  input: ActionPlanInput, 
  urgencyActions: string[], 
  specialtyTips: string[]
): string {
  const { symptom, specialty, urgency, conditions } = input;

  let plan = `YOUR ACTION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 WHAT TO DO NEXT
${urgencyActions.map(a => `  ${a}`).join('\n')}

🏥 WHERE TO GO
  → ${specialty}
  ${urgency === 'emergency' ? '  → Emergency Room / 911' : urgency === 'urgent' ? '  → Urgent Care if no appointments available' : ''}

📝 BEFORE YOUR VISIT
${specialtyTips.map(t => `  • ${t}`).join('\n')}

💡 WHAT TO TELL YOUR PROVIDER
  "I'm experiencing ${symptom}"
  ${conditions.length > 0 ? `Possible conditions to discuss: ${conditions.join(', ')}` : ''}
`;

  if (input.redFlags.length > 0) {
    plan += `
⚠️ WATCH FOR THESE WARNING SIGNS
${input.redFlags.map(f => `  • ${f} → Seek immediate care if this worsens`).join('\n')}
`;
  }

  plan += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is guidance only, not medical advice.
Always consult a healthcare professional.`;

  return plan;
}

// =============================================================================
// FIRST RESPONDER / PROTOCOL MODE
// =============================================================================

/**
 * Patient information for protocol retrieval
 */
export interface FieldPatientInfo {
  age?: number;
  sex?: 'male' | 'female';
  weight?: number;         // kg - for pediatric dosing
  allergies: string[];     // Critical for drug warnings
  vitals?: {
    bp?: string;           // "160/90"
    hr?: number;           // 88
    spo2?: number;         // 94
    rr?: number;           // 16
  };
  currentMeds?: string[];  // For drug interaction checks
}

/**
 * Protocol result from LLM inference
 */
export interface ProtocolInferenceResult {
  protocolId: string;
  protocolName: string;
  confidence: number;
  urgency: 'immediate' | 'urgent' | 'routine';
  interventions: string[];
  drugWarnings: string[];
  dosageInfo: string[];
  redFlags: string[];
  inferenceTime: number;
  usedLLM: boolean;
  rawResponse?: string;  // Debug: raw LLM output
}

/**
 * Run protocol-focused inference on medic observation
 * Uses LLM to enrich protocol selection with interventions and warnings
 */
export async function runProtocolInference(
  observation: string,
  patientInfo: FieldPatientInfo
): Promise<ProtocolInferenceResult> {
  const startTime = Date.now();

  // Build prompt for protocol retrieval
  const prompt = buildProtocolPrompt(observation, patientInfo);
  
  // If LLM not available, use fallback
  if (!llamaContext) {
    console.log('LLM not available, using keyword-based protocol matching');
    return runFallbackProtocol(observation, patientInfo, Date.now() - startTime);
  }

  try {
    console.log('=== PROTOCOL INFERENCE ===');
    console.log('Observation:', observation);
    
    const response = await llamaContext.completion({
      prompt,
      n_predict: 1024,     // High token limit for interventions
      temperature: 0.1,    // Deterministic
      top_p: 0.85,
      stop: ['</s>', '\n\n\n'],
    });

    const inferenceTime = Date.now() - startTime;
    console.log('Raw response:', response.text);
    console.log('Inference time:', inferenceTime, 'ms');
    
    const result = parseProtocolResponse(response.text, patientInfo);
    console.log('=== END PROTOCOL INFERENCE ===');
    
    return {
      ...result,
      inferenceTime,
      usedLLM: true,
      rawResponse: response.text,
    };
  } catch (error) {
    console.error('Protocol inference error:', error);
    return runFallbackProtocol(observation, patientInfo, Date.now() - startTime);
  }
}

/**
 * Build prompt for protocol retrieval
 */
function buildProtocolPrompt(observation: string, patientInfo: FieldPatientInfo): string {
  const ageStr = patientInfo.age ? `${patientInfo.age}yo` : 'adult';
  const sexStr = patientInfo.sex || 'unknown';
  const allergiesStr = patientInfo.allergies.length > 0 
    ? patientInfo.allergies.join(', ') 
    : 'NKDA';
  
  let vitalsStr = 'not obtained';
  if (patientInfo.vitals) {
    const parts = [];
    if (patientInfo.vitals.bp) parts.push(`BP ${patientInfo.vitals.bp}`);
    if (patientInfo.vitals.hr) parts.push(`HR ${patientInfo.vitals.hr}`);
    if (patientInfo.vitals.spo2) parts.push(`SpO2 ${patientInfo.vitals.spo2}%`);
    if (patientInfo.vitals.rr) parts.push(`RR ${patientInfo.vitals.rr}`);
    if (parts.length > 0) vitalsStr = parts.join(', ');
  }

  return `<bos><start_of_turn>user
MEDIC FIELD REPORT
Patient: ${ageStr} ${sexStr}
Allergies: ${allergiesStr}
Vitals: ${vitalsStr}
Observation: "${observation}"

Identify protocol and interventions.
Format: PROTOCOL|URGENCY|INTERVENTIONS|DRUG_WARNINGS|DOSAGES|RED_FLAGS
<end_of_turn>
<start_of_turn>model
`;
}

/**
 * Parse protocol-focused LLM response
 */
function parseProtocolResponse(
  response: string, 
  patientInfo: FieldPatientInfo
): Omit<ProtocolInferenceResult, 'inferenceTime' | 'usedLLM'> {
  const lines = response.split('\n');
  
  let protocolId = 'general-assessment';
  let protocolName = 'General Assessment';
  let confidence = 0.6;
  let urgency: 'immediate' | 'urgent' | 'routine' = 'routine';
  let interventions: string[] = [];
  let drugWarnings: string[] = [];
  let dosageInfo: string[] = [];
  let redFlags: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (/PROTOCOL:/i.test(trimmed)) {
      const value = trimmed.replace(/.*PROTOCOL:\s*/i, '').trim();
      const matched = matchProtocolName(value);
      protocolId = matched.id;
      protocolName = matched.name;
      confidence = matched.confidence;
    } else if (/URGENCY:/i.test(trimmed)) {
      const value = trimmed.replace(/.*URGENCY:\s*/i, '').toLowerCase();
      if (value.includes('immediate')) urgency = 'immediate';
      else if (value.includes('urgent')) urgency = 'urgent';
      else urgency = 'routine';
    } else if (/INTERVENTIONS:/i.test(trimmed)) {
      const value = trimmed.replace(/.*INTERVENTIONS:\s*/i, '');
      interventions = value.split(/[,;]/).map(i => i.trim()).filter(i => i.length > 0);
    } else if (/DRUG_WARNINGS:/i.test(trimmed) || /WARNINGS:/i.test(trimmed)) {
      const value = trimmed.replace(/.*(?:DRUG_)?WARNINGS:\s*/i, '').trim();
      if (value.toLowerCase() !== 'none' && value.length > 0) {
        drugWarnings = value.split(/[,;]/).map(w => w.trim()).filter(w => w.length > 0);
      }
    } else if (/DOSAGES:/i.test(trimmed) || /DOSES:/i.test(trimmed)) {
      const value = trimmed.replace(/.*DOSAGE?S?:\s*/i, '').trim();
      if (value.toLowerCase() !== 'none' && value.length > 0) {
        dosageInfo = value.split(/[,;]/).map(d => d.trim()).filter(d => d.length > 0);
      }
    } else if (/RED_FLAGS:/i.test(trimmed)) {
      const value = trimmed.replace(/.*RED_FLAGS:\s*/i, '').trim();
      if (value.toLowerCase() !== 'none' && value.length > 0) {
        redFlags = value.split(/[,;]/).map(f => f.trim()).filter(f => f.length > 0);
      }
    }
  }

  // Add allergy-based warnings
  if (patientInfo.allergies.length > 0) {
    for (const allergy of patientInfo.allergies) {
      if (allergy.toLowerCase() === 'aspirin' && 
          (protocolId.includes('stemi') || protocolId.includes('chest'))) {
        drugWarnings.push(`🚫 ASPIRIN contraindicated - patient allergy`);
      }
    }
  }

  // Check vitals for drug contraindications
  if (patientInfo.vitals?.bp) {
    const [systolic] = patientInfo.vitals.bp.split('/').map(Number);
    if (systolic && systolic < 90) {
      drugWarnings.push(`⚠️ Hypotensive (SBP ${systolic}) - hold vasodilators`);
    }
  }

  // Fallbacks
  if (interventions.length === 0) {
    interventions = ['Establish IV access', 'Monitor vitals', 'Obtain 12-lead ECG if indicated'];
  }

  return {
    protocolId,
    protocolName,
    confidence,
    urgency,
    interventions,
    drugWarnings,
    dosageInfo,
    redFlags,
  };
}

/**
 * Match protocol name from LLM output to known protocols
 */
function matchProtocolName(input: string): { id: string; name: string; confidence: number } {
  const inputLower = input.toLowerCase();
  
  const protocolMap: Array<{ keywords: string[]; id: string; name: string }> = [
    { keywords: ['stemi', 'st elevation', 'heart attack', 'mi'], id: 'stemi', name: 'STEMI Protocol' },
    { keywords: ['cardiac arrest', 'acls', 'cpr', 'pulseless', 'vfib'], id: 'cardiac-arrest', name: 'Cardiac Arrest / ACLS' },
    { keywords: ['anaphylaxis', 'allergic', 'epipen'], id: 'anaphylaxis', name: 'Anaphylaxis Protocol' },
    { keywords: ['stroke', 'cva', 'face droop', 'slurred'], id: 'stroke', name: 'Stroke / CVA Protocol' },
    { keywords: ['hypoglycemia', 'low blood sugar', 'diabetic'], id: 'hypoglycemia', name: 'Hypoglycemia Protocol' },
    { keywords: ['opioid', 'overdose', 'narcan', 'naloxone', 'heroin', 'fentanyl'], id: 'opioid-overdose', name: 'Opioid Overdose Protocol' },
    { keywords: ['seizure', 'convulsion', 'status epilepticus'], id: 'seizure', name: 'Seizure Protocol' },
    { keywords: ['asthma', 'copd', 'wheezing', 'bronchospasm'], id: 'asthma-copd', name: 'Asthma / COPD Exacerbation' },
    { keywords: ['chest pain', 'angina'], id: 'chest-pain-general', name: 'Chest Pain - General Assessment' },
    { keywords: ['hemorrhage', 'bleeding', 'trauma', 'blood loss'], id: 'trauma-hemorrhage', name: 'Hemorrhage Control Protocol' },
    { keywords: ['bradycardia', 'slow heart'], id: 'bradycardia', name: 'Symptomatic Bradycardia' },
    { keywords: ['tachycardia', 'svt', 'fast heart', 'rapid'], id: 'tachycardia-stable', name: 'Stable Tachycardia' },
    { keywords: ['pediatric', 'child', 'baby', 'infant', 'pals'], id: 'pediatric-resuscitation', name: 'Pediatric Resuscitation (PALS)' },
    { keywords: ['head injury', 'tbi', 'concussion'], id: 'head-injury', name: 'Traumatic Head Injury' },
    { keywords: ['spine', 'c-spine', 'neck injury'], id: 'spinal-immobilization', name: 'Spinal Immobilization' },
    { keywords: ['respiratory distress', 'dyspnea', 'short of breath'], id: 'respiratory-distress', name: 'Respiratory Distress - General' },
    { keywords: ['chf', 'pulmonary edema', 'heart failure'], id: 'chf-pulmonary-edema', name: 'CHF / Pulmonary Edema' },
    { keywords: ['pain', 'painful'], id: 'pain-management', name: 'Pain Management Protocol' },
    { keywords: ['nausea', 'vomiting'], id: 'nausea-vomiting', name: 'Nausea / Vomiting Protocol' },
  ];

  for (const protocol of protocolMap) {
    if (protocol.keywords.some(k => inputLower.includes(k))) {
      return { id: protocol.id, name: protocol.name, confidence: 0.85 };
    }
  }

  return { id: 'general-assessment', name: 'General Assessment', confidence: 0.5 };
}

/**
 * Fallback protocol matching using keywords only
 */
function runFallbackProtocol(
  observation: string,
  patientInfo: FieldPatientInfo,
  elapsedMs: number
): ProtocolInferenceResult {
  const obsLower = observation.toLowerCase();
  
  // Match based on keywords
  if (obsLower.includes('chest pain') || obsLower.includes('crushing') || obsLower.includes('heart attack')) {
    const hasAspirinAllergy = patientInfo.allergies.some(a => 
      a.toLowerCase().includes('aspirin')
    );
    return {
      protocolId: 'stemi',
      protocolName: 'STEMI Protocol',
      confidence: 0.75,
      urgency: 'immediate',
      interventions: ['12-lead ECG', 'IV access', 'Aspirin 324mg if no allergy', 'Nitro if SBP > 90'],
      drugWarnings: hasAspirinAllergy ? ['🚫 ASPIRIN contraindicated - patient allergy'] : [],
      dosageInfo: ['Aspirin 324mg PO', 'NTG 0.4mg SL q5min'],
      redFlags: ['Hypotension', 'Diaphoresis', 'Altered LOC'],
      inferenceTime: elapsedMs,
      usedLLM: false,
    };
  }

  if (obsLower.includes('not breathing') || obsLower.includes('unresponsive') || obsLower.includes('no pulse')) {
    return {
      protocolId: 'cardiac-arrest',
      protocolName: 'Cardiac Arrest / ACLS',
      confidence: 0.8,
      urgency: 'immediate',
      interventions: ['Begin CPR 100-120/min', 'Attach AED', 'Establish IV/IO', 'Epinephrine q3-5min'],
      drugWarnings: [],
      dosageInfo: ['Epinephrine 1mg IV/IO', 'Amiodarone 300mg if VF/pVT'],
      redFlags: ['Prolonged downtime', 'Unknown cause'],
      inferenceTime: elapsedMs,
      usedLLM: false,
    };
  }

  if (obsLower.includes('allergic') || obsLower.includes('bee sting') || obsLower.includes('swelling') && obsLower.includes('throat')) {
    return {
      protocolId: 'anaphylaxis',
      protocolName: 'Anaphylaxis Protocol',
      confidence: 0.8,
      urgency: 'immediate',
      interventions: ['Remove allergen', 'Epinephrine IM', 'IV access', 'Diphenhydramine'],
      drugWarnings: [],
      dosageInfo: ['Epinephrine 0.3-0.5mg IM', 'Benadryl 50mg IV/IM'],
      redFlags: ['Stridor', 'Rapid progression', 'Hypotension'],
      inferenceTime: elapsedMs,
      usedLLM: false,
    };
  }

  if (obsLower.includes('overdose') || obsLower.includes('heroin') || obsLower.includes('fentanyl') || obsLower.includes('not breathing')) {
    return {
      protocolId: 'opioid-overdose',
      protocolName: 'Opioid Overdose Protocol',
      confidence: 0.75,
      urgency: 'immediate',
      interventions: ['BVM ventilation', 'Naloxone 2mg IN or 0.4mg IV', 'Monitor for renarcotization'],
      drugWarnings: ['May precipitate withdrawal'],
      dosageInfo: ['Naloxone 2-4mg IN or 0.4-2mg IV'],
      redFlags: ['Fentanyl may need higher doses', 'Renarcotization risk'],
      inferenceTime: elapsedMs,
      usedLLM: false,
    };
  }

  // Default fallback
  return {
    protocolId: 'general-assessment',
    protocolName: 'General Assessment',
    confidence: 0.4,
    urgency: 'routine',
    interventions: ['Complete patient assessment', 'Obtain vitals', 'Establish IV if indicated', 'Transport for evaluation'],
    drugWarnings: patientInfo.allergies.map(a => `Patient allergic to: ${a}`),
    dosageInfo: [],
    redFlags: [],
    inferenceTime: elapsedMs,
    usedLLM: false,
  };
}

/**
 * Generate a Prehospital Care Report (PCR) summary
 */
export function generatePCRSummary(
  observation: string,
  patientInfo: FieldPatientInfo,
  protocolResult: ProtocolInferenceResult,
  interventionsPerformed: string[] = []
): string {
  const timestamp = new Date().toLocaleString();
  const ageStr = patientInfo.age ? `${patientInfo.age} y/o` : 'Unknown age';
  const sexStr = patientInfo.sex === 'male' ? 'Male' : patientInfo.sex === 'female' ? 'Female' : '';
  
  let vitalsStr = 'Not obtained';
  if (patientInfo.vitals) {
    const parts = [];
    if (patientInfo.vitals.bp) parts.push(`BP: ${patientInfo.vitals.bp}`);
    if (patientInfo.vitals.hr) parts.push(`HR: ${patientInfo.vitals.hr}`);
    if (patientInfo.vitals.spo2) parts.push(`SpO2: ${patientInfo.vitals.spo2}%`);
    if (patientInfo.vitals.rr) parts.push(`RR: ${patientInfo.vitals.rr}`);
    vitalsStr = parts.join(' | ');
  }

  let pcr = `PREHOSPITAL CARE REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated: ${timestamp}

PATIENT INFORMATION
  ${ageStr} ${sexStr}
  Allergies: ${patientInfo.allergies.length > 0 ? patientInfo.allergies.join(', ') : 'NKDA'}

VITAL SIGNS
  ${vitalsStr}

CHIEF COMPLAINT / MEDIC OBSERVATION
  "${observation}"

PROTOCOL ACTIVATED
  ${protocolResult.protocolName}
  Priority: ${protocolResult.urgency.toUpperCase()}
`;

  if (protocolResult.drugWarnings.length > 0) {
    pcr += `
⚠️ DRUG WARNINGS
${protocolResult.drugWarnings.map(w => `  ${w}`).join('\n')}
`;
  }

  if (interventionsPerformed.length > 0) {
    pcr += `
INTERVENTIONS PERFORMED
${interventionsPerformed.map(i => `  ✓ ${i}`).join('\n')}
`;
  }

  if (protocolResult.dosageInfo.length > 0) {
    pcr += `
MEDICATIONS ADMINISTERED
${protocolResult.dosageInfo.map(d => `  • ${d}`).join('\n')}
`;
  }

  pcr += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated by KVEC Field Protocol Assistant
For medical professional use only.`;

  return pcr;
}
