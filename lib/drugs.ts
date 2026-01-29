/**
 * Drug Interaction and Dosing Service
 * Provides offline drug lookups, interaction checks, and dosage calculations
 */

import drugsData from '../data/drugs.json';

// Type definitions
export type DrugSeverity = 'severe' | 'moderate' | 'mild';

export interface DrugInteraction {
  drug: string;
  severity: DrugSeverity;
  effect: string;
}

export interface DoseInfo {
  adult?: string;
  pediatric?: string;
}

export interface Drug {
  id: string;
  name: string;
  brandNames: string[];
  class: string;
  emsIndications: string[];
  contraindications: string[];
  interactions: DrugInteraction[];
  dosing: Record<string, DoseInfo>;
  routes: string[];
  maxDose?: string;
  commonAllergies: string[];
  warnings: string[];
}

export interface AllergyCrossReaction {
  allergen: string;
  crossReacts: string[];
}

export interface InteractionWarning {
  drug: string;
  severity: DrugSeverity;
  message: string;
  type: 'allergy' | 'drug-drug' | 'contraindication';
}

export interface DoseCalculation {
  drug: string;
  indication: string;
  calculatedDose: string;
  route: string;
  warnings: string[];
  maxDose?: string;
}

// Load data - cast through unknown to handle JSON type inference
const drugs = drugsData.drugs as unknown as Drug[];
const allergyCrossReactions = drugsData.commonAllergyCrossReactions as AllergyCrossReaction[];

/**
 * Check for drug interactions and warnings
 */
export function checkInteractions(
  drugName: string,
  allergies: string[],
  currentMeds: string[] = []
): InteractionWarning[] {
  const warnings: InteractionWarning[] = [];
  const drugLower = drugName.toLowerCase();
  const allergiesLower = allergies.map(a => a.toLowerCase());
  
  // Find the drug
  const drug = drugs.find(d => 
    d.id === drugLower || 
    d.name.toLowerCase() === drugLower ||
    d.brandNames.some(b => b.toLowerCase() === drugLower)
  );
  
  if (!drug) {
    return warnings;
  }
  
  // Check direct allergies
  if (allergiesLower.includes(drug.name.toLowerCase()) || 
      allergiesLower.includes(drug.id)) {
    warnings.push({
      drug: drug.name,
      severity: 'severe',
      message: `Patient has documented ${drug.name} allergy - DO NOT ADMINISTER`,
      type: 'allergy',
    });
  }
  
  // Check allergy cross-reactions
  for (const allergy of allergiesLower) {
    // Check commonAllergies on the drug
    if (drug.commonAllergies.some(ca => ca.toLowerCase() === allergy)) {
      warnings.push({
        drug: drug.name,
        severity: 'severe',
        message: `${drug.name} contraindicated - contains ${allergy}`,
        type: 'allergy',
      });
    }
    
    // Check cross-reaction table
    const crossReaction = allergyCrossReactions.find(cr => 
      cr.allergen.toLowerCase() === allergy
    );
    if (crossReaction) {
      const isRelated = crossReaction.crossReacts.some(cr =>
        drug.name.toLowerCase().includes(cr.toLowerCase()) ||
        cr.toLowerCase().includes(drug.name.toLowerCase())
      );
      if (isRelated) {
        warnings.push({
          drug: drug.name,
          severity: 'moderate',
          message: `${drug.name} may cross-react with ${allergy} allergy`,
          type: 'allergy',
        });
      }
    }
  }
  
  // Check drug-drug interactions
  for (const currentMed of currentMeds) {
    const currentMedLower = currentMed.toLowerCase();
    
    for (const interaction of drug.interactions) {
      if (currentMedLower.includes(interaction.drug.toLowerCase()) ||
          interaction.drug.toLowerCase().includes(currentMedLower)) {
        warnings.push({
          drug: drug.name,
          severity: interaction.severity,
          message: `${drug.name} + ${currentMed}: ${interaction.effect}`,
          type: 'drug-drug',
        });
      }
    }
  }
  
  // Add general warnings
  for (const warning of drug.warnings) {
    warnings.push({
      drug: drug.name,
      severity: 'mild',
      message: warning,
      type: 'contraindication',
    });
  }
  
  return warnings;
}

/**
 * Calculate weight-based dose for a drug
 */
