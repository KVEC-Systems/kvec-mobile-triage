import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  checkModelStatus,
  downloadAllModels,
  getRemainingDownloadSize,
  formatBytes,
  type DownloadProgress,
} from '../lib/download';

type DownloadState = 'checking' | 'ready' | 'downloading' | 'complete' | 'error';

export default function DownloadScreen() {
  const [state, setState] = useState<DownloadState>('checking');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadSize, setDownloadSize] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // Check model status on mount
  useEffect(() => {
    async function check() {
      try {
        const status = await checkModelStatus();
        const isComplete = status.medgemma.ggufExists && 
          status.medgemma.mmprojExists && status.voxtral.ggufExists;
        
        if (isComplete) {
          setState('complete');
          setTimeout(() => router.replace('/'), 500);
        } else {
          const size = await getRemainingDownloadSize();
          setDownloadSize(size);
          setState('ready');
        }
      } catch (error) {
        console.error('Error checking models:', error);
        setState('error');
        setErrorMessage('Failed to check model status');
      }
    }
    check();
  }, []);

  const handleDownload = useCallback(async () => {
    setState('downloading');
    setErrorMessage(null);
    
    try {
      const success = await downloadAllModels((prog) => {
        setProgress(prog);
      });
      
      if (success) {
        setState('complete');
        setTimeout(() => router.replace('/'), 500);
      } else {
        setState('error');
        setErrorMessage('Download failed. Please try again.');
      }
    } catch (error) {
      console.error('Download error:', error);
      setState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Download failed. Check your connection.'
      );
    }
  }, []);

  const renderContent = () => {
    switch (state) {
      case 'checking':
        return (
          <>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.statusText}>Checking models...</Text>
          </>
        );

      case 'ready':
        return (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="cloud-download" size={64} color="#2563EB" />
            </View>
            <Text style={styles.title}>Download AI Models</Text>
            <Text style={styles.description}>
              Download Voxtral (speech-to-text) and MedGemma (AI assistant) 
              for on-device PCR generation, works completely offline.
            </Text>
            <View style={styles.sizeInfo}>
              <Ionicons name="download-outline" size={18} color="#94A3B8" />
              <Text style={styles.sizeText}>
                Download size: {formatBytes(downloadSize)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={handleDownload}
            >
              <Ionicons name="download" size={20} color="#fff" />
              <Text style={styles.downloadButtonText}>Download Model</Text>
            </TouchableOpacity>
          </>
        );

      case 'downloading':
        return (
          <>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${progress?.percent || 0}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {progress?.percent || 0}%
              </Text>
            </View>
            <Text style={styles.statusText}>
              Downloading {progress?.modelName || 'model'}...
            </Text>
            <Text style={styles.sizeText}>
              {formatBytes(progress?.current || 0)} / {formatBytes(progress?.total || downloadSize)}
            </Text>
          </>
        );

      case 'complete':
        return (
          <>
            <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
            <Text style={styles.statusText}>Download complete!</Text>
          </>
        );

      case 'error':
        return (
          <>
            <Ionicons name="alert-circle" size={64} color="#dc2626" />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleDownload}
            >
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.downloadButtonText}>Retry Download</Text>
            </TouchableOpacity>
          </>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {renderContent()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  sizeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
    padding: 12,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
  },
  sizeText: {
    fontSize: 14,
    color: '#64748B',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  downloadButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563EB',
  },
  progressText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  statusText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
});
