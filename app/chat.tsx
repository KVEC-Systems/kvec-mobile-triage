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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { initializeLLM, sendMessage, getLLMStatus } from '../lib/llm';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export default function ChatScreen() {
  const { symptom, specialty, conditions } = useLocalSearchParams<{
    symptom: string;
    specialty: string;
    conditions: string;
  }>();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [llmReady, setLlmReady] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Initialize LLM and set up initial context
  useEffect(() => {
    async function init() {
      const success = await initializeLLM();
      setLlmReady(success);
      
      // Add initial context message
      const contextMessage: Message = {
        role: 'system',
        content: `Patient symptoms: "${symptom}"\nRecommended specialty: ${specialty}\nPossible conditions: ${conditions}\n\nI'm MedGemma, a medical AI assistant. How can I help you understand this triage recommendation?`,
      };
      
      setMessages([{
        role: 'assistant',
        content: `Based on the symptoms you described, I've recommended ${specialty} as the primary specialty.\n\n**Possible conditions:**\n${conditions}\n\nWhat questions do you have about this recommendation? I can explain:\n• Why this specialty was chosen\n• What to expect at your appointment\n• Warning signs to watch for\n• General information about these conditions`,
      }]);
      
      setIsLoading(false);
    }
    init();
  }, [symptom, specialty, conditions]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return;
    
    const userMessage = input.trim();
    setInput('');
    setIsSending(true);
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    
    try {
      if (llmReady) {
        // Build prompt with context
        const prompt = `Patient symptoms: "${symptom}"
Recommended specialty: ${specialty}
Possible conditions: ${conditions}

User question: ${userMessage}

Please provide a helpful, medically accurate response. Be concise but thorough. Always remind the user to consult with a healthcare provider for personalized advice.`;

        const response = await sendMessage(prompt);
        setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'I apologize, but the AI model is not available right now. Please consult with a healthcare provider for medical advice.',
        }]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      }]);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, llmReady, symptom, specialty, conditions]);

  // Scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading MedGemma...</Text>
        <Text style={styles.loadingSubtext}>Initializing medical AI</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerTitle: 'MedGemma AI' }} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.statusBar}>
          <View style={[styles.statusDot, { backgroundColor: llmReady ? '#16a34a' : '#dc2626' }]} />
          <Text style={styles.statusText}>{llmReady ? 'Online' : 'Offline'}</Text>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map((message, index) => (
            <View
              key={index}
              style={[
                styles.messageBubble,
                message.role === 'user' ? styles.userMessage : styles.assistantMessage,
              ]}
            >
              <Text style={[
                styles.messageText,
                message.role === 'user' ? styles.userMessageText : styles.assistantMessageText,
              ]}>
                {message.content}
              </Text>
            </View>
          ))}
          {isSending && (
            <View style={[styles.messageBubble, styles.assistantMessage]}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.typingText}>Thinking...</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your symptoms..."
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={500}
            editable={!isSending}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isSending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || isSending}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
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
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#64748b',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 4,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  assistantMessageText: {
    color: '#1e293b',
  },
  typingText: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 8,
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
});
