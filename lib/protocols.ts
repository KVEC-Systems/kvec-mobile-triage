/**
 * Protocol Retrieval Service
 * Provides offline protocol lookup for EMS/first responder workflows
 */

import protocolsData from '../data/protocols.json';

// Type definitions
export type ProtocolCategory = 
  | 'cardiac' 
  | 'respiratory' 
  | 'neurological' 
  | 'trauma' 
  | 'toxicology' 
  | 'allergic' 
  | 'metabolic' 
  | 'pediatric' 
  | 'general';

export type TransportPriority = 'immediate' | 'urgent' | 'routine';

export interface ProtocolStep {
  order: number;
  action: string;
  critical: boolean;
  drugRef?: string;
}

export interface MedicationDose {
  drug: string;
  dose: string;
  route: string;
  note?: string;
}

export interface Protocol {
  id: string;
  name: string;
  category: ProtocolCategory;
  keywords: string[];
  indications: string[];
  contraindications: string[];
  steps: ProtocolStep[];
  medications: MedicationDose[];
  redFlags: string[];
  transportPriority: TransportPriority;
}

export interface PatientInfo {
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
}

export interface ProtocolMatch {
  protocol: Protocol;
  score: number;
  matchedKeywords: string[];
}

export interface ProtocolResult {
  protocol: Protocol;
  confidence: number;
  matchedKeywords: string[];
  drugWarnings: string[];
  modifiedSteps?: string[];  // Steps modified based on patient info
  retrievalTime: number;
}

// Load protocols from JSON
const protocols: Protocol[] = protocolsData.protocols as Protocol[];

/**
 * Retrieve the best matching protocol for a medic observation
 */
export function retrieveProtocol(
  observation: string,
  patientInfo: PatientInfo
): ProtocolResult {
  const startTime = Date.now();
  
  // Find best matching protocol
  const matches = findMatchingProtocols(observation);
  
  if (matches.length === 0) {
    // Default to general assessment
    const defaultProtocol = protocols.find(p => p.id === 'chest-pain-general') || protocols[0];
    return {
      protocol: defaultProtocol,
      confidence: 0.3,
      matchedKeywords: [],
      drugWarnings: checkDrugWarnings(defaultProtocol, patientInfo),
      retrievalTime: Date.now() - startTime,
    };
  }
  
  const bestMatch = matches[0];
  const drugWarnings = checkDrugWarnings(bestMatch.protocol, patientInfo);
  
  return {
    protocol: bestMatch.protocol,
    confidence: Math.min(bestMatch.score / 5, 1), // Normalize score to 0-1
    matchedKeywords: bestMatch.matchedKeywords,
    drugWarnings,
    retrievalTime: Date.now() - startTime,
  };
}

/**
 * Find protocols matching the observation with scoring
 */
function findMatchingProtocols(observation: string): ProtocolMatch[] {
  const observationLower = observation.toLowerCase();
  const observationWords = observationLower.split(/\s+/);
  
  const matches: ProtocolMatch[] = [];
  
  for (const protocol of protocols) {
    let score = 0;
    const matchedKeywords: string[] = [];
    
    // Check keywords
    for (const keyword of protocol.keywords) {
      if (observationLower.includes(keyword.toLowerCase())) {
        score += 2;
        matchedKeywords.push(keyword);
      }
    }
    
    // Check indications
    for (const indication of protocol.indications) {
      const indicationWords = indication.toLowerCase().split(/\s+/);
      const matchCount = indicationWords.filter(w => 
        observationWords.some(ow => ow.includes(w) || w.includes(ow))
      ).length;
      if (matchCount >= 2) {
        score += matchCount;
      }
    }
    
    // Boost for emergency keywords
    const emergencyKeywords = ['unresponsive', 'not breathing', 'no pulse', 'chest pain', 'severe'];
    for (const ek of emergencyKeywords) {
      if (observationLower.includes(ek) && protocol.transportPriority === 'immediate') {
        score += 1;
      }
    }
    
    if (score > 0) {
      matches.push({ protocol, score, matchedKeywords });
    }
  }
  
  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Check for drug-related warnings based on patient allergies
 */
function checkDrugWarnings(protocol: Protocol, patientInfo: PatientInfo): string[] {
  const warnings: string[] = [];
  const allergiesLower = patientInfo.allergies.map(a => a.toLowerCase());
  
  // Drug-allergy cross-reactions
  const crossReactions: Record<string, string[]> = {
    'aspirin': ['nsaids', 'ibuprofen', 'naproxen', 'ketorolac', 'nsaid'],
    'penicillin': ['amoxicillin', 'ampicillin', 'cephalosporin'],
    'opioid': ['morphine', 'fentanyl', 'hydrocodone', 'oxycodone'],
    'sulfa': ['sulfamethoxazole', 'furosemide'],
  };
  
  for (const med of protocol.medications) {
    const drugLower = med.drug.toLowerCase();
    
    // Direct allergy match
    if (allergiesLower.includes(drugLower)) {
      warnings.push(`⚠️ ${med.drug.toUpperCase()} contraindicated - patient allergy`);
      continue;
    }
    
    // Check cross-reactions
    for (const [allergen, crossReacts] of Object.entries(crossReactions)) {
      if (allergiesLower.includes(allergen)) {
        if (crossReacts.some(cr => drugLower.includes(cr) || cr.includes(drugLower))) {
          warnings.push(`⚠️ ${med.drug} - potential cross-reaction with ${allergen} allergy`);
        }
      }
    }
    
    // Special case: aspirin allergy and aspirin in protocol
    if (allergiesLower.includes('aspirin') && drugLower === 'aspirin') {
      warnings.push(`🚫 DO NOT GIVE ASPIRIN - documented aspirin allergy`);
    }
  }
  
  // Check vitals-based contraindications
  if (patientInfo.vitals?.bp) {
    const [systolic] = patientInfo.vitals.bp.split('/').map(Number);
    if (systolic && systolic < 90) {
      const hasNtg = protocol.medications.some(m => 
        m.drug.toLowerCase().includes('nitro')
      );
      if (hasNtg) {
        warnings.push(`🚫 HOLD NITROGLYCERIN - SBP ${systolic} < 90`);
      }
    }
  }
  
  return warnings;
}

/**
 * Get all available protocols grouped by category
 */
export function getProtocolsByCategory(): Record<ProtocolCategory, Protocol[]> {
  const grouped: Partial<Record<ProtocolCategory, Protocol[]>> = {};
  
  for (const protocol of protocols) {
    if (!grouped[protocol.category]) {
      grouped[protocol.category] = [];
    }
    grouped[protocol.category]!.push(protocol);
  }
  
  return grouped as Record<ProtocolCategory, Protocol[]>;
}

/**
 * Get a specific protocol by ID
 */
export function getProtocolById(id: string): Protocol | undefined {
  return protocols.find(p => p.id === id);
}

/**
 * Get all protocols
 */
export function getAllProtocols(): Protocol[] {
  return protocols;
}

/**
 * Search protocols by text query
 */
export function searchProtocols(query: string): Protocol[] {
  const queryLower = query.toLowerCase();
  
  return protocols.filter(protocol => 
    protocol.name.toLowerCase().includes(queryLower) ||
    protocol.keywords.some(k => k.toLowerCase().includes(queryLower)) ||
    protocol.category.toLowerCase().includes(queryLower)
  );
}
