import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  LayoutAnimation,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { areModelsReady } from '../lib/download';
import { initializeLLM, generatePCR, generateTriageAssessment, isLLMReady } from '../lib/llm';
import { HamburgerMenu } from '../components/HamburgerMenu';
import { savePCR, updateTriageAssessment } from '../lib/storage';

type Screen = 'transcript' | 'pcr';

// Parse thinking tokens from LLM output
function parseThinkingTokens(text: string): { thinking: string | null; content: string } {
  const thinkingStart = '<unused94>thought';
  const thinkingEnd = '<unused95>';
  
  const startIdx = text.indexOf(thinkingStart);
  const endIdx = text.indexOf(thinkingEnd);
  
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const thinking = text.substring(startIdx + thinkingStart.length, endIdx).trim();
    const content = text.substring(endIdx + thinkingEnd.length).trim();
    return { thinking, content };
  }
  
  return { thinking: null, content: text };
}

// Collapsible Thinking Box Component
function ThinkingBox({ thinking }: { thinking: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };
  
  return (
    <View style={thinkingStyles.container}>
      <TouchableOpacity style={thinkingStyles.header} onPress={toggleExpanded}>
        <Ionicons 
          name="bulb-outline" 
          size={16} 
          color="#7C3AED"
        />
        <Text style={thinkingStyles.headerText}>Thinking</Text>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#7C3AED" 
        />
      </TouchableOpacity>
      {isExpanded && (
        <View style={thinkingStyles.content}>
          <Text style={thinkingStyles.contentText}>{thinking}</Text>
        </View>
      )}
    </View>
  );
}

const thinkingStyles = StyleSheet.create({
  container: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
  },
  headerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
  },
  content: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
  },
  contentText: {
    fontSize: 12,
    color: '#6366f1',
    lineHeight: 18,
  },
});

// PCR section icons
const PCR_SECTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'CHIEF COMPLAINT': 'alert-circle',
  'HPI': 'document-text',
  'VITALS': 'pulse',
  'PHYSICAL EXAM': 'body',
  'ASSESSMENT': 'medkit',
  'INTERVENTIONS': 'bandage',
  'DISPOSITION': 'car',
};

// Triage section icons
const TRIAGE_SECTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'ACUITY': 'warning',
  'DIFFERENTIAL DX': 'list',
  'RECOMMENDED INTERVENTIONS': 'bandage',
  'TRANSPORT PRIORITY': 'car',
};

interface ParsedSection {
  title: string;
  content: string;
}

// Parse structured LLM output into sections
function parseSections(text: string, sectionNames: string[]): ParsedSection[] | null {
  const sections: ParsedSection[] = [];
  // Build regex: match any section name at start of line followed by colon
  const pattern = new RegExp(
    `^(${sectionNames.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:`,
    'gm'
  );

  const matches = [...text.matchAll(pattern)];
  if (matches.length < 2) return null; // Not enough sections to parse

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const title = match[1];
    const contentStart = match.index! + match[0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const content = text.substring(contentStart, contentEnd).trim();
    sections.push({ title, content });
  }

  return sections;
}

// Section Card component
function SectionCard({ section, icons, accentColor = '#2563EB' }: {
  section: ParsedSection;
  icons: Record<string, keyof typeof Ionicons.glyphMap>;
  accentColor?: string;
}) {
  const icon = icons[section.title] || 'information-circle';
  return (
    <View style={sectionStyles.card}>
      <View style={[sectionStyles.cardHeader, { backgroundColor: accentColor + '12' }]}>
        <Ionicons name={icon} size={14} color={accentColor} />
        <Text style={[sectionStyles.cardTitle, { color: accentColor }]}>{section.title}</Text>
      </View>
      <Text style={sectionStyles.cardContent}>{section.content}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardContent: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 4,
  },
});

