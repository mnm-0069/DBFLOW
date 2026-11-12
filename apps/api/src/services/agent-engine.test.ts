// apps/api/src/services/agent-engine.test.ts
// Unit tests for DBFlow Copilot 2.0 AI Database Agent, Tools, and Conversation Persistence

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TOOLS } from './agentTools.js';
import {
  createConversation,
  listConversations,
  getConversation,
  deleteConversation,
  addMessageToConversation,
  reinitConversationStore,
  clearAllConversationsForTest,
} from './conversationStore.js';
import { runCopilotAgent } from './agentEngine.js';
import { getAiConfig, normalizeAiError } from './aiProvider.js';

test('AGENT_TOOLS exposes all 14 required database tools with schemas', () => {
  const expectedTools = [
    'inspect_database_schema',
    'inspect_table_details',
    'inspect_table_relationships',
    'inspect_database_health',
    'inspect_table_indexes',
    'inspect_database_statistics',
    'explain_sql_query',
    'compare_query_plans',
    'analyze_normalization',
    'analyze_schema_impact',
    'suggest_indexes',
    'generate_sql_improvement',
    'validate_sql_improvement',
    'locate_schema_object',
  ];

  for (const name of expectedTools) {
    assert.ok(AGENT_TOOLS[name], `Tool "${name}" must be registered in AGENT_TOOLS`);
    assert.equal(typeof AGENT_TOOLS[name]?.handler, 'function');
    assert.equal(typeof AGENT_TOOLS[name]?.description, 'string');
    assert.equal(AGENT_TOOLS[name]?.parameters.type, 'object');
  }
});

test('conversation store creates, retrieves, lists, updates, and deletes conversations', () => {
  const connId = 'test-conn-999';
  const conv = createConversation(connId, 'Performance Investigation');
  assert.ok(conv.id.startsWith('conv-'));
  assert.equal(conv.connectionId, connId);
  assert.equal(conv.title, 'Performance Investigation');
  assert.equal(conv.messages.length, 1); // welcome message

  // Add user message
  const updated = addMessageToConversation(conv.id, {
    id: 'msg-u1',
    role: 'user',
    content: 'Why is enrollments table slow?',
    timestamp: new Date().toISOString(),
    isAiGenerated: false,
  });
  assert.equal(updated.messages.length, 2);

  // List conversations
  const list = listConversations(connId);
  assert.ok(list.length >= 1);
  assert.equal(list[0]?.id, conv.id);

  // Get conversation
  const fetched = getConversation(conv.id);
  assert.equal(fetched?.id, conv.id);

  // Delete conversation
  const deleted = deleteConversation(conv.id);
  assert.equal(deleted, true);
  assert.equal(getConversation(conv.id), undefined);
});

test('conversation store persists conversations and messages across simulated server restarts', () => {
  const testStorageFile = `/tmp/test-copilot-persist-${Date.now()}.json`;
  try {
    reinitConversationStore(testStorageFile);

    const connId = 'conn-survive-restart-101';
    const conv = createConversation(connId, 'Investigate Slow Joins', 'user-alpha');

    addMessageToConversation(conv.id, {
      id: 'm1',
      role: 'user',
      content: 'Which foreign keys are unindexed?',
      timestamp: new Date().toISOString(),
      isAiGenerated: false,
    });

    addMessageToConversation(conv.id, {
      id: 'm2',
      role: 'assistant',
      content: 'Found 8 unindexed foreign keys.',
      timestamp: new Date().toISOString(),
      isAiGenerated: false,
    });

    // SIMULATE BACKEND PROCESS RESTART:
    // Re-initialize store from the same disk file
    reinitConversationStore(testStorageFile);

    const reloadedList = listConversations(connId);
    assert.equal(reloadedList.length, 1);
    assert.equal(reloadedList[0]?.id, conv.id);
    assert.equal(reloadedList[0]?.title, 'Investigate Slow Joins');

    const reloadedDetail = getConversation(conv.id);
    assert.ok(reloadedDetail);
    assert.equal(reloadedDetail.messages.length, 3); // welcome + 2 messages
    assert.equal(reloadedDetail.messages[1]?.content, 'Which foreign keys are unindexed?');
    assert.equal(reloadedDetail.messages[2]?.content, 'Found 8 unindexed foreign keys.');
  } finally {
    clearAllConversationsForTest();
  }
});

test('conversation store enforces session and user boundary isolation without leakage', () => {
  const testStorageFile = `/tmp/test-copilot-isolation-${Date.now()}.json`;
  try {
    reinitConversationStore(testStorageFile);

    const connA = 'conn-session-a';
    const connB = 'conn-session-b';

    const convA = createConversation(connA, 'Private Session A', 'user-1');
    const convB = createConversation(connB, 'Private Session B', 'user-2');

    // 1. Connection isolation: connA cannot see connB
    const listA = listConversations(connA);
    assert.equal(listA.length, 1);
    assert.equal(listA[0]?.id, convA.id);
    assert.ok(!listA.some((c) => c.id === convB.id));

    // 2. Cross-connection get: cannot access convA through connB
    assert.equal(getConversation(convA.id, connB), undefined);

    // 3. Cross-connection delete: connB cannot delete convA
    const deleteAttempt = deleteConversation(convA.id, connB);
    assert.equal(deleteAttempt, false);
    assert.ok(getConversation(convA.id, connA) !== undefined);

    // 4. User isolation
    const listUser2 = listConversations(connA, 'user-2');
    assert.equal(listUser2.length, 0); // User 2 cannot see User 1's conversation on connA
  } finally {
    clearAllConversationsForTest();
  }
});

test('normalizeAiError formats Gemini and provider errors cleanly', () => {
  const authErr = normalizeAiError(new Error('API_KEY_INVALID: bad token'), 'gemini');
  assert.ok(authErr.includes('Authentication Failed'));

  const quotaErr = normalizeAiError(new Error('RESOURCE_EXHAUSTED: rate limit exceeded'), 'gemini');
  assert.ok(quotaErr.includes('Quota Exceeded / Rate Limited'));

  const timeoutErr = normalizeAiError(new Error('Request abort timeout'), 'gemini');
  assert.ok(timeoutErr.includes('Request Timed Out'));
});

test('getAiConfig resolves Gemini configuration when GEMINI_API_KEY is provided', () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origProvider = process.env.AI_PROVIDER;
  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AI_PROVIDER = 'gemini';
    const config = getAiConfig();
    assert.equal(config.provider, 'gemini');
    assert.equal(config.configured, true);
    assert.equal(config.model, 'gemini-3.8-flash');
  } finally {
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    else delete process.env.GEMINI_API_KEY;
    if (origProvider !== undefined) process.env.AI_PROVIDER = origProvider;
    else delete process.env.AI_PROVIDER;
  }
});
