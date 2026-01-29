import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { checkModelStatus } from '../lib/download';
import { initializeLLM } from '../lib/llm';

type Sex = 'male' | 'female' | undefined;

export default function FieldReportScreen() {
  const [observation, setObservation] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>(undefined);
  const [allergies, setAllergies] = useState('');
  const [weight, setWeight] = useState('');
  
  // Vital signs
  const [bp, setBp] = useState('');
  const [hr, setHr] = useState('');
  const [spo2, setSpo2] = useState('');
  const [rr, setRr] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingModel, setIsCheckingModel] = useState(true);
  const [showVitals, setShowVitals] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function checkAndLoadModel() {
      try {
        const status = await checkModelStatus();
        if (!status.gguf.exists) {
          router.replace('/download');
          return;
        }
        setIsCheckingModel(false);
        // Pre-load LLM in background
        initializeLLM().catch(() => {});
      } catch (error) {
        console.error('Error checking models:', error);
        setIsCheckingModel(false);
      }
    }
    checkAndLoadModel();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!observation.trim()) {
      Alert.alert('Missing Observation', 'Please describe the patient presentation.');
      return;
    }
    
    setIsLoading(true);
    
    // Build patient info for route params
    const patientInfo = {
      age: age ? parseInt(age, 10) : undefined,
      sex,
      weight: weight ? parseFloat(weight) : undefined,
      allergies: allergies.split(',').map(a => a.trim()).filter(a => a.length > 0),
      vitals: showVitals ? {
        bp: bp || undefined,
        hr: hr ? parseInt(hr, 10) : undefined,
        spo2: spo2 ? parseInt(spo2, 10) : undefined,
        rr: rr ? parseInt(rr, 10) : undefined,
      } : undefined,
    };
    
    router.push({
      pathname: '/protocol-results',
      params: { 
        observation: observation.trim(),
        patientInfo: JSON.stringify(patientInfo),
      },
    });
    
    setIsLoading(false);
  }, [observation, age, sex, allergies, weight, bp, hr, spo2, rr, showVitals]);

  if (isCheckingModel) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#dc2626" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 40) }]}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="medkit" size={48} color="#dc2626" />
          <Text style={styles.title}>Field Protocol</Text>
          <Text style={styles.subtitle}>EMS Protocol Assistant</Text>
        </View>

        {/* Mode Toggle */}
        <TouchableOpacity 
          style={styles.modeToggle}
          onPress={() => router.replace('/')}
        >
          <Ionicons name="swap-horizontal" size={16} color="#64748b" />
          <Text style={styles.modeToggleText}>Switch to Specialty Routing</Text>
        </TouchableOpacity>

        {/* Observation Input */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            <Ionicons name="eye-outline" size={18} color="#dc2626" /> Observation
          </Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., 55yo male, crushing chest pain, diaphoretic..."
            placeholderTextColor="#94a3b8"
            value={observation}
            onChangeText={setObservation}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Patient Info Row */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            <Ionicons name="person-outline" size={18} color="#dc2626" /> Patient
          </Text>
          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Age</Text>
              <TextInput
                style={styles.smallInput}
                placeholder="yrs"
                placeholderTextColor="#94a3b8"
                value={age}
                onChangeText={setAge}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Sex</Text>
              <View style={styles.sexToggle}>
                <TouchableOpacity
                  style={[styles.sexButton, sex === 'male' && styles.sexButtonActive]}
                  onPress={() => setSex('male')}
                >
                  <Text style={[styles.sexButtonText, sex === 'male' && styles.sexButtonTextActive]}>M</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sexButton, sex === 'female' && styles.sexButtonActive]}
                  onPress={() => setSex('female')}
                >
                  <Text style={[styles.sexButtonText, sex === 'female' && styles.sexButtonTextActive]}>F</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Weight (kg)</Text>
              <TextInput
                style={styles.smallInput}
                placeholder="kg"
                placeholderTextColor="#94a3b8"
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Allergies */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            <Ionicons name="warning-outline" size={18} color="#f59e0b" /> Allergies
          </Text>
          <TextInput
            style={styles.allergyInput}
            placeholder="Aspirin, Penicillin, Sulfa (comma-separated) or NKDA"
            placeholderTextColor="#94a3b8"
            value={allergies}
            onChangeText={setAllergies}
          />
        </View>

        {/* Vitals Toggle */}
        <TouchableOpacity 
          style={styles.vitalsToggle}
          onPress={() => setShowVitals(!showVitals)}
        >
          <Ionicons 
            name={showVitals ? "chevron-down" : "chevron-forward"} 
            size={20} 
            color="#64748b" 
          />
          <Text style={styles.vitalsToggleText}>Vital Signs (Optional)</Text>
        </TouchableOpacity>

        {showVitals && (
          <View style={styles.card}>
            <View style={styles.vitalsGrid}>
              <View style={styles.vitalItem}>
                <Text style={styles.vitalLabel}>BP</Text>
                <TextInput
                  style={styles.vitalInput}
                  placeholder="120/80"
                  placeholderTextColor="#94a3b8"
                  value={bp}
                  onChangeText={setBp}
                />
              </View>
              <View style={styles.vitalItem}>
                <Text style={styles.vitalLabel}>HR</Text>
                <TextInput
                  style={styles.vitalInput}
                  placeholder="80"
                  placeholderTextColor="#94a3b8"
                  value={hr}
                  onChangeText={setHr}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.vitalItem}>
                <Text style={styles.vitalLabel}>SpO2</Text>
                <TextInput
                  style={styles.vitalInput}
                  placeholder="98%"
                  placeholderTextColor="#94a3b8"
                  value={spo2}
                  onChangeText={setSpo2}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.vitalItem}>
                <Text style={styles.vitalLabel}>RR</Text>
                <TextInput
                  style={styles.vitalInput}
                  placeholder="16"
                  placeholderTextColor="#94a3b8"
                  value={rr}
                  onChangeText={setRr}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, !observation.trim() && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!observation.trim() || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>Get Protocol</Text>
              <Ionicons name="medkit" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        {/* Quick Examples */}
        <View style={styles.examples}>
          <Text style={styles.examplesTitle}>Quick scenarios:</Text>
          {[
            { text: "Unresponsive, not breathing, no pulse", icon: "heart-dislike" },
            { text: "Crushing chest pain, diaphoretic, pale", icon: "heart" },
            { text: "Bee sting, throat swelling, hives", icon: "bug" },
            { text: "Found down, pinpoint pupils, slow breathing", icon: "medical" },
          ].map((example, i) => (
            <TouchableOpacity 
              key={i} 
              style={styles.exampleItem}
              onPress={() => setObservation(example.text)}
            >
              <Ionicons name={example.icon as any} size={16} color="#dc2626" />
              <Text style={styles.exampleText}>{example.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  scrollContent: {
    padding: 16,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
    paddingVertical: 8,
  },
  modeToggleText: {
    fontSize: 14,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    backgroundColor: '#1e1e1e',
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    minWidth: 70,
  },
  inputLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
  },
  smallInput: {
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#1e1e1e',
    color: '#fff',
    minWidth: 60,
  },
  sexToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  sexButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#404040',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
  },
  sexButtonActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  sexButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  sexButtonTextActive: {
    color: '#fff',
  },
  allergyInput: {
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#1e1e1e',
    color: '#fff',
  },
  vitalsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  vitalsToggleText: {
    fontSize: 14,
    color: '#64748b',
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  vitalItem: {
    width: '45%',
  },
  vitalLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
  },
  vitalInput: {
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#1e1e1e',
    color: '#fff',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#4a4a4a',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  examples: {
    marginTop: 24,
    marginBottom: 40,
  },
  examplesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
  },
  exampleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  exampleText: {
    fontSize: 14,
    color: '#94a3b8',
    flex: 1,
  },
});
