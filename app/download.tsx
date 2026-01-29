import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  TextInput,
  type AppStateStatus,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  checkModelStatus,
  downloadGGUFModel,
  downloadSetFitModels,
  getRemainingDownloadSize,
  formatBytes,
  pauseDownload,
  hasResumableDownload,
  setHuggingFaceToken,
  hasHuggingFaceToken,
  type DownloadProgress,
} from '../lib/download';

export default function DownloadScreen() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'downloading' | 'complete' | 'error' | 'needsToken'>('checking');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadSize, setDownloadSize] = useState<number>(0);
  const [tokenInput, setTokenInput] = useState<string>('');
  const appState = useRef(AppState.currentState);

  // Handle app state changes to pause/resume download
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        // App going to background - pause download
        if (status === 'downloading') {
          console.log('App backgrounding, pausing download...');
          await pauseDownload();
        }
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [status]);

  // Check model status on mount
  useEffect(() => {
    async function check() {
      const modelStatus = await checkModelStatus();
      
      // LiteRT model is required for triage
      if (modelStatus.litertlm.exists) {
        // Model exists, can proceed to main screen
        setStatus('complete');
        setTimeout(() => router.replace('/'), 500);
      } else {
        const size = await getRemainingDownloadSize();
        setDownloadSize(size);
        
        // Check if HuggingFace token is set (required for gated models)
        const hasToken = await hasHuggingFaceToken();
        if (!hasToken) {
          setStatus('needsToken');
        } else {
          setStatus('ready');
        }
      }
    }
    check();
  }, []);

  const startDownload = useCallback(async () => {
    setStatus('downloading');
    setErrorMessage(null);

    try {
      // First download SetFit models (required, ~180MB total)
      setProgress({ modelName: 'SetFit Classification Models', current: 0, total: 180000000, percent: 0 });
      const setfitSuccess = await downloadSetFitModels((prog) => {
        setProgress(prog);
      });

      if (!setfitSuccess) {
        setStatus('error');
        setErrorMessage('Failed to download classification models. Please try again.');
        return;
      }

      // Then optionally download GGUF model (for follow-up chat, ~1.4GB)
      // For now, skip GGUF download to get user to fast triage quickly
      await downloadGGUFModel((prog) => setProgress(prog));

      setStatus('complete');
      setTimeout(() => router.replace('/'), 1000);
    } catch (error) {
      // Download was interrupted (likely app went to background)
      setStatus('ready');
      setErrorMessage('Download paused. Tap to resume.');
    }
  }, []);

  const skipDownload = useCallback(() => {
    // Skip to main screen without model (will use fallback triage)
    router.replace('/');
  }, []);

  const saveToken = useCallback(async () => {
    if (tokenInput.trim()) {
      await setHuggingFaceToken(tokenInput.trim());
      setStatus('ready');
    }
  }, [tokenInput]);

  if (status === 'checking') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.statusText}>Checking model status...</Text>
      </View>
    );
  }

  if (status === 'complete') {
    return (
      <View style={styles.container}>
        <Ionicons name="checkmark-circle" size={80} color="#16a34a" />
        <Text style={styles.title}>Model Ready!</Text>
        <Text style={styles.subtitle}>Launching KVEC Triage...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="cloud-download" size={80} color="#2563eb" />
      </View>

      <Text style={styles.title}>Download AI Model</Text>
      <Text style={styles.subtitle}>
        KVEC Triage uses an on-device AI model for{'\n'}intelligent symptom routing.
      </Text>

      {status === 'ready' && (
        <>
          <View style={styles.sizeCard}>
            <Ionicons name="document" size={24} color="#64748b" />
            <View>
              <Text style={styles.sizeLabel}>Download Size</Text>
              <Text style={styles.sizeValue}>{formatBytes(downloadSize)}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.downloadButton} onPress={startDownload}>
            <Ionicons name="download" size={24} color="#fff" />
            <Text style={styles.downloadButtonText}>Download Model</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={skipDownload}>
            <Text style={styles.skipButtonText}>Skip for now (limited features)</Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'needsToken' && (
        <View style={styles.tokenContainer}>
          <Text style={styles.tokenTitle}>HuggingFace Token Required</Text>
          <Text style={styles.tokenDesc}>
            The Gemma model requires accepting Google's license.{"\n"}
            1. Go to huggingface.co/google/gemma-3n-E2B-it-litert-lm{"\n"}
            2. Log in and accept the license{"\n"}
            3. Create a Read token at huggingface.co/settings/tokens
          </Text>
          
          <TextInput
            style={styles.tokenInput}
            placeholder="hf_xxxxxxxxxxxx"
            placeholderTextColor="#94a3b8"
            value={tokenInput}
            onChangeText={setTokenInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          <TouchableOpacity 
            style={[styles.downloadButton, !tokenInput.trim() && styles.buttonDisabled]} 
            onPress={saveToken}
            disabled={!tokenInput.trim()}
          >
            <Ionicons name="key" size={24} color="#fff" />
            <Text style={styles.downloadButtonText}>Save Token</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={skipDownload}>
            <Text style={styles.skipButtonText}>Skip for now (limited features)</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'downloading' && progress && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>{progress.modelName}</Text>
          
          <View style={styles.progressBarOuter}>
            <View 
              style={[styles.progressBarInner, { width: `${progress.percent}%` }]} 
            />
          </View>

          <View style={styles.progressStats}>
            <Text style={styles.progressText}>
              {formatBytes(progress.current)} / {formatBytes(progress.total)}
            </Text>
            <Text style={styles.progressPercent}>{progress.percent}%</Text>
          </View>

          <Text style={styles.progressHint}>
            This may take a few minutes on mobile data
          </Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#dc2626" />
          <Text style={styles.errorText}>{errorMessage}</Text>
          
          <TouchableOpacity style={styles.retryButton} onPress={startDownload}>
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.retryButtonText}>Retry Download</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={skipDownload}>
            <Text style={styles.skipButtonText}>Continue without AI model</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  statusText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 16,
  },
  sizeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sizeLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  sizeValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#2563eb',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
  },
  downloadButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  skipButton: {
    padding: 12,
  },
  skipButtonText: {
    fontSize: 14,
    color: '#64748b',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 16,
  },
  progressBarOuter: {
    width: '100%',
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#64748b',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  progressHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 24,
  },
  errorContainer: {
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  tokenContainer: {
    width: '100%',
    alignItems: 'center',
  },
  tokenTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  tokenDesc: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'left',
    lineHeight: 22,
    marginBottom: 20,
  },
  tokenInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
    color: '#1e293b',
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
  },
});