export default function PCRRecorderScreen() {
  const [screen, setScreen] = useState<Screen>('transcript');
  const [isCheckingModels, setIsCheckingModels] = useState(true);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Transcript state
  const [transcript, setTranscript] = useState('');
  
  // PCR state
  const [pcrText, setPcrText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingPcr, setStreamingPcr] = useState('');

  // Triage assessment state
  const [triageText, setTriageText] = useState('');
  const [isAssessing, setIsAssessing] = useState(false);
  const [streamingTriage, setStreamingTriage] = useState('');

  const savedPcrId = useRef<string | null>(null);

  const insets = useSafeAreaInsets();

  // Check models on mount — load LLM on demand when user taps Generate
  useEffect(() => {
    async function checkModels() {
      try {
        console.log('[PCR] Checking model files...');
        const available = await areModelsReady();
        if (!available) {
          console.log('[PCR] Models not downloaded, redirecting to download screen');
          router.replace('/download');
          return;
        }
        console.log('[PCR] Models available, ready for on-demand loading');
      } catch (error) {
        console.error('[PCR] Error during startup:', error);
      } finally {
        setIsCheckingModels(false);
        setIsLoadingModels(false);
      }
    }
    checkModels();
  }, []);

  // Generate PCR
  const handleGeneratePCR = useCallback(async () => {
    if (!transcript.trim()) return;
    
    setIsGenerating(true);
    setStreamingPcr('');
    setScreen('pcr');
    
    try {
      // Load LLM on demand (text-only, no vision needed for PCR)
      if (!isLLMReady()) {
        console.log('[PCR] Loading LLM model (text-only)...');
        const success = await initializeLLM(false);
        console.log('[PCR] LLM load result:', success);
        if (!success) {
          throw new Error('Failed to load LLM model');
        }
      } else {
        console.log('[PCR] LLM already loaded, reusing');
      }
      console.log('[PCR] Starting generation, transcript length:', transcript.length);
      let fullPcr = '';
      await generatePCR(transcript, (token) => {
        fullPcr += token;
        setStreamingPcr(fullPcr);
      });
      console.log('[PCR] Generation complete, length:', fullPcr.length);
      setPcrText(fullPcr);
      // Auto-save to history
      const saved = await savePCR(transcript, fullPcr);
      savedPcrId.current = saved.id;
      setStreamingPcr('');
    } catch (error) {
      console.error('[PCR] Failed to generate:', error);
      Alert.alert('Error', `Failed to generate PCR: ${error}`);
      setScreen('transcript');
    } finally {
      setIsGenerating(false);
    }
  }, [transcript]);

  // Copy PCR to clipboard (content only, no thinking tokens)
  const handleCopy = useCallback(async () => {
    const { content } = parseThinkingTokens(pcrText);
    await Clipboard.setStringAsync(content);
    Alert.alert('Copied', 'PCR copied to clipboard');
  }, [pcrText]);

  // Reset for new report
  const handleNewReport = useCallback(() => {
    setTranscript('');
    setPcrText('');
    setTriageText('');
    setStreamingTriage('');
    savedPcrId.current = null;
    setScreen('transcript');
  }, []);

  // Generate triage assessment from PCR
  const handleTriageAssessment = useCallback(async () => {
    if (!pcrText.trim()) return;

    setIsAssessing(true);
    setStreamingTriage('');

    try {
      const { content } = parseThinkingTokens(pcrText);
      let fullTriage = '';
      await generateTriageAssessment(content, (token) => {
        fullTriage += token;
        setStreamingTriage(fullTriage);
      });
      setTriageText(fullTriage);
      // Update saved PCR with triage assessment
      if (savedPcrId.current) {
        await updateTriageAssessment(savedPcrId.current, fullTriage);
      }
      setStreamingTriage('');
    } catch (error) {
      console.error('Failed to generate triage assessment:', error);
      Alert.alert('Error', 'Failed to generate triage assessment');
    } finally {
      setIsAssessing(false);
    }
  }, [pcrText]);

  // Loading state
  if (isCheckingModels) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <HamburgerMenu />
        <View style={styles.headerTitleContainer}>
          <Ionicons name="medical" size={28} color="#2563EB" />
          <Text style={styles.headerTitle}>Patient Care Report</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>
      
      {isLoadingModels && (
        <View style={styles.modelLoadingBanner}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.modelLoadingText}>Loading AI models...</Text>
        </View>
      )}

      {/* Clinical Notes Screen */}
      {screen === 'transcript' && (
        <KeyboardAvoidingView
          style={styles.screenContent}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Clinical Notes</Text>

              <TextInput
                style={styles.transcriptInput}
                placeholder="Enter your clinical notes here..."
                placeholderTextColor="#94A3B8"
                value={transcript}
                onChangeText={setTranscript}
                multiline
                textAlignVertical="top"
              />

              <View style={[styles.buttonRow, { paddingBottom: insets.bottom + 16 }]}>
                <TouchableOpacity
                  style={[styles.primaryButton, !transcript.trim() && styles.buttonDisabled]}
                  onPress={handleGeneratePCR}
                  disabled={!transcript.trim()}
                >
                  <Text style={styles.primaryButtonText}>Generate PCR</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      )}

      {/* PCR Output Screen */}
      {screen === 'pcr' && (
        <View style={styles.screenContent}>
          <Text style={styles.sectionTitle}>Patient Care Report</Text>
          
          <ScrollView style={styles.pcrContainer}>
            {(() => {
              const displayText = streamingPcr || pcrText || '';
              const { thinking, content } = parseThinkingTokens(displayText);
              const pcrSectionNames = Object.keys(PCR_SECTION_ICONS);
              // Parse into cards when generation is done, fall back to plain text while streaming
              const sections = !isGenerating && content ? parseSections(content, pcrSectionNames) : null;

              return (
                <>
                  {thinking && <ThinkingBox thinking={thinking} />}
                  {sections ? (
                    sections.map((section, idx) => (
                      <SectionCard key={idx} section={section} icons={PCR_SECTION_ICONS} />
                    ))
                  ) : (
                    <Text style={styles.pcrText}>
                      {content || (isGenerating ? 'Generating...' : '')}
                    </Text>
                  )}
                </>
              );
            })()}
            {isGenerating && (
              <ActivityIndicator size="small" color="#2563EB" style={styles.generatingIndicator} />
            )}

            {/* Triage Assessment Section */}
            {(triageText || streamingTriage) && (
              <View style={styles.triageSection}>
                <Text style={styles.triageSectionTitle}>Triage Assessment</Text>
                {(() => {
                  const displayTriage = streamingTriage || triageText || '';
                  const { thinking, content } = parseThinkingTokens(displayTriage);
                  const triageSectionNames = Object.keys(TRIAGE_SECTION_ICONS);
                  const sections = !isAssessing && content ? parseSections(content, triageSectionNames) : null;
                  return (
                    <>
                      {thinking && <ThinkingBox thinking={thinking} />}
                      {sections ? (
                        sections.map((section, idx) => (
                          <SectionCard key={idx} section={section} icons={TRIAGE_SECTION_ICONS} accentColor="#d97706" />
                        ))
                      ) : (
                        <Text style={styles.pcrText}>
                          {content || (isAssessing ? 'Analyzing...' : '')}
                        </Text>
                      )}
                    </>
                  );
                })()}
                {isAssessing && (
                  <ActivityIndicator size="small" color="#f59e0b" style={styles.generatingIndicator} />
                )}
              </View>
            )}
          </ScrollView>
          
          <View style={[styles.buttonRow, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={[styles.pcrButton, styles.pcrButtonSecondary]}
              onPress={() => setScreen('transcript')}
              disabled={isGenerating}
            >
              <Ionicons name="create-outline" size={18} color="#64748B" />
              <Text style={styles.pcrButtonSecondaryText}>Edit</Text>
            </TouchableOpacity>

            {!triageText && !isAssessing && pcrText && !isGenerating && (
              <TouchableOpacity
                style={[styles.pcrButton, styles.pcrButtonTriage]}
                onPress={handleTriageAssessment}
              >
                <Ionicons name="analytics" size={18} color="#fff" />
                <Text style={styles.pcrButtonTriageText}>Triage</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.pcrButton, styles.pcrButtonCopy, isGenerating && styles.buttonDisabled]}
              onPress={handleCopy}
              disabled={isGenerating || !pcrText}
            >
              <Ionicons name="copy-outline" size={18} color="#fff" />
              <Text style={styles.pcrButtonCopyText}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pcrButton, styles.pcrButtonNew]}
              onPress={handleNewReport}
              disabled={isGenerating}
            >
              <Ionicons name="add" size={18} color="#2563EB" />
              <Text style={styles.pcrButtonNewText}>New</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  chatButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modelLoadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  modelLoadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  screenContent: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  transcriptInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#1E293B',
    lineHeight: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  pcrButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  pcrButtonSecondary: {
    backgroundColor: '#E2E8F0',
  },
  pcrButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  pcrButtonTriage: {
    backgroundColor: '#d97706',
  },
  pcrButtonTriageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  pcrButtonCopy: {
    backgroundColor: '#059669',
  },
  pcrButtonCopyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  pcrButtonNew: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  pcrButtonNewText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pcrContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pcrText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  generatingIndicator: {
    marginTop: 16,
  },
  triageSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
  },
  triageSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f59e0b',
    marginBottom: 12,
  },
});
