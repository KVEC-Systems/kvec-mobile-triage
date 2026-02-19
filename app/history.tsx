import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { loadPCRHistory, deletePCR, type SavedPCR } from '../lib/storage';

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<SavedPCR[]>([]);
  const [selectedPCR, setSelectedPCR] = useState<SavedPCR | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadPCRHistory().then(setHistory);
    }, [])
  );

  const handleDelete = (id: string) => {
    Alert.alert('Delete Report', 'Are you sure you want to delete this PCR?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePCR(id);
          setHistory(prev => prev.filter(p => p.id !== id));
          if (selectedPCR?.id === id) setSelectedPCR(null);
        },
      },
    ]);
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Report copied to clipboard');
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Extract first line after CHIEF COMPLAINT as excerpt
  const getExcerpt = (pcrText: string): string => {
    const match = pcrText.match(/CHIEF COMPLAINT[:\s]*([^\n]+)/i);
    if (match) return match[1].trim().substring(0, 60);
    // Fallback: first non-empty line
    const firstLine = pcrText.split('\n').find(l => l.trim().length > 0);
    return firstLine?.trim().substring(0, 60) || 'Patient Care Report';
  };

  // Detail view
  if (selectedPCR) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setSelectedPCR(null)}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {getExcerpt(selectedPCR.pcrText)}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => handleCopy(selectedPCR.pcrText)}
          >
            <Ionicons name="copy-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
          <Text style={styles.detailDate}>{formatDate(selectedPCR.createdAt)}</Text>

          <Text style={styles.detailSectionTitle}>Clinical Notes</Text>
          <View style={styles.detailCard}>
            <Text style={styles.detailText}>{selectedPCR.clinicalNotes}</Text>
          </View>

          <Text style={styles.detailSectionTitle}>Patient Care Report</Text>
          <View style={styles.detailCard}>
            <Text style={styles.detailText}>{selectedPCR.pcrText}</Text>
          </View>

          {selectedPCR.triageAssessment && (
            <>
              <Text style={[styles.detailSectionTitle, { color: '#f59e0b' }]}>
                Triage Assessment
              </Text>
              <View style={[styles.detailCard, { borderColor: '#92400e' }]}>
                <Text style={styles.detailText}>{selectedPCR.triageAssessment}</Text>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // List view
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>Report History</Text>
        <View style={{ width: 40 }} />
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="documents-outline" size={48} color="#94a3b8" />
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.emptySubtitle}>
            Generated PCRs will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => setSelectedPCR(item)}
              onLongPress={() => handleDelete(item.id)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardExcerpt} numberOfLines={1}>
                  {getExcerpt(item.pcrText)}
                </Text>
                {item.triageAssessment && (
                  <View style={styles.triageBadge}>
                    <Text style={styles.triageBadgeText}>Triaged</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e2e8f0',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardExcerpt: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  triageBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  triageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f59e0b',
  },
  cardDate: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 6,
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    padding: 16,
    paddingBottom: 32,
  },
  detailDate: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginTop: 16,
    marginBottom: 8,
  },
  detailCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detailText: {
    fontSize: 14,
    color: '#e2e8f0',
    lineHeight: 22,
  },
});
