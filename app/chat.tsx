import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { areModelsReady } from '../lib/download';
import { initializeLLM, generateResponse, isLLMReady, isVisionEnabled, type ChatMessage, type ChatMessageContent } from '../lib/llm';
import { HamburgerMenu } from '../components/HamburgerMenu';

// Helper to extract text content from message
function getMessageText(content: string | ChatMessageContent[]): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
    .map(item => item.text)
    .join('\n');
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingModels, setIsCheckingModels] = useState(true);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Check if models exist on mount
  useEffect(() => {
    async function checkAndLoadModels() {
      try {
        const available = await areModelsReady();
        
        if (!available) {
          router.replace('/download');
          return;
        }
        
        setIsCheckingModels(false);
        setIsLoadingModel(true);
        
        // Initialize LLM
        await initializeLLM();
      } catch (error) {
        console.error('Error checking models:', error);
      } finally {
        setIsCheckingModels(false);
        setIsLoadingModel(false);
      }
    }
    checkAndLoadModels();
  }, []);

  // Pick image from camera
  const pickFromCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take photos.');
      return;
    }
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
    });
    
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  }, []);

  // Pick image from gallery
  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
    });
    
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  }, []);

  // Show image picker options
  const showImageOptions = useCallback(() => {
    Alert.alert(
      'Add Image',
      'Choose where to get your image',
      [
        { text: 'Camera', onPress: pickFromCamera },
        { text: 'Photo Library', onPress: pickFromGallery },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [pickFromCamera, pickFromGallery]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() && !selectedImage) return;
    if (isLoading) return;
    
    // Build message content (text + optional image)
    let messageContent: string | ChatMessageContent[];
    if (selectedImage) {
      console.log('Selected image URI:', selectedImage);
      console.log('Vision enabled:', isVisionEnabled());
      
      // Always include image in message for display, even if vision not enabled
      messageContent = [
        { type: 'text', text: inputText.trim() || 'What do you see in this image?' },
        { type: 'image_url', image_url: { url: selectedImage } },
      ];
    } else {
      messageContent = inputText.trim();
    }
    
    const userMessage: ChatMessage = { role: 'user', content: messageContent };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setSelectedImage(null);
    setIsLoading(true);
    setStreamingText('');
    
    try {
      // Add system message for medical context on first message
      const promptMessages: ChatMessage[] = messages.length === 0 
        ? [{ role: 'system', content: 'You are MedGemma, a helpful medical AI assistant. Provide accurate, helpful health information. Always recommend consulting a healthcare professional for medical decisions.' }, ...newMessages]
        : newMessages;
      
      let fullResponse = '';
      
      await generateResponse(promptMessages, (token) => {
        fullResponse += token;
        setStreamingText(fullResponse);
      });
      
      const assistantMessage: ChatMessage = { role: 'assistant', content: fullResponse };
      setMessages([...newMessages, assistantMessage]);
      setStreamingText('');
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage: ChatMessage = { 
        role: 'assistant', 
        content: 'Sorry, something went wrong. Please try again.' 
      };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, messages, isLoading]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, streamingText]);

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
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <HamburgerMenu />
          
          <View style={styles.headerContent}>
            <Ionicons name="medical" size={28} color="#6366f1" />
            <Text style={styles.headerTitle}>MedGemma</Text>
          </View>
          
          <View style={{ width: 44 }} />
        </View>
        {isLoadingModel && (
          <Text style={styles.loadingModelText}>Loading model...</Text>
        )}
      </View>
      
      {/* Messages */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptySubtitle}>
              Ask any health-related questions
            </Text>
          </View>
        )}
        
        {messages.map((msg, idx) => {
          // Extract image URL if present
          const imageUrl = Array.isArray(msg.content) 
            ? msg.content.find(
                (item): item is { type: 'image_url'; image_url: { url: string } } => 
                  item.type === 'image_url'
              )?.image_url.url
            : undefined;
          
          return (
            <View
              key={idx}
              style={[
                styles.messageBubble,
                msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              {imageUrl && (
                <Image 
                  source={{ uri: imageUrl }} 
                  style={styles.messageImage}
                  resizeMode="cover"
                  onError={(e) => console.log('Image load error:', e.nativeEvent.error, 'uri:', imageUrl)}
                />
              )}
              <Text style={[
                styles.messageText,
                msg.role === 'user' ? styles.userText : styles.assistantText,
              ]}>
                {getMessageText(msg.content)}
              </Text>
            </View>
          );
        })}
        
        {/* Streaming response */}
        {streamingText && (
          <View style={[styles.messageBubble, styles.assistantBubble]}>
            <Text style={[styles.messageText, styles.assistantText]}>
              {streamingText}
            </Text>
          </View>
        )}
        
        {/* Loading indicator */}
        {isLoading && !streamingText && (
          <View style={[styles.messageBubble, styles.assistantBubble]}>
            <ActivityIndicator size="small" color="#6366f1" />
          </View>
        )}
      </ScrollView>
      
      {/* Input area */}
      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {/* Image preview */}
        {selectedImage && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => setSelectedImage(null)}
            >
              <Ionicons name="close-circle" size={24} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
        
        <View style={styles.inputRow}>
          {/* Image picker button */}
          <TouchableOpacity
            style={[styles.imageButton, !isVisionEnabled() && styles.imageButtonDisabled]}
            onPress={showImageOptions}
            disabled={isLoading || !isVisionEnabled()}
          >
            <Ionicons name="image" size={24} color={isVisionEnabled() ? "#6366f1" : "#475569"} />
          </TouchableOpacity>
          
          <TextInput
            style={styles.textInput}
            placeholder={selectedImage ? "Ask about this image..." : "Type your message..."}
            placeholderTextColor="#94a3b8"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            editable={!isLoading && isLLMReady()}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() && !selectedImage || isLoading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={(!inputText.trim() && !selectedImage) || isLoading}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f1f5f9',
  },
  loadingModelText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
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
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#6366f1',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#334155',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#1e293b',
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#e2e8f0',
  },
  inputContainer: {
    padding: 12,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  imagePreviewContainer: {
    marginBottom: 12,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#334155',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#0f172a',
    borderRadius: 12,
  },
  imageButton: {
    width: 44,
    height: 44,
    backgroundColor: '#334155',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageButtonDisabled: {
    opacity: 0.5,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#f1f5f9',
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: '#6366f1',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#475569',
  },
});
