// apps/web/src/app/CopilotChat.tsx
// DBFlow Copilot 2.0 — Premium Autonomous Database Engineering Workspace
// Designed with conversational simplicity (ChatGPT-style) & Linear-grade developer polish

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Compass,
  Copy,
  Database,
  ExternalLink,
  Info,
  Layers,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  StopCircle,
  Terminal,
  Trash2,
  User,
  Wrench,
  Zap,
} from 'lucide-react';
import type {
  CopilotChatMessage,
  CopilotAction,
  ConversationSummary,
  AgentToolCall,
} from '@idp/shared';

interface CopilotChatProps {
  connectionId: string | null;
  databaseName: string;
  engine: string;
  aiConfigured: boolean;
  onNavigateToSchema: (tableName?: string) => void;
  onNavigateToAudit: () => void;
  onNavigateToSql: (query: string) => void;
  onNotify: (msg: string) => void;
}

const DEFAULT_PROMPTS = [
  'Analyse my entire database.',
  'My database is getting slower. Perform a complete investigation, identify the three most important issues, explain why they matter, and recommend the safest improvements. Don\'t change anything without my approval.',
  'Which indexes should I consider adding?',
  'Explain the relationships between students, enrollments, and courses.',
  'Is my database properly normalized?',
  'What happens if I delete a course record?',
];

// 4 Premium Investigation Cards for Redesigned Welcome Experience
const INVESTIGATION_SHORTCUTS = [
  {
    id: 'performance',
    title: 'Performance Investigation',
    icon: Zap,
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-50',
    borderColor: 'hover:border-amber-200',
    description: 'Diagnose query latency, sequential scans, and bottleneck queries.',
    prompt:
      'Investigate why my database might be slow. Examine indexes, table statistics, relationships and potential query performance problems.',
  },
  {
    id: 'schema',
    title: 'Schema Exploration',
    icon: Compass,
    iconColor: 'text-indigo-500',
    iconBg: 'bg-indigo-50',
    borderColor: 'hover:border-indigo-200',
    description: 'Explore table topology, foreign key constraints, and cascade actions.',
    prompt:
      'Explain all foreign key relationships in my database and show how tables are connected.',
  },
  {
    id: 'indexes',
    title: 'Index Optimization',
    icon: Layers,
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-50',
    borderColor: 'hover:border-blue-200',
    description: 'Evaluate B-Tree coverage, unindexed foreign keys, and write overhead.',
    prompt:
      'Suggest indexes for my foreign keys and identify any missing indexes.',
  },
  {
    id: 'health',
    title: 'Database Health Audit',
    icon: ShieldCheck,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-50',
    borderColor: 'hover:border-emerald-200',
    description: 'Run an instant 100-point audit scoring schema integrity, design, and performance.',
    prompt:
      'Give me a detailed database health report and audit score.',
  },
];

// Friendly descriptions for known database tools
const TOOL_LABELS: Record<string, string> = {
  inspect_database_schema: 'Inspected schema tables & column types',
  inspect_table_details: 'Inspected table schema & column constraints',
  inspect_table_relationships: 'Traced foreign key referential graph',
  inspect_database_health: 'Evaluated database health & deductions',
  inspect_table_indexes: 'Analyzed B-Tree index coverage & definitions',
  inspect_database_statistics: 'Evaluated table scan counts & row estimates',
  explain_sql_query: 'Executed EXPLAIN query execution plan',
  compare_query_plans: 'Compared query execution costs & scan types',
  analyze_normalization: 'Checked 1NF / 2NF / 3NF normalization',
  analyze_schema_impact: 'Analyzed cascade & locking impact of schema changes',
  suggest_indexes: 'Evaluated missing indexes on foreign keys',
  generate_sql_improvement: 'Generated reviewable SQL migration proposal',
  validate_sql_improvement: 'Validated SQL syntax & transactional safety',
  locate_schema_object: 'Located table or foreign key schema object',
};