export function calculateDose(
  drugName: string,
  weight: number,
  indication: string,
  isAdult: boolean = true
): DoseCalculation | null {
  const drugLower = drugName.toLowerCase();
  
  const drug = drugs.find(d => 
    d.id === drugLower || 
    d.name.toLowerCase() === drugLower
  );
  
  if (!drug) {
    return null;
  }
  
  // Find dosing for indication
  const indicationKey = Object.keys(drug.dosing).find(k =>
    k.toLowerCase().includes(indication.toLowerCase()) ||
    indication.toLowerCase().includes(k.toLowerCase())
  ) || Object.keys(drug.dosing)[0];
  
  const dosing = drug.dosing[indicationKey];
  if (!dosing) {
    return null;
  }
  
  const warnings: string[] = [];
  let calculatedDose: string;
  
  if (isAdult && dosing.adult) {
    calculatedDose = dosing.adult;
  } else if (!isAdult && dosing.pediatric) {
    // Parse pediatric dose and calculate based on weight
    calculatedDose = calculatePediatricDose(dosing.pediatric, weight);
    warnings.push(`Calculated for ${weight}kg patient`);
  } else if (dosing.adult) {
    calculatedDose = dosing.adult;
    if (!isAdult) {
      warnings.push('No pediatric dosing available - using adult dose with caution');
    }
  } else {
    return null;
  }
  
  return {
    drug: drug.name,
    indication: indicationKey,
    calculatedDose,
    route: drug.routes[0] || 'IV',
    warnings,
    maxDose: drug.maxDose,
  };
}

/**
 * Parse and calculate pediatric dose from formula
 */
function calculatePediatricDose(formula: string, weight: number): string {
  // Common patterns: "0.01mg/kg" or "0.1mL/kg of 1:10,000"
  const mgPerKgMatch = formula.match(/([\d.]+)\s*mg\/kg/);
  const mcgPerKgMatch = formula.match(/([\d.]+)\s*mcg\/kg/);
  const mlPerKgMatch = formula.match(/([\d.]+)\s*mL\/kg/);
  
  let calculated = formula;
  
  if (mgPerKgMatch) {
    const dosePerKg = parseFloat(mgPerKgMatch[1]);
    const totalDose = (dosePerKg * weight).toFixed(2);
    calculated = `${totalDose}mg (${formula})`;
  } else if (mcgPerKgMatch) {
    const dosePerKg = parseFloat(mcgPerKgMatch[1]);
    const totalDose = (dosePerKg * weight).toFixed(1);
    calculated = `${totalDose}mcg (${formula})`;
  } else if (mlPerKgMatch) {
    const dosePerKg = parseFloat(mlPerKgMatch[1]);
    const totalDose = (dosePerKg * weight).toFixed(1);
    calculated = `${totalDose}mL (${formula})`;
  }
  
  // Check for max dose in formula
  const maxMatch = formula.match(/max\s*([\d.]+\s*\w+)/i);
  if (maxMatch) {
    calculated += ` - MAX ${maxMatch[1]}`;
  }
  
  return calculated;
}

/**
 * Get drug by name or ID
 */
export function getDrug(nameOrId: string): Drug | undefined {
  const lower = nameOrId.toLowerCase();
  return drugs.find(d =>
    d.id === lower ||
    d.name.toLowerCase() === lower ||
    d.brandNames.some(b => b.toLowerCase() === lower)
  );
}

/**
 * Get all drugs
 */
export function getAllDrugs(): Drug[] {
  return drugs;
}

/**
 * Search drugs by indication or name
 */
export function searchDrugs(query: string): Drug[] {
  const queryLower = query.toLowerCase();
  
  return drugs.filter(drug =>
    drug.name.toLowerCase().includes(queryLower) ||
    drug.brandNames.some(b => b.toLowerCase().includes(queryLower)) ||
    drug.emsIndications.some(i => i.toLowerCase().includes(queryLower)) ||
    drug.class.toLowerCase().includes(queryLower)
  );
}

/**
 * Check if an allergy affects any drug in a medication list
 */
export function checkAllergyAgainstMeds(
  allergies: string[],
  medications: string[]
): InteractionWarning[] {
  const allWarnings: InteractionWarning[] = [];
  
  for (const med of medications) {
    const warnings = checkInteractions(med, allergies, []);
    allWarnings.push(...warnings.filter(w => w.type === 'allergy'));
  }
  
  return allWarnings;
}
