# AI Project Delivery OS — Architecture Handoff & Continuity Pack

Status: PROPOSED / NOT APPROVED / NO NEW IMPLEMENTATION.
Recorded: 2026-10-17 (Asia/Bangkok).
Purpose: preserve the agreed design context across ChatGPT sessions and prevent architecture drift.

## Non-negotiable decisions
1. **Architecture-first selective reuse**: the target architecture is independently designed. Existing repositories are references/assets only, not architectural authorities.
2. **Comprehensive target before MVP**: 7 product domains, 24 business capabilities, 12 shared platform capabilities and 12 cross-domain workflows. 24 capabilities != 24 LLM agents.
3. **Workflow-first**, versioned agent contracts, deterministic computation for quantitative/business rule operations, evidence-based reasoning, explicit human approval, tenant isolation, evaluation, audit, observability.
4. Modular monolith initially; domain boundaries are stable. Read-only external integrations by default, no auto-approval/release/changes.
5. Fintech-quality scope: change control, resource/workload, finance, stakeholder, governance, security/compliance, release readiness, SDLC improvement, AI adoption/ROI must remain visible in the overall architecture even if deferred for implementation.
6. **Do not let old prototypes dictate framework selection or runtime contracts.** Existing React/Vite UI, BA validators, risk graph, PMIS KPI schemas and evaluation fixtures are reuse candidates, not mandatory dependencies.
7. No repo deletion or archive until dependency, legal/privacy and test audit is done. No real client data in demos.

## Product goals
- Enterprise PM/BA/delivery fintech demo (VDF JD as requirements reference).
- Reusable commercial platform: service-first -> managed offering -> multi-tenant SaaS.
- North star: auditable decisions/actions supported by verified project evidence and followed through to outcomes.

## Canonical layers
Experience -> Application/Workflow Orchestrator -> Specialized Domain Agents & Deterministic Engines -> Shared Agent Harness -> Canonical Data/Integration.
The harness includes contract registry, context/retrieval, tool gateway, guardrails, provenance, evaluator, tracing, cost limits, model adapter, human approvals.

## Required output of P0 Architecture Completeness & Domain Modeling
- CAPABILITY_MAP.md
- DOMAIN_BOUNDARIES.md
- AGENT_REGISTRY.md
- WORKFLOW_CATALOG.md
- CANONICAL_DOMAIN_MODEL.md
- ASSET_REUSE_REGISTER.md
- ARCHITECTURE_ADRS.md
- plus evidence-backed completeness and traceability review.
All are *planned*, not approved.
Start next session by reading CAPABILITY_REGISTRY.md and DECISIONS_AND_NEXT_STEPS.md in this folder, verify current GitHub HEAD, then continue P0. Do not begin wholesale rewriting.

## Existing assets (8 in-scope repositories)
- khannitran-coder/Ba-Pm-agent: BA contracts, domain validation, evidence, RTM, UAT, privacy, tests; version v0.3.0 documented, live API acceptance pending.
- khannitran-coder/PIMS-AI: 38 KPI dictionary, mappings, registry, import policy, negative fixtures; mostly P0/P1 documents, no running application verified.
- khannitran-coder/risk-monitoring-agent-2.0: LangGraph risk prototype, rules, simulated connectors, human checkpoints; the >=2/3 source rule is *not* acceptable as a universal severity gate.
- khannitran-coder/AI-PM-Harness-starter: 90-case golden set, anonymizer, validators and benchmark harness; real-model benchmark not yet performed.
- khannitran-coder/PM-skills: 9 PM knowledge skills; dangling references, overlapping routing, verify PMBOK statements and PDF redistribution rights.
- khannitran-coder/Multi-agent-platform: UI, FastAPI, SQLite, versioned artifacts, BA integration prototype; existing tests documented, but auth and production isolation absent.
- khannitran-coder/Pm-agent-weekly-report: reporting/BDD/guardrail ideas; mock RAG and misleading APPROVED_BY_HARNESS flag must not be adopted.
- khannitran-coder/sprint-risk-monitoring-agent: earlier mostly-empty skeleton; archive candidate only after dependency checking.
Out of scope: vocab-to-anki-pipeline.

## Snapshot limitations
Previous audit included repository file trees, important READMEs, selected code, docs and test reports. It did NOT independently rerun every suite, review every line/branch/PR, certify security, or deploy. Distinguish findings from claims in repository READMEs.

This branch is only a persistence location for documentation. It **does not mean Multi-agent-platform has been selected as the target architecture**. Move the baseline to a dedicated private product repo when repository-creation tooling/permission is available.
