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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { initializeLLM, getLLMStatus } from '../lib/llm';
import LiteRTLM from '../modules/litert-lm/src';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function DirectChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [llmReady, setLlmReady] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Handle keyboard on Android
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

  // Initialize LLM
  useEffect(() => {
    async function init() {
      try {
        const success = await initializeLLM();
        setLlmReady(success);
        
        // Add welcome message
        setMessages([{
          role: 'assistant',
          content: `👋 Hi! I'm your AI assistant powered by Gemma 3.\n\nYou can ask me anything. I'm running entirely on your device - no internet required.\n\nTry asking:\n• "What is the capital of France?"\n• "Tell me a joke"\n• "Explain quantum computing simply"`,
        }]);
      } catch (error) {
        console.error('Failed to initialize LLM:', error);
        setMessages([{
          role: 'assistant',
          content: '⚠️ Failed to load the AI model. Please make sure you have downloaded the model first.',
        }]);
      }
      setIsLoading(false);
    }
    init();
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return;
    
    const userMessage = input.trim();
    setInput('');
    setIsSending(true);
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    
    try {
      if (llmReady) {
        // Simple prompt format
        const prompt = `<start_of_turn>user
${userMessage}
<end_of_turn>
<start_of_turn>model
`;

        const response = await LiteRTLM.generateResponse(prompt);
        
        // Clean up response (remove any trailing tokens)
        const cleanResponse = response
          .replace(/<end_of_turn>/g, '')
          .replace(/<start_of_turn>model\n?/g, '')
          .trim();
        
        setMessages(prev => [...prev, { role: 'assistant', content: cleanResponse || 'Sorry, I couldn\'t generate a response.' }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚠️ AI model is not available. Please download the model first.',
        }]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }]);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, llmReady]);

  // Scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading AI Model...</Text>
        <Text style={styles.loadingSubtext}>This may take a moment</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen 
        options={{ 
          headerTitle: 'Chat with AI',
          headerStyle: { backgroundColor: '#1e1b4b' },
          headerTintColor: '#fff',
        }} 
      />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 60}
      >
        <View style={styles.statusBar}>
          <View style={[styles.statusDot, { backgroundColor: llmReady ? '#22c55e' : '#ef4444' }]} />
          <Text style={styles.statusText}>
            {llmReady ? 'Gemma 3 - On Device' : 'Model Not Loaded'}
          </Text>
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
              <View style={styles.typingContainer}>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={styles.typingText}>Thinking...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[
          styles.inputContainer,
          Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: keyboardHeight }
        ]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor="#71717a"
            multiline
            maxLength={1000}
            editable={!isSending}
            onSubmitEditing={handleSend}
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
    backgroundColor: '#0f0d1a',
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0d1a',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e4e4e7',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#71717a',
    marginTop: 4,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: '#1e1b4b',
    borderBottomWidth: 1,
    borderBottomColor: '#312e81',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    color: '#a5b4fc',
    fontWeight: '500',
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
    padding: 14,
    borderRadius: 18,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 6,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#27272a',
    borderBottomLeftRadius: 6,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  assistantMessageText: {
    color: '#e4e4e7',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingText: {
    fontSize: 14,
    color: '#a1a1aa',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#18181b',
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: '#27272a',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
    color: '#e4e4e7',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#3f3f46',
  },
});
