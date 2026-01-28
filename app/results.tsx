import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { initializeSetFit, classifySymptom, isSetFitReady, type SetFitResult } from '../lib/setfit';
import { runTriage, enrichWithLLM, initializeLLM, type TriageResult, type UrgencyLevel, type EnrichmentResult } from '../lib/llm';

// Result type that works for both SetFit and LLM results
interface UnifiedResult {
  specialty: string;
  confidence: number;
  conditions: string[];
  guidance: string;
  inferenceTime: number;
  usedSetFit: boolean;
  // Structured extraction fields
  urgency: UrgencyLevel;
  bodySystem: string;
  redFlags: string[];
  followUpTimeframe: string;
  suggestedQuestions: string[];
  // Enrichment state
  isEnriching?: boolean;
  enrichmentTime?: number;
}

// Initialize SetFit on module load
let setfitInitPromise: Promise<boolean> | null = null;

// Initial result from SetFit (before enrichment)
function createInitialSetFitResult(result: SetFitResult): UnifiedResult {
  return {
    specialty: result.specialty,
    confidence: result.specialtyConfidence,
    conditions: result.conditions,
    guidance: `Recommended evaluation by ${result.specialty} specialist.`,
    inferenceTime: result.inferenceTime,
    usedSetFit: true,
    // Placeholder values - will be enriched by LLM
    urgency: 'routine' as UrgencyLevel,
    bodySystem: 'general',
    redFlags: [],
    followUpTimeframe: 'within 1 week',
    suggestedQuestions: ['How long have you had these symptoms?', 'Have you tried any treatments?'],
    isEnriching: true,  // Flag that enrichment is pending
  };
}

async function runTriageInference(symptom: string): Promise<UnifiedResult> {
  // Try SetFit first (fast classification)
  if (!setfitInitPromise) {
    setfitInitPromise = initializeSetFit();
  }
  
  const setfitReady = await setfitInitPromise;
  
  if (setfitReady && isSetFitReady()) {
    try {
      console.log('Using SetFit for fast classification...');
      const result = await classifySymptom(symptom);
      return createInitialSetFitResult(result);
    } catch (error) {
      console.error('SetFit classification failed, falling back to LLM:', error);
    }
  }
  
  // Fallback to LLM (full inference, no enrichment needed)
  console.log('Using LLM for triage...');
  const llmResult = await runTriage(symptom);
  return {
    specialty: llmResult.specialty,
    confidence: llmResult.confidence,
    conditions: llmResult.conditions,
    guidance: llmResult.guidance,
    inferenceTime: llmResult.inferenceTime,
    usedSetFit: false,
    urgency: llmResult.urgency,
    bodySystem: llmResult.bodySystem,
    redFlags: llmResult.redFlags,
    followUpTimeframe: llmResult.followUpTimeframe,
    suggestedQuestions: llmResult.suggestedQuestions,
    isEnriching: false,
  };
}

