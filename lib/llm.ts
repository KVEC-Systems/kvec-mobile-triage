/**
 * LLM Service
 * On-device chat inference using MedGemma via llama.rn
 */

import { initLlama, type LlamaContext } from 'llama.rn';
import { getGgufModelPath, getMmprojPath } from './download';

// LLM context singleton
let llamaContext: LlamaContext | null = null;
let isInitializing = false;
let isMultimodalEnabled = false;

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
 */
export async function initializeLLM(): Promise<boolean> {
  if (llamaContext) {
    console.log('LLM already initialized');
    return true;
  }
  
  if (isInitializing) {
    console.log('LLM initialization already in progress');
    return false;
  }
  
  isInitializing = true;
  
  try {
    const modelPath = getGgufModelPath();
    console.log('Initializing LLM from:', modelPath);
    
    llamaContext = await initLlama({
      model: modelPath,
      n_ctx: 2048,      // Context size
      n_batch: 512,     // Batch size for prompt processing
      n_threads: 4,     // Number of threads
      n_gpu_layers: 99, // Offload layers to GPU (Metal on iOS, OpenCL on Android)
      ctx_shift: false, // Required for multimodal - disable context shifting
    });
    
    console.log('LLM initialized successfully');
    
    // Initialize multimodal support with mmproj
    try {
      const mmprojPath = getMmprojPath();
      console.log('Initializing multimodal from:', mmprojPath);
      
      // Check if file exists and log size
      const { getInfoAsync } = await import('expo-file-system');
      const fileInfo = await getInfoAsync(mmprojPath);
      console.log('mmproj file info:', JSON.stringify(fileInfo));
      
      if (!fileInfo.exists) {
        console.warn('mmproj file does not exist at path');
      } else {
        const success = await llamaContext.initMultimodal({
          path: mmprojPath,
          use_gpu: true,
        });
        
        if (success) {
          isMultimodalEnabled = true;
          const support = await llamaContext.getMultimodalSupport();
          console.log('Multimodal enabled - Vision:', support?.vision, 'Audio:', support?.audio);
        } else {
          console.log('Multimodal initialization returned false - mmproj may be incompatible with model');
        }
      }
    } catch (mmError) {
      console.warn('Multimodal init failed (vision disabled):', mmError);
    }
    
    isInitializing = false;
    return true;
  } catch (error) {
    console.error('Failed to initialize LLM:', error);
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
  
  // Format messages for Gemma chat template
  const prompt = formatChatPrompt(messages);
  
  let response = '';
  
  const result = await llamaContext.completion({
    prompt,
    n_predict: 2048,    // Max tokens to generate (enough for complex PCRs)
    temperature: 0.3,   // Low temp for consistent, factual output
    top_p: 0.95,         // Slightly higher top_p for coherence
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
    if (msg.role === 'system') {
      prompt += `<start_of_turn>user\n${msg.content}<end_of_turn>\n`;
    } else if (msg.role === 'user') {
      prompt += `<start_of_turn>user\n${msg.content}<end_of_turn>\n`;
    } else if (msg.role === 'assistant') {
      prompt += `<start_of_turn>model\n${msg.content}<end_of_turn>\n`;
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
    console.log('LLM released from memory');
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
  const systemPrompt = `DO NOT THINK. Generate a structured Patient Care Report (PCR) from the following transcript of a first responder's verbal notes. Format the output as plain text that can be copied into an ePCR system. Be concise and use standard medical abbreviations (pt, yo, LOC, GCS, BP, HR, RR, SpO2, etc).`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Transcript:\n${transcript}` },
  ];

  return generateResponse(messages, onToken);
}

/**
 * Check if LLM is ready
 */
export function isLLMReady(): boolean {
  return llamaContext !== null;
}

