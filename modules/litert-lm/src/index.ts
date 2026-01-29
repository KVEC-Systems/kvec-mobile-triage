import { requireNativeModule } from 'expo-modules-core';

// Get the native module
const LiteRTLMModule = requireNativeModule('LiteRTLM');

/**
 * Create and initialize the LiteRT engine with a model file
 * @param modelPath Absolute path to the .litertlm model file
 * @returns Promise that resolves to true on success
 */
export async function createEngine(modelPath: string): Promise<boolean> {
  return await LiteRTLMModule.createEngine(modelPath);
}

/**
 * Generate a response using the initialized engine
 * @param prompt The input prompt
 * @returns Promise that resolves to the generated text
 */
export async function generateResponse(prompt: string): Promise<string> {
  return await LiteRTLMModule.generateResponse(prompt);
}

/**
 * Release the engine and free resources
 * @returns Promise that resolves to true on success
 */
export async function releaseEngine(): Promise<boolean> {
  return await LiteRTLMModule.releaseEngine();
}

/**
 * Check if the engine is initialized
 * @returns boolean indicating if engine is ready
 */
export function isInitialized(): boolean {
  return LiteRTLMModule.isInitialized();
}

export default {
  createEngine,
  generateResponse,
  releaseEngine,
  isInitialized,
};
