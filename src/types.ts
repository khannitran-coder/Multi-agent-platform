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
  source_id: string;
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
}
