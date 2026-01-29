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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { areModelsAvailable, initializeSemanticSearch } from '../lib/semantic-search';

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingModels, setIsCheckingModels] = useState(true);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const insets = useSafeAreaInsets();

  // Check if models exist on mount, redirect to download if not
  useEffect(() => {
    async function checkAndLoadModels() {
      try {
        const available = await areModelsAvailable();
        
        if (!available) {
          router.replace('/download');
          return;
        }
        
        // Models exist - pre-load semantic search
        setIsCheckingModels(false);
        setIsLoadingModels(true);
        await initializeSemanticSearch().catch(() => {
          // Failed to load, will show error later
        });
      } catch (error) {
        console.error('Error checking models:', error);
      } finally {
        setIsCheckingModels(false);
        setIsLoadingModels(false);
      }
    }
    checkAndLoadModels();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    
    // Navigate to results with query
    router.push({
      pathname: '/results',
      params: { query: query.trim() },
    });
    
    setIsLoading(false);
  }, [query]);

  // Show loading while checking model status
  if (isCheckingModels) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Ionicons name="book" size={64} color="#059669" />
          <Text style={styles.title}>Protocol Navigator</Text>
          <Text style={styles.subtitle}>
            {isLoadingModels ? 'Loading AI model...' : 'Offline semantic search for clinical guidelines'}
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Search clinical protocols</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., crushing chest pain, child fever, difficulty breathing..."
            placeholderTextColor="#94a3b8"
            value={query}
            onChangeText={setQuery}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.submitButton, !query.trim() && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!query.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="search" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>Search Protocols</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.examples}>
          <Text style={styles.examplesTitle}>Example searches:</Text>
          {[
            "crushing chest pain",
            "child with high fever",
            "difficulty breathing at rest",
            "severe headache sudden onset",
            "uncontrolled bleeding",
            "suspected stroke symptoms",
          ].map((example, i) => (
            <TouchableOpacity 
              key={i} 
              style={styles.exampleItem}
              onPress={() => setQuery(example)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#64748b" />
              <Text style={styles.exampleText}>{example}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#059669" />
          <Text style={styles.infoText}>
            Search is powered by MedSigLIP AI embeddings. All processing happens on-device - no internet required.
          </Text>
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
    textAlign: 'center',
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
    minHeight: 100,
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
    backgroundColor: '#059669',
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 24,
    padding: 16,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#065f46',
    lineHeight: 20,
  },
});
