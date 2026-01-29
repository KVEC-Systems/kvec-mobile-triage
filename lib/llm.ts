/**
 * LLM Service
 * On-device chat inference using MedGemma via llama.rn
 */

import { initLlama, type LlamaContext } from 'llama.rn';
import { getGgufModelPath } from './download';

// LLM context singleton
let llamaContext: LlamaContext | null = null;
let isInitializing = false;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

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
      n_gpu_layers: 0,  // CPU only for now
    });
    
    console.log('LLM initialized successfully');
    isInitializing = false;
    return true;
  } catch (error) {
    console.error('Failed to initialize LLM:', error);
    isInitializing = false;
    return false;
  }
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
    n_predict: 512,    // Max tokens to generate
    temperature: 0.7,
    top_p: 0.9,
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
 * Check if LLM is ready
 */
export function isLLMReady(): boolean {
  return llamaContext !== null;
}
