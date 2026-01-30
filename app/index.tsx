import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder } from '@siteed/expo-audio-studio';
import * as Clipboard from 'expo-clipboard';
import { areModelsReady } from '../lib/download';
import { initializeLLM, generatePCR, isLLMReady } from '../lib/llm';
import { HamburgerMenu } from '../components/HamburgerMenu';

type Screen = 'record' | 'transcript' | 'pcr';

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
          color="#a78bfa" 
        />
        <Text style={thinkingStyles.headerText}>Thinking</Text>
        <Ionicons 
          name={isExpanded ? 'chevron-up' : 'chevron-down'} 
          size={16} 
          color="#a78bfa" 
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
    backgroundColor: '#1e1b4b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4c1d95',
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
    color: '#a78bfa',
  },
  content: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#4c1d95',
  },
  contentText: {
    fontSize: 12,
    color: '#c4b5fd',
    lineHeight: 18,
  },
});

export default function PCRRecorderScreen() {
  const [screen, setScreen] = useState<Screen>('transcript'); // Start with notes input
  const [isCheckingModels, setIsCheckingModels] = useState(true);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  // Recording state - using expo-audio-studio
  const audioRecorder = useAudioRecorder();
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Transcript state
  const [transcript, setTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  // PCR state
  const [pcrText, setPcrText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingPcr, setStreamingPcr] = useState('');
  
  const insets = useSafeAreaInsets();

  // Check models on mount
  useEffect(() => {
    async function checkModels() {
      try {
        const available = await areModelsReady();
        if (!available) {
          router.replace('/download');
          return;
        }
        setIsCheckingModels(false);
        setIsLoadingModels(true);
        await initializeLLM();
      } catch (error) {
        console.error('Error checking models:', error);
      } finally {
        setIsCheckingModels(false);
        setIsLoadingModels(false);
      }
    }
    checkModels();
  }, []);

  // Recording functions using expo-audio-studio
  const startRecording = useCallback(async () => {
    try {
      // Request permission using expo-audio-studio
      const { ExpoAudioStreamModule } = await import('@siteed/expo-audio-studio');
      const { granted } = await ExpoAudioStreamModule.requestPermissionsAsync();
      
      if (!granted) {
        Alert.alert('Permission Denied', 'Microphone permission is required to record audio.');
        return;
      }
      
      // Start recording with 16kHz mono PCM for ASR
      // Disable notification/keepAwake to avoid foreground service issues
      await audioRecorder.startRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        showNotification: false,
        keepAwake: false,
      });
      
      setRecordingDuration(0);
      
      // Start timer
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  }, [audioRecorder]);

  const stopRecording = useCallback(async () => {
    if (!audioRecorder.isRecording) return;
    
    try {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      
      const result = await audioRecorder.stopRecording();
      
      if (result?.fileUri) {
        // ASR disabled - requires mel spectrogram preprocessing
        // For now, prompt user to type their notes
        setTranscript(`[Recording saved: ${formatTime(recordingDuration)}]\n\nType your clinical notes here. The AI will generate a PCR from this text.`);
        setScreen('transcript');
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, [audioRecorder, recordingDuration]);

  // Generate PCR
  const handleGeneratePCR = useCallback(async () => {
    if (!transcript.trim()) return;
    
    setIsGenerating(true);
    setStreamingPcr('');
    setScreen('pcr');
    
    try {
      let fullPcr = '';
      await generatePCR(transcript, (token) => {
        fullPcr += token;
        setStreamingPcr(fullPcr);
      });
      setPcrText(fullPcr);
      setStreamingPcr('');
    } catch (error) {
      console.error('Failed to generate PCR:', error);
      Alert.alert('Error', 'Failed to generate PCR');
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
    setRecordingDuration(0);
    setScreen('record');
  }, []);

  // Format time helper
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Loading state
  if (isCheckingModels) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
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
          <Ionicons name="medical" size={28} color="#6366f1" />
          <Text style={styles.headerTitle}>Patient Care Report</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>
      
      {isLoadingModels && (
        <View style={styles.modelLoadingBanner}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={styles.modelLoadingText}>Loading AI models...</Text>
        </View>
      )}

      {/* Record Screen */}
      {screen === 'record' && (
        <View style={styles.screenContent}>
          <View style={styles.recordingArea}>
            <Text style={styles.durationText}>{formatTime(recordingDuration)}</Text>
            
            {audioRecorder.isRecording && (
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingLabel}>Recording...</Text>
              </View>
            )}
            
            <TouchableOpacity
              style={[styles.recordButton, audioRecorder.isRecording && styles.recordButtonActive]}
              onPress={audioRecorder.isRecording ? stopRecording : startRecording}
            >
              <Ionicons 
                name={audioRecorder.isRecording ? 'stop' : 'mic'} 
                size={48} 
                color="#fff" 
              />
            </TouchableOpacity>
            
            <Text style={styles.recordHint}>
              {audioRecorder.isRecording 
                ? 'Tap to stop recording' 
                : 'Tap to start recording your notes'}
            </Text>
          </View>
          
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => {
              setTranscript('');
              setScreen('transcript');
            }}
          >
            <Text style={styles.skipButtonText}>Or type notes manually</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Clinical Notes Screen (Main) */}
      {screen === 'transcript' && (
        <View style={styles.screenContent}>
          {isTranscribing ? (
            <View style={styles.transcribingContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.transcribingText}>Processing...</Text>
            </View>
          ) : (
            <>
              <View style={styles.notesHeader}>
                <Text style={styles.sectionTitle}>Clinical Notes</Text>
                
                {/* Inline Recording Controls */}
                <View style={styles.micContainer}>
                  {audioRecorder.isRecording && (
                    <Text style={styles.micDuration}>{formatTime(recordingDuration)}</Text>
                  )}
                  <TouchableOpacity
                    style={[styles.micButton, audioRecorder.isRecording && styles.micButtonActive]}
                    onPress={audioRecorder.isRecording ? stopRecording : startRecording}
                  >
                    <Ionicons 
                      name={audioRecorder.isRecording ? 'stop' : 'mic'} 
                      size={22} 
                      color={audioRecorder.isRecording ? '#ef4444' : '#6366f1'} 
                    />
                  </TouchableOpacity>
                </View>
              </View>
              
              <TextInput
                style={styles.transcriptInput}
                placeholder="Enter your clinical notes here...\n\nExample: 65 yo male, chest pain, A&O x4, BP 158/94..."
                placeholderTextColor="#64748b"
                value={transcript}
                onChangeText={setTranscript}
                multiline
                textAlignVertical="top"
              />
              
              <View style={[styles.buttonRow, { paddingBottom: insets.bottom + 16 }]}>
                <TouchableOpacity
                  style={[styles.primaryButton, !transcript.trim() && styles.buttonDisabled]}
                  onPress={handleGeneratePCR}
                  disabled={!transcript.trim() || !isLLMReady()}
                >
                  <Text style={styles.primaryButtonText}>Generate PCR</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* PCR Output Screen */}
      {screen === 'pcr' && (
        <View style={styles.screenContent}>
          <Text style={styles.sectionTitle}>Patient Care Report</Text>
          
          <ScrollView style={styles.pcrContainer}>
            {(() => {
              const displayText = streamingPcr || pcrText || '';
              const { thinking, content } = parseThinkingTokens(displayText);
              
              return (
                <>
                  {thinking && <ThinkingBox thinking={thinking} />}
                  <Text style={styles.pcrText}>
                    {content || (isGenerating ? 'Generating...' : '')}
                  </Text>
                </>
              );
            })()}
            {isGenerating && (
              <ActivityIndicator size="small" color="#6366f1" style={styles.generatingIndicator} />
            )}
          </ScrollView>
          
          <View style={[styles.buttonRow, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setScreen('transcript')}
              disabled={isGenerating}
            >
              <Ionicons name="arrow-back" size={20} color="#94a3b8" />
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.copyButton, isGenerating && styles.buttonDisabled]}
              onPress={handleCopy}
              disabled={isGenerating || !pcrText}
            >
              <Ionicons name="copy-outline" size={20} color="#fff" />
              <Text style={styles.copyButtonText}>Copy</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.newButton}
              onPress={handleNewReport}
              disabled={isGenerating}
            >
              <Ionicons name="add" size={20} color="#6366f1" />
              <Text style={styles.newButtonText}>New</Text>
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
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  loadingText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    gap: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f1f5f9',
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
    backgroundColor: '#1e293b',
  },
  modelLoadingText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  screenContent: {
    flex: 1,
    padding: 16,
  },
  recordingArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationText: {
    fontSize: 64,
    fontWeight: '200',
    color: '#f1f5f9',
    fontVariant: ['tabular-nums'],
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 32,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  recordingLabel: {
    fontSize: 16,
    color: '#ef4444',
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 32,
  },
  recordButtonActive: {
    backgroundColor: '#ef4444',
  },
  recordHint: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  skipButton: {
    alignItems: 'center',
    padding: 16,
  },
  skipButtonText: {
    fontSize: 14,
    color: '#6366f1',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 16,
  },
  transcribingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transcribingText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 16,
  },
  transcriptInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#f1f5f9',
    lineHeight: 24,
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 16,
    backgroundColor: '#334155',
    borderRadius: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pcrContainer: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pcrText: {
    fontSize: 14,
    color: '#e2e8f0',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  generatingIndicator: {
    marginTop: 16,
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    padding: 16,
    borderRadius: 12,
  },
  copyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  newButtonText: {
    fontSize: 14,
    color: '#6366f1',
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  micContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  micDuration: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  micButtonActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
});
