import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { runTriage, initializeLLM, getLLMStatus, type TriageResult } from '../lib/llm';

// Initialize LLM on module load
let llmInitPromise: Promise<boolean> | null = null;

async function runTriageInference(symptom: string): Promise<TriageResult> {
  // Ensure LLM is initialized (or at least attempted)
  if (!llmInitPromise) {
    llmInitPromise = initializeLLM();
  }
  await llmInitPromise;

  // Run the triage (will use LLM if available, fallback otherwise)
  return runTriage(symptom);
}

export default function ResultsScreen() {
  const { symptom } = useLocalSearchParams<{ symptom: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<TriageResult | null>(null);

  useEffect(() => {
    if (symptom) {
      runTriageInference(symptom).then((res) => {
        setResult(res);
        setIsLoading(false);
      });
    }
  }, [symptom]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Analyzing symptoms...</Text>
        <Text style={styles.loadingSubtext}>Running on-device inference</Text>
      </View>
    );
  }

  const confidenceColor = 
    result!.confidence > 0.8 ? '#16a34a' : 
    result!.confidence > 0.6 ? '#ca8a04' : '#dc2626';

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

        <View style={styles.metadataRow}>
          <View style={styles.metadataItem}>
            <Ionicons name={result!.usedLLM ? 'hardware-chip' : 'flash'} size={14} color="#64748b" />
            <Text style={styles.metadataText}>
              {result!.usedLLM ? 'MedGemma LLM' : 'Quick Match'}
            </Text>
          </View>
          <View style={styles.metadataItem}>
            <Ionicons name="time-outline" size={14} color="#64748b" />
            <Text style={styles.metadataText}>{result!.inferenceTime}ms</Text>
          </View>
        </View>
      </View>

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
