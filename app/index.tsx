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
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { checkModelStatus } from '../lib/download';
import { initializeSetFit } from '../lib/setfit';

export default function HomeScreen() {
  const [symptom, setSymptom] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingModel, setIsCheckingModel] = useState(true);
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  // Check if GGUF model exists on mount, redirect to download if not
  useEffect(() => {
    async function checkAndLoadModel() {
      try {
        const status = await checkModelStatus();
        
        if (!status.gguf.exists) {
          router.replace('/download');
          return;
        }
        
        // Model exists - try to pre-load SetFit (non-blocking)
        setIsCheckingModel(false);
        setIsLoadingModel(true);
        await initializeSetFit().catch(() => {
          // SetFit failed, will use LLM fallback - that's ok
        });
      } catch (error) {
        console.error('Error checking models:', error);
      } finally {
        setIsCheckingModel(false);
        setIsLoadingModel(false);
      }
    }
    checkAndLoadModel();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!symptom.trim()) return;
    
    setIsLoading(true);
    
    // Navigate to results with symptom
    router.push({
      pathname: '/results',
      params: { symptom: symptom.trim() },
    });
    
    setIsLoading(false);
  }, [symptom]);



  // Show loading while checking model status
  if (isCheckingModel) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="medical" size={64} color="#2563eb" />
          <Text style={styles.title}>KVEC Triage</Text>
          <Text style={styles.subtitle}>
            {isLoadingModel ? 'Loading AI model...' : 'Offline symptom-to-specialty routing'}
          </Text>
        </View>

        {/* Mode Toggle */}
        <TouchableOpacity 
          style={styles.modeToggle}
          onPress={() => router.replace('/field-report')}
        >
          <Ionicons name="medkit" size={16} color="#dc2626" />
          <Text style={styles.modeToggleText}>Switch to First Responder Mode</Text>
        </TouchableOpacity>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Describe your symptoms</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., burning pain when I pee, chest pain after eating..."
            placeholderTextColor="#94a3b8"
            value={symptom}
            onChangeText={setSymptom}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <View style={styles.buttonRow}>

            <TouchableOpacity
              style={[styles.submitButton, !symptom.trim() && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!symptom.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Get Triage</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.examples}>
          <Text style={styles.examplesTitle}>Example symptoms:</Text>
          {[
            "feeling anxious and can't sleep",
            "lower back pain radiating to leg",
            "always thirsty and urinating frequently",
            "trouble swallowing and food getting stuck",
            "seeing floaters and flashing lights",
            "heart racing for no reason",
          ].map((example, i) => (
            <TouchableOpacity 
              key={i} 
              style={styles.exampleItem}
              onPress={() => setSymptom(example)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#64748b" />
              <Text style={styles.exampleText}>{example}</Text>
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
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 12,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    backgroundColor: '#f8fafc',
    color: '#1e293b',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  examples: {
    marginTop: 24,
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
    paddingVertical: 8,
    gap: 8,
  },
  exampleText: {
    fontSize: 14,
    color: '#475569',
    flex: 1,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
    paddingVertical: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  modeToggleText: {
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
  },
});
