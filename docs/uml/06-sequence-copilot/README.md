# Sequence Diagram — Database Copilot 2.0 Autonomous Agent Loop

## 1. Overview
This sequence diagram details the DBFlow Copilot 2.0 hybrid conversational AI architecture. It demonstrates how user inquiries are routed through intent classification into either a deterministic fast path, a conversational path, or an iterative autonomous database agent loop with live tool execution.

## 2. Intent Routing Paths
- **Path A: Deterministic Local Fast Path**:
  - Triggered by greetings, gratitude, goodbyes, and acknowledgements.
  - Resolves instantly locally ($< 2\text{ ms}$) without invoking external LLM APIs, returning contextual greeting text and suggested starter actions.
- **Path B: Conversational Intelligence**:
  - Triggered by general questions, programming questions, or architectural discussions.
  - Dispatches a lightweight single-turn call to Google Gemini 3.8 Flash without database tool overhead, preserving conversational fluidity.
- **Path C: Autonomous Database Specialist Agent Loop**:
  - Triggered by database inspection, performance diagnostics, index analysis, or schema questions.
  - Injects live catalog metadata and 14 specialized tool declarations.
  - Executes up to 8 autonomous iterations: Gemini requests a tool $\to$ `AgentEngine` runs the live tool handler $\to$ returns tool results back to Gemini $\to$ Gemini reflects and decides whether further tools are needed.
  - Synthesizes findings, assigns confidence ratings, and generates structured action buttons (e.g. `preview_plan` for one-click index migrations).
