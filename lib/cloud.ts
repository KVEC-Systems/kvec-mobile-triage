/**
 * Cloud Inference Service
 * Calls MedGemma via ngrok tunnel to local GPU server
 */

// Configurable endpoint - set to your ngrok URL
let CLOUD_ENDPOINT = '';

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Set the cloud inference endpoint URL
 * @param url - Your ngrok URL, e.g., 'https://abc123.ngrok.io'
 */
export function setCloudEndpoint(url: string): void {
  // Remove trailing slash if present
  CLOUD_ENDPOINT = url.replace(/\/$/, '');
  console.log('Cloud endpoint set to:', CLOUD_ENDPOINT);
}

/**
 * Get current cloud endpoint
 */
export function getCloudEndpoint(): string {
  return CLOUD_ENDPOINT;
}

/**
 * Check if cloud inference is available
 */
export async function isCloudAvailable(): Promise<boolean> {
  if (!CLOUD_ENDPOINT) {
    return false;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${CLOUD_ENDPOINT}/v1/models`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Call cloud endpoint for inference (OpenAI-compatible API)
 */
export async function cloudInference(prompt: string): Promise<string> {
  const startTime = Date.now();
  
  if (!CLOUD_ENDPOINT) {
    throw new Error('Cloud endpoint not configured. Call setCloudEndpoint() first.');
  }
  
  try {
    const response = await fetch(`${CLOUD_ENDPOINT}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'medgemma',  // Will be ignored by most vLLM setups but needed for compatibility
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloud inference error:', response.status, errorText);
      throw new Error(`Cloud inference error: ${response.status}`);
    }

    const data: OpenAIResponse = await response.json();
    const inferenceTime = Date.now() - startTime;
    
    console.log(`Cloud inference completed in ${inferenceTime}ms`);
    
    if (data.choices?.length > 0) {
      return data.choices[0].message.content || '';
    }
    
    throw new Error('No response from model');
  } catch (error) {
    console.error('Cloud inference error:', error);
    throw error;
  }
}

/**
 * Build enrichment prompt for cloud inference
 */
export function buildCloudEnrichmentPrompt(
  symptom: string,
  specialty: string,
  conditions: string[]
): string {
  return `You are a medical triage assistant. Given this triage context:

Patient complaint: "${symptom}"
Specialty: ${specialty}
Conditions: ${conditions.join(', ')}

Provide:
1. URGENCY: emergency, urgent, or routine
2. RED_FLAGS: warning signs (or "none")
3. TIMEFRAME: when to see provider

Be concise. Format as numbered list.`;
}
