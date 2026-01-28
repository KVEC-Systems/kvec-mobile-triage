/**
 * Clinical Evaluation Script
 * Tests the triage system against a curated dataset
 * 
 * Run with: npx ts-node evaluation/evaluate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
interface TestCase {
  symptom: string;
  expected_specialty: string;
  expected_conditions?: string[];
}

interface TestResult {
  symptom: string;
  expected_specialty: string;
  predicted_specialty: string;
  confidence: number;
  correct: boolean;
  inference_time_ms: number;
  conditions_predicted: string[];
  conditions_expected: string[];
}

interface EvaluationMetrics {
  total_cases: number;
  correct: number;
  accuracy: number;
  avg_confidence: number;
  avg_inference_time_ms: number;
  per_specialty: Record<string, {
    total: number;
    correct: number;
    precision: number;
    recall: number;
    f1: number;
  }>;
}

// Fallback triage logic (same as lib/llm.ts)
function runFallbackTriage(symptom: string): { specialty: string; confidence: number; conditions: string[] } {
  const symptomLower = symptom.toLowerCase();
  
  if (symptomLower.includes('burn') && (symptomLower.includes('pee') || symptomLower.includes('urin'))) {
    return { specialty: 'Urology', confidence: 0.85, conditions: ['Urinary Tract Infection', 'Cystitis'] };
  }
  
  if (symptomLower.includes('chest') && (symptomLower.includes('eat') || symptomLower.includes('food') || symptomLower.includes('meal'))) {
    return { specialty: 'Gastroenterology', confidence: 0.82, conditions: ['GERD', 'Esophagitis'] };
  }
  
  if (symptomLower.includes('sad') || symptomLower.includes('depress') || symptomLower.includes('anxious') || symptomLower.includes('panic')) {
    return { specialty: 'Behavioral Health', confidence: 0.80, conditions: ['Depression', 'Anxiety'] };
  }
  
  if (symptomLower.includes('mole') || symptomLower.includes('rash') || symptomLower.includes('skin') || symptomLower.includes('itch')) {
    return { specialty: 'Dermatology', confidence: 0.78, conditions: ['Dermatitis', 'Skin Lesion'] };
  }
  
  if (symptomLower.includes('heart') || symptomLower.includes('chest pain') || symptomLower.includes('palpitation')) {
    return { specialty: 'Cardiology', confidence: 0.75, conditions: ['Cardiac evaluation needed'] };
  }
  
  if (symptomLower.includes('headache') || symptomLower.includes('migraine') || symptomLower.includes('numbness') || symptomLower.includes('tingling')) {
    return { specialty: 'Neurology', confidence: 0.75, conditions: ['Neurological evaluation needed'] };
  }
  
  if (symptomLower.includes('back pain') || symptomLower.includes('knee') || symptomLower.includes('shoulder') || symptomLower.includes('joint')) {
    return { specialty: 'Orthopedic Surgery', confidence: 0.75, conditions: ['Musculoskeletal evaluation needed'] };
  }
  
  if (symptomLower.includes('breath') || symptomLower.includes('cough') || symptomLower.includes('wheez')) {
    return { specialty: 'Pulmonology', confidence: 0.75, conditions: ['Respiratory evaluation needed'] };
  }
  
  if (symptomLower.includes('period') || symptomLower.includes('menstrua') || symptomLower.includes('pelvic')) {
    return { specialty: "Women's Health", confidence: 0.75, conditions: ['Gynecological evaluation needed'] };
  }
  
  if (symptomLower.includes('swallow') || symptomLower.includes('stomach') || symptomLower.includes('diarrhea') || symptomLower.includes('abdominal')) {
    return { specialty: 'Gastroenterology', confidence: 0.75, conditions: ['GI evaluation needed'] };
  }
  
  return { specialty: 'Primary Care', confidence: 0.50, conditions: ['General evaluation needed'] };
}

// Load test cases
function loadTestCases(): TestCase[] {
  const yamlPath = path.join(__dirname, 'test_cases.yaml');
  const content = fs.readFileSync(yamlPath, 'utf8');
  const data = yaml.load(content) as { test_cases: TestCase[] };
  return data.test_cases;
}

// Run evaluation
function evaluate(testCases: TestCase[]): { results: TestResult[]; metrics: EvaluationMetrics } {
  const results: TestResult[] = [];
  const specialtyStats: Record<string, { tp: number; fp: number; fn: number }> = {};

  // Initialize specialty stats
  const specialties = [...new Set(testCases.map(tc => tc.expected_specialty))];
  specialties.forEach(s => {
    specialtyStats[s] = { tp: 0, fp: 0, fn: 0 };
  });

  for (const testCase of testCases) {
    const startTime = Date.now();
    const prediction = runFallbackTriage(testCase.symptom);
    const inferenceTime = Date.now() - startTime;

    const correct = prediction.specialty === testCase.expected_specialty;

    results.push({
      symptom: testCase.symptom,
      expected_specialty: testCase.expected_specialty,
      predicted_specialty: prediction.specialty,
      confidence: prediction.confidence,
      correct,
      inference_time_ms: inferenceTime,
      conditions_predicted: prediction.conditions,
      conditions_expected: testCase.expected_conditions || [],
    });

    // Update specialty stats
    if (correct) {
      specialtyStats[testCase.expected_specialty].tp++;
    } else {
      specialtyStats[testCase.expected_specialty].fn++;
      if (!specialtyStats[prediction.specialty]) {
        specialtyStats[prediction.specialty] = { tp: 0, fp: 0, fn: 0 };
      }
      specialtyStats[prediction.specialty].fp++;
    }
  }

  // Calculate metrics
  const correctCount = results.filter(r => r.correct).length;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  const avgInferenceTime = results.reduce((sum, r) => sum + r.inference_time_ms, 0) / results.length;

  const perSpecialty: EvaluationMetrics['per_specialty'] = {};
  for (const [specialty, stats] of Object.entries(specialtyStats)) {
    const precision = stats.tp / (stats.tp + stats.fp) || 0;
    const recall = stats.tp / (stats.tp + stats.fn) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;
    perSpecialty[specialty] = {
      total: stats.tp + stats.fn,
      correct: stats.tp,
      precision: Math.round(precision * 100) / 100,
      recall: Math.round(recall * 100) / 100,
      f1: Math.round(f1 * 100) / 100,
    };
  }

  return {
    results,
    metrics: {
      total_cases: testCases.length,
      correct: correctCount,
      accuracy: Math.round((correctCount / testCases.length) * 100) / 100,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      avg_inference_time_ms: Math.round(avgInferenceTime * 100) / 100,
      per_specialty: perSpecialty,
    },
  };
}

// Generate markdown report
function generateReport(metrics: EvaluationMetrics, results: TestResult[]): string {
  let report = `# Clinical Evaluation Report

## Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | ${metrics.total_cases} |
| Correct Predictions | ${metrics.correct} |
| **Overall Accuracy** | **${(metrics.accuracy * 100).toFixed(1)}%** |
| Average Confidence | ${(metrics.avg_confidence * 100).toFixed(1)}% |
| Average Inference Time | ${metrics.avg_inference_time_ms.toFixed(2)}ms |

## Per-Specialty Performance

| Specialty | Total | Correct | Precision | Recall | F1 Score |
|-----------|-------|---------|-----------|--------|----------|
`;

  for (const [specialty, stats] of Object.entries(metrics.per_specialty).sort((a, b) => b[1].f1 - a[1].f1)) {
    report += `| ${specialty} | ${stats.total} | ${stats.correct} | ${(stats.precision * 100).toFixed(0)}% | ${(stats.recall * 100).toFixed(0)}% | ${stats.f1.toFixed(2)} |\n`;
  }

  report += `
## Misclassifications

| Symptom | Expected | Predicted |
|---------|----------|-----------|
`;

  const misclassifications = results.filter(r => !r.correct);
  for (const miss of misclassifications.slice(0, 20)) {
    const symptomShort = miss.symptom.length > 50 ? miss.symptom.slice(0, 47) + '...' : miss.symptom;
    report += `| ${symptomShort} | ${miss.expected_specialty} | ${miss.predicted_specialty} |\n`;
  }

  if (misclassifications.length > 20) {
    report += `\n*...and ${misclassifications.length - 20} more misclassifications*\n`;
  }

  report += `
---
*Generated: ${new Date().toISOString()}*
*Evaluation Mode: Fallback Triage (keyword-based)*

> Note: This baseline uses the keyword-based fallback. SetFit and LLM will achieve higher accuracy.
`;

  return report;
}

// Main
async function main() {
  console.log('Loading test cases...');
  const testCases = loadTestCases();
  console.log(`Loaded ${testCases.length} test cases`);

  console.log('Running evaluation...');
  const { results, metrics } = evaluate(testCases);

  console.log('\n=== EVALUATION RESULTS ===');
  console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`Correct: ${metrics.correct}/${metrics.total_cases}`);
  console.log(`Avg Confidence: ${(metrics.avg_confidence * 100).toFixed(1)}%`);
  console.log(`Avg Inference: ${metrics.avg_inference_time_ms.toFixed(2)}ms`);

  // Generate and save report
  const report = generateReport(metrics, results);
  const reportPath = path.join(__dirname, 'evaluation_report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);

  // Save raw results as JSON
  const jsonPath = path.join(__dirname, 'evaluation_results.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ metrics, results }, null, 2));
  console.log(`Results saved to: ${jsonPath}`);
}

main().catch(console.error);
