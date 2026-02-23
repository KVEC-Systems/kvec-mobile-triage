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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { areModelsReady } from '../lib/download';
import { initializeLLM, generateResponse, isLLMReady, isVisionEnabled, type ChatMessage, type ChatMessageContent } from '../lib/llm';
import { HamburgerMenu } from '../components/HamburgerMenu';
import { saveChat, updateChat, loadChat } from '../lib/chat-storage';

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

interface VisionMode {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  prompt: string;
}

const VISION_MODES: VisionMode[] = [
  {
    label: 'Wound',
    icon: 'bandage',
    prompt: 'Analyze this wound image. Describe: wound type (laceration, abrasion, puncture, burn, etc), estimated size, depth assessment, signs of infection, bleeding status, and recommended field treatment.',
  },
  {
    label: 'Medication',
    icon: 'medical',
    prompt: 'Identify the medication(s) shown. Provide: drug name, dosage form, strength if visible, common uses, and any critical safety information (allergies, interactions).',
  },
  {
    label: 'Skin',
    icon: 'body',
    prompt: 'Assess this skin condition. Describe: appearance (color, texture, borders, distribution), possible differential diagnoses, severity assessment, and whether urgent medical evaluation is recommended.',
  },
  {
    label: 'ECG/Monitor',
    icon: 'pulse',
    prompt: 'Analyze this patient monitor or ECG reading. Identify: heart rate/rhythm, any visible vital signs, notable findings or abnormalities, and clinical significance.',
  },
];

export default function ChatScreen() {
  const { id: chatIdParam } = useLocalSearchParams<{ id?: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingModels, setIsCheckingModels] = useState(true);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeVisionMode, setActiveVisionMode] = useState<VisionMode | null>(null);
  const activeChatId = useRef<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Check if models exist on mount, load chat if ID provided
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

        // Initialize LLM with vision support for multimodal chat
        await initializeLLM(true);

        // Load saved chat if ID provided
        if (chatIdParam) {
          const saved = await loadChat(chatIdParam);
          if (saved) {
            setMessages(saved.messages);
            activeChatId.current = saved.id;
          }
        }
      } catch (error) {
        console.error('Error checking models:', error);
      } finally {
        setIsCheckingModels(false);
        setIsLoadingModel(false);
      }
    }
    checkAndLoadModels();
  }, [chatIdParam]);

  // Start a new chat
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInputText('');
    setSelectedImage(null);
    setStreamingText('');
    activeChatId.current = null;
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

  // Handle vision quick-assess mode selection
  const handleVisionMode = useCallback((mode: VisionMode) => {
    setActiveVisionMode(mode);
    Alert.alert(
      mode.label + ' Assessment',
      'Take or select a photo to analyze',
      [
        { text: 'Camera', onPress: pickFromCamera },
        { text: 'Photo Library', onPress: pickFromGallery },
        { text: 'Cancel', style: 'cancel', onPress: () => setActiveVisionMode(null) },
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

      const promptText = activeVisionMode
        ? activeVisionMode.prompt
        : inputText.trim() || 'What do you see in this image?';

      messageContent = [
        { type: 'text', text: inputText.trim() ? inputText.trim() + '\n\n' + (activeVisionMode?.prompt || '') : promptText },
        { type: 'image_url', image_url: { url: selectedImage } },
      ];
      setActiveVisionMode(null);
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
        ? [{ role: 'system', content: `You are MedGemma, a concise medical AI for EMS field support.

Rules:
- Lead with the direct answer, then brief supporting details
- Use bullet points, not paragraphs
- Keep responses under 150 words unless asked for detail
- Use standard medical terminology
- For images: describe key findings in bullets, note limitations
- If unsure, say so briefly
- For emergencies, advise calling 911` }, ...newMessages]
        : newMessages;
      
      let fullResponse = '';
      
      await generateResponse(promptMessages, (token) => {
        fullResponse += token;
        setStreamingText(fullResponse);
      });
      
      const assistantMessage: ChatMessage = { role: 'assistant', content: fullResponse };
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      setStreamingText('');

      // Auto-save chat
      if (activeChatId.current) {
        await updateChat(activeChatId.current, updatedMessages);
      } else {
        const saved = await saveChat(updatedMessages);
        activeChatId.current = saved.id;
      }
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
  }, [inputText, messages, isLoading, selectedImage, activeVisionMode]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, streamingText]);

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
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <HamburgerMenu />
          
          <View style={styles.headerContent}>
            <Ionicons name="medical" size={28} color="#2563EB" />
            <Text style={styles.headerTitle}>MedGemma</Text>
          </View>
          
          <TouchableOpacity
            style={styles.newChatButton}
            onPress={handleNewChat}
          >
            <Ionicons name="add" size={24} color="#2563EB" />
          </TouchableOpacity>
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
            <Ionicons name="chatbubbles-outline" size={48} color="#64748B" />
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
        
        {/* Streaming response — plain text while generating, formatted after */}
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
            <ActivityIndicator size="small" color="#2563EB" />
          </View>
        )}
      </ScrollView>
      
      {/* Input area */}
      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {/* Medical Vision Quick Assess */}
        {isVisionEnabled() && !isLoading && messages.length === 0 && !selectedImage && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.visionModesContainer}
            contentContainerStyle={styles.visionModesContent}
          >
            {VISION_MODES.map((mode) => (
              <TouchableOpacity
                key={mode.label}
                style={[
                  styles.visionModeButton,
                  activeVisionMode?.label === mode.label && styles.visionModeButtonActive,
                ]}
                onPress={() => handleVisionMode(mode)}
              >
                <Ionicons name={mode.icon} size={18} color="#2563EB" />
                <Text style={styles.visionModeLabel}>{mode.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

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
            <Ionicons name="image" size={24} color={isVisionEnabled() ? "#2563EB" : "#94A3B8"} />
          </TouchableOpacity>
          
          <TextInput
            style={styles.textInput}
            placeholder={selectedImage ? "Ask about this image..." : "Type your message..."}
            placeholderTextColor="#64748B"
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
    backgroundColor: '#E2E8F0',
  },
  newChatButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  loadingModelText: {
    fontSize: 12,
    color: '#64748B',
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
    color: '#1E293B',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#2563EB',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#F1F5F9',
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
    backgroundColor: '#FFFFFF',
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#1E293B',
  },
  inputContainer: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
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
    backgroundColor: '#E2E8F0',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  imageButton: {
    width: 44,
    height: 44,
    backgroundColor: '#F1F5F9',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageButtonDisabled: {
    opacity: 0.5,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E293B',
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: '#2563EB',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  visionModesContainer: {
    marginBottom: 10,
  },
  visionModesContent: {
    gap: 8,
    paddingHorizontal: 4,
  },
  visionModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  visionModeButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  visionModeLabel: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },
});
