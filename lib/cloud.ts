/**
 * Vertex AI Cloud Inference Service
 * Calls MedGemma deployed on Google Cloud for fast inference
 */

// Vertex AI endpoint configuration
const VERTEX_CONFIG = {
  baseUrl: 'https://mg-endpoint-71d44274-9621-4a14-a5ac-62c4f7c7ce1b.us-central1-77607692213.prediction.vertexai.goog',
  projectId: '77607692213',
  endpointId: 'mg-endpoint-71d44274-9621-4a14-a5ac-62c4f7c7ce1b',
  location: 'us-central1',
  maxTokens: 100,
  temperature: 0.1,
};

// Service account key (loaded at runtime)
let accessToken: string | null = null;
let tokenExpiry: number = 0;

interface VertexResponse {
  predictions: {
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
  };
  deployedModelId: string;
}

/**
 * Check if cloud inference is available (has network)
 */
export async function isCloudAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(VERTEX_CONFIG.baseUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok || response.status === 404 || response.status === 405;
  } catch {
    return false;
  }
}

/**
 * Set the access token for authentication
 * In production, this should come from a service account or OAuth flow
 */
export function setAccessToken(token: string, expiresInSeconds: number = 3600): void {
  accessToken = token;
  tokenExpiry = Date.now() + (expiresInSeconds * 1000);
}

/**
 * Call Vertex AI endpoint for inference
 */
export async function cloudInference(prompt: string): Promise<string> {
  const startTime = Date.now();
  
  if (!accessToken || Date.now() > tokenExpiry) {
    throw new Error('No valid access token. Call setAccessToken() first.');
  }
  
  const url = `${VERTEX_CONFIG.baseUrl}/v1/projects/${VERTEX_CONFIG.projectId}/locations/${VERTEX_CONFIG.location}/endpoints/${VERTEX_CONFIG.endpointId}:predict`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [
          {
            '@requestFormat': 'chatCompletions',
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: prompt }],
              },
            ],
            max_tokens: VERTEX_CONFIG.maxTokens,
            temperature: VERTEX_CONFIG.temperature,
          },
        ],
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
    
    if (data.predictions?.choices?.length > 0) {
      return data.predictions.choices[0].message.content || '';
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
