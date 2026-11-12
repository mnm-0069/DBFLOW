export type CopilotSeverity = 'critical' | 'warning' | 'optimization' | 'info';

export type CopilotCategory = 'performance' | 'integrity' | 'schema_design' | 'storage' | 'security';

export type CopilotConfidence = 'confirmed' | 'high' | 'heuristic';

export type HealthFinding = {
  id: string;
  title: string;
  severity: CopilotSeverity;
  category: CopilotCategory;
  table: string;
  column?: string;
  problem: string;
  explanation: string;
  evidence: string;
  recommendedSolution: string;
  suggestedSql?: string;
  expectedBenefit: string;
  potentialRisks: string;
  isReversible: boolean;
  rollbackSql?: string;
  confidence: CopilotConfidence;
};

export type HealthScoreBreakdown = {
  baseScore: number;
  totalDeductions: number;
  finalScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  deductions: Array<{
    reason: string;
    points: number;
    category: CopilotCategory;
  }>;
  categoryScores: {
    performance: number;
    integrity: number;
    schemaDesign: number;
  };
};

export type DatabaseHealthReport = {
  engine: 'postgres' | 'mysql' | 'demo';
  database: string;
  analyzedAt: string;
  tableCount: number;
  totalColumns: number;
  foreignKeyCount: number;
  indexCount: number;
  healthScore: HealthScoreBreakdown;
  findings: HealthFinding[];
  summary: {
    criticalCount: number;
    warningCount: number;
    optimizationCount: number;
    infoCount: number;
  };
};

export type AgentToolStatus = 'running' | 'completed' | 'failed';

export type AgentToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: AgentToolStatus;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  error?: string;
};

export type CopilotActionType = 'run_sql' | 'open_table' | 'view_finding' | 'ask_question' | 'preview_plan';

export type CopilotAction = {
  label: string;
  actionType: CopilotActionType;
  payload?: string;
};

export type CopilotExecutionSource =
  | 'conversational_fast_path'
  | 'deterministic_local'
  | 'cached_intelligence'
  | 'gemini_direct'
  | 'gemini_with_tools'
  | 'heuristic_agent';

export interface CopilotStageTimings {
  frontendSubmittedAt?: string;
  requestReceivedAt: string;
  intentClassifiedAt?: string;
  intentClassificationDurationMs?: number;
  historyRetrievedAt?: string;
  historyRetrievalDurationMs?: number;
  contextRetrievedAt?: string;
  contextRetrievalDurationMs?: number;
  geminiRequestStartedAt?: string;
  geminiFirstResponseAt?: string;
  geminiResponseReceivedAt?: string;
  geminiDurationMs?: number;
  completedAt: string;
  totalBackendDurationMs: number;
  frontendRenderedAt?: string;
  frontendDurationMs?: number;
}

export interface CopilotExecutionTelemetry {
  requestId?: string;
  source: CopilotExecutionSource;
  provider?: string;
  model?: string;
  classifiedIntent?: string;
  geminiInvoked?: boolean;
  apiRequestsCount?: number;
  toolCallsCount?: number;
  iterationsCount?: number;
  timings: CopilotStageTimings;
}

export type CopilotChatMessage = {
  id: string;
  conversationId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  suggestedActions?: CopilotAction[];
  isAiGenerated: boolean;
  toolCalls?: AgentToolCall[];
  telemetry?: CopilotExecutionTelemetry;
};

