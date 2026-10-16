import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileCode2,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";
import type { Artifact, Run } from "./types";

export function BaWorkflow({
  busy,
  ready,
  start,
}: {
  busy: boolean;
  ready: boolean;
  start: (
    workflow: string,
    proposal?: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [proposal, setProposal] = useState("");
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const fixture = await api<{ proposal: Record<string, unknown> }>(
        "/ba/fixture",
      );
      setProposal(JSON.stringify(fixture.proposal, null, 2));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function run() {
    setError("");
    try {
      const value = proposal.trim() ? JSON.parse(proposal) : undefined;
      if (value && (typeof value !== "object" || Array.isArray(value)))
        throw new Error("Proposal cần là JSON object.");
      await start("ba-harness-fixture", value);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel ba-workflow">
      <div className="section-row">
        <div>
          <div className="eyebrow">CONNECTED HARNESS / FIXTURE DATA</div>
          <h2>BA Harness · Fixture</h2>
        </div>
        <span className="badge green">
          {ready ? "Runtime sẵn sàng" : "Runtime chưa sẵn sàng"}
        </span>
      </div>
      <p>
        Chạy Python harness thật trên fixture <strong>Báo cáo công nợ</strong>:
        kiểm tra schema, domain, manifest và nhập review pack. Không gọi model;
        không phân tích notes của project.
      </p>
      <div className="workflow-chain">
        <span>Supplied proposal</span>
        <ArrowRight size={14} />
        <span>BA CLI</span>
        <ArrowRight size={14} />
        <span>Integrity & domain</span>
        <ArrowRight size={14} />
        <span>PM review</span>
      </div>
      <details>
        <summary>Chỉnh proposal JSON (tùy chọn)</summary>
        <p>
          Context, principals và reviews là fixture cố định. Bạn chỉ chỉnh
          proposal; dữ liệu không hợp lệ sẽ bị gate từ chối, không tạo artifact.
        </p>
        <button
          className="text-button"
          disabled={busy || !ready}
          onClick={load}
        >
          Nạp proposal mẫu
        </button>
        <label className="field">
          Proposal cung cấp sẵn
          <textarea
            className="json-editor"
            aria-label="Proposal BA JSON"
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            placeholder="Để trống để dùng proposal fixture nguyên bản."
            maxLength={200000}
          />
        </label>
        <button className="text-button" onClick={() => setProposal("")}>
          Dùng lại fixture nguyên bản
        </button>
      </details>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="workflow-footer">
        <span>
          <ShieldCheck size={15} />
          Technical pass luôn tách khỏi human approval
        </span>
        <button
          className="button primary"
          disabled={busy || !ready}
          onClick={run}
        >
          Chạy BA harness fixture
          <ArrowRight size={15} />
        </button>
      </div>
      {!ready && (
        <p className="muted">
          Chạy <code>python3 scripts/prepare_ba_runtime.py</code> trong checkout
          platform để cài dependency pin commit.
        </p>
      )}
    </section>
  );
}

interface Invocation {
  agent_commit: string;
  state: string;
  input_hash: string;
  context: { project: string; sources: { id: string; text: string }[] };
  result: Record<string, unknown>;
}
export function BaRunDetails({ run }: { run: Run }) {
  const [data, setData] = useState<Invocation | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api<Invocation>("/runs/" + run.id + "/ba")
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [run.id, run.state]);
  return (
    <section className="panel ba-run-details">
      <h3>
        <FileCode2 size={18} />
        Invocation BA thật
      </h3>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            <strong>{data.context.project}</strong>
          </p>
          <p>
            Input: fixture cố định + supplied proposal. Không dùng notes của
            project.
          </p>
          <dl>
            <dt>Commit pin</dt>
            <dd className="mono hash">{data.agent_commit}</dd>
            <dt>Input SHA-256</dt>
            <dd className="mono hash">{data.input_hash}</dd>
            <dt>BA state</dt>
            <dd data-testid="ba-state">{data.state}</dd>
          </dl>
          {data.result && Object.keys(data.result).length > 0 && (
            <details open={run.state === "escalated" || run.state === "failed"}>
              <summary>Result / findings</summary>
              <pre className="json-output">
                {JSON.stringify(data.result, null, 2)}
              </pre>
            </details>
          )}
          <details>
            <summary>Nguồn fixture đã khóa</summary>
            {data.context.sources.map((s) => (
              <div className="ba-source" key={s.id}>
                <strong>{s.id}</strong>
                <p>{s.text}</p>
              </div>
            ))}
          </details>
        </>
      )}
    </section>
  );
}

