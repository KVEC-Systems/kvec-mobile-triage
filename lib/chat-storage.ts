/**
 * Chat Storage Service
 * Persists chat conversations to AsyncStorage for history
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from './llm';

const CHAT_HISTORY_KEY = 'chat_history';

export interface SavedChat {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  messages: ChatMessage[];
}

/**
 * Extract a title from the first user message
 */
function extractTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const text = typeof firstUser.content === 'string'
    ? firstUser.content
    : firstUser.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map(c => c.text)
        .join(' ');
  return text.slice(0, 80) || 'New Chat';
}

/**
 * Save a new chat to history
 */
export async function saveChat(messages: ChatMessage[]): Promise<SavedChat> {
  const now = new Date().toISOString();
  const entry: SavedChat = {
    id: Date.now().toString(),
    createdAt: now,
    updatedAt: now,
    title: extractTitle(messages),
    messages: messages.filter(m => m.role !== 'system'),
  };

  const history = await loadChatHistory();
  history.unshift(entry);
  if (history.length > 50) {
    history.length = 50;
  }
  await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  return entry;
}

/**
 * Update an existing chat with new messages
 */
export async function updateChat(id: string, messages: ChatMessage[]): Promise<void> {
  const history = await loadChatHistory();
  const entry = history.find(c => c.id === id);
  if (entry) {
    entry.messages = messages.filter(m => m.role !== 'system');
    entry.updatedAt = new Date().toISOString();
    entry.title = extractTitle(messages);
    await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  }
}

/**
 * Load all saved chats, newest first
 */
export async function loadChatHistory(): Promise<SavedChat[]> {
  const raw = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedChat[];
  } catch {
    return [];
  }
}

/**
 * Load a single chat by ID
 */
export async function loadChat(id: string): Promise<SavedChat | null> {
  const history = await loadChatHistory();
  return history.find(c => c.id === id) || null;
}

/**
 * Delete a single chat from history
 */
export async function deleteChat(id: string): Promise<void> {
  const history = await loadChatHistory();
  const filtered = history.filter(c => c.id !== id);
  await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(filtered));
}
