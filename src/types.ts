export interface ProjectSummary {
  id: string;
  name: string;
  objective: string;
  created_at: string;
  run_count: number;
  blockers: number;
  artifact_count: number;
}
export interface Run {
  id: string;
  project_id: string;
  workflow: string;
  state: string;
  step: string;
  version: number;
  turns: number;
  attempts: number;
  created_at: string;
  source_id: string | null;
}
export interface Source {
  id: string;
  name: string;
  text: string;
  version: number;
  hash: string;
}
export interface Message {
  id: string;
  run_id: string;
  role: string;
  text: string;
  created_at: string;
}
export interface AuditEvent {
  id: string;
  run_id: string | null;
  kind: string;
  detail: string;
  actor: string;
  created_at: string;
}
export interface Review {
  id: string;
  decision: string;
  comment: string;
  actor: string;
  created_at: string;
}
export interface Artifact {
  id: string;
  run_id: string;
  version: number;
  hash: string;
  technical: string;
  business: string;
  approval: string;
  created_at: string;
  reviews: Review[];
  content: {
    ba_bundle?: BaBundle;
    ba_sources?: {
      id: string;
      version: string;
      content_hash: string;
      text: string;
    }[];
    origin?: {
      adapter: string;
      agent_commit: string;
      agent_version: string;
      run_hash: string;
      validation: string;
    };
    title: string;
    summary: string;
    source_id: string;
    source_hash: string;
    answer: string;
    change_request: string;
    uat_status: string;
    requirements: {
      id: string;
      title: string;
      description: string;
      evidence: string;
      priority: string;
    }[];
    stories: {
      id: string;
      requirement_id: string;
      text: string;
      given: string;
      when: string;
      then: string;
    }[];
  };
}
export interface Snapshot {
  id: string;
  run_id: string;
  text: string;
  created_at: string;
}
export interface Project extends ProjectSummary {
  sources: Source[];
  runs: Run[];
  artifacts: Artifact[];
  messages: Message[];
  events: AuditEvent[];
  snapshots: Snapshot[];
  channel: { enabled: boolean; schedule: string };
}
export interface Agent {
  id: string;
  commit?: string;
  name: string;
  version: string;
  category: string;
  capability: string;
  mode: string;
  input_schema: string;
  output_schema: string;
  platform_output?: string;
  available: boolean;
  harness_status?: string;
}

export interface BaBundle {
  project: string;
  agent_version: string;
  state: string;
  baseline_status: string;
  uat_signoff: string;
  ba_verification: string;
  business_validation: string;
  requirements: {
    id: string;
    description: string;
    business_need: string;
    priority: string;
    scope: string;
    status: string;
    route: string;
    evidence: {
      source_id: string;
      line: number;
      quote: string;
      source_version: string;
    }[];
  }[];
  stories: {
    id: string;
    role: string;
    goal: string;
    benefit: string;
    status: string;
    requirement_ids: string[];
    acceptance_criteria: {
      id: string;
      kind: string;
      given: string;
      when: string;
      then: string;
    }[];
  }[];
  rtm: {
    requirement_id: string;
    story_ids: string[];
    test_ids: string[];
    uat_status: string;
    gap: string | null;
    owner: string;
  }[];
  tests: {
    id: string;
    story_id: string;
    ac_id: string;
    requirement_ids: string[];
    precondition: string;
    steps: string[];
    expected: string;
    actual: string | null;
    status: string;
  }[];
  review_findings: {
    id: string;
    message: string;
    owner: string;
    rule_id: string;
    severity: string;
    target_id: string;
  }[];
  questions: unknown[];
  conflicts: unknown[];
  handoffs: unknown[];
}
