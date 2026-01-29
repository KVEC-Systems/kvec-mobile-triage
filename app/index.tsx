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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { areModelsReady } from '../lib/download';
import { initializeLLM, generatePCR, isLLMReady } from '../lib/llm';

type Screen = 'record' | 'transcript' | 'pcr';

export default function PCRRecorderScreen() {
  const [screen, setScreen] = useState<Screen>('record');
  const [isCheckingModels, setIsCheckingModels] = useState(true);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  // Recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
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

  // Recording functions
  const startRecording = useCallback(async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start timer
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recording) return;
    
    try {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      
      if (uri) {
        // TODO: Transcribe using MedASR
        // For now, show placeholder and move to transcript screen
        setIsTranscribing(true);
        
        // Simulate transcription delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Placeholder - actual transcription will come from ASR
        setTranscript(`[Recording ${formatTime(recordingDuration)}]\n\nType or edit your clinical notes here. The AI will generate a PCR from this text.`);
        setIsTranscribing(false);
        setScreen('transcript');
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, [recording, recordingDuration]);

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

  // Copy PCR to clipboard
  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(pcrText);
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
        <Ionicons name="medical" size={28} color="#6366f1" />
        <Text style={styles.headerTitle}>EMS PCR Generator</Text>
        <TouchableOpacity 
          style={styles.chatButton}
          onPress={() => router.push('/chat')}
        >
          <Ionicons name="chatbubbles-outline" size={22} color="#94a3b8" />
        </TouchableOpacity>
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
            
            {isRecording && (
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingLabel}>Recording...</Text>
              </View>
            )}
            
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Ionicons 
                name={isRecording ? 'stop' : 'mic'} 
                size={48} 
                color="#fff" 
              />
            </TouchableOpacity>
            
            <Text style={styles.recordHint}>
              {isRecording 
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

      {/* Transcript Screen */}
      {screen === 'transcript' && (
        <View style={styles.screenContent}>
          {isTranscribing ? (
            <View style={styles.transcribingContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.transcribingText}>Transcribing audio...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Review & Edit Transcript</Text>
              <TextInput
                style={styles.transcriptInput}
                placeholder="Enter or edit your clinical notes..."
                placeholderTextColor="#64748b"
                value={transcript}
                onChangeText={setTranscript}
                multiline
                textAlignVertical="top"
              />
              
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setScreen('record')}
                >
                  <Ionicons name="arrow-back" size={20} color="#94a3b8" />
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </TouchableOpacity>
                
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
            <Text style={styles.pcrText}>
              {streamingPcr || pcrText || 'Generating...'}
            </Text>
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
});
