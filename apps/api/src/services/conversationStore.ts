// apps/api/src/services/conversationStore.ts
// Durable conversation persistence scoped to user and database sessions
// Survives API process restarts and prevents cross-user / cross-connection leakage.

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CopilotChatMessage,
  ConversationSummary,
  ConversationDetail,
} from '@idp/shared';

const conversations = new Map<string, ConversationDetail>();
let activeStoragePath: string | null = null;

function resolveStoragePath(): string {
  if (activeStoragePath) return activeStoragePath;
  if (process.env.COPILOT_CONVERSATIONS_FILE) {
    return path.resolve(process.env.COPILOT_CONVERSATIONS_FILE);
  }
  // Default to data directory in project root or current working directory
  return path.resolve(process.cwd(), 'data', 'copilot-conversations.json');
}

/**
 * Loads conversations from disk into memory.
 */
function loadFromDisk(): void {
  try {
    const filePath = resolveStoragePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const items: ConversationDetail[] = JSON.parse(raw);
      conversations.clear();
      for (const item of items) {
        if (item && item.id) {
          conversations.set(item.id, item);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load conversations from disk, starting with empty store:', err);
  }
}

/**
 * Atomically flushes in-memory conversations to disk.
 */
function flushToDisk(): void {
  try {
    const filePath = resolveStoragePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    const payload = JSON.stringify(Array.from(conversations.values()), null, 2);
    fs.writeFileSync(tempPath, payload, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.warn('Failed to save conversations to disk:', err);
  }
}

// Initial load on module evaluation
loadFromDisk();

/**
 * Reinitializes the store, optionally with a custom storage file (for test isolation).
 */
export function reinitConversationStore(customFilePath?: string): void {
  if (customFilePath !== undefined) {
    activeStoragePath = customFilePath;
  }
  loadFromDisk();
}

/**
 * Clears in-memory and on-disk conversations for testing purposes.
 */
export function clearAllConversationsForTest(): void {
  conversations.clear();
  const filePath = resolveStoragePath();
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

export function createConversation(
  connectionId: string,
  initialTitle = 'New Database Consultation',
  userId?: string
): ConversationDetail {
  const id = `conv-${randomUUID()}`;
  const now = new Date().toISOString();
  const conv: ConversationDetail = {
    id,
    connectionId,
    userId: userId || 'default_user',
    title: initialTitle,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: `msg-${Date.now()}-welcome`,
        conversationId: id,
        role: 'assistant',
        content:
          'Hello! I am DBFlow Copilot 2.0, your autonomous AI database engineer. I have direct access to database inspection, indexing analysis, and query planning tools for your connected session.\n\nHow can I help you investigate or improve your database today?',
        timestamp: now,
        isAiGenerated: false,
        suggestedActions: [
          { label: 'Investigate Database Performance', actionType: 'ask_question', payload: 'My database is getting slower. Perform a complete investigation, identify the three most important issues, explain why they matter, and recommend the safest improvements. Don\'t change anything without my approval.' },
          { label: 'Check Missing Indexes', actionType: 'ask_question', payload: 'Which indexes should I consider adding?' },
          { label: 'Review Database Health', actionType: 'ask_question', payload: 'Run a full health audit of my database.' },
          { label: 'Explain Table Relationships', actionType: 'ask_question', payload: 'Explain how the tables in my database are connected.' },
        ],
      },
    ],
  };

  conversations.set(id, conv);
  flushToDisk();
  return conv;
}

export function listConversations(connectionId: string, userId?: string): ConversationSummary[] {
  const result: ConversationSummary[] = [];
  for (const conv of conversations.values()) {
    // Strictly isolate by connectionId, and by userId if provided
    if (conv.connectionId === connectionId) {
      if (userId && conv.userId && conv.userId !== userId) {
        continue;
      }
      result.push({
        id: conv.id,
        connectionId: conv.connectionId,
        userId: conv.userId,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.length,
      });
    }
  }

  // Sort descending by updatedAt
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getConversation(
  conversationId: string,
  connectionId?: string,
  userId?: string
): ConversationDetail | undefined {
  const conv = conversations.get(conversationId);
  if (!conv) return undefined;

  // Strict boundary check
  if (connectionId && conv.connectionId !== connectionId) {
    return undefined;
  }
  if (userId && conv.userId && conv.userId !== userId) {
    return undefined;
  }

  return conv;
}

export function addMessageToConversation(
  conversationId: string,
  message: CopilotChatMessage
): ConversationDetail {
  let conv = conversations.get(conversationId);
  if (!conv) {
    // If conversation does not exist, recreate one
    conv = createConversation('unknown', 'New Consultation');
  }

  conv.messages.push({
    ...message,
    conversationId,
  });
  conv.updatedAt = new Date().toISOString();

  // If this is the first user message, generate title from content
  if (message.role === 'user' && conv.title === 'New Database Consultation') {
    const cleanTitle = message.content.replace(/[#*`\n]/g, ' ').trim();
    conv.title = cleanTitle.length > 38 ? `${cleanTitle.slice(0, 35)}...` : cleanTitle;
  }

  flushToDisk();
  return conv;
}

export function deleteConversation(
  conversationId: string,
  connectionId?: string,
  userId?: string
): boolean {
  const conv = conversations.get(conversationId);
  if (!conv) return false;

  // Prevent cross-connection or cross-user deletion
  if (connectionId && conv.connectionId !== connectionId) {
    return false;
  }
  if (userId && conv.userId && conv.userId !== userId) {
    return false;
  }

  const deleted = conversations.delete(conversationId);
  if (deleted) {
    flushToDisk();
  }
  return deleted;
}
