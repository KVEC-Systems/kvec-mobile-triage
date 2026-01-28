import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { initializeLLM, sendMessage, generateVisitSummary, type UrgencyLevel } from '../lib/llm';

interface DiagnosticAnswer {
  question: string;
  answer: string;
}

interface AssessmentUpdate {
  updatedUrgency?: UrgencyLevel;
  updatedRedFlags?: string[];
  additionalQuestions?: string[];
  summary?: string;
}

export default function DiagnosticScreen() {
  const params = useLocalSearchParams<{
    symptom: string;
    specialty: string;
    conditions: string;
    urgency: string;
    suggestedQuestions: string;
  }>();

  const symptom = params.symptom || '';
  const specialty = params.specialty || 'Primary Care';
  const conditions = params.conditions?.split(',').map(c => c.trim()) || [];
  const initialUrgency = (params.urgency || 'routine') as UrgencyLevel;
  const suggestedQuestions = params.suggestedQuestions?.split('|').filter(q => q.trim()) || [];

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [llmReady, setLlmReady] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentUpdate>({});
  const [allQuestions, setAllQuestions] = useState<string[]>(suggestedQuestions);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [visitSummary, setVisitSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryGenerated, setSummaryGenerated] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Initialize LLM
  useEffect(() => {
    initializeLLM().then(setLlmReady);
  }, []);

  // Keyboard handling for Android
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const currentQuestion = allQuestions[currentQuestionIndex];

  // Generate options based on question type
  const getOptionsForQuestion = (question: string): string[] => {
    const q = question.toLowerCase();
    
    // Duration questions
    if (q.includes('how long') || q.includes('when did') || q.includes('started')) {
      return ['Less than a day', 'A few days', '1-2 weeks', 'Several weeks', 'More than a month'];
    }
    // Severity questions
    if (q.includes('severe') || q.includes('pain level') || q.includes('how bad') || q.includes('rate')) {
      return ['Mild - barely noticeable', 'Moderate - uncomfortable', 'Severe - very painful', 'Extreme - unbearable'];
    }
    // Yes/No questions
    if (q.includes('have you') || q.includes('do you') || q.includes('are you') || q.includes('is there') || q.includes('did you')) {
      return ['Yes', 'No', 'Not sure'];
    }
    // Treatment questions
    if (q.includes('treatment') || q.includes('medication') || q.includes('tried')) {
      return ['No treatment yet', 'Over-the-counter meds', 'Prescription medication', 'Home remedies', 'Multiple treatments'];
    }
    // Frequency questions
    if (q.includes('how often') || q.includes('frequency') || q.includes('regularly')) {
      return ['Constantly', 'Several times a day', 'Daily', 'A few times a week', 'Occasionally'];
    }
    // Location questions
    if (q.includes('where') || q.includes('location') || q.includes('which area')) {
      return ['Head/Face', 'Chest', 'Abdomen', 'Back', 'Arms/Hands', 'Legs/Feet', 'Multiple areas'];
    }
    // Trigger questions
    if (q.includes('trigger') || q.includes('worse') || q.includes('better') || q.includes('affects')) {
      return ['Activity/Movement', 'Eating/Drinking', 'Stress', 'Weather', 'Time of day', 'Nothing specific'];
    }
    // Default options
    return ['Yes', 'No', 'Sometimes', 'Not applicable'];
  };

  const currentOptions = currentQuestion ? getOptionsForQuestion(currentQuestion) : [];

  const handleSubmitAnswer = useCallback(async () => {
    if (!currentAnswer.trim() || isProcessing) return;

    const answer = currentAnswer.trim();
    setCurrentAnswer('');
    setIsProcessing(true);

    // Save the answer
    const newAnswer: DiagnosticAnswer = {
      question: currentQuestion,
      answer,
    };
    const updatedAnswers = [...answers, newAnswer];
    setAnswers(updatedAnswers);

    // Check if we have more questions
    const nextIndex = currentQuestionIndex + 1;
    
    if (nextIndex < allQuestions.length) {
      // More questions to ask
      setCurrentQuestionIndex(nextIndex);
      setIsProcessing(false);
    } else if (llmReady) {
      // No more predefined questions - ask LLM for assessment or follow-up
      try {
        const prompt = buildAssessmentPrompt(symptom, specialty, conditions, updatedAnswers);
        const response = await sendMessage(prompt);
        const parsedAssessment = parseAssessmentResponse(response);
        
        setAssessment(parsedAssessment);
        
        if (parsedAssessment.additionalQuestions && parsedAssessment.additionalQuestions.length > 0) {
          // LLM wants to ask more questions
          setAllQuestions(prev => [...prev, ...parsedAssessment.additionalQuestions!]);
          setCurrentQuestionIndex(nextIndex);
        } else {
          // Assessment complete
          setIsComplete(true);
        }
      } catch (error) {
        console.error('Assessment error:', error);
        setIsComplete(true);
      }
    } else {
      // LLM not ready, just complete
      setIsComplete(true);
    }
    
    setIsProcessing(false);
  }, [currentAnswer, isProcessing, currentQuestion, answers, currentQuestionIndex, allQuestions, llmReady, symptom, specialty, conditions]);

  // Scroll to bottom when answers change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [answers, currentQuestionIndex]);

  const urgencyColor = 
    (assessment.updatedUrgency || initialUrgency) === 'emergency' ? '#dc2626' : 
    (assessment.updatedUrgency || initialUrgency) === 'urgent' ? '#ea580c' : '#16a34a';

  if (allQuestions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerTitle: 'Assessment' }} />
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={64} color="#94a3b8" />
          <Text style={styles.emptyTitle}>No questions available</Text>
          <Text style={styles.emptyText}>The initial triage didn't generate follow-up questions.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerTitle: 'Assessment' }} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 60}
      >
        {/* Triage Summary Header */}
        <View style={styles.summaryHeader}>
          <View style={styles.summaryRow}>
            <Ionicons name="medical" size={20} color="#2563eb" />
            <Text style={styles.summarySpecialty}>{specialty}</Text>
          </View>
          <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor }]}>
            <Text style={styles.urgencyText}>
              {(assessment.updatedUrgency || initialUrgency).toUpperCase()}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Progress indicator */}
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              Question {Math.min(currentQuestionIndex + 1, allQuestions.length)} of {allQuestions.length}
              {isComplete ? ' - Complete' : ''}
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${((currentQuestionIndex + (isComplete ? 1 : 0)) / allQuestions.length) * 100}%` }
                ]} 
              />
            </View>
          </View>

          {/* Previous Q&A */}
          {answers.map((qa, index) => (
            <View key={index} style={styles.qaCard}>
              <View style={styles.questionRow}>
                <Ionicons name="help-circle" size={18} color="#2563eb" />
                <Text style={styles.questionText}>{qa.question}</Text>
              </View>
              <View style={styles.answerRow}>
                <Ionicons name="chatbubble" size={16} color="#16a34a" />
                <Text style={styles.answerText}>{qa.answer}</Text>
              </View>
            </View>
          ))}

          {/* Current question or completion */}
          {isComplete ? (
            <View style={styles.completionCard}>
              <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
              <Text style={styles.completionTitle}>Assessment Complete</Text>
              
              {assessment.summary && (
                <Text style={styles.summaryText}>{assessment.summary}</Text>
              )}

              {assessment.updatedRedFlags && assessment.updatedRedFlags.length > 0 && (
                <View style={styles.redFlagsSection}>
                  <Text style={styles.redFlagsLabel}>Important Notes:</Text>
                  {assessment.updatedRedFlags.map((flag, i) => (
                    <View key={i} style={styles.redFlagItem}>
                      <Ionicons name="alert-circle" size={16} color="#dc2626" />
                      <Text style={styles.redFlagText}>{flag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Summary Generation Section */}
              {!summaryGenerated ? (
                <TouchableOpacity 
                  style={styles.generateButton}
                  onPress={async () => {
                    setIsGeneratingSummary(true);
                    try {
                      const summary = await generateVisitSummary({
                        symptom,
                        specialty,
                        conditions,
                        urgency: assessment.updatedUrgency || initialUrgency,
                        redFlags: assessment.updatedRedFlags || [],
                        qaPairs: answers,
                        assessmentSummary: assessment.summary,
                      });
                      setVisitSummary(summary);
                      setSummaryGenerated(true);
                    } catch (error) {
                      console.error('Summary generation error:', error);
                    }
                    setIsGeneratingSummary(false);
                  }}
                  disabled={isGeneratingSummary}
                >
                  {isGeneratingSummary ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="document-text" size={18} color="#fff" />
                  )}
                  <Text style={styles.generateButtonText}>
                    {isGeneratingSummary ? 'Generating...' : 'Generate Visit Summary'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.generatedSummaryContainer}>
                  <Text style={styles.generatedSummaryTitle}>Visit Summary</Text>
                  <ScrollView 
                    style={styles.summaryScrollView}
                    nestedScrollEnabled
                  >
                    <Text style={styles.generatedSummaryText}>{visitSummary}</Text>
                  </ScrollView>
                  <View style={styles.summaryActions}>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={async () => {
                        if (visitSummary) {
                          await Clipboard.setStringAsync(visitSummary);
                        }
                      }}
                    >
                      <Ionicons name="copy" size={18} color="#2563eb" />
                      <Text style={styles.actionButtonText}>Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={async () => {
                        if (visitSummary) {
                          await Share.share({ message: visitSummary });
                        }
                      }}
                    >
                      <Ionicons name="share" size={18} color="#2563eb" />
                      <Text style={styles.actionButtonText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <TouchableOpacity 
                style={styles.doneButton}
                onPress={() => router.back()}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.currentQuestionCard}>
              <Ionicons name="help-circle" size={24} color="#2563eb" />
              <Text style={styles.currentQuestionText}>{currentQuestion}</Text>
            </View>
          )}
        </ScrollView>

        {/* Options area */}
        {!isComplete && (
          <View style={styles.optionsContainer}>
            {isProcessing ? (
              <View style={styles.processingState}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.processingText}>Processing...</Text>
              </View>
            ) : (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.optionsScroll}
              >
                {currentOptions.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.optionButton}
                    onPress={() => {
                      setCurrentAnswer(option);
                      // Auto-submit after a brief delay
                      setTimeout(() => {
                        const syntheticAnswer = option;
                        setCurrentAnswer('');
                        // Inline submit logic
                        const newAnswer: DiagnosticAnswer = {
                          question: currentQuestion,
                          answer: syntheticAnswer,
                        };
                        const updatedAnswers = [...answers, newAnswer];
                        setAnswers(updatedAnswers);
                        
                        const nextIndex = currentQuestionIndex + 1;
                        if (nextIndex < allQuestions.length) {
                          setCurrentQuestionIndex(nextIndex);
                        } else {
                          setIsComplete(true);
                        }
                      }, 100);
                    }}
                  >
                    <Text style={styles.optionText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function buildAssessmentPrompt(
  symptom: string,
  specialty: string,
  conditions: string[],
  answers: DiagnosticAnswer[]
): string {
  const qaHistory = answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
  
  return `You are a medical triage assistant. Based on the patient's symptoms and their answers to follow-up questions, provide an updated assessment.

