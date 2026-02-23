/**
 * LLM Service
 * On-device chat inference using MedGemma via llama.rn
 */

import { initLlama, type LlamaContext } from 'llama.rn';
import * as Device from 'expo-device';
import { getGgufModelPath, getMmprojPath } from './download';

// LLM context singleton
let llamaContext: LlamaContext | null = null;
let isInitializing = false;
let isMultimodalEnabled = false;
let wasLoadedWithVision = false;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ChatMessageContent[];
}

// Support for multimodal message content
export type ChatMessageContent = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * Initialize the LLM with the downloaded GGUF model
 * @param enableVision Whether to load the mmproj vision projector (~945MB). Default false.
 */
export async function initializeLLM(enableVision = false): Promise<boolean> {
  if (llamaContext) {
    // If vision is requested but context was loaded without it, must reinitialize
    // because ctx_shift must be false for multimodal
    if (enableVision && !wasLoadedWithVision) {
      console.log('[LLM] Reinitializing with vision support (ctx_shift needs to change)...');
      await releaseLLM();
      // Fall through to fresh initialization below
    } else if (enableVision && !isMultimodalEnabled) {
      // Context was loaded with vision settings but mmproj failed — try again
      console.log('[LLM] Retrying mmproj load...');
      try {
        const mmprojPath = getMmprojPath();
        const { getInfoAsync } = await import('expo-file-system/legacy');
        const fileInfo = await getInfoAsync(mmprojPath);

        if (fileInfo.exists) {
          const mmStart = Date.now();
          const success = await llamaContext.initMultimodal({
            path: mmprojPath,
            use_gpu: true,
          });

          if (success) {
            isMultimodalEnabled = true;
            const support = await llamaContext.getMultimodalSupport();
            console.log(`[LLM] Multimodal loaded in ${Date.now() - mmStart}ms - Vision:`, support?.vision, 'Audio:', support?.audio);
          } else {
            console.log('[LLM] Multimodal init returned false');
          }
        } else {
          console.warn('[LLM] mmproj file not found at:', mmprojPath);
        }
      } catch (mmError) {
        console.warn('[LLM] Failed to load mmproj:', mmError);
      }
      return true;
    } else {
      console.log('[LLM] Already initialized, vision:', isMultimodalEnabled);
      return true;
    }
  }

  if (isInitializing) {
    console.log('[LLM] Initialization already in progress');
    return false;
  }

  isInitializing = true;

  try {
    const modelPath = getGgufModelPath();
    console.log('[LLM] Loading model from:', modelPath);
    console.log('[LLM] Vision enabled:', enableVision);

    const gpuLayers = Device.isDevice ? 99 : 0;
    console.log('[LLM] Device:', !Device.isDevice ? 'Simulator' : 'Physical', '| GPU layers:', gpuLayers);

    const startTime = Date.now();
    console.log('[LLM] Calling initLlama...');
    llamaContext = await initLlama({
      model: modelPath,
      n_ctx: 2048,      // Context size
      n_batch: 512,     // Batch size for prompt processing
      n_threads: 4,     // Number of threads
      n_gpu_layers: gpuLayers, // GPU via Metal on device, CPU-only on simulator
      ctx_shift: !enableVision, // Disable context shifting only when multimodal is needed
    });

    wasLoadedWithVision = enableVision;
    console.log(`[LLM] Model loaded in ${Date.now() - startTime}ms`);

    // Only load mmproj if vision is requested (saves ~945MB of memory)
    if (enableVision) {
      try {
        const mmprojPath = getMmprojPath();
        console.log('[LLM] Loading mmproj from:', mmprojPath);

        const { getInfoAsync } = await import('expo-file-system/legacy');
        const fileInfo = await getInfoAsync(mmprojPath);
        console.log('[LLM] mmproj file info:', JSON.stringify(fileInfo));

        if (!fileInfo.exists) {
          console.warn('[LLM] mmproj file does not exist at path');
        } else {
          const mmStart = Date.now();
          const success = await llamaContext.initMultimodal({
            path: mmprojPath,
            use_gpu: true,
          });

          if (success) {
            isMultimodalEnabled = true;
            const support = await llamaContext.getMultimodalSupport();
            console.log(`[LLM] Multimodal loaded in ${Date.now() - mmStart}ms - Vision:`, support?.vision, 'Audio:', support?.audio);
          } else {
            console.log('[LLM] Multimodal init returned false');
          }
        }
      } catch (mmError) {
        console.warn('[LLM] Multimodal init failed:', mmError);
      }
    } else {
      console.log('[LLM] Skipping mmproj (text-only mode)');
    }

    isInitializing = false;
    console.log('[LLM] Ready. Total init time:', Date.now() - startTime, 'ms');
    return true;
  } catch (error) {
    console.error('[LLM] Failed to initialize:', error);
    isInitializing = false;
    return false;
  }
}

/**
 * Check if multimodal vision is available
 */
export function isVisionEnabled(): boolean {
  return isMultimodalEnabled;
}

/**
 * Generate a response from the LLM
 * @param messages Chat history
 * @param onToken Callback for streaming tokens
 * @returns Full response text
 */