export function BaArtifactBody({
  artifact,
  tab,
}: {
  artifact: Artifact;
  tab: string;
}) {
  const bundle = artifact.content.ba_bundle!;
  return (
    <div className="document-body ba-document">
      <div className="document-eyebrow">
        REAL BA HARNESS / SUPPLIED PROPOSAL / SYNTHETIC FIXTURE
      </div>
      <h2>{artifact.content.title}</h2>
      <p className="document-intro">{artifact.content.summary}</p>
      <div className="alert success">
        <CheckCircle2 size={17} />
        Canonical schema, domain và manifest đã được kiểm tra. Không có model
        sinh nội dung trong workflow này.
      </div>
      <div className="clarification-note">
        <strong>Giới hạn dữ liệu và review</strong>
        <p>
          Pack này dùng fixture công nợ, không phải kết quả phân tích notes của
          project. BA verification: {bundle.ba_verification}; business
          validation: {bundle.business_validation}; baseline:{" "}
          {bundle.baseline_status}; UAT sign-off: {bundle.uat_signoff}.
        </p>
      </div>
      {tab === "requirements" && (
        <>
          {bundle.requirements.map((r) => (
            <article key={r.id} className="requirement">
              <div>
                <span className="mono">{r.id}</span>
                <span className="badge">
                  {r.priority} · proposed · {r.scope}
                </span>
              </div>
              <h3>{r.description}</h3>
              <p>{r.business_need}</p>
              <p>
                Status: {r.status} · Route: {r.route}
              </p>
              {r.evidence.map((e, i) => (
                <blockquote key={i}>
                  <span className="mono">
                    {e.source_id}:L{e.line} · {e.source_version}
                  </span>
                  <p>{e.quote}</p>
                </blockquote>
              ))}
            </article>
          ))}
          <h3>BA review findings ({bundle.review_findings.length})</h3>
          <p className="muted">
            Các mục bên dưới cần người có thẩm quyền kiểm tra ý nghĩa. Trích dẫn
            nguồn khớp chưa tự xác nhận claim.
          </p>
          <div className="ba-findings" role="list">
            {bundle.review_findings.map((f) => (
              <article key={f.id} role="listitem">
                <div>
                  <span className="badge amber">{f.severity}</span>
                  <span className="mono">
                    {f.target_id} · {f.id}
                  </span>
                </div>
                <p>{f.message}</p>
                <small>
                  Owner: {f.owner} · {f.rule_id}
                </small>
              </article>
            ))}
          </div>
          <details>
            <summary>Câu hỏi / conflicts / handoff đề xuất</summary>
            <pre className="json-output">
              {JSON.stringify(
                {
                  questions: bundle.questions,
                  conflicts: bundle.conflicts,
                  handoffs: bundle.handoffs,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
      {tab === "stories" &&
        bundle.stories.map((s) => (
          <article className="story" key={s.id}>
            <span className="mono">
              {s.id} → {s.requirement_ids.join(", ")}
            </span>
            <h3>
              As a {s.role}, I want {s.goal}, so that {s.benefit}.
            </h3>
            <span className="badge amber">{s.status}</span>
            {s.acceptance_criteria.map((ac) => (
              <section key={ac.id} className="ba-ac">
                <h3>
                  {ac.id} · {ac.kind}
                </h3>
                <dl>
                  <dt>GIVEN</dt>
                  <dd>{ac.given}</dd>
                  <dt>WHEN</dt>
                  <dd>{ac.when}</dd>
                  <dt>THEN</dt>
                  <dd>{ac.then}</dd>
                </dl>
              </section>
            ))}
          </article>
        ))}
      {tab === "rtm" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Stories</th>
                <th>Tests</th>
                <th>UAT / Gap</th>
              </tr>
            </thead>
            <tbody>
              {bundle.rtm.map((r) => (
                <tr key={r.requirement_id}>
                  <td>{r.requirement_id}</td>
                  <td>{r.story_ids.join(", ") || "—"}</td>
                  <td>{r.test_ids.join(", ") || "—"}</td>
                  <td>
                    {r.uat_status}
                    <br />
                    {r.gap || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            RTM nguyên bản từ harness; liên kết kỹ thuật không chứng minh đủ
            coverage nghiệp vụ.
          </p>
        </div>
      )}
      {tab === "uat" && (
        <>
          <div className="alert neutral">
            UAT plan nháp từ harness · không phải kết quả thực thi.
          </div>
          {bundle.tests.map((t) => (
            <article className="requirement" key={t.id}>
              <span className="mono">
                {t.id} → {t.story_id} / {t.ac_id}
              </span>
              <h3>{t.requirement_ids.join(", ")}</h3>
              <p>Given: {t.precondition}</p>
              <p>Steps: {t.steps.join(" → ")}</p>
              <p>Expected: {t.expected}</p>
              <span className="badge">
                Actual: {t.actual ?? "chưa có"} · {t.status}
              </span>
            </article>
          ))}
        </>
      )}
      {tab === "sources" && (
        <div className="provenance">
          <h3>BA pack đã xác minh</h3>
          <dl>
            {Object.entries(artifact.content.origin || {}).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="mono hash">{v}</dd>
              </div>
            ))}
            <dt>Normalized artifact SHA-256</dt>
            <dd className="mono hash">{artifact.hash}</dd>
          </dl>
          <div className="ba-downloads">
            {[
              "bundle.json",
              "review-pack.md",
              "audit.json",
              "manifest.json",
            ].map((name) => (
              <a
                key={name}
                className="button secondary"
                href={"/api/artifacts/" + artifact.id + "/ba-pack/" + name}
                download
              >
                <Download size={14} />
                {name}
              </a>
            ))}
          </div>
          {artifact.content.ba_sources?.map((s) => (
            <article className="requirement" key={s.id}>
              <h3>
                {s.id} · {s.version}
              </h3>
              <p className="mono hash">{s.content_hash}</p>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
