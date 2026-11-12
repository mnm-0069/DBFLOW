// apps/api/src/services/copilotChatService.ts
// Conversational AI Database Agent interface for DBFlow Copilot 2.0

import type { CopilotChatMessage } from '@idp/shared';
import type { DatabaseSession } from './connection-service.js';
import { runCopilotAgent } from './agentEngine.js';

export async function handleCopilotChat(
  session: DatabaseSession,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  conversationId?: string,
  signal?: AbortSignal,
  frontendSubmittedAt?: string
): Promise<CopilotChatMessage> {
  const latestMessage = messages[messages.length - 1]?.content || '';
  const history = messages.slice(0, -1);

  return await runCopilotAgent(session, latestMessage, history, {
    conversationId,
    connectionId: session.connectionId,
    signal,
    frontendSubmittedAt,
  });
}
