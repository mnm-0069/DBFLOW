// Copilot agent and conversation routes.

import { Router } from 'express';
import { z } from 'zod';
import { getDatabaseSession, ReadOnlyQueryValidationError } from '../services/connection-service.js';
import { getAiConfig } from '../services/aiProvider.js';
import { analyzeDatabaseHealth } from '../services/databaseHealthAnalyzer.js';
import { explainAndAnalyzeQuery, generateSqlFromPrompt } from '../services/sqlIntelligenceService.js';
import { handleCopilotChat } from '../services/copilotChatService.js';
import {
  createConversation,
  listConversations,
  getConversation,
  deleteConversation,
  addMessageToConversation,
} from '../services/conversationStore.js';
import { AGENT_TOOLS } from '../services/agentTools.js';
import { getJobStatus, scheduleAnalysis } from '../services/intelligenceOrchestrator.js';
import { getIntelligence } from '../services/intelligenceStore.js';

export const copilotRouter = Router();

const connectionSchema = z.object({
  connectionId: z.string().min(1),
});

const chatSchema = z.object({
  connectionId: z.string().min(1),
  conversationId: z.string().optional(),
  frontendSubmittedAt: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1).max(10000),
    })
  ).min(1),
});

const explainSchema = z.object({
  connectionId: z.string().min(1),
  query: z.string().min(1).max(10000),
});

const nlToSqlSchema = z.object({
  connectionId: z.string().min(1),
  prompt: z.string().min(1).max(1000),
});

const toolExecuteSchema = z.object({
  connectionId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.unknown()).optional(),
});

copilotRouter.get('/status', (req, res) => {
  const config = getAiConfig();
  res.json({
    aiConfigured: config.configured,
    provider: config.provider,
    model: config.model,
    agentSupported: true,
    availableTools: Object.keys(AGENT_TOOLS),
    features: {
      healthAnalysis: true,
      explainQuery: true,
      aiChat: true,
      nlToSql: true,
      agentLoop: true,
      conversations: true,
      proactiveIntelligence: true,
    },
  });
});

copilotRouter.get('/intelligence', (req, res) => {
  const connectionId = String(req.query.connectionId || '');
  if (!connectionId) {
    return res.status(400).json({ error: 'connectionId query parameter is required' });
  }
  const status = getJobStatus(connectionId);
  res.json(status);
});

copilotRouter.post('/intelligence/refresh', (req, res) => {
  const { connectionId, force } = req.body;
  if (!connectionId) {
    return res.status(400).json({ error: 'connectionId is required' });
  }
  const session = getDatabaseSession(connectionId);
  if (!session) {
    return res.status(410).json({ error: 'Database session has expired or does not exist.' });
  }
  scheduleAnalysis(connectionId, session, { reason: 'user_requested_refresh', force: Boolean(force) });
  const status = getJobStatus(connectionId);
  res.json(status);
});

copilotRouter.get('/conversations', (req, res) => {
  const connectionId = String(req.query.connectionId || '');
  if (!connectionId) {
    return res.status(400).json({ error: 'connectionId query parameter is required' });
  }
  const convs = listConversations(connectionId);
  res.json(convs);
});

copilotRouter.post('/conversations', (req, res) => {
  const { connectionId, title } = req.body;
  if (!connectionId) {
    return res.status(400).json({ error: 'connectionId is required' });
  }
  const conv = createConversation(connectionId, title);
  res.status(201).json(conv);
});

copilotRouter.get('/conversations/:id', (req, res) => {
  const connectionId = req.query.connectionId ? String(req.query.connectionId) : undefined;
  const conv = getConversation(req.params.id, connectionId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  res.json(conv);
});

copilotRouter.delete('/conversations/:id', (req, res) => {
  const connectionId = req.query.connectionId ? String(req.query.connectionId) : undefined;
  const success = deleteConversation(req.params.id, connectionId);
  res.json({ success });
});

copilotRouter.post('/chat', async (req, res, next) => {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) {
      controller.abort();
    }
  });

  try {
    const { connectionId, messages, conversationId, frontendSubmittedAt } = chatSchema.parse(req.body);
    const session = getDatabaseSession(connectionId);
    if (!session) {
      return res.status(410).json({ error: 'Database session has expired or does not exist.' });
    }

    // Persist incoming prompt to conversation history.
    const userMsg = messages[messages.length - 1];
    let activeConvId = conversationId;
    if (activeConvId && userMsg && userMsg.role === 'user') {
      addMessageToConversation(activeConvId, {
        id: `msg-${Date.now()}-u`,
        role: 'user',
        content: userMsg.content,
        timestamp: new Date().toISOString(),
        isAiGenerated: false,
      });
    }

    const response = await handleCopilotChat(
      session,
      messages as any,
      activeConvId,
      controller.signal,
      frontendSubmittedAt
    );

    if (controller.signal.aborted || res.writableEnded) {
      return;
    }

    // Record response to history.
    if (activeConvId) {
      addMessageToConversation(activeConvId, response);
    }

    res.json(response);
  } catch (err: any) {
    if (controller.signal.aborted || err?.name === 'AbortError') {
      return;
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request payload', details: err.errors });
    }
    if (err instanceof ReadOnlyQueryValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

copilotRouter.post('/tools/execute', async (req, res, next) => {
  try {
    const { connectionId, toolName, args } = toolExecuteSchema.parse(req.body);
    const session = getDatabaseSession(connectionId);
    if (!session) {
      return res.status(410).json({ error: 'Database session has expired or does not exist.' });
    }

    const tool = AGENT_TOOLS[toolName];
    if (!tool) {
      return res.status(404).json({ error: `Tool "${toolName}" not found.` });
    }

    const result = await tool.handler(session, args || {});
    if (result && typeof result === 'object' && 'error' in result && (result as any).error) {
      return res.status(400).json({ toolName, error: (result as any).error, result });
    }
    res.json({ toolName, result });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request payload', details: err.errors });
    }
    if (err instanceof ReadOnlyQueryValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

copilotRouter.post('/health', async (req, res, next) => {
  try {
    const { connectionId } = connectionSchema.parse(req.body);
    const session = getDatabaseSession(connectionId);
    if (!session) {
      return res.status(410).json({ error: 'Database session has expired or does not exist.' });
    }

    const report = await analyzeDatabaseHealth(session);
    res.json(report);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request payload', details: err.errors });
    }
    next(err);
  }
});

copilotRouter.post('/explain-query', async (req, res, next) => {
  try {
    const { connectionId, query } = explainSchema.parse(req.body);
    const session = getDatabaseSession(connectionId);
    if (!session) {
      return res.status(410).json({ error: 'Database session has expired or does not exist.' });
    }

    const response = await explainAndAnalyzeQuery(session, query);
    res.json(response);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request payload', details: err.errors });
    }
    if (err instanceof ReadOnlyQueryValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

copilotRouter.post('/nl-to-sql', async (req, res, next) => {
  try {
    const { connectionId, prompt } = nlToSqlSchema.parse(req.body);
    const session = getDatabaseSession(connectionId);
    if (!session) {
      return res.status(410).json({ error: 'Database session has expired or does not exist.' });
    }

    const response = await generateSqlFromPrompt(session, prompt);
    res.json(response);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request payload', details: err.errors });
    }
    if (err instanceof ReadOnlyQueryValidationError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});
