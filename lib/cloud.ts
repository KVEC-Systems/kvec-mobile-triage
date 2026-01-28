/**
 * Vertex AI Cloud Inference Service
 * Calls MedGemma deployed on Google Cloud for fast inference
 */

// Vertex AI endpoint configuration
const VERTEX_CONFIG = {
  endpoint: 'https://mg-endpoint-71d44274-9621-4a14-a5ac-62c4f7c7ce1b.us-central1-77607692213.prediction.vertexai.goog',
  model: 'medgemma-4b',
  maxTokens: 100,
  temperature: 0.1,
};

interface VertexResponse {
  predictions: Array<{
    content: string;
  }>;
  metadata?: {
    tokenMetadata?: {
      outputTokenCount?: number;
    };
  };
}

/**
 * Check if cloud inference is available (has network)
 */
export async function isCloudAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(VERTEX_CONFIG.endpoint, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok || response.status === 405; // 405 = method not allowed but reachable
  } catch {
    return false;
  }
}

/**
 * Call Vertex AI endpoint for inference
 */
export async function cloudInference(prompt: string): Promise<string> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${VERTEX_CONFIG.endpoint}/v1:predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: prompt,
          },
        ],
        parameters: {
          maxOutputTokens: VERTEX_CONFIG.maxTokens,
          temperature: VERTEX_CONFIG.temperature,
          topP: 0.85,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vertex AI error:', response.status, errorText);
      throw new Error(`Vertex AI error: ${response.status}`);
    }

    const data: VertexResponse = await response.json();
    const inferenceTime = Date.now() - startTime;
    
    console.log(`Cloud inference completed in ${inferenceTime}ms`);
    
    if (data.predictions && data.predictions.length > 0) {
      return data.predictions[0].content || '';
    }
    
    throw new Error('No predictions in response');
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
