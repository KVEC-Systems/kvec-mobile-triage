import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { 
  runProtocolInference, 
  generatePCRSummary,
  initializeLLM,
  FieldPatientInfo,
  ProtocolInferenceResult,
} from '../lib/llm';
import { retrieveProtocol } from '../lib/protocols';
import { checkInteractions } from '../lib/drugs';

export default function ProtocolResultsScreen() {
  const { observation, patientInfo: patientInfoStr } = useLocalSearchParams<{
    observation: string;
    patientInfo: string;
  }>();
  
  const [result, setResult] = useState<ProtocolInferenceResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [showPCR, setShowPCR] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const insets = useSafeAreaInsets();
  
  const patientInfo: FieldPatientInfo = patientInfoStr 
    ? JSON.parse(patientInfoStr) 
    : { allergies: [] };

  useEffect(() => {
    async function runInference() {
      if (!observation) {
        router.back();
        return;
      }

      try {
        // Try to initialize LLM first
        await initializeLLM().catch(() => {});
        
        // Run protocol inference
        const inferenceResult = await runProtocolInference(observation, patientInfo);
        
        // Enrich with local protocol data
        const localResult = retrieveProtocol(observation, patientInfo);
        
        // Merge drug warnings from local checks
        const allWarnings = new Set([...inferenceResult.drugWarnings, ...localResult.drugWarnings]);
        
        // Add interaction checks for any drugs in the protocol
        if (localResult.protocol.medications) {
          for (const med of localResult.protocol.medications) {
            const warnings = checkInteractions(med.drug, patientInfo.allergies, patientInfo.currentMeds || []);
            const severeWarnings = warnings.filter(w => w.severity === 'severe');
            severeWarnings.forEach(w => allWarnings.add(w.message));
          }
        }
        
        setResult({
          ...inferenceResult,
          // Prefer local protocol data when available
          protocolId: localResult.protocol.id,
          protocolName: localResult.protocol.name,
          interventions: localResult.protocol.steps.map(s => s.action),
          redFlags: localResult.protocol.redFlags,
          drugWarnings: Array.from(allWarnings),
          dosageInfo: localResult.protocol.medications.map(m => `${m.drug}: ${m.dose} ${m.route}`),
        });
      } catch (error) {
        console.error('Protocol inference error:', error);
        Alert.alert('Error', 'Failed to retrieve protocol. Please try again.');
        router.back();
      } finally {
        setIsLoading(false);
      }
    }
    
    runInference();
  }, [observation]);

  const toggleStep = useCallback((index: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleSharePCR = useCallback(async () => {
    if (!result) return;
    
    const pcr = generatePCRSummary(
      observation,
      patientInfo,
      result,
      result.interventions.filter((_, i) => completedSteps.has(i))
    );
    
    try {
      await Share.share({
        message: pcr,
        title: 'Prehospital Care Report',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  }, [result, observation, patientInfo, completedSteps]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#dc2626" />
        <Text style={styles.loadingText}>Retrieving protocol...</Text>
      </View>
    );
  }

  if (!result) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No protocol found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const urgencyColors = {
    immediate: { bg: '#dc2626', text: '#fff' },
    urgent: { bg: '#f59e0b', text: '#000' },
    routine: { bg: '#22c55e', text: '#fff' },
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.protocolName}>{result.protocolName}</Text>
          <View style={[styles.urgencyBadge, { backgroundColor: urgencyColors[result.urgency].bg }]}>
            <Text style={[styles.urgencyText, { color: urgencyColors[result.urgency].text }]}>
              {result.urgency.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Drug Warnings - Most prominent */}
        {result.drugWarnings.length > 0 && (
          <View style={styles.warningCard}>
            <View style={styles.warningHeader}>
              <Ionicons name="warning" size={24} color="#f59e0b" />
              <Text style={styles.warningTitle}>Drug Warnings</Text>
            </View>
            {result.drugWarnings.map((warning, i) => (
              <Text key={i} style={styles.warningText}>{warning}</Text>
            ))}
          </View>
        )}

        {/* Red Flags */}
        {result.redFlags.length > 0 && (
          <View style={styles.redFlagsCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="alert-circle" size={20} color="#ef4444" />
              <Text style={styles.sectionTitle}>Red Flags</Text>
            </View>
            {result.redFlags.map((flag, i) => (
              <Text key={i} style={styles.redFlagText}>• {flag}</Text>
            ))}
          </View>
        )}

        {/* Interventions Checklist */}
        <View style={styles.interventionsCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={20} color="#22c55e" />
            <Text style={styles.sectionTitle}>Interventions</Text>
            <Text style={styles.progressText}>
              {completedSteps.size}/{result.interventions.length}
            </Text>
          </View>
          {result.interventions.map((intervention, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.interventionItem, completedSteps.has(i) && styles.interventionCompleted]}
              onPress={() => toggleStep(i)}
            >
              <View style={[styles.checkbox, completedSteps.has(i) && styles.checkboxChecked]}>
                {completedSteps.has(i) && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
              <Text style={[
                styles.interventionText,
                completedSteps.has(i) && styles.interventionTextCompleted
              ]}>
                {intervention}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Dosages */}
        {result.dosageInfo.length > 0 && (
          <View style={styles.dosageCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="medical" size={20} color="#3b82f6" />
              <Text style={styles.sectionTitle}>Medications / Dosages</Text>
            </View>
            {result.dosageInfo.map((dose, i) => (
              <View key={i} style={styles.doseItem}>
                <Text style={styles.doseText}>{dose}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Patient Summary */}
        <View style={styles.patientCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person" size={20} color="#94a3b8" />
            <Text style={styles.sectionTitle}>Patient</Text>
          </View>
          <Text style={styles.patientInfo}>
            {patientInfo.age ? `${patientInfo.age}yo ` : ''}
            {patientInfo.sex || ''}
            {patientInfo.weight ? ` | ${patientInfo.weight}kg` : ''}
          </Text>
          <Text style={styles.patientInfo}>
            Allergies: {patientInfo.allergies.length > 0 ? patientInfo.allergies.join(', ') : 'NKDA'}
          </Text>
          {patientInfo.vitals && (
            <Text style={styles.patientInfo}>
              {patientInfo.vitals.bp && `BP ${patientInfo.vitals.bp} `}
              {patientInfo.vitals.hr && `HR ${patientInfo.vitals.hr} `}
              {patientInfo.vitals.spo2 && `SpO2 ${patientInfo.vitals.spo2}% `}
              {patientInfo.vitals.rr && `RR ${patientInfo.vitals.rr}`}
            </Text>
          )}
        </View>

        {/* Inference Info */}
        <View style={styles.metaCard}>
          <Text style={styles.metaText}>
            {result.usedLLM ? '🧠 LLM-enriched' : '⚡ Keyword match'} • {result.inferenceTime}ms • 
            Confidence: {Math.round(result.confidence * 100)}%
          </Text>
        </View>

        {/* Raw Response Toggle */}
        {result.rawResponse && (
          <>
            <TouchableOpacity 
              style={styles.rawToggle}
              onPress={() => setShowRawResponse(!showRawResponse)}
            >
              <Ionicons 
                name={showRawResponse ? "chevron-down" : "chevron-forward"} 
                size={16} 
                color="#64748b" 
              />
              <Text style={styles.rawToggleText}>Debug: Raw LLM Response</Text>
            </TouchableOpacity>
            {showRawResponse && (
              <View style={styles.rawCard}>
                <Text style={styles.rawText} selectable>{result.rawResponse}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity 
          style={styles.pcrButton}
          onPress={handleSharePCR}
        >
          <Ionicons name="document-text" size={20} color="#fff" />
          <Text style={styles.pcrButtonText}>Export PCR</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.newButton}
          onPress={() => router.replace('/field-report')}
        >
          <Ionicons name="add" size={20} color="#dc2626" />
          <Text style={styles.newButtonText}>New Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
  },
  loadingText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#2a2a2a',
  },
  backBtn: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  protocolName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  urgencyBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  warningCard: {
    backgroundColor: '#422006',
    borderWidth: 2,
    borderColor: '#f59e0b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f59e0b',
  },
  warningText: {
    fontSize: 16,
    color: '#fef3c7',
    marginBottom: 6,
  },
  redFlagsCard: {
    backgroundColor: '#450a0a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  progressText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  redFlagText: {
    fontSize: 14,
    color: '#fca5a5',
    marginBottom: 4,
  },
  interventionsCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  interventionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
    gap: 12,
  },
  interventionCompleted: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#22c55e',
  },
  interventionText: {
    fontSize: 15,
    color: '#fff',
    flex: 1,
  },
  interventionTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  dosageCard: {
    backgroundColor: '#172554',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  doseItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  doseText: {
    fontSize: 15,
    color: '#93c5fd',
  },
  patientCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  patientInfo: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 4,
  },
  metaCard: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
  },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#1e1e1e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  pcrButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  pcrButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  newButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#dc2626',
    gap: 8,
  },
  newButtonText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
  rawToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  rawToggleText: {
    fontSize: 12,
    color: '#64748b',
  },
  rawCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  rawText: {
    fontSize: 12,
    color: '#a3e635',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});