export default function ResultsScreen() {
  const { symptom } = useLocalSearchParams<{ symptom: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<UnifiedResult | null>(null);

  useEffect(() => {
    if (symptom) {
      // Phase 1: Fast classification
      runTriageInference(symptom).then((res) => {
        setResult(res);
        setIsLoading(false);
        
        // Phase 2: LLM enrichment (if SetFit was used)
        if (res.usedSetFit && res.isEnriching) {
          // Initialize LLM if needed, then enrich
          initializeLLM().then(() => {
            enrichWithLLM(symptom, res.specialty, res.conditions).then((enrichment) => {
              setResult(prev => prev ? {
                ...prev,
                urgency: enrichment.urgency,
                bodySystem: enrichment.bodySystem,
                redFlags: enrichment.redFlags,
                followUpTimeframe: enrichment.followUpTimeframe,
                suggestedQuestions: enrichment.suggestedQuestions,
                enrichmentTime: enrichment.enrichmentTime,
                isEnriching: false,
              } : prev);
            });
          });
        }
      });
    }
  }, [symptom]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Analyzing symptoms...</Text>
        <Text style={styles.loadingSubtext}>Running on-device classification</Text>
      </View>
    );
  }

  const confidenceColor = 
    result!.confidence > 0.8 ? '#16a34a' : 
    result!.confidence > 0.6 ? '#ca8a04' : '#dc2626';

  const urgencyColor = 
    result!.urgency === 'emergency' ? '#dc2626' : 
    result!.urgency === 'urgent' ? '#ea580c' : '#16a34a';

  const isEnriching = result!.isEnriching;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.symptomCard}>
        <Text style={styles.symptomLabel}>Patient's symptoms:</Text>
        <Text style={styles.symptomText}>"{symptom}"</Text>
      </View>

      <View style={styles.resultCard}>
        <View style={styles.specialtyHeader}>
          <Ionicons name="medical" size={32} color="#2563eb" />
          <View>
            <Text style={styles.specialtyLabel}>Recommended Specialty</Text>
            <Text style={styles.specialtyName}>{result!.specialty}</Text>
          </View>
        </View>

        <View style={styles.confidenceRow}>
          <Text style={styles.confidenceLabel}>Confidence:</Text>
          <View style={[styles.confidenceBadge, { backgroundColor: confidenceColor }]}>
            <Text style={styles.confidenceText}>
              {Math.round(result!.confidence * 100)}%
            </Text>
          </View>
        </View>

        <View style={styles.urgencyRow}>
          <Text style={styles.urgencyLabel}>Urgency:</Text>
          {isEnriching ? (
            <View style={styles.enrichingBadge}>
              <ActivityIndicator size="small" color="#64748b" />
              <Text style={styles.enrichingText}>Analyzing...</Text>
            </View>
          ) : (
            <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor }]}>
              <Ionicons 
                name={result!.urgency === 'emergency' ? 'alert-circle' : result!.urgency === 'urgent' ? 'warning' : 'checkmark-circle'} 
                size={14} 
                color="#fff" 
              />
              <Text style={styles.urgencyText}>
                {result!.urgency.charAt(0).toUpperCase() + result!.urgency.slice(1)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.timeframeRow}>
          <Ionicons name="calendar-outline" size={16} color="#64748b" />
          {isEnriching ? (
            <Text style={styles.enrichingText}>Determining timeframe...</Text>
          ) : (
            <Text style={styles.timeframeText}>See provider: {result!.followUpTimeframe}</Text>
          )}
        </View>

        <View style={styles.metadataRow}>
          <View style={styles.metadataItem}>
            <Ionicons name={result!.usedSetFit ? 'flash' : 'hardware-chip'} size={14} color="#64748b" />
            <Text style={styles.metadataText}>
              {result!.usedSetFit ? 'SetFit Fast' : 'LLM'}
            </Text>
          </View>
          <View style={styles.metadataItem}>
            <Ionicons name="time-outline" size={14} color="#64748b" />
            <Text style={styles.metadataText}>
              {result!.inferenceTime}ms
              {result!.enrichmentTime ? ` + ${result!.enrichmentTime}ms` : ''}
            </Text>
          </View>
        </View>
      </View>

      {result!.redFlags.length > 0 && (
        <View style={styles.redFlagsCard}>
          <View style={styles.redFlagsHeader}>
            <Ionicons name="alert" size={20} color="#dc2626" />
            <Text style={styles.redFlagsTitle}>Warning Signs</Text>
          </View>
          {result!.redFlags.map((flag, i) => (
            <View key={i} style={styles.redFlagItem}>
              <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
              <Text style={styles.redFlagText}>{flag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.conditionsCard}>
        <Text style={styles.sectionTitle}>Possible Conditions</Text>
        {result!.conditions.map((condition, i) => (
          <View key={i} style={styles.conditionItem}>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
            <Text style={styles.conditionText}>{condition}</Text>
          </View>
        ))}
      </View>

      <View style={styles.guidanceCard}>
        <View style={styles.guidanceHeader}>
          <Ionicons name="information-circle" size={24} color="#1e40af" />
          <Text style={styles.sectionTitle}>Clinical Guidance</Text>
        </View>
        <Text style={styles.guidanceText}>{result!.guidance}</Text>
      </View>

      {/* Start Assessment Button - only show when enrichment is complete and we have questions */}
      {!isEnriching && result!.suggestedQuestions.length > 0 && (
        <TouchableOpacity
          style={styles.assessmentButton}
          onPress={() => {
            router.push({
              pathname: '/diagnostic',
              params: {
                symptom,
                specialty: result!.specialty,
                conditions: result!.conditions.join(','),
                urgency: result!.urgency,
                suggestedQuestions: result!.suggestedQuestions.join('|'),
              },
            });
          }}
        >
          <Ionicons name="clipboard-outline" size={20} color="#fff" />
          <Text style={styles.assessmentButtonText}>Start Assessment</Text>
          <View style={styles.questionCount}>
            <Text style={styles.questionCountText}>{result!.suggestedQuestions.length} questions</Text>
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.chatButton}
        onPress={() => {
          router.push({
            pathname: '/chat',
            params: {
              symptom,
              specialty: result!.specialty,
              conditions: result!.conditions.join(', '),
            },
          });
        }}
      >
        <Ionicons name="chatbubbles" size={20} color="#fff" />
        <Text style={styles.chatButtonText}>Chat with MedGemma AI</Text>
      </TouchableOpacity>

      <View style={styles.disclaimer}>
        <Ionicons name="warning" size={16} color="#ca8a04" />
        <Text style={styles.disclaimerText}>
          This is a triage tool only. Always use clinical judgment and refer to appropriate specialists.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  symptomCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
  },
  symptomLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  symptomText: {
    fontSize: 16,
    color: '#1e293b',
    fontStyle: 'italic',
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  specialtyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  specialtyLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  specialtyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confidenceLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  confidenceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  confidenceText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  urgencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  urgencyLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  urgencyText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  timeframeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  timeframeText: {
    fontSize: 13,
    color: '#64748b',
  },
  enrichingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  enrichingText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  redFlagsCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  redFlagsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  redFlagsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
  },
  redFlagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  redFlagText: {
    fontSize: 14,
    color: '#7f1d1d',
    flex: 1,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metadataText: {
    fontSize: 12,
    color: '#64748b',
  },
  conditionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
  },
  conditionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  conditionText: {
    fontSize: 15,
    color: '#1e293b',
  },
  guidanceCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  guidanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  guidanceText: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 22,
  },
  assessmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  assessmentButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  questionCount: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  questionCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    marginBottom: 32,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#78350f',
    lineHeight: 18,
  },
});
