import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { 
  searchProtocols, 
  initializeSemanticSearch, 
  isSemanticSearchReady,
  type SearchResult 
} from '../lib/semantic-search';

// Source badge colors
const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  who: { bg: '#dbeafe', text: '#1e40af' },
  cdc: { bg: '#fef3c7', text: '#92400e' },
  nice: { bg: '#dcfce7', text: '#166534' },
  icrc: { bg: '#fee2e2', text: '#991b1b' },
};

export default function ResultsScreen() {
  const { query } = useLocalSearchParams<{ query: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchTime, setSearchTime] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function runSearch() {
      if (!query) return;
      
      const startTime = Date.now();
      
      try {
        // Initialize if not ready
        if (!isSemanticSearchReady()) {
          await initializeSemanticSearch();
        }
        
        // Run search
        const searchResults = await searchProtocols(query, 10);
        setResults(searchResults);
        setSearchTime(Date.now() - startTime);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    runSearch();
  }, [query]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Searching protocols...</Text>
        <Text style={styles.loadingSubtext}>Running on-device AI search</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}
    >
      {/* Query Card */}
      <View style={styles.queryCard}>
        <Text style={styles.queryLabel}>Search query:</Text>
        <Text style={styles.queryText}>"{query}"</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="flash" size={14} color="#64748b" />
            <Text style={styles.metaText}>{searchTime}ms</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="document-text" size={14} color="#64748b" />
            <Text style={styles.metaText}>{results.length} results</Text>
          </View>
        </View>
      </View>

      {/* Results */}
      {results.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color="#94a3b8" />
          <Text style={styles.emptyText}>No matching protocols found</Text>
          <Text style={styles.emptySubtext}>Try different search terms</Text>
        </View>
      ) : (
        results.map((result, index) => {
          const sourceColor = SOURCE_COLORS[result.source] || { bg: '#f1f5f9', text: '#475569' };
          const isExpanded = expandedId === result.id;
          
          return (
            <TouchableOpacity
              key={result.id}
              style={styles.resultCard}
              onPress={() => setExpandedId(isExpanded ? null : result.id)}
              activeOpacity={0.8}
            >
              <View style={styles.resultHeader}>
                <View style={[styles.sourceBadge, { backgroundColor: sourceColor.bg }]}>
                  <Text style={[styles.sourceBadgeText, { color: sourceColor.text }]}>
                    {result.source.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreText}>
                    {Math.round(result.score * 100)}% match
                  </Text>
                </View>
              </View>

              <Text style={styles.resultTitle} numberOfLines={isExpanded ? undefined : 2}>
                {result.title}
              </Text>

              <Text style={styles.resultText} numberOfLines={isExpanded ? undefined : 4}>
                {result.text}
              </Text>

              {isExpanded && result.url && (
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => Linking.openURL(result.url)}
                >
                  <Ionicons name="open-outline" size={16} color="#059669" />
                  <Text style={styles.linkText}>View source</Text>
                </TouchableOpacity>
              )}

              <View style={styles.expandHint}>
                <Ionicons 
                  name={isExpanded ? "chevron-up" : "chevron-down"} 
                  size={16} 
                  color="#94a3b8" 
                />
                <Text style={styles.expandHintText}>
                  {isExpanded ? "Show less" : "Tap to expand"}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={20} color="#059669" />
        <Text style={styles.backButtonText}>New Search</Text>
      </TouchableOpacity>

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Ionicons name="warning" size={16} color="#ca8a04" />
        <Text style={styles.disclaimerText}>
          These guidelines are for reference only. Always use clinical judgment and consult authoritative sources.
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
  queryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  queryLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  queryText: {
    fontSize: 16,
    color: '#1e293b',
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scoreBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
    lineHeight: 22,
  },
  resultText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 21,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '500',
  },
  expandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  expandHintText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
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