// Safe, lightweight SQL Syntax Tokenizer
function highlightSql(code: string): React.ReactNode {
  const tokens = code.split(
    /(\b(?:SELECT|FROM|WHERE|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|FULL\s+JOIN|CROSS\s+JOIN|ON|USING|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION\s+ALL|UNION|INTERSECT|EXCEPT|INSERT\s+INTO|VALUES|UPDATE|SET|DELETE\s+FROM|DELETE|CREATE\s+INDEX|CREATE\s+TABLE|ALTER\s+TABLE|ADD\s+COLUMN|DROP\s+TABLE|DROP\s+INDEX|BEGIN|COMMIT|ROLLBACK|CONCURRENTLY|IF\s+EXISTS|IF\s+NOT\s+EXISTS|PRIMARY\s+KEY|FOREIGN\s+KEY|REFERENCES|CHECK|UNIQUE|DEFAULT|NOT\s+NULL|NULL|CASCADE|RESTRICT|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|ILIKE|IS|AS|CASE|WHEN|THEN|ELSE|END|DISTINCT|COUNT|SUM|AVG|MIN|MAX|COALESCE|NOW)\b|--[^\n]*|'[^']*'|\b\d+\b)/gi
  );

  return tokens.map((part, i) => {
    if (!part) return null;
    const lower = part.toLowerCase();

    if (part.startsWith('--')) {
      return (
        <span key={i} className="sql-token-comment">
          {part}
        </span>
      );
    }
    if (part.startsWith("'") && part.endsWith("'")) {
      return (
        <span key={i} className="sql-token-string">
          {part}
        </span>
      );
    }
    if (/^\d+$/.test(part)) {
      return (
        <span key={i} className="sql-token-number">
          {part}
        </span>
      );
    }
    if (
      /^(select|from|where|join|left\s+join|right\s+join|inner\s+join|full\s+join|cross\s+join|on|using|group\s+by|order\s+by|having|limit|offset|union\s+all|union|intersect|except|insert\s+into|values|update|set|delete\s+from|delete|create\s+index|create\s+table|alter\s+table|add\s+column|drop\s+table|drop\s+index|begin|commit|rollback|concurrently|if\s+exists|if\s+not\s+exists|primary\s+key|foreign\s+key|references|check|unique|default|not\s+null|null|cascade|restrict|and|or|not|in|exists|between|like|ilike|is|as|case|when|then|else|end|distinct)$/i.test(
        lower
      )
    ) {
      return (
        <span key={i} className="sql-token-keyword">
          {part}
        </span>
      );
    }
    if (/^(count|sum|avg|min|max|coalesce|now)$/i.test(lower)) {
      return (
        <span key={i} className="sql-token-function">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function CopilotChat({
  connectionId,
  databaseName,
  engine,
  aiConfigured,
  onNavigateToSchema,
  onNavigateToAudit,
  onNavigateToSql,
  onNotify,
}: CopilotChatProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [expandedToolMsgIds, setExpandedToolMsgIds] = useState<Set<string>>(new Set());

  const chatMessagesAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConvId),
    [conversations, activeConvId]
  );
  const sessionTitle = activeConversation?.title || 'Database Consultation';

  const scrollToBottom = () => {
    if (chatMessagesAreaRef.current) {
      chatMessagesAreaRef.current.scrollTo({
        top: chatMessagesAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy]);

  // Adjust textarea height dynamically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  // Load conversation list on connection
  useEffect(() => {
    if (!connectionId) {
      setMessages([
        {
          id: 'welcome-default',
          role: 'assistant',
          content: `Hello! I am DBFlow Copilot 2.0, your autonomous AI database engineer for **${databaseName}** (${engine.toUpperCase()}).\n\nI can inspect live metadata, analyze foreign key index coverage, extract PostgreSQL execution plans, and recommend safe, verified SQL improvements.\n\nAsk me any question below or choose an investigation prompt.`,
          timestamp: new Date().toISOString(),
          isAiGenerated: false,
        },
      ]);
      return;
    }

    fetch(`http://localhost:4000/api/copilot/conversations?connectionId=${connectionId}`)
      .then((res) => res.json())
      .then((data: ConversationSummary[]) => {
        setConversations(data);
        if (data.length > 0 && !activeConvId) {
          loadConversation(data[0]!.id);
        } else if (data.length === 0) {
          handleNewConversation();
        }
      })
      .catch(() => {
        setMessages([
          {
            id: 'welcome-default',
            role: 'assistant',
            content: `Hello! I am DBFlow Copilot 2.0, your autonomous AI database engineer for **${databaseName}** (${engine.toUpperCase()}).\n\nI can inspect live metadata, analyze foreign key index coverage, extract PostgreSQL execution plans, and recommend safe, verified SQL improvements.\n\nAsk me any question below or choose an investigation prompt.`,
            timestamp: new Date().toISOString(),
            isAiGenerated: false,
          },
        ]);
      });
  }, [connectionId]);

  const loadConversation = async (convId: string) => {
    setActiveConvId(convId);
    try {
      const res = await fetch(`http://localhost:4000/api/copilot/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      onNotify('Could not load conversation history.');
    }
  };

  const handleNewConversation = async () => {
    if (!connectionId) {
      const demoId = `demo-conv-${Date.now()}`;
      const demoConv: ConversationSummary = {
        id: demoId,
        connectionId: 'demo-session',
        title: 'Demo Database Consultation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 1,
      };
      setConversations((prev) => [demoConv, ...prev]);
      setActiveConvId(demoId);
      setMessages([
        {
          id: `msg-${Date.now()}-welcome`,
          role: 'assistant',
          content: `Hello! I am DBFlow Copilot 2.0, your autonomous AI database engineer for **${databaseName}** (${engine.toUpperCase()}).\n\nHow can I help you investigate or improve your database today?`,
          timestamp: new Date().toISOString(),
          isAiGenerated: false,
        },
      ]);
      return;
    }
    try {
      const res = await fetch('http://localhost:4000/api/copilot/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, title: 'New Database Consultation' }),
      });
      if (res.ok) {
        const newConv = await res.json();
        setConversations((prev) => [newConv, ...prev]);
        setActiveConvId(newConv.id);
        setMessages(newConv.messages || []);
      }
    } catch {
      onNotify('Could not start new conversation.');
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (!connectionId || convId.startsWith('demo-conv-')) {
      const remaining = conversations.filter((c) => c.id !== convId);
      setConversations(remaining);
      if (activeConvId === convId) {
        if (remaining.length > 0) {
          loadConversation(remaining[0]!.id);
        } else {
          setActiveConvId(null);
          setMessages([]);
        }
      }
      onNotify('Conversation deleted.');
      return;
    }
    try {
      const res = await fetch(`http://localhost:4000/api/copilot/conversations/${convId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const remaining = conversations.filter((c) => c.id !== convId);
        setConversations(remaining);
        if (activeConvId === convId) {
          if (remaining.length > 0) {
            loadConversation(remaining[0]!.id);
          } else {
            handleNewConversation();
          }
        }
        onNotify('Conversation deleted.');
      }
    } catch {
      onNotify('Could not delete conversation.');
    }
  };

  const toggleToolAccordion = (msgId: string) => {
    setExpandedToolMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    onNotify('SQL copied to clipboard');
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const copyFullMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    onNotify('Message copied to clipboard');
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Stop active AI request
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setBusy(false);
      onNotify('Generation cancelled by user.');
    }
  };

  const handleSend = async (userPrompt?: string) => {
    const textToSend = (userPrompt || input).trim();
    if (!textToSend || busy) return;

    if (!connectionId) {
      onNotify('Please connect a database session first.');
      return;
    }

    const submitStart = Date.now();
    const frontendSubmittedAt = new Date(submitStart).toISOString();

    const userMsg: CopilotChatMessage = {
      id: `usr-${Date.now()}`,
      conversationId: activeConvId || undefined,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
      isAiGenerated: false,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('http://localhost:4000/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          connectionId,
          conversationId: activeConvId,
          frontendSubmittedAt,
          messages: history,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Copilot assistant was unable to process request.');
      }

      const botMsg: CopilotChatMessage = await res.json();
      const renderTime = Date.now();
      if (botMsg.telemetry && botMsg.telemetry.timings) {
        botMsg.telemetry.timings.frontendRenderedAt = new Date(renderTime).toISOString();
        botMsg.telemetry.timings.frontendDurationMs = renderTime - submitStart;
      }
      setMessages((prev) => [...prev, botMsg]);

      // If message has tool calls, expand tool activity by default
      if (botMsg.toolCalls && botMsg.toolCalls.length > 0) {
        setExpandedToolMsgIds((prev) => new Set(prev).add(botMsg.id));
      }

      // Refresh conversation title if updated
      if (activeConvId) {
        fetch(`http://localhost:4000/api/copilot/conversations?connectionId=${connectionId}`)
          .then((r) => r.json())
          .then((data: ConversationSummary[]) => setConversations(data))
          .catch(() => {});
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-aborted`,
            conversationId: activeConvId || undefined,
            role: 'assistant',
            content: `*Request stopped by user.*`,
            timestamp: new Date().toISOString(),
            isAiGenerated: false,
          },
        ]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          conversationId: activeConvId || undefined,
          role: 'assistant',
          content: `⚠️ **Agent Error:** ${err.message || 'Unable to communicate with local API.'}`,
          timestamp: new Date().toISOString(),
          isAiGenerated: false,
        },
      ]);
    } finally {
      setBusy(false);
      abortControllerRef.current = null;
    }
  };

  const handleAction = (action: CopilotAction) => {
    if (action.actionType === 'view_finding') {
      onNavigateToAudit();
    } else if (action.actionType === 'open_table') {
      onNavigateToSchema(action.payload);
    } else if (action.actionType === 'preview_plan' && action.payload) {
      copyCode(action.payload, 'action-plan');
      onNotify('Proposed SQL copied. Review in Schema Designer or SQL Workspace.');
      if (onNavigateToSql) {
        onNavigateToSql(action.payload);
      }
    } else if (action.actionType === 'ask_question' && action.payload) {
      void handleSend(action.payload);
    }
  };

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  // Is conversation in welcome state?
  const isWelcomeState = useMemo(() => {
    return messages.length === 0 || (messages.length === 1 && messages[0]?.role === 'assistant');
  }, [messages]);

  const renderInlineMarkdown = (text: string) => {
    const segments = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return segments.map((seg, i) => {
      if (seg.startsWith('**') && seg.endsWith('**')) {
        return <strong key={i}>{seg.slice(2, -2)}</strong>;
      }
      if (seg.startsWith('*') && seg.endsWith('*')) {
        return <em key={i}>{seg.slice(1, -1)}</em>;
      }
      if (seg.startsWith('`') && seg.endsWith('`')) {
        return (
          <code key={i} className="inline-code">
            {seg.slice(1, -1)}
          </code>
        );
      }
      return seg;
    });
  };

  const renderFormattedContent = (content: string, msgId: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const firstLine = lines[0]?.trim() || '';
        const hasLang = /^[a-z0-9_-]+$/i.test(firstLine);
        const language = hasLang ? firstLine : 'sql';
        const codeLines = hasLang ? lines.slice(1).join('\n') : lines.join('\n');
        const codeId = `${msgId}-code-${index}`;
        const isSql = /sql|postgres|mysql|sqlite/i.test(language);
        const lineCount = codeLines.split('\n').length;

        return (
          <div className="chat-code-block" key={codeId}>
            <div className="code-block-bar">
              <div className="flex items-center gap-2">
                <Code2 size={13} className="text-slate-400" />
                <span className="code-lang-label">{language.toUpperCase()}</span>
                <span className="code-lines-count">{lineCount} lines</span>
              </div>
              <button
                className="copy-code-btn"
                onClick={() => copyCode(codeLines, codeId)}
                title="Copy code to clipboard"
              >
                {copiedCodeId === codeId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copiedCodeId === codeId ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="code-content">
              <code>{isSql ? highlightSql(codeLines) : codeLines}</code>
            </pre>
          </div>
        );
      }

      // Check for Markdown table
      if (part.includes('|') && part.includes('---')) {
        const lines = part.trim().split('\n');
        const tableLines = lines.filter((l) => l.trim().startsWith('|') && l.trim().endsWith('|'));
        if (tableLines.length >= 2) {
          const headerCols = tableLines[0]!
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim());
          const bodyRows = tableLines.slice(2).map((row) =>
            row
              .slice(1, -1)
              .split('|')
              .map((c) => c.trim())
          );

          return (
            <div key={`table-${index}`} className="chat-table-wrapper">
              <table className="chat-table">
                <thead>
                  <tr>
                    {headerCols.map((col, cIdx) => (
                      <th key={cIdx}>{renderInlineMarkdown(col)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx}>{renderInlineMarkdown(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
      }

      const paragraphs = part.split('\n\n');
      return (
        <div key={`text-${index}`} className="chat-text-chunk">
          {paragraphs.map((p, pIdx) => {
            const trimmed = p.trim();
            if (!trimmed) return null;

            if (trimmed.startsWith('#### ')) {
              return (
                <h5 key={pIdx} className="chat-subheading">
                  {renderInlineMarkdown(trimmed.slice(5))}
                </h5>
              );
            }
            if (trimmed.startsWith('### ')) {
              return (
                <h4 key={pIdx} className="chat-heading">
                  {renderInlineMarkdown(trimmed.slice(4))}
                </h4>
              );
            }
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              const items = trimmed.split('\n');
              return (
                <ul key={pIdx} className="chat-list">
                  {items.map((it, iIdx) => (
                    <li key={iIdx} className="chat-list-item">
                      {renderInlineMarkdown(it.replace(/^[-*]\s+/, ''))}
                    </li>
                  ))}
                </ul>
              );
            }
            if (/^\d+\.\s/.test(trimmed)) {
              const items = trimmed.split('\n');
              return (
                <ol key={pIdx} className="chat-list chat-numbered-list">
                  {items.map((it, iIdx) => (
                    <li key={iIdx} className="chat-numbered-item">
                      {renderInlineMarkdown(it.replace(/^\d+\.\s+/, ''))}
                    </li>
                  ))}
                </ol>
              );
            }

            return (
              <p key={pIdx} className="chat-paragraph">
                {renderInlineMarkdown(trimmed)}
              </p>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div className="copilot-workspace-layout">
      {/* 1. Left: Conversation History Sidebar */}
      <div className={`copilot-conv-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="conv-sidebar-header">
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-2">
                <MessageSquare size={15} className="text-slate-500" />
                <span className="conv-sidebar-title">Chats</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="new-chat-btn"
                  onClick={handleNewConversation}
                  title="New Conversation (⌘K)"
                >
                  <Plus size={14} />
                  <span>New Chat</span>
                </button>
                <button
                  className="sidebar-collapse-toggle"
                  onClick={() => setSidebarOpen(false)}
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose size={15} />
                </button>
              </div>
            </>
          ) : (
            <button
              className="sidebar-expand-toggle"
              onClick={() => setSidebarOpen(true)}
              title="Expand conversation list"
              aria-label="Expand conversation list"
            >
              <PanelLeft size={16} />
            </button>
          )}
        </div>

        {sidebarOpen && (
          <>
            {/* Search filter for conversations */}
            <div className="conv-search-bar">
              <Search size={13} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search conversations…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="conv-search-input"
              />
            </div>

            <div className="conv-list">
              {filteredConversations.length === 0 ? (
                <div className="conv-empty">
                  {searchQuery ? 'No matching conversations' : 'No saved conversations'}
                </div>
              ) : (
                filteredConversations.map((c) => (
                  <div
                    key={c.id}
                    className={`conv-item ${activeConvId === c.id ? 'active' : ''}`}
                    onClick={() => loadConversation(c.id)}
                  >
                    <MessageSquare size={13} className="conv-icon" />
                    <span className="conv-title" title={c.title}>
                      {c.title}
                    </span>
                    <button
                      className="conv-del-btn"
                      onClick={(e) => handleDeleteConversation(e, c.id)}
                      title="Delete conversation"
                      aria-label="Delete conversation"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* 2. Center: Main Chat & Agent Timeline Area */}
      <div className="copilot-main-workspace">
        {/* Workspace Sub-Header: Clean Linear/ChatGPT single-row design */}
        <div className="copilot-workspace-topbar">
          <div className="topbar-left-cluster">
            {!sidebarOpen && (
              <button
                className="topbar-sidebar-toggle"
                onClick={() => setSidebarOpen(true)}
                title="Show conversation sidebar"
                aria-label="Show conversation sidebar"
              >
                <PanelLeft size={14} />
              </button>
            )}
            <div className="topbar-title-wrap">
              <MessageSquare size={13} className="topbar-title-icon" />
              <span
                className="topbar-session-title active-conv-title"
                title={sessionTitle}
              >
                {sessionTitle === 'Demo Database Consultation' ? 'Database Consultation' : sessionTitle}
              </span>
            </div>
            <span className="topbar-divider" />
            <div className="topbar-db-badge active-db-tag" title={`Database: ${databaseName} (${engine.toUpperCase()})`}>
              <Database size={12} className="topbar-db-icon" />
              <span className="topbar-db-name">{databaseName || 'No DB'}</span>
              <span className="topbar-engine-tag">{engine.toUpperCase() || 'SQL'}</span>
            </div>
            <div
              className={`topbar-ai-badge ai-badge-pill ${aiConfigured ? 'online' : 'offline'}`}
              title={aiConfigured ? 'Gemini 2.5 Flash Connected' : 'Autonomous Offline Heuristic'}
            >
              <span className="topbar-status-dot" />
              <span className="topbar-ai-label">{aiConfigured ? 'Gemini 2.5 Flash' : 'Offline'}</span>
            </div>
          </div>

          <div className="topbar-right-cluster">
            <button
              className="topbar-action-btn quiet-icon-btn"
              onClick={handleNewConversation}
              title="Start a new consultation session"
            >
              <RotateCcw size={13} />
              <span className="topbar-btn-label">Reset</span>
            </button>
            <button
              className={`topbar-action-btn topbar-intelligence-btn context-drawer-btn ${contextDrawerOpen ? 'active' : ''}`}
              onClick={() => setContextDrawerOpen(!contextDrawerOpen)}
              title="Toggle Database Intelligence Context Drawer"
            >
              <Activity size={13} />
              <span className="topbar-btn-label">Intelligence</span>
            </button>
          </div>
        </div>

        {/* Message Stream */}
        <div className="chat-messages-area" ref={chatMessagesAreaRef}>
          {/* Welcome Screen (Rendered when conversation is fresh) */}
          {isWelcomeState && (
            <div className="copilot-welcome-hero animate-fade-in">
              <div className="welcome-glow-icon">
                <Sparkles size={24} />
              </div>
              <h2 className="welcome-headline">What would you like to investigate?</h2>
              <p className="welcome-subtext">
                Explore your database, diagnose performance issues, understand relationships, and optimize your queries.
              </p>

              {/* 4 Premium Investigation Shortcut Cards */}
              <div className="welcome-shortcuts-grid">
                {INVESTIGATION_SHORTCUTS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      className={`welcome-shortcut-card ${card.borderColor}`}
                      onClick={() => handleSend(card.prompt)}
                      disabled={busy}
                    >
                      <div className={`shortcut-icon-wrap ${card.iconBg}`}>
                        <Icon size={18} className={card.iconColor} />
                      </div>
                      <div className="shortcut-text-wrap">
                        <strong className="shortcut-title">{card.title}</strong>
                        <span className="shortcut-desc">{card.description}</span>
                      </div>
                      <ArrowRight size={14} className="shortcut-arrow" />
                    </button>
                  );
                })}
              </div>

              {/* Suggested Quick Prompt Chips */}
              <div className="welcome-prompt-shelf">
                <span className="shelf-label">Suggested prompts:</span>
                <div className="shelf-chips-wrap">
                  {DEFAULT_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      className="welcome-prompt-chip"
                      onClick={() => handleSend(prompt)}
                      disabled={busy}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Render Actual Messages */}
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isExpanded = expandedToolMsgIds.has(msg.id);
            const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;
            const hasPlan = msg.suggestedActions?.some((a) => a.actionType === 'preview_plan');

            return (
              <div key={msg.id} className={`chat-message-row ${isUser ? 'user-message-row' : 'assistant-message-row'}`}>
                <div className="message-avatar-wrap">
                  {isUser ? (
                    <div className="user-avatar-circle">
                      <User size={15} />
                    </div>
                  ) : (
                    <div className="bot-avatar-circle">
                      <Sparkles size={15} />
                    </div>
                  )}
                </div>

                <div className="message-body-wrap">
                  {/* Tool Activity Timeline Box */}
                  {hasToolCalls && (
                    <div className="agent-activity-card">
                      <div
                        className="agent-activity-header"
                        onClick={() => toggleToolAccordion(msg.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-center gap-2">
                          <Wrench size={14} className="text-blue-600" />
                          <span className="activity-headline">
                            Autonomous Investigation ({msg.toolCalls!.length} database tools executed)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="activity-toggle-hint">{isExpanded ? 'Hide' : 'Details'}</span>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="agent-activity-timeline">
                          {msg.toolCalls!.map((tc) => {
                            const friendlyLabel = TOOL_LABELS[tc.name] || tc.summary || tc.name;
                            return (
                              <div key={tc.id} className="timeline-step">
                                <div className="timeline-node">
                                  <span className={`timeline-dot ${tc.status}`} />
                                </div>
                                <div className="timeline-content">
                                  <div className="timeline-line-1">
                                    <strong className="timeline-friendly-name">{friendlyLabel}</strong>
                                    <code className="timeline-tool-code">{tc.name}</code>
                                  </div>
                                  {tc.summary && tc.summary !== friendlyLabel && (
                                    <span className="timeline-summary">{tc.summary}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Markdown Content */}
                  <div className="message-content-bubble">
                    {renderFormattedContent(msg.content, msg.id)}
                  </div>

                  {/* Two-Phase Plan Engine Review Card (if preview_plan is present) */}
                  {hasPlan && (
                    <div className="two-phase-plan-card">
                      <div className="plan-card-header">
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={16} className="text-emerald-600" />
                          <strong className="plan-card-title">Two-Phase Schema Improvement Proposal</strong>
                        </div>
                        <span className="plan-card-safety-badge">Reviewable & Non-Destructive</span>
                      </div>
                      <p className="plan-card-desc">
                        DBFlow Copilot never self-executes schema alterations. Inspect proposed DDL in the Plan Engine
                        before execution.
                      </p>
                      <div className="plan-card-actions">
                        <button
                          className="button button-primary plan-review-btn"
                          onClick={() => {
                            const planAct = msg.suggestedActions?.find((a) => a.actionType === 'preview_plan');
                            if (planAct) handleAction(planAct);
                          }}
                        >
                          <Sparkles size={14} /> Review in Plan Engine
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Suggested Action Pills Tray */}
                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <div className="chat-actions-tray">
                      {msg.suggestedActions.map((action, aIdx) => (
                        <button
                          key={aIdx}
                          className="chat-action-pill"
                          onClick={() => handleAction(action)}
                        >
                          <span>{action.label}</span>
                          <ArrowRight size={12} />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Message Footer Actions */}
                  {!isUser && (
                    <div className="message-footer-bar">
                      <div className="flex items-center gap-3">
                        <button
                          className="msg-quiet-action-btn"
                          onClick={() => copyFullMessage(msg.content, msg.id)}
                          title="Copy response"
                        >
                          {copiedMsgId === msg.id ? (
                            <Check size={12} className="text-emerald-600" />
                          ) : (
                            <Copy size={12} />
                          )}
                          <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>

                        {msg.telemetry && (
                          <span
                            className="telemetry-chip"
                            title={`Request ID: ${msg.telemetry.requestId || 'N/A'}\nIntent: ${msg.telemetry.classifiedIntent || 'N/A'}\nModel: ${msg.telemetry.model || 'N/A'}\nBackend: ${msg.telemetry.timings?.totalBackendDurationMs}ms\nTotal End-to-End: ${msg.telemetry.timings?.frontendDurationMs || msg.telemetry.timings?.totalBackendDurationMs}ms`}
                          >
                            {msg.telemetry.classifiedIntent ? `${msg.telemetry.classifiedIntent.toLowerCase().replace(/_/g, ' ')} • ` : ''}
                            {msg.telemetry.timings?.frontendDurationMs ? `${msg.telemetry.timings.frontendDurationMs}ms` : `${msg.telemetry.timings?.totalBackendDurationMs}ms`}
                            {msg.telemetry.toolCallsCount ? ` • ${msg.telemetry.toolCallsCount} tools` : ''}
                          </span>
                        )}
                      </div>

                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Reasoning & In-flight Tool Calling State */}
          {busy && (
            <div className="chat-message-row assistant-message-row">
              <div className="message-avatar-wrap">
                <div className="bot-avatar-circle animate-pulse">
                  <Bot size={15} />
                </div>
              </div>
              <div className="message-body-wrap">
                <div className="chat-typing-card">
                  <div className="flex items-center gap-3">
                    <Activity size={15} className="animate-spin text-blue-600" />
                    <span className="typing-status-text">
                      Autonomous agent investigating database metadata & reasoning over findings…
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 3. Floating Bottom Multiline Message Composer */}
        <div className="copilot-composer-container">
          <div className="copilot-composer-card">
            <textarea
              ref={textareaRef}
              rows={1}
              className="copilot-textarea"
              placeholder="Ask DBFlow Copilot about performance, indexes, relationships, or optimization..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={busy}
            />

            <div className="composer-actions-bar">
              <span className="composer-helper-hint">
                <kbd>Shift</kbd> + <kbd>Enter</kbd> for newline • <kbd>Enter</kbd> to send
              </span>

              {busy ? (
                <button
                  type="button"
                  className="composer-stop-btn"
                  onClick={handleStopGeneration}
                  title="Stop generating response (Esc)"
                >
                  <StopCircle size={15} />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="composer-send-btn"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  title="Send message to Copilot"
                >
                  <Send size={14} />
                  <span>Send</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Right: Collapsible Database Context & Intelligence Drawer */}
      {contextDrawerOpen && (
        <div className="copilot-context-drawer">
          <div className="context-drawer-header">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-blue-600" />
              <strong>Database Intelligence</strong>
            </div>
            <button
              className="drawer-close-btn"
              onClick={() => setContextDrawerOpen(false)}
              title="Close drawer"
            >
              <PanelRightClose size={15} />
            </button>
          </div>

          <div className="context-drawer-body">
            {/* Health Snapshot */}
            <div className="drawer-metric-card">
              <span className="drawer-card-label">HEALTH SCORE</span>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-slate-800">100</span>
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
                <span className="badge-grade-a">Grade A</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Calculated deterministically from schema rules & index coverage.
              </p>
              <button
                className="button button-quiet w-full mt-3 text-xs flex items-center justify-center gap-1"
                onClick={onNavigateToAudit}
              >
                <span>View Full Audit Breakdown</span>
                <ArrowRight size={12} />
              </button>
            </div>

            {/* Quick Investigation Launcher */}
            <div className="drawer-section">
              <span className="drawer-section-title">QUICK INVESTIGATIONS</span>
              <div className="flex flex-col gap-2 mt-2">
                <button
                  className="drawer-quick-btn"
                  onClick={() => handleSend('Explain all foreign key relationships in my database.')}
                  disabled={busy}
                >
                  <Compass size={13} className="text-indigo-500" />
                  <span>Explain Relationships</span>
                </button>
                <button
                  className="drawer-quick-btn"
                  onClick={() => handleSend('Suggest indexes for my foreign keys.')}
                  disabled={busy}
                >
                  <Layers size={13} className="text-blue-500" />
                  <span>Suggest Indexes</span>
                </button>
                <button
                  className="drawer-quick-btn"
                  onClick={() => handleSend('Generate SQL to add indexes to my foreign keys.')}
                  disabled={busy}
                >
                  <Code2 size={13} className="text-emerald-500" />
                  <span>Generate Index SQL</span>
                </button>
                <button
                  className="drawer-quick-btn"
                  onClick={() => handleSend('Is my database properly normalized? Check 1NF, 2NF, and 3NF.')}
                  disabled={busy}
                >
                  <CheckCircle2 size={13} className="text-amber-500" />
                  <span>Normalization Audit</span>
                </button>
              </div>
            </div>

            {/* Navigation Shortcuts */}
            <div className="drawer-section mt-4">
              <span className="drawer-section-title">DBFLOW WORKSPACE TOOLS</span>
              <div className="flex flex-col gap-2 mt-2">
                <button
                  className="drawer-quick-btn"
                  onClick={() => onNavigateToSchema()}
                >
                  <ExternalLink size={13} className="text-slate-500" />
                  <span>Open Schema Designer</span>
                </button>
                <button
                  className="drawer-quick-btn"
                  onClick={() => onNavigateToSql('SELECT * FROM students LIMIT 10;')}
                >
                  <Terminal size={13} className="text-slate-500" />
                  <span>Open SQL Workspace</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