Initial complaint: "${symptom}"
Specialty: ${specialty}
Possible conditions: ${conditions.join(', ')}

Follow-up Q&A:
${qaHistory}

Based on these answers, provide:
1. URGENCY: [emergency/urgent/routine] - has urgency changed?
2. RED_FLAGS: [any new warning signs, or "none"]
3. QUESTIONS: [1-2 more questions if needed, or "none"]
4. SUMMARY: [brief assessment summary in 1-2 sentences]

Respond in the exact format above.`;
}

function parseAssessmentResponse(response: string): AssessmentUpdate {
  const result: AssessmentUpdate = {};
  
  const lines = response.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (/URGENCY:/i.test(trimmed)) {
      const value = trimmed.replace(/.*URGENCY:\s*/i, '').toLowerCase();
      if (value.includes('emergency')) result.updatedUrgency = 'emergency';
      else if (value.includes('urgent')) result.updatedUrgency = 'urgent';
      else if (value.includes('routine')) result.updatedUrgency = 'routine';
    } else if (/RED_FLAGS:/i.test(trimmed)) {
      const value = trimmed.replace(/.*RED_FLAGS:\s*/i, '').trim();
      if (value.toLowerCase() !== 'none' && value.length > 0) {
        result.updatedRedFlags = value.split(',').map(f => f.trim()).filter(f => f.length > 0);
      }
    } else if (/QUESTIONS:/i.test(trimmed)) {
      const value = trimmed.replace(/.*QUESTIONS:\s*/i, '').trim();
      if (value.toLowerCase() !== 'none' && value.length > 0) {
        result.additionalQuestions = value.split(/[,;]/).map(q => q.trim()).filter(q => q.length > 0);
      }
    } else if (/SUMMARY:/i.test(trimmed)) {
      result.summary = trimmed.replace(/.*SUMMARY:\s*/i, '').trim();
    }
  }
  
  return result;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summarySpecialty: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  urgencyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  urgencyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressText: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 2,
  },
  qaCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  questionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  answerRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 4,
  },
  answerText: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
  },
  currentQuestionCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  currentQuestionText: {
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'center',
    fontWeight: '500',
  },
  completionCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  completionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#166534',
    marginTop: 12,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },
  redFlagsSection: {
    marginTop: 16,
    width: '100%',
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  redFlagsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 8,
  },
  redFlagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  redFlagText: {
    fontSize: 13,
    color: '#7f1d1d',
    flex: 1,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    width: '100%',
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  summaryActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  generatedSummaryContainer: {
    marginTop: 16,
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  generatedSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  summaryScrollView: {
    maxHeight: 200,
  },
  generatedSummaryText: {
    padding: 12,
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#334155',
    lineHeight: 18,
  },
  actionButtonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '500',
  },
  doneButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#16a34a',
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: '#f1f5f9',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1e293b',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  optionsContainer: {
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  optionsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 12,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  optionText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '500',
  },
  processingState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  processingText: {
    color: '#64748b',
    fontSize: 14,
  },
});