export type ConversationSummary = {
  id: string;
  connectionId: string;
  userId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ConversationDetail = {
  id: string;
  connectionId: string;
  userId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: CopilotChatMessage[];
};

export type ExplainQueryRequest = {
  connectionId: string;
  query: string;
};

export type QueryScanInfo = {
  table: string;
  scanType: string;
  isSequential: boolean;
  filterCondition?: string;
};

export type QueryJoinInfo = {
  type: string;
  condition?: string;
};

export type ExplainQueryResponse = {
  originalQuery: string;
  estimatedCost?: {
    startupCost?: number;
    totalCost?: number;
    planRows?: number;
    planWidth?: number;
  };
  scansUsed: QueryScanInfo[];
  joinsUsed: QueryJoinInfo[];
  explanation: string;
  potentialInefficiencies: string[];
  suggestedSql?: string;
  suggestedSqlExplanation?: string;
  executionPlanRaw?: string;
  isAiEnhanced: boolean;
};

export type NlToSqlRequest = {
  connectionId: string;
  prompt: string;
};

export type NlToSqlResponse = {
  sql: string;
  explanation: string;
  assumptions: string[];
  targetTables: string[];
  isAiGenerated: boolean;
};

export type CopilotStatusResponse = {
  aiConfigured: boolean;
  provider: string;
  model: string;
  features: {
    healthAnalysis: boolean;
    explainQuery: boolean;
    aiChat: boolean;
    nlToSql: boolean;
  };
};

export type IntelligenceFreshnessState = 'fresh' | 'updating' | 'stale' | 'failed';

export type CategoryStatus = 'pending' | 'running' | 'ready' | 'failed';

export interface IntelligenceCategoryStatus {
  schema: CategoryStatus;
  relationships: CategoryStatus;
  indexes: CategoryStatus;
  health: CategoryStatus;
  dataProfiling: CategoryStatus;
}

export interface TableColumnProfile {
  columnName: string;
  dataType: string;
  nullable: boolean;
  nullCount?: number;
  nullPercentage?: number;
  distinctCountEstimate?: number;
}

export interface TableProfile {
  tableName: string;
  schema: string;
  estimatedRowCount: number;
  columnStats: TableColumnProfile[];
  scanStats?: {
    seqScans?: number;
    indexScans?: number;
  };
  lastProfiledAt: string;
}

export interface SchemaSnapshotTable {
  name: string;
  schema: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isUnique: boolean;
    hasDefault: boolean;
    isGenerated: boolean;
  }>;
  primaryKey: string[];
  uniqueConstraints: Array<{ name: string; columns: string[] }>;
  foreignKeys: Array<{
    constraintName: string;
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
    onDelete?: string;
    onUpdate?: string;
  }>;
}

export interface DatabaseIntelligenceSnapshot {
  connectionId: string;
  engine: 'postgres' | 'mysql';
  database: string;
  schemaFingerprint: string;
  analysisVersion: number;
  generation: number;
  freshnessState: IntelligenceFreshnessState;
  categoryStatus: IntelligenceCategoryStatus;
  startedAt: string;
  completedAt?: string;
  lastSuccessfulAnalysisTime?: string;
  errorMessage?: string;
  schema: {
    tables: SchemaSnapshotTable[];
    views: Array<{ name: string; schema: string }>;
    tableCount: number;
  };
  relationships: {
    graph: Array<{
      fromTable: string;
      fromColumns: string[];
      toTable: string;
      toColumns: string[];
      constraintName: string;
    }>;
    rootTables: string[];
    leafTables: string[];
    junctionTables: string[];
    parentChildMappings: Record<string, string[]>;
  };
  indexes: {
    existingIndexes: Array<{
      tableName: string;
      indexName: string;
      columns: string[];
      isUnique: boolean;
      isPrimary: boolean;
      definition?: string;
    }>;
    unindexedForeignKeys: Array<{
      tableName: string;
      foreignKeyName: string;
      columns: string[];
      referencedTable: string;
    }>;
    redundantIndexes: Array<{
      tableName: string;
      indexName: string;
      coveredByIndex: string;
      reason: string;
    }>;
    missingIndexRecommendations: Array<{
      tableName: string;
      suggestedIndexName: string;
      columns: string[];
      reason: string;
      suggestedSql: string;
    }>;
  };
  health: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    categoryScores: Record<string, number>;
    findings: HealthFinding[];
  };
  tableProfiles: Record<string, TableProfile>;
  recommendations: Array<{
    id: string;
    title: string;
    category: string;
    severity: CopilotSeverity;
    suggestedSql?: string;
    rollbackSql?: string;
    explanation: string;
    confidence: CopilotConfidence;
  }>;
}

export type JobLifecycleState = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'partially_completed';

export interface IntelligenceStatusResponse {
  connectionId: string;
  status: JobLifecycleState;
  freshnessState: IntelligenceFreshnessState;
  categoryStatus: IntelligenceCategoryStatus;
  lastSuccessfulAnalysisTime?: string;
  errorMessage?: string;
  snapshot?: DatabaseIntelligenceSnapshot;
}

