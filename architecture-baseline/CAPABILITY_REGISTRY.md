# Capability Registry v2.0 — Architecture Scope, not Implementation

Seven product domains / 24 business capabilities:

## A. Strategy & Governance
- A01 Portfolio Intelligence (P3)
- A02 Project Governance (P1)
- A03 Benefits & Value Intelligence (P3)

## B. Discovery & Planning
- B01 Requirement Intelligence (P1)
- B02 Planning & Estimation (P2)
- B03 Change Control Intelligence (P2)

## C. Delivery & Resources
- C01 Delivery Intelligence (P1)
- C02 Risk & Issue Intelligence (P1)
- C03 Resource & Capacity (P2)
- C04 Financial Intelligence (P2)
- C05 Vendor & Dependency (P3)

## D. People & Stakeholders
- D01 Stakeholder Intelligence (P2)
- D02 Communication & Decision (P1)
- D03 Team Enablement (P3)

## E. Engineering & Quality
- E01 Engineering Flow Intelligence (P2)
- E02 QA & Test Intelligence (P2)
- E03 Release Readiness (P2)
- E04 Security & Compliance Assurance (P2)
- E05 Incident & Reliability (P3)

## F. Continuous Improvement
- F01 SDLC Improvement (P3)
- F02 Knowledge & Lessons Learned (P3)
- F03 AI Adoption & ROI (P2)

## G. Enterprise Operations
- G01 Executive & PMO Reporting (P1)
- G02 Delivery Process Compliance (P3)

Priority summary: P1=7, P2=10, P3=7. Architecture coverage does not mean all 24 are autonomous LLM agents; distinguish reasoning agents, deterministic engines, workflow services and data/knowledge services. Security, approval, evidence and AI/SDLC measurement hooks begin in P1 even if advanced modules are deferred.

## Shared platform capabilities (12)
1. Identity & Tenant Management
2. Project Context Service
3. Agent Registry & Contracts
4. Workflow Orchestration
5. Tool & Connector Gateway
6. Canonical Data & Mapping
7. Evidence & Provenance
8. Policy & Guardrail Engine
9. Human Approval Service
10. Model Gateway & Cost Control
11. Evaluation & Observability
12. Notification & Integration Events

## Cross-domain workflows (12)
- WF-01 New Project Setup: Governance + Planning + Resource + Finance
- WF-02 Requirement Discovery: Requirement + Stakeholder + QA
- WF-03 Change Impact: Requirement + Planning + Resource + Finance + Risk + QA
- WF-04 Sprint Health: Delivery + Risk + Capacity + Engineering
- WF-05 Critical Risk Escalation: Risk + Vendor + Stakeholder + Decision
- WF-06 Release Readiness: QA + Security + Release + Vendor + Operations
- WF-07 Portfolio Review: Portfolio + Delivery + Finance + Value
- WF-08 Weekly Executive Review: Delivery + Risk + Finance + Stakeholder
- WF-09 Process Improvement: SDLC + Engineering + QA + Knowledge
- WF-10 AI Adoption Pilot: AI Adoption + Finance + Governance + Security
- WF-11 Incident Follow-up: Incident + Risk + QA + Knowledge
- WF-12 Vendor Dependency Review: Vendor + Planning + Risk + Stakeholder

## Canonical logical entity families
Organization & Portfolio: Tenant, Organization, Portfolio, Program, Project, User, Role.
Governance & Planning: Charter, Baseline, Milestone, Estimate, Dependency, ChangeRequest.
People & Capacity: Resource, Team, Skill, Availability, Allocation, CapacityPlan.
Delivery & Engineering: WorkItem, Sprint, Commit, PullRequest, Build, Deployment.
Financial & Vendor: Budget, CostEntry, Forecast, Contract, Vendor, Commitment.
Quality & Risk: Requirement, TestCase, TestRun, Defect, Risk, Issue, Incident.
Stakeholder & Decision: Stakeholder, Engagement, Meeting, Decision, Approval, Action.
Knowledge & AI: Artifact, EvidenceRef, Snapshot, AgentRun, Evaluation, AdoptionMetric, ImprovementExperiment.

All above require detailed contracts and traceability in P0; they are not implemented by this document.