export async function generateResponse(
  messages: ChatMessage[],
  onToken?: (token: string) => void
): Promise<string> {
  if (!llamaContext) {
    throw new Error('LLM not initialized. Call initializeLLM() first.');
  }
  
  // Extract image URL from the LAST user message (not older messages)
  let imageUrl: string | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const imageContent = msg.content.find(
        (item): item is { type: 'image_url'; image_url: { url: string } } =>
          item.type === 'image_url'
      );
      if (imageContent) {
        imageUrl = imageContent.image_url.url;
      }
      break; // Only check the last user message
    }
    if (msg.role === 'user') break; // Last user message was text-only
  }
  
  // Format messages for Gemma chat template
  const prompt = formatChatPrompt(messages);
  
  let response = '';
  
  // If we have an image and multimodal is enabled, use vision completion
  console.log('[LLM] Image URL:', imageUrl, 'Multimodal enabled:', isMultimodalEnabled);
  if (imageUrl && isMultimodalEnabled) {
    // Get the file path - imageUrl from expo-image-picker is a file:// URI
    const imagePath = imageUrl.startsWith('file://')
      ? imageUrl.replace('file://', '')
      : imageUrl;

    console.log('[LLM] Using multimodal completion, image path:', imagePath);
    console.log('[LLM] Prompt length:', prompt.length);

    try {
      const result = await llamaContext.completion({
        prompt,
        n_predict: 2048,
        temperature: 0.3,
        top_p: 0.95,
        stop: ['<end_of_turn>', '<eos>'],
        media_paths: [imagePath],
      }, (token) => {
        response += token.token;
        if (onToken) {
          onToken(token.token);
        }
      });

      console.log('[LLM] Multimodal completion done, response length:', response.length);
      return response.trim();
    } catch (imgError) {
      console.error('[LLM] Failed multimodal completion:', imgError);
      throw new Error('Vision analysis failed. Please try again.');
    }
  } else if (imageUrl && !isMultimodalEnabled) {
    console.warn('[LLM] Image provided but multimodal NOT enabled — vision projector not loaded');
    throw new Error('Vision is not available. The mmproj model needs to be downloaded.');
  }
  
  // Standard text completion
  const result = await llamaContext.completion({
    prompt,
    n_predict: 2048,
    temperature: 0.3,
    top_p: 0.95,
    stop: ['<end_of_turn>', '<eos>'],
  }, (token) => {
    response += token.token;
    if (onToken) {
      onToken(token.token);
    }
  });
  
  return response.trim();
}

/**
 * Format chat messages into Gemma-style prompt
 */
function formatChatPrompt(messages: ChatMessage[]): string {
  let prompt = '';
  
  for (const msg of messages) {
    // Extract text content from message
    let textContent: string;
    if (typeof msg.content === 'string') {
      textContent = msg.content;
    } else {
      textContent = msg.content
        .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    }
    
    if (msg.role === 'system') {
      prompt += `<start_of_turn>user\n${textContent}<end_of_turn>\n`;
    } else if (msg.role === 'user') {
      prompt += `<start_of_turn>user\n${textContent}<end_of_turn>\n`;
    } else if (msg.role === 'assistant') {
      prompt += `<start_of_turn>model\n${textContent}<end_of_turn>\n`;
    }
  }
  
  // Add start of model response
  prompt += '<start_of_turn>model\n';
  
  return prompt;
}

/**
 * Release the LLM context from memory
 */
export async function releaseLLM(): Promise<void> {
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
    isMultimodalEnabled = false;
    wasLoadedWithVision = false;
    console.log('[LLM] Released from memory');
  }
}

/**
 * Generate an EMS Patient Care Report from a transcript
 * @param transcript Raw transcript from speech recognition
 * @param onToken Callback for streaming tokens
 * @returns Formatted PCR text
 */
export async function generatePCR(
  transcript: string,
  onToken?: (token: string) => void
): Promise<string> {
  const systemPrompt = `You are an EMS documentation system. Generate a structured PCR from first responder notes. Use EMS abbreviations throughout.

Output these sections, each on its own line starting with the section name in caps followed by a colon:
CHIEF COMPLAINT: One line only.
HPI: 2-3 sentences max. Telegraphic style.
VITALS: List each vital on one line (BP, HR, RR, SpO2, GCS, temp). Write "Not documented" for missing.
PHYSICAL EXAM: 1-2 bullet points of key findings only.
ASSESSMENT: Working diagnosis in one line.
INTERVENTIONS: Bullet list of treatments, one per line.
DISPOSITION: Destination and patient condition in one line.

Rules: No prose paragraphs. No preambles or summaries. No fabrication. Maximum 1-2 bullet points per section.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `First responder notes:\n${transcript}` },
  ];

  return generateResponse(messages, onToken);
}

/**
 * Generate a triage assessment from a completed PCR
 * @param pcrText The generated PCR text
 * @param onToken Callback for streaming tokens
 * @returns Triage assessment text
 */
export async function generateTriageAssessment(
  pcrText: string,
  onToken?: (token: string) => void
): Promise<string> {
  const systemPrompt = `You are an EMS clinical decision support system. Analyze the PCR and provide a triage assessment.

Output these sections, each on its own line starting with the section name in caps followed by a colon:
ACUITY: ESI level (1-5) with one-line justification.
DIFFERENTIAL DX: Top 3 diagnoses, one line each, numbered.
RECOMMENDED INTERVENTIONS: Bullet list, one per line. Only actionable items.
TRANSPORT PRIORITY: Emergent/Urgent/Non-urgent + facility type in one line.

Rules: No preambles, disclaimers, or summaries. Maximum 2 sentences per section. No fabrication.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Patient Care Report:\n${pcrText}` },
  ];

  return generateResponse(messages, onToken);
}

/**
 * Check if LLM is ready
 */
export function isLLMReady(): boolean {
  return llamaContext !== null;
}

