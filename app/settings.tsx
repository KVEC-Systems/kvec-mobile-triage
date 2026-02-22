/**
 * Settings Page
 * Shows downloaded models and links to their sources
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { checkModelStatus, formatBytes, ModelStatus } from '../lib/download';

// Model metadata for display
const MODEL_INFO = {
  medgemmaGguf: {
    name: 'MedGemma 4B',
    description: 'Medical-tuned LLM for PCR generation and clinical chat',
    file: 'medgemma-4b-it-Q4_K_M.gguf',
    repo: 'unsloth/medgemma-4b-it-GGUF',
    size: 2490000000,
  },
  medgemmaMmproj: {
    name: 'MedGemma Vision Projector',
    description: 'Multimodal vision support for medical image analysis',
    file: 'mmproj-F16.gguf',
    repo: 'unsloth/medgemma-4b-it-GGUF',
    size: 945000000,
  },
  voxtralGguf: {
    name: 'Voxtral Mini 4B',
    description: 'Speech-to-text for clinical note dictation',
    file: 'Q4_0.gguf',
    repo: 'andrijdavid/Voxtral-Mini-4B-Realtime-2602-GGUF',
    size: 2500000000,
  },
};

const HF_BASE = 'https://huggingface.co';

export default function SettingsScreen() {
  const router = useRouter();
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadModelStatus();
  }, []);

  const loadModelStatus = async () => {
    setLoading(true);
    const status = await checkModelStatus();
    setModelStatus(status);
    setLoading(false);
  };

  const openHuggingFaceRepo = (repo: string) => {
    Linking.openURL(`${HF_BASE}/${repo}`);
  };

  const getModelDownloadStatus = (key: string): boolean => {
    if (!modelStatus) return false;

    switch (key) {
      case 'medgemmaGguf':
        return modelStatus.medgemma.ggufExists;
      case 'medgemmaMmproj':
        return modelStatus.medgemma.mmprojExists;
      case 'voxtralGguf':
        return modelStatus.voxtral.ggufExists;
      default:
        return false;
    }
  };

  const renderModelCard = (key: string, info: typeof MODEL_INFO.medgemmaGguf) => {
    const isDownloaded = getModelDownloadStatus(key);
    
    return (
      <TouchableOpacity
        key={key}
        style={styles.modelCard}
        onPress={() => openHuggingFaceRepo(info.repo)}
        activeOpacity={0.7}
      >
        <View style={styles.modelHeader}>
          <View style={styles.modelTitleRow}>
            <Text style={styles.modelName}>{info.name}</Text>
            <View style={[styles.statusBadge, isDownloaded ? styles.downloadedBadge : styles.notDownloadedBadge]}>
              <Ionicons 
                name={isDownloaded ? 'checkmark-circle' : 'cloud-download'} 
                size={14} 
                color={isDownloaded ? '#4ade80' : '#f59e0b'} 
              />
              <Text style={[styles.statusText, isDownloaded ? styles.downloadedText : styles.notDownloadedText]}>
                {isDownloaded ? 'Downloaded' : 'Not Downloaded'}
              </Text>
            </View>
          </View>
          <Text style={styles.modelDescription}>{info.description}</Text>
        </View>
        
        <View style={styles.modelDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>File:</Text>
            <Text style={styles.detailValue}>{info.file}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Size:</Text>
            <Text style={styles.detailValue}>{formatBytes(info.size)}</Text>
          </View>
        </View>
        
        <View style={styles.linkRow}>
          <Ionicons name="logo-github" size={16} color="#2563EB" />
          <Text style={styles.linkText}>View on HuggingFace</Text>
          <Ionicons name="open-outline" size={14} color="#2563EB" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Models Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Downloaded Models</Text>
          <Text style={styles.sectionSubtitle}>
            On-device AI models for offline PCR generation
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingText}>Checking model status...</Text>
            </View>
          ) : (
            <View style={styles.modelsList}>
              {Object.entries(MODEL_INFO).map(([key, info]) => renderModelCard(key, info))}
            </View>
          )}
        </View>

        {/* App Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.infoCard}>
            <Text style={styles.appName}>KVEC Triage</Text>
            <Text style={styles.appVersion}>Version 1.0.0</Text>
            <Text style={styles.appDescription}>
              On-device EMS Patient Care Report generator powered by MedGemma AI.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  modelsList: {
    gap: 12,
  },
  modelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modelHeader: {
    marginBottom: 12,
  },
  modelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  downloadedBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
  },
  notDownloadedBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  downloadedText: {
    color: '#4ade80',
  },
  notDownloadedText: {
    color: '#f59e0b',
  },
  modelDescription: {
    fontSize: 13,
    color: '#64748B',
  },
  modelDetails: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  detailValue: {
    fontSize: 13,
    color: '#1E293B',
    fontFamily: 'monospace',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: {
    fontSize: 14,
    color: '#2563EB',
    flex: 1,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  appName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
  },
  appDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
});
