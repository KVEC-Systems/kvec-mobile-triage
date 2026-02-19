/**
 * PCR Storage Service
 * Persists generated PCRs to AsyncStorage for history
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PCR_HISTORY_KEY = 'pcr_history';

export interface SavedPCR {
  id: string;
  createdAt: string;
  clinicalNotes: string;
  pcrText: string;
  triageAssessment: string | null;
}

/**
 * Save a PCR to history
 */
export async function savePCR(
  clinicalNotes: string,
  pcrText: string,
  triageAssessment: string | null = null,
): Promise<SavedPCR> {
  const entry: SavedPCR = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    clinicalNotes,
    pcrText,
    triageAssessment,
  };

  const history = await loadPCRHistory();
  history.unshift(entry);
  if (history.length > 100) {
    history.length = 100;
  }
  await AsyncStorage.setItem(PCR_HISTORY_KEY, JSON.stringify(history));
  return entry;
}

/**
 * Update the triage assessment for an existing PCR
 */
export async function updateTriageAssessment(
  id: string,
  triageAssessment: string,
): Promise<void> {
  const history = await loadPCRHistory();
  const entry = history.find(p => p.id === id);
  if (entry) {
    entry.triageAssessment = triageAssessment;
    await AsyncStorage.setItem(PCR_HISTORY_KEY, JSON.stringify(history));
  }
}

/**
 * Load all saved PCRs, newest first
 */
export async function loadPCRHistory(): Promise<SavedPCR[]> {
  const raw = await AsyncStorage.getItem(PCR_HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedPCR[];
  } catch {
    return [];
  }
}

/**
 * Delete a single PCR from history
 */
export async function deletePCR(id: string): Promise<void> {
  const history = await loadPCRHistory();
  const filtered = history.filter(p => p.id !== id);
  await AsyncStorage.setItem(PCR_HISTORY_KEY, JSON.stringify(filtered));
}
