# Deployment Diagram — Physical & Containerized Runtime Topology

## 1. Overview
The **Deployment Diagram** models the physical and execution environments of the DBFlow platform. It illustrates the distribution of software artifacts across the developer workstation (client), local application server (Node.js/Express), target database infrastructure (PostgreSQL and MySQL), and external cloud AI services (Google Gemini).

## 2. Nodes & Deployment Artifacts
- **Client Device (Developer Workstation)**:
  - Runs a modern web browser hosting the React 18 SPA (Vite production build), Monaco Editor worker thread, AG Grid Community engine, and React Flow canvas.
  - Utilizes browser `sessionStorage` for tab-isolated query execution histories.
- **Application Server Host (Local Developer Machine / Host)**:
  - Node.js v24.x runtime hosting the DBFlow Express API service (`server.ts`).
  - **Strict Loopback Binding**: Binds exclusively to `127.0.0.1:4000`, preventing LAN exposure.
  - **In-Memory State**: Ephemeral session map with 15-minute idle TTL and staged two-phase plan map (5-minute TTL).
  - **Local Persistence**: Stores cache files in `apps/api/data/` (`intelligence-cache.json` and `copilot-conversations.json`).
- **Target Database Tier (Local / Docker Container)**:
  - PostgreSQL 14–18.6 instance listening on TCP port 5432.
  - MySQL 8.0+ instance listening on TCP port 3306.
  - Communicates via native wire protocols with optional TLS/SSL encryption.
- **Cloud AI Services**:
  - Google Gemini API (`generativelanguage.googleapis.com`) accessed over outbound HTTPS (port 443) with TLS 1.3 encryption and API key authorization.

## 3. Existing vs. Future Production Deployment Considerations
| Aspect | Current Implementation | Production Target Architecture |
| :--- | :--- | :--- |
| **Hosting Mode** | Local developer workstation / single-node | Multi-container Docker Compose / Kubernetes cluster |
| **API Network Binding** | Loopback only (`127.0.0.1`) | Nginx reverse proxy with TLS certificate termination |
| **Authentication** | Ephemeral in-memory session tokens | User accounts, JWT auth, RBAC, and tenant isolation |
| **Credential Storage**| In-memory connection pools (15-min TTL) | HashiCorp Vault / Cloud Secret Manager integration |
| **Database Egress** | `DatabaseHostValidator` DNS & IP pinning | Dedicated egress proxies with VPC firewall isolation |
