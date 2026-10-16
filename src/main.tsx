import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  FileText,
  Files,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Link2,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  SquareArrowOutUpRight,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  Agent,
  Artifact,
  AuditEvent,
  Project,
  ProjectSummary,
  Run,
} from "./types";
import "./styles.css";
import { api } from "./api";
import { BaWorkflow, BaRunDetails, BaArtifactBody } from "./BaPanel";
import { ContextWorkbench } from "./ContextWorkbench";

const nav: { id: string; name: string; icon: LucideIcon; subtitle: string }[] =
  [
    {
      id: "overview",
      name: "Tổng quan",
      icon: LayoutDashboard,
      subtitle: "Một nơi cho dự án, con người và AI.",
    },
    {
      id: "agents",
      name: "Agent & Workflow",
      icon: Bot,
      subtitle: "Đúng năng lực. Đúng bước. Đúng người review.",
    },
    {
      id: "workspace",
      name: "Agent Workspace",
      icon: MessageSquare,
      subtitle: "Làm rõ bối cảnh để có bản nháp tốt hơn.",
    },
    {
      id: "runs",
      name: "Run & Handoff",
      icon: GitBranch,
      subtitle: "Theo dõi từng bước và nguồn gốc dữ liệu.",
    },
    {
      id: "artifacts",
      name: "Artifact & Review",
      icon: Files,
      subtitle: "Từ đề xuất của agent đến quyết định của bạn.",
    },
    {
      id: "channels",
      name: "Kênh thông báo",
      icon: Send,
      subtitle: "Web là nơi làm việc. Kênh phụ giúp bạn nắm tình hình.",
    },
  ];
const labels: Record<string, string> = {
  queued: "Đang xếp hàng",
  running: "Đang xử lý",
  awaiting_input: "Cần làm rõ",
  awaiting_review: "Chờ review",
  reviewed: "Đã ghi nhận review",
  failed: "Dừng do lỗi",
  escalated: "Cần operator xử lý",
  awaiting_proposal: "Chờ proposal",
  changes_requested: "Đã yêu cầu sửa",
};
const fmt = (date: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(date));
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function State({ run }: { run?: Run }) {
  return run ? (
    <Badge
      tone={
        run.state === "awaiting_input"
          ? "amber"
          : run.state === "failed" || run.state === "escalated"
            ? "red"
            : run.state === "running" || run.state === "queued"
              ? "blue"
              : "green"
      }
    >
      <span className="status-dot" />
      {labels[run.state]}
    </Badge>
  ) : (
    <Badge>Chưa có run</Badge>
  );
}
function Empty({
  icon: Icon = Files,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={34} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function App() {
  const readHash = () => new URLSearchParams(location.hash.slice(1));
  const [page, setPage] = useState(readHash().get("view") || "overview");
  const [pid, setPid] = useState(readHash().get("project") || "");
  const [rid, setRid] = useState(readHash().get("run") || "");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [comment, setComment] = useState("");
  const [artifactId, setArtifactId] = useState("");
  const [tab, setTab] = useState("requirements");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [channelEnabled, setChannelEnabled] = useState(false);
  const [schedule, setSchedule] = useState("blockers");
  const [agentFilter, setAgentFilter] = useState("all");
  const current = nav.find((x) => x.id === page) || nav[0];
  const run = project?.runs.find((r) => r.id === rid) || project?.runs[0];
  const artifacts =
    project?.artifacts.filter((a) => a.run_id === run?.id) || [];
  const artifact = artifacts.find((a) => a.id === artifactId) || artifacts[0];
  const messages = project?.messages.filter((m) => m.run_id === run?.id) || [];
  const events =
    project?.events.filter(
      (e) => page === "overview" || e.run_id === run?.id,
    ) || [];
  const working = run?.state === "queued" || run?.state === "running";
  const harnessRun = run?.workflow === "ba-harness-fixture";
  const harnessArtifact = !!artifact?.content.ba_bundle;

  function go(view: string, nextRun = rid, nextPid = pid) {
    const params = new URLSearchParams({ view });
    if (nextPid) params.set("project", nextPid);
    if (nextRun) params.set("run", nextRun);
    location.hash = params.toString();
    setPage(view);
    setRid(nextRun);
    setPid(nextPid);
    setArtifactId("");
    setNotice("");
  }
  useEffect(() => {
    const f = () => {
      const h = readHash();
      setPage(h.get("view") || "overview");
      setPid(h.get("project") || "");
      setRid(h.get("run") || "");
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    api<Agent[]>("/agents")
      .then(setAgents)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<ProjectSummary[]>("/projects")
        .then((p) => {
          if (active) {
            setProjects(p);
            if (!pid && p.length) setPid(p[0].id);
          }
        })
        .catch((e) => active && setError(e.message));
    load();
    const timer = setInterval(load, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pid]);
  useEffect(() => {
    if (!pid) return;
    let active = true;
    setProject(null);
    setArtifactId("");
    setReply("");
    setComment("");
    const load = () =>
      api<Project>("/projects/" + pid)
        .then((p) => {
          if (active) setProject(p);
        })
        .catch((e) => active && setError(e.message));
    load();
    const timer = setInterval(load, 800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pid]);
  useEffect(() => {
    if (project) {
      setChannelEnabled(!!project.channel.enabled);
      setSchedule(project.channel.schedule);
    }
  }, [project?.id, project?.channel.enabled, project?.channel.schedule]);
  async function refresh() {
    if (pid) setProject(await api<Project>("/projects/" + pid));
    setProjects(await api<ProjectSummary[]>("/projects"));
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start(
    workflow = "requirements-discovery",
    proposal?: Record<string, unknown>,
  ) {
    await act(async () => {
      const r = await api<{ id: string }>(
        "/projects/" + pid + "/runs",
        "POST",
        { workflow, ...(proposal ? { proposal } : {}) },
      );
      await refresh();
      go("workspace", r.id);
    });
  }
  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!run) return;
    await act(async () => {
      await api("/runs/" + run.id + "/answers", "POST", { text: reply });
      setReply("");
      await refresh();
    });
  }
  async function review(decision: string) {
    if (!artifact) return;
    await act(async () => {
      await api("/artifacts/" + artifact.id + "/reviews", "POST", {
        decision,
        comment,
      });
      setComment("");
      setArtifactId("");
      await refresh();
      setNotice(
        decision === "reviewed"
          ? "Đã lưu review cho đúng phiên bản. Phê duyệt chính thức vẫn chưa được ghi nhận."
          : harnessArtifact
            ? "Đã ghi nhận yêu cầu sửa BA fixture. Chỉnh proposal JSON và tạo run mới; pack cũ giữ nguyên."
            : "Yêu cầu sửa đã lưu. Worker đang tạo phiên bản mới; bản cũ được giữ nguyên.",
      );
    });
  }
  const startButton = (
    <button
      className="button primary"
      disabled={busy || !pid}
      onClick={() => start()}
    >
      <Play size={15} />
      Chạy workflow
    </button>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#view=overview"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <div className="brand-mark">
            <GitBranch size={25} />
          </div>
          <div>
            agentdesk<span>PROJECT INTELLIGENCE</span>
          </div>
        </a>
        <div className="org">
          <div className="org-avatar">K</div>
          <div>
            Khánh Workspace<small>Không gian cá nhân</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              aria-label={item.name}
              className={page === item.id ? "nav-item active" : "nav-item"}
              onClick={() => go(item.id)}
            >
              <item.icon size={19} />
              <span>{item.name}</span>
              {item.id === "workspace" &&
                project?.runs.some((r) => r.state === "awaiting_input") && (
                  <span className="nav-count">!</span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-projects">
          <div className="nav-label">
            PROJECT CỦA BẠN
            <button title="Tạo project" onClick={() => setCreating(true)}>
              <Plus size={15} />
            </button>
          </div>
          {projects.slice(0, 4).map((p, i) => (
            <button
              className={
                pid === p.id ? "project-link selected" : "project-link"
              }
              key={p.id}
              onClick={() => go("overview", "", p.id)}
            >
              <i className={"project-square color-" + i} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sandbox-card">
            <div>
              <ShieldCheck size={17} /> Prototype sandbox
            </div>
            <p>
              Dữ liệu giả lập. Quyết định
              <br />
              luôn thuộc về bạn.
            </p>
            <span>
              <i />
              Không kết nối bên ngoài
            </span>
          </div>
          <div className="user-profile">
            <div className="avatar">KP</div>
            <div>
              Khánh · PM<small>Danh tính demo cố định</small>
            </div>
            <Badge tone="dark">LOCAL</Badge>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <span>{current.name}</span>
          </div>
          <div className="top-actions">
            <span className="prototype-tag">
              <span />
              Bản phác thảo v0.1
            </span>
            <button
              className="icon-button"
              aria-label="Xem snapshot"
              onClick={() => go("channels")}
            >
              <Bell size={19} />
              {!!project?.snapshots.length && <i />}
            </button>
            <div className="avatar small">KP</div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR AI OPERATIONS, IN ONE PLACE</div>
              <h1>{current.name}</h1>
              <p>{current.subtitle}</p>
            </div>
            <div className="heading-actions">
              {page === "overview" ? (
                <button
                  className="button primary"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={17} />
                  Tạo project
                </button>
              ) : (
                <label className="project-picker">
                  <FolderKanban size={16} />
                  <select
                    aria-label="Project hiện tại"
                    value={pid}
                    onChange={(e) => go(page, "", e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="alert error">
              <span>{error}</span>
              <button aria-label="Đóng lỗi" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}
          {page === "overview" && (
            <>
              <section className="welcome-panel">
                <div>
                  <div className="welcome-kicker">
                    <Sparkles size={15} /> YOUR PROJECT. YOUR AGENTS. YOUR CALL.
                  </div>
                  <h2>
                    Ít việc tổng hợp hơn.
                    <br />
                    Nhiều thời gian cho quyết định.
                  </h2>
                  <p>
                    Biến bối cảnh dự án thành bản nháp có thể review.
                    <br />
                    Agent phối hợp, bạn giữ quyền điều phối.
                  </p>
                  <button className="button white" onClick={() => go("agents")}>
                    Khám phá workflow
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                <div
                  className="orbit-diagram"
                  aria-label="Notes qua BA và QA đến PM review"
                >
                  <div className="orbit-dotted" />
                  <div className="orbit-node n1">
                    <FileText size={19} />
                    <span>Context</span>
                  </div>
                  <div className="orbit-node n2">
                    <Bot size={23} />
                    <span>BA Agent</span>
                    <i />
                  </div>
                  <div className="orbit-node n3">
                    <ListChecks size={18} />
                    <span>QA review</span>
                  </div>
                  <div className="orbit-node n4">
                    <ShieldCheck size={19} />
                    <span>You decide</span>
                  </div>
                  <div className="orbit-caption">
                    CONNECTED WORK. CONTROLLED FLOW.
                  </div>
                </div>
              </section>
              <section className="stats-grid">
                {[
                  {
                    label: "Project trong workspace",
                    value: projects.length,
                    icon: FolderKanban,
                    foot: "Lưu trữ cục bộ · SQLite",
                  },
                  {
                    label: "Workflow đã khởi chạy",
                    value: projects.reduce((n, p) => n + p.run_count, 0),
                    icon: GitBranch,
                    foot: "Luồng mô phỏng có lưu trạng thái",
                  },
                  {
                    label: "Đang cần bạn làm rõ",
                    value: projects.reduce((n, p) => n + p.blockers, 0),
                    icon: MessageSquare,
                    foot: "Câu hỏi cần PM trả lời",
                    amber: true,
                  },
                  {
                    label: "Phiên bản artifact",
                    value: projects.reduce((n, p) => n + p.artifact_count, 0),
                    icon: Files,
                    foot: "Bản nháp · chưa phê duyệt",
                  },
                ].map((s) => (
                  <div className="stat-card" key={s.label}>
                    <div className="stat-top">
                      {s.label}
                      <s.icon size={18} />
                    </div>
                    <strong className={s.amber ? "amber-text" : ""}>
                      {String(s.value).padStart(2, "0")}
                    </strong>
                    <small>{s.foot}</small>
                  </div>
                ))}
              </section>
              <div className="overview-grid">
                <section className="panel projects-panel">
                  <div className="panel-heading">
                    <h2>
                      Project của bạn <span>{projects.length}</span>
                    </h2>
                    <label className="search">
                      <Search size={15} />
                      <input
                        aria-label="Tìm project"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm project…"
                      />
                    </label>
                  </div>
                  <div className="project-cards">
                    {projects
                      .filter((p) =>
                        p.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((p, i) => (
                        <article
                          key={p.id}
                          className={
                            "project-card " +
                            (pid === p.id ? "is-selected" : "")
                          }
                        >
                          <div className="project-card-top">
                            <div className={"project-icon color-" + i}>
                              <FolderKanban size={21} />
                            </div>
                            <Badge tone={p.blockers ? "amber" : "neutral"}>
                              {p.blockers ? "Cần làm rõ" : "Discovery"}
                            </Badge>
                            <button
                              className="icon-button"
                              aria-label={"Mở " + p.name}
                              onClick={() => go("workspace", "", p.id)}
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </div>
                          <button
                            className="project-title"
                            onClick={() => go("overview", "", p.id)}
                          >
                            {p.name}
                          </button>
                          <p>{p.objective}</p>
                          <div className="project-meta">
                            <span>
                              <GitBranch size={13} />
                              {p.run_count} run
                            </span>
                            <span>
                              <Files size={13} />
                              {p.artifact_count} bản nháp
                            </span>
                          </div>
                          <div className="project-card-footer">
                            <div className="avatar tiny">KP</div>
                            <span>PM owner</span>
                            <button onClick={() => go("workspace", "", p.id)}>
                              Mở workspace
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        </article>
                      ))}
                    {!projects.filter((p) =>
                      p.name.toLowerCase().includes(search.toLowerCase()),
                    ).length && (
                      <Empty
                        title="Không tìm thấy project"
                        description="Thử tên khác hoặc tạo một project mới."
                      />
                    )}
                  </div>
                </section>
                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <h2>Hoạt động gần đây</h2>
                    <Activity size={17} />
                  </div>
                  <p className="panel-subtitle">
                    {project?.name || "Đang tải project"}
                  </p>
                  <div className="activity-list">
                    {events.slice(0, 5).map((e) => (
                      <EventItem key={e.id} event={e} />
                    ))}
                    {!events.length && (
                      <p className="muted">
                        Tạo project để bắt đầu lịch sử hoạt động.
                      </p>
                    )}
                  </div>
                  <button className="text-button" onClick={() => go("runs")}>
                    Xem lịch sử run
                    <ArrowRight size={14} />
                  </button>
                </section>
              </div>
              {project && (
                <section className="next-step">
                  <div className="next-icon">
                    <GitBranch size={22} />
                  </div>
                  <div>
                    <h3>Bắt đầu từ một cuộc trao đổi rõ ràng</h3>
                    <p>
                      {project.name} · Notes → BA → QA fixture → PM review →
                      Snapshot
                    </p>
                  </div>
                  {startButton}
                </section>
              )}
            </>
          )}
          {page === "agents" && (
            <>
              <div className="section-row">
                <div>
                  <h2>Workflow được đề xuất</h2>
                  <p>
                    Chuỗi công việc có checkpoint và người chịu trách nhiệm.
                  </p>
                </div>
                <Badge tone="green">2 mô phỏng · 1 BA harness fixture</Badge>
              </div>
              {project && <ContextWorkbench key={project.id} project={project} refresh={refresh} />}
              <BaWorkflow
                busy={busy}
                ready={agents[0]?.harness_status === "ready"}
                start={start}
              />
              <div className="workflow-grid">
                <section className="workflow-card featured">
                  <div className="workflow-icon">
                    <GitBranch size={23} />
                  </div>
                  <Badge tone="green">Bắt đầu tại đây</Badge>
                  <h2>Requirements Discovery</h2>
                  <p>
                    Từ notes rời rạc đến bản nháp yêu cầu và kế hoạch kiểm thử
                    để PM review.
                  </p>
                  <div className="workflow-chain">
                    <span>BA</span>
                    <ArrowRight size={14} />
                    <span>QA fixture</span>
                    <ArrowRight size={14} />
                    <span>Snapshot</span>
                  </div>
                  <div className="workflow-footer">
                    <span>
                      <ShieldCheck size={14} />
                      Human review gate
                    </span>
                    {startButton}
                  </div>
                </section>
                <section className="workflow-card">
                  <div className="workflow-icon lilac">
                    <Bot size={23} />
                  </div>
                  <Badge>1 agent · mô phỏng</Badge>
                  <h2>BA Draft độc lập</h2>
                  <p>
                    Làm rõ yêu cầu và tạo bản nháp. Dừng ở PM review, không tạo
                    snapshot tổng hợp cuối run.
                  </p>
                  <div className="workflow-chain">
                    <span>BA Requirements</span>
                    <ArrowRight size={14} />
                    <span>PM review</span>
                  </div>
                  <div className="workflow-footer">
                    <span>Không gọi model</span>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => start("ba-draft")}
                    >
                      Chạy BA
                      <Play size={14} />
                    </button>
                  </div>
                </section>
              </div>
              <div className="section-row agents-heading">
                <div>
                  <h2>
                    Agent registry{" "}
                    <span className="count-label">{agents.length}</span>
                  </h2>
                  <p>Năng lực, phiên bản và contract tại một nơi.</p>
                </div>
                <div className="segmented">
                  {[
                    ["all", "Tất cả"],
                    ["simulation", "Mô phỏng"],
                    ["planned", "Sắp tới"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      className={agentFilter === v ? "selected" : ""}
                      onClick={() => setAgentFilter(v)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="agent-grid">
                {agents
                  .filter(
                    (a) => agentFilter === "all" || a.mode === agentFilter,
                  )
                  .map((a, i) => (
                    <section
                      className={
                        "panel agent-card " + (!a.available ? "planned" : "")
                      }
                      key={a.id}
                    >
                      <div className="agent-top">
                        <div className={"agent-symbol color-" + i}>
                          <Bot size={24} />
                        </div>
                        <Badge tone={a.available ? "green" : "neutral"}>
                          {a.id === "ba" && a.harness_status === "ready"
                            ? "Harness fixture + mô phỏng"
                            : a.available
                              ? "Mô phỏng"
                              : "Đề xuất"}
                        </Badge>
                      </div>
                      <h3>{a.name}</h3>
                      <span className="agent-version">
                        {a.version} · {a.category}
                      </span>
                      <p>{a.capability}</p>
                      <dl className="contract-summary">
                        <dt>Input</dt>
                        <dd>{a.input_schema}</dd>
                        <dt>Output gốc</dt>
                        <dd>{a.output_schema}</dd>
                        {a.platform_output && (
                          <>
                            <dt>Prototype</dt>
                            <dd>{a.platform_output}</dd>
                          </>
                        )}
                      </dl>
                      <div className="agent-bottom">
                        {a.id === "ba"
                          ? `BA ${a.version} @ ${a.commit?.slice(0, 8)} · harness ${a.harness_status || "unavailable"}`
                          : a.available
                            ? "Fixture adapter · chưa có agent thật"
                            : "Chưa đăng ký worker adapter"}
                      </div>
                    </section>
                  ))}
              </div>
            </>
          )}
          {page === "workspace" && project && (
            <>
              <div className="workspace-top">
                <div className="project-label">
                  <div className="project-icon">
                    <FolderKanban size={21} />
                  </div>
                  <div>
                    <h2>{project.name}</h2>
                    <p>
                      {run
                        ? "Run " + run.id.slice(-8)
                        : "Sẵn sàng cho lần chạy đầu tiên"}
                    </p>
                  </div>
                </div>
                <div className="row-actions">
                  <State run={run} />
                  {run && (
                    <button
                      className="button secondary"
                      onClick={() => go("runs", run.id)}
                    >
                      Chi tiết run
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="workspace-grid">
                <section className="panel conversation">
                  <div className="panel-heading">
                    <h2>
                      <Bot size={18} />
                      BA Requirements
                    </h2>
                    <Badge>
                      {harnessRun
                        ? "BA CLI thật · fixture · không LLM"
                        : "Mô phỏng · không LLM"}
                    </Badge>
                  </div>
                  {run ? (
                    <>
                      <div className="conversation-messages">
                        {messages.map((m) => (
                          <div className={"message " + m.role} key={m.id}>
                            <div
                              className={
                                "message-avatar " +
                                (m.role === "user" ? "human" : "")
                              }
                            >
                              {m.role === "user" ? (
                                "KP"
                              ) : m.role === "system" ? (
                                <GitBranch size={16} />
                              ) : (
                                <Bot size={18} />
                              )}
                            </div>
                            <div className="message-content">
                              <div className="message-label">
                                {m.role === "user"
                                  ? "Bạn · PM"
                                  : m.role === "system"
                                    ? "Orchestrator"
                                    : "BA Requirements"}
                                <time>{fmt(m.created_at)}</time>
                              </div>
                              <div className="message-text">
                                {m.role === "question" && (
                                  <div className="question-label">
                                    <MessageSquare size={14} />
                                    Cần bạn làm rõ · Q-01
                                  </div>
                                )}
                                {m.text}
                              </div>
                            </div>
                          </div>
                        ))}
                        {working && (
                          <div className="typing">
                            <LoaderCircle size={16} className="spin" />
                            Worker đang xử lý bước {run.step}…
                          </div>
                        )}
                        {artifact && (
                          <button
                            className="artifact-message"
                            onClick={() => go("artifacts", run.id)}
                          >
                            <div className="file-icon">
                              <FileText size={23} />
                            </div>
                            <div>
                              <strong>
                                Requirements draft · v{artifact.version}
                              </strong>
                              <small>
                                {artifact.content.requirements.length} yêu cầu ·{" "}
                                {artifact.content.stories.length} stories · RTM
                                · UAT plan
                              </small>
                            </div>
                            <ArrowUpRight size={18} />
                          </button>
                        )}
                      </div>
                      <form className="composer" onSubmit={submitAnswer}>
                        <textarea
                          aria-label="Trả lời câu hỏi làm rõ"
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          disabled={run.state !== "awaiting_input" || busy}
                          placeholder={
                            run.state === "awaiting_input"
                              ? "VD: PM review; ưu tiên tạo yêu cầu và theo dõi trạng thái. Telegram để giai đoạn sau."
                              : "Câu trả lời mở khi agent cần làm rõ. Yêu cầu sửa tại Artifact & Review."
                          }
                          minLength={3}
                          maxLength={5000}
                        />
                        <div className="composer-footer">
                          <span>
                            <ShieldCheck size={13} />
                            Câu trả lời không cấp quyền phê duyệt
                          </span>
                          <button
                            type="submit"
                            className="button primary"
                            disabled={
                              run.state !== "awaiting_input" ||
                              busy ||
                              reply.trim().length < 3
                            }
                          >
                            Trả lời & chạy tiếp
                            <ArrowUpRight size={15} />
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <Empty
                      icon={MessageSquare}
                      title="Bắt đầu cuộc trao đổi đầu tiên"
                      description="Chạy workflow để agent đọc notes, hỏi làm rõ và chuẩn bị bản nháp."
                      action={startButton}
                    />
                  )}
                </section>
                <aside className="context-column">
                  {harnessRun && run ? (
                    <BaRunDetails run={run} />
                  ) : (
                    <section className="panel context-panel">
                      <div className="panel-heading">
                        <h3>Bối cảnh đầu vào</h3>
                        <FileText size={17} />
                      </div>
                      <Badge>
                        Notes · v
                        {project.sources.find((s) => s.id === run?.source_id)
                          ?.version || project.sources[0]?.version}
                      </Badge>
                      <p className="source-preview">
                        {
                          (
                            project.sources.find(
                              (s) => s.id === run?.source_id,
                            ) || project.sources[0]
                          )?.text
                        }
                      </p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSourceText(project.sources[0]?.text || "");
                          setSourceOpen(true);
                        }}
                      >
                        Quản lý phiên bản notes
                        <ArrowUpRight size={14} />
                      </button>
                    </section>
                  )}
                  <section className="panel context-panel">
                    <h3>Hành trình của run</h3>
                    <MiniSteps run={run} />
                    <div className="limits">
                      <ShieldCheck size={16} />
                      <div>
                        <strong>Giới hạn có kiểm soát</strong>
                        <p>
                          {harnessRun
                            ? "1 pack/run · 1 retry runtime"
                            : "Tối đa 6 lượt · 3 phiên bản"}
                          <br />
                          {harnessRun
                            ? "CLI 15s · verify 10s · lease 35s"
                            : "1 retry/bước · timeout 20s"}
                          <br />
                          Chi phí model: $0
                        </p>
                      </div>
                    </div>
                  </section>
                  <div className="info-note">
                    <Sparkles size={16} />
                    <p>
                      {harnessRun
                        ? "Fixture công nợ chạy qua BA CLI và canonical/domain validation thật. Notes của project không được đưa vào trusted context. Feedback không tự tạo proposal hoặc phê duyệt."
                        : "BA đang dùng mẫu cố định để bạn thử UX. Câu trả lời và feedback được lưu thật; chưa có AI phân tích. Bản nháp dùng 3 dòng notes không trống đầu tiên."}
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {page === "runs" && project && (
            <>
              <div className="run-layout">
                <section className="panel run-list">
                  <div className="panel-heading">
                    <h3>Lịch sử run</h3>
                    <Badge>{project.runs.length}</Badge>
                  </div>
                  {project.runs.map((r) => (
                    <button
                      key={r.id}
                      className={
                        "run-item " + (r.id === run?.id ? "selected" : "")
                      }
                      onClick={() => go("runs", r.id)}
                    >
                      <div>
                        <GitBranch size={17} />
                        <strong>{r.id.slice(-8)}</strong>
                      </div>
                      <small>
                        {fmt(r.created_at)} · v{r.version}
                      </small>
                      <State run={r} />
                    </button>
                  ))}
                  {!run && <p className="muted padded">Chưa có run.</p>}
                </section>
                <div>
                  {run ? (
                    <>
                      <section className="panel run-summary">
                        <div className="section-row">
                          <div>
                            <div className="eyebrow">{run.workflow}</div>
                            <h2>Run {run.id.slice(-8)}</h2>
                          </div>
                          <State run={run} />
                        </div>
                        <div className="run-metrics">
                          <div>
                            <small>Adapter</small>
                            <strong>
                              {harnessRun
                                ? "BA CLI · supplied proposal"
                                : "Fixture simulator"}
                            </strong>
                          </div>
                          <div>
                            <small>Lượt / giới hạn</small>
                            <strong>{run.turns} / 6</strong>
                          </div>
                          <div>
                            <small>Retry hiện tại</small>
                            <strong>{run.attempts} / 1</strong>
                          </div>
                          <div>
                            <small>Model cost</small>
                            <strong>$0.00</strong>
                          </div>
                        </div>
                        <MiniSteps run={run} horizontal />
                        <button
                          className="text-button"
                          onClick={() =>
                            go(
                              run.state === "awaiting_input"
                                ? "workspace"
                                : "artifacts",
                              run.id,
                            )
                          }
                        >
                          {run.state === "awaiting_input"
                            ? "Trả lời câu hỏi"
                            : "Mở artifact & review"}
                          <ArrowRight size={15} />
                        </button>
                      </section>
                      {harnessRun && run && <BaRunDetails run={run} />}
                      <section className="panel audit-panel">
                        <div className="panel-heading">
                          <h2>Event & handoff trail</h2>
                          <Badge>SQLite audit · demo</Badge>
                        </div>
                        <div className="audit-list">
                          {events.map((e) => (
                            <EventItem key={e.id} event={e} detailed />
                          ))}
                        </div>
                      </section>
                    </>
                  ) : (
                    <section className="panel">
                      <Empty
                        icon={GitBranch}
                        title="Chưa có run để theo dõi"
                        description="Chạy Requirements Discovery từ notes của project."
                        action={startButton}
                      />
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
          {page === "artifacts" && project && (
            <>
              <div className="artifact-toolbar">
                <div className="row-actions">
                  <Badge tone="amber">BẢN NHÁP · chưa baseline</Badge>
                  <span>
                    Input, output và quyết định được lưu theo phiên bản.
                  </span>
                </div>
                {project.runs.length > 0 && (
                  <select
                    aria-label="Chọn run artifact"
                    value={run?.id}
                    onChange={(e) => go("artifacts", e.target.value)}
                  >
                    {project.runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        Run {r.id.slice(-8)} · {labels[r.state]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {artifact ? (
                <div className="artifact-layout">
                  <section className="panel document-panel">
                    <div className="document-header">
                      <div className="file-icon">
                        <FileText size={25} />
                      </div>
                      <div>
                        <h2>Requirements review pack</h2>
                        <p>
                          {project.name} · {fmt(artifact.created_at)}
                        </p>
                      </div>
                      <select
                        aria-label="Phiên bản artifact"
                        value={artifact.id}
                        onChange={(e) => setArtifactId(e.target.value)}
                      >
                        {artifacts.map((a) => (
                          <option key={a.id} value={a.id}>
                            Phiên bản {a.version}
                            {a.id === artifacts[0].id ? " · mới nhất" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="icon-button"
                        aria-label="Tải artifact JSON"
                        onClick={() => {
                          const url = URL.createObjectURL(
                            new Blob([JSON.stringify(artifact, null, 2)], {
                              type: "application/json",
                            }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `draft-${run?.id}-v${artifact.version}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <SquareArrowOutUpRight size={18} />
                      </button>
                    </div>
                    <div className="document-tabs">
                      {[
                        ["requirements", "Yêu cầu"],
                        ["stories", "Stories & AC"],
                        ["rtm", "RTM"],
                        ["uat", "UAT plan"],
                        ["sources", "Nguồn & thay đổi"],
                      ].map(([v, l]) => (
                        <button
                          key={v}
                          onClick={() => setTab(v)}
                          className={tab === v ? "active" : ""}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    {harnessArtifact ? (
                      <BaArtifactBody artifact={artifact} tab={tab} />
                    ) : (
                      <div className="document-body">
                        <div className="document-eyebrow">
                          SIMULATED OUTPUT / PLATFORM-DRAFT/1
                        </div>
                        <h2>{artifact.content.title}</h2>
                        <p className="document-intro">
                          {artifact.content.summary}
                        </p>
                        {artifact.content.change_request && (
                          <div className="feedback-callout">
                            <RefreshCw size={17} />
                            <div>
                              <strong>
                                Yêu cầu sửa đã được đưa vào bản v
                                {artifact.version}
                              </strong>
                              <p>{artifact.content.change_request}</p>
                              <small>
                                Prototype ghi nhận yêu cầu; chưa dùng AI để diễn
                                giải hoặc bảo đảm đã giải quyết.
                              </small>
                            </div>
                          </div>
                        )}
                        {tab === "requirements" && (
                          <>
                            <div className="clarification-note">
                              <strong>Phạm vi PM đã làm rõ</strong>
                              <p>{artifact.content.answer}</p>
                            </div>
                            {artifact.content.requirements.map((r) => (
                              <article className="requirement" key={r.id}>
                                <div>
                                  <span className="mono">{r.id}</span>
                                  <Badge>{r.priority}</Badge>
                                </div>
                                <h3>{r.title}</h3>
                                <p>{r.description}</p>
                                <small>
                                  <Link2 size={13} />
                                  {r.evidence}
                                </small>
                              </article>
                            ))}
                          </>
                        )}
                        {tab === "stories" &&
                          artifact.content.stories.map((s) => (
                            <article className="story" key={s.id}>
                              <span className="mono">
                                {s.id} → {s.requirement_id}
                              </span>
                              <h3>{s.text}</h3>
                              <dl>
                                <dt>GIVEN</dt>
                                <dd>{s.given}</dd>
                                <dt>WHEN</dt>
                                <dd>{s.when}</dd>
                                <dt>THEN</dt>
                                <dd>{s.then}</dd>
                              </dl>
                              <Badge tone="amber">
                                Template · cần BA/QA bổ sung tiêu chí đo
                              </Badge>
                            </article>
                          ))}
                        {tab === "rtm" && (
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Requirement</th>
                                  <th>Story</th>
                                  <th>Test plan</th>
                                  <th>UAT</th>
                                </tr>
                              </thead>
                              <tbody>
                                {artifact.content.stories.map((s) => (
                                  <tr key={s.id}>
                                    <td>{s.requirement_id}</td>
                                    <td>{s.id}</td>
                                    <td>TC-{s.id}</td>
                                    <td>
                                      <Badge>Chưa chạy</Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="muted">
                              Liên kết sinh từ mẫu. Coverage ngữ nghĩa chưa được
                              kiểm chứng.
                            </p>
                          </div>
                        )}
                        {tab === "uat" && (
                          <>
                            <div className="alert neutral">
                              <Clock3 size={17} />
                              Kế hoạch UAT nháp · không phải kết quả kiểm thử.
                            </div>
                            {artifact.content.stories.map((s) => (
                              <article className="requirement" key={s.id}>
                                <span className="mono">TC-{s.id}</span>
                                <h3>{s.requirement_id} · kiểm chứng hành vi</h3>
                                <p>Điều kiện: {s.given}</p>
                                <p>Bước: {s.when}</p>
                                <p>Kỳ vọng: {s.then}</p>
                                <Badge>Actual: chưa có · Not Started</Badge>
                              </article>
                            ))}
                          </>
                        )}
                        {tab === "sources" && (
                          <div className="provenance">
                            <h3>Nguồn gốc nội dung</h3>
                            <dl>
                              <dt>Source ID</dt>
                              <dd>{artifact.content.source_id}</dd>
                              <dt>Source SHA-256</dt>
                              <dd className="mono hash">
                                {artifact.content.source_hash}
                              </dd>
                              <dt>Artifact SHA-256</dt>
                              <dd className="mono hash">{artifact.hash}</dd>
                              <dt>Adapter</dt>
                              <dd>
                                Deterministic fixture · không gọi BA harness
                              </dd>
                              <dt>BA đã kiểm tra</dt>
                              <dd>
                                Remote 0.2.0 @ 9f786144 · chưa có bằng chứng
                                0.2.1
                              </dd>
                            </dl>
                            <h3>Lịch sử phiên bản của run</h3>
                            {artifacts.map((a) => (
                              <button
                                className="version-row"
                                key={a.id}
                                onClick={() => setArtifactId(a.id)}
                              >
                                <FileText size={15} />v{a.version}
                                <span>{fmt(a.created_at)}</span>
                                <Badge>
                                  {a.business === "reviewed"
                                    ? "Đã review"
                                    : a.business === "needs_changes"
                                      ? "Yêu cầu sửa"
                                      : "Chờ review"}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                  <aside className="review-column">
                    <section className="panel review-panel">
                      <div className="panel-heading">
                        <h3>Review checkpoint</h3>
                        <ShieldCheck size={18} />
                      </div>
                      <div className="gate-status">
                        <CheckCircle2 size={19} className="green-text" />
                        <div>
                          <strong>Kiểm tra kỹ thuật</strong>
                          <p>
                            {harnessArtifact
                              ? "Schema + domain + manifest đạt"
                              : "Schema prototype đạt"}
                          </p>
                          <small>
                            {harnessArtifact
                              ? "Kiểm tra kỹ thuật đạt; ngữ nghĩa vẫn cần BA/PM review"
                              : "Chưa chạy BA domain validation"}
                          </small>
                        </div>
                      </div>
                      <div className="gate-status">
                        <MessageSquare size={19} />
                        <div>
                          <strong>Review nghiệp vụ</strong>
                          <p>
                            {artifact.business === "reviewed"
                              ? "Đã ghi nhận review"
                              : artifact.business === "needs_changes"
                                ? "Đã yêu cầu sửa"
                                : "Chờ PM review"}
                          </p>
                        </div>
                      </div>
                      <div className="gate-status">
                        <ShieldCheck size={19} />
                        <div>
                          <strong>Phê duyệt của con người</strong>
                          <p>Chưa phê duyệt chính thức</p>
                          <small>
                            Review không phải baseline hoặc UAT sign-off
                          </small>
                        </div>
                      </div>
                      <label className="field">
                        Nhận xét cho v{artifact.version}
                        <textarea
                          aria-label="Nhận xét review"
                          placeholder="Ghi nhận điểm đã review hoặc mô tả phần cần sửa…"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          maxLength={5000}
                        />
                      </label>
                      <button
                        className="button primary full"
                        disabled={
                          busy ||
                          working ||
                          comment.trim().length < 3 ||
                          artifact.version !== run?.version ||
                          !["awaiting_review", "reviewed"].includes(
                            run?.state || "",
                          )
                        }
                        onClick={() => review("reviewed")}
                      >
                        <Check size={16} />
                        Ghi nhận đã review
                      </button>
                      <button
                        className="button secondary full"
                        disabled={
                          busy ||
                          working ||
                          comment.trim().length < 3 ||
                          artifact.version !== run?.version ||
                          !["awaiting_review", "reviewed"].includes(
                            run?.state || "",
                          )
                        }
                        onClick={() => review("needs_changes")}
                      >
                        <RefreshCw size={15} />
                        Yêu cầu sửa bản nháp
                      </button>
                      <p className="fine-print">
                        {harnessArtifact
                          ? "Review platform không trở thành confirmation của BA. Yêu cầu sửa chỉ được ghi nhận; chỉnh proposal và tạo run mới để chạy lại."
                          : "Mỗi quyết định gắn với đúng artifact/version và người review demo. Tối đa 3 phiên bản/run."}
                      </p>
                      {working && (
                        <div className="typing">
                          <LoaderCircle size={15} className="spin" />
                          Đang tạo bản mới…
                        </div>
                      )}
                    </section>
                    <section className="panel review-history">
                      <h3>Lịch sử review · v{artifact.version}</h3>
                      {artifact.reviews.length ? (
                        artifact.reviews.map((r) => (
                          <div key={r.id} className="review-entry">
                            <Badge
                              tone={
                                r.decision === "reviewed" ? "green" : "amber"
                              }
                            >
                              {r.decision === "reviewed"
                                ? "Đã review"
                                : "Yêu cầu sửa"}
                            </Badge>
                            <p>{r.comment}</p>
                            <small>
                              {r.actor} · {fmt(r.created_at)}
                            </small>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          Chưa có nhận xét cho phiên bản này.
                        </p>
                      )}
                    </section>
                  </aside>
                </div>
              ) : (
                <section className="panel">
                  <Empty
                    icon={FileText}
                    title={
                      working
                        ? "Worker đang chuẩn bị bản nháp…"
                        : "Chưa có artifact cho run này"
                    }
                    description="Chạy workflow và trả lời câu hỏi trong Workspace để nhận bản nháp đầu tiên."
                    action={
                      <button
                        className="button primary"
                        onClick={() => go("workspace")}
                      >
                        Mở Workspace
                        <ArrowRight size={15} />
                      </button>
                    }
                  />
                </section>
              )}
            </>
          )}
          {page === "channels" && project && (
            <>
              <div className="channel-layout">
                <div>
                  <section className="panel channel-settings">
                    <div className="channel-title">
                      <div className="telegram-icon">
                        <Send size={28} />
                      </div>
                      <div>
                        <h2>Telegram</h2>
                        <p>Kênh phụ cho snapshot & cảnh báo blocker</p>
                      </div>
                      <Badge>Chưa kết nối</Badge>
                    </div>
                    <div className="alert neutral">
                      <ShieldCheck size={17} />
                      Chế độ mô phỏng. Không cần bot token, không gửi tin ra
                      ngoài.
                    </div>
                    <h3>Thông báo bạn muốn nhận</h3>
                    <label className="toggle-row">
                      <div>
                        <strong>Nhận snapshot & blocker</strong>
                        <p>
                          Lưu tùy chọn cho project hiện tại, chưa kích hoạt gửi.
                        </p>
                      </div>
                      <input
                        aria-label="Bật tùy chọn snapshot"
                        type="checkbox"
                        checked={channelEnabled}
                        onChange={(e) => setChannelEnabled(e.target.checked)}
                      />
                    </label>
                    <label className="field">
                      Tần suất dự kiến
                      <select
                        aria-label="Tần suất thông báo"
                        value={schedule}
                        onChange={(e) => setSchedule(e.target.value)}
                      >
                        <option value="blockers">
                          Khi có blocker hoặc cần review
                        </option>
                        <option value="daily">
                          Snapshot hằng ngày · 17:00 (UTC+7)
                        </option>
                        <option value="manual">Chỉ khi được yêu cầu</option>
                      </select>
                    </label>
                    <div className="channel-permissions">
                      <h3>
                        <ShieldCheck size={17} />
                        Cùng project, cùng quyền truy cập
                      </h3>
                      <p>
                        Thiết kế: liên kết Telegram user với danh tính web, xác
                        thực quyền project tại mỗi yêu cầu. Hành động review chi
                        tiết quay về web.
                      </p>
                      <div>
                        <Badge>/status</Badge>
                        <Badge>/latest</Badge>
                        <Badge>/projects</Badge>
                      </div>
                      <small>
                        Command và liên kết danh tính chưa triển khai. Slack
                        đang ở phạm vi đề xuất.
                      </small>
                    </div>
                    <div className="row-actions">
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await api("/projects/" + pid + "/channel", "PUT", {
                              enabled: channelEnabled,
                              schedule,
                            });
                            await refresh();
                            setNotice(
                              "Đã lưu tùy chọn Telegram mô phỏng. Chưa kết nối hoặc gửi tin.",
                            );
                          })
                        }
                      >
                        Lưu tùy chọn mô phỏng
                      </button>
                      <button
                        className="button secondary"
                        disabled
                        title="Ngoài phạm vi prototype"
                      >
                        Kết nối bot
                        <ExternalLink size={14} />
                      </button>
                    </div>
                  </section>
                  <section className="info-note channel-note">
                    <Link2 size={18} />
                    <p>
                      Snapshot bên phải lấy từ cùng dữ liệu project/run trong
                      SQLite. Đây là inbox nội bộ và bản xem trước Telegram,
                      không phải tin đã được gửi.
                    </p>
                  </section>
                </div>
                <section className="snapshot-column">
                  <div className="section-row">
                    <h2>Snapshot inbox</h2>
                    <Badge>{project.snapshots.length} bản</Badge>
                  </div>
                  <div className="telegram-preview">
                    <div className="telegram-preview-header">
                      <div className="avatar bot-avatar">
                        <Bot size={21} />
                      </div>
                      <div>
                        Agent Desk
                        <small>bot preview · chỉ hiển thị cục bộ</small>
                      </div>
                      <MoreHorizontal size={20} />
                    </div>
                    <div className="telegram-preview-body">
                      {project.snapshots.length ? (
                        project.snapshots.map((s) => (
                          <article className="snapshot-message" key={s.id}>
                            <strong>
                              <Activity size={15} />
                              {project.name}
                            </strong>
                            <p>{s.text}</p>
                            <div className="snapshot-meta">
                              Run {s.run_id.slice(-8)} · {fmt(s.created_at)}
                            </div>
                            <button onClick={() => go("workspace", s.run_id)}>
                              Mở trong Agent Desk
                              <ArrowUpRight size={14} />
                            </button>
                            <small>LOCAL PREVIEW · KHÔNG GỬI TELEGRAM</small>
                          </article>
                        ))
                      ) : (
                        <div className="snapshot-message">
                          <strong>Snapshot đầu tiên đang chờ bạn</strong>
                          <p>
                            Khởi chạy workflow. Snapshot sẽ xuất hiện khi cần
                            làm rõ hoặc khi bản nháp sẵn sàng review.
                          </p>
                          <button onClick={() => go("workspace")}>
                            Mở Workspace
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
          {!project && page !== "overview" && page !== "agents" && (
            <div className="loading">
              <LoaderCircle className="spin" />
              Đang tải project…
            </div>
          )}
          <footer className="page-footer">
            <span>
              <span className="live-dot" />
              Local prototype · SQLite persistence
            </span>
            <span>Agent đề xuất. Con người quyết định.</span>
          </footer>
        </main>
      </div>
      {creating && (
        <CreateModal
          busy={busy}
          close={() => setCreating(false)}
          create={async (form) => {
            await act(async () => {
              const p = await api<{ id: string }>("/projects", "POST", form);
              setProjects(await api<ProjectSummary[]>("/projects"));
              setCreating(false);
              go("workspace", "", p.id);
              setNotice(
                "Project đã tạo. Chạy workflow để bắt đầu làm rõ notes.",
              );
            });
          }}
        />
      )}
      {sourceOpen && (
        <div className="modal-overlay" onClick={() => setSourceOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Đóng notes"
              onClick={() => setSourceOpen(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">VERSIONED CONTEXT</div>
            <h2 id="source-title">Notes của project</h2>
            <p>
              Mỗi lần lưu tạo phiên bản mới. Run đang chạy giữ nguyên phiên bản
              input đã khóa.
            </p>
            <label className="field">
              Nội dung notes
              <textarea
                className="notes-input"
                aria-label="Cập nhật notes"
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                maxLength={20000}
              />
            </label>
            <button
              className="button primary"
              disabled={busy || sourceText.trim().length < 3}
              onClick={() =>
                act(async () => {
                  await api("/projects/" + pid + "/sources", "POST", {
                    text: sourceText,
                  });
                  await refresh();
                  setSourceOpen(false);
                  setNotice(
                    "Đã lưu phiên bản notes mới, dùng cho lần chạy tiếp theo.",
                  );
                })
              }
            >
              Lưu phiên bản notes
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function MiniSteps({
  run,
  horizontal = false,
}: {
  run?: Run;
  horizontal?: boolean;
}) {
  const done = run?.state === "awaiting_review" || run?.state === "reviewed";
  const harness = run?.workflow === "ba-harness-fixture";
  const steps = [
    {
      label: harness ? "Fixture context & proposal" : "Context & notes",
      sub: "Input được khóa theo phiên bản",
      done: !!run,
      active: false,
    },
    {
      label: harness ? "BA CLI · supplied proposal" : "BA · Làm rõ & soạn nháp",
      sub:
        run?.state === "awaiting_input"
          ? "Đang chờ câu trả lời"
          : harness
            ? "Harness thật · không model"
            : "Fixture adapter",
      done: done || run?.step === "quality",
      active: !!run && !done && run.step !== "quality",
    },
    {
      label: harness
        ? "Canonical / domain / manifest"
        : run?.workflow === "ba-draft"
          ? "Kiểm tra schema nội bộ"
          : "QA fixture · Kiểm tra schema",
      sub: harness
        ? "Pack chỉ nhập khi mọi gate đạt"
        : "Chưa xác minh ngữ nghĩa",
      done,
      active: run?.step === "quality" && !done,
    },
    {
      label: harness
        ? "PM review · fixture pack"
        : run?.workflow === "ba-draft"
          ? "PM review"
          : "PM review & snapshot",
      sub: "Phê duyệt chính thức là bước riêng",
      done: run?.state === "reviewed",
      active: run?.state === "awaiting_review",
    },
  ];
  return (
    <div className={"mini-steps " + (horizontal ? "horizontal" : "")}>
      {steps.map((s, i) => (
        <div
          className={
            "mini-step " + (s.done ? "done" : s.active ? "current" : "")
          }
          key={s.label}
        >
          <div className="step-node">
            {s.done ? <Check size={13} /> : s.active ? <span /> : i + 1}
          </div>
          <div>
            <strong>{s.label}</strong>
            <small>{s.sub}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
function EventItem({
  event: e,
  detailed = false,
}: {
  event: AuditEvent;
  detailed?: boolean;
}) {
  return (
    <div className="event-item">
      <div
        className={
          "event-marker " + (e.kind.includes("review") ? "amber-marker" : "")
        }
      >
        <Circle size={9} />
      </div>
      <div>
        {detailed && (
          <div className="event-kind">
            <span>{e.kind}</span>
            <Badge>{e.actor}</Badge>
          </div>
        )}
        <p>{e.detail}</p>
        <time>{fmt(e.created_at)}</time>
      </div>
    </div>
  );
}
function CreateModal({
  close,
  create,
  busy,
}: {
  close: () => void;
  create: (form: { name: string; objective: string; notes: string }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [close]);
  return (
    <div className="modal-overlay" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close icon-button"
          aria-label="Đóng tạo project"
          onClick={close}
        >
          <X size={20} />
        </button>
        <div className="modal-symbol">
          <FolderKanban size={25} />
        </div>
        <div className="eyebrow">START WITH CONTEXT</div>
        <h2 id="create-title">Một project. Nhiều cộng sự AI.</h2>
        <p>
          Cho agent biết mục tiêu và bối cảnh. Bạn có thể làm rõ chi tiết trong
          Workspace.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create({ name, objective, notes });
          }}
        >
          <label className="field">
            Tên project
            <input
              autoFocus
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Cổng dịch vụ khách hàng"
            />
          </label>
          <label className="field">
            Mục tiêu
            <input
              required
              minLength={3}
              maxLength={2000}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Dự án cần giải quyết điều gì?"
            />
          </label>
          <label className="field">
            Context / notes / SOW nháp
            <textarea
              className="notes-input"
              required
              minLength={10}
              maxLength={20000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dán ghi chú cuộc họp, yêu cầu ban đầu hoặc phạm vi dự kiến…"
            />
          </label>
          <div className="form-hint">
            <ShieldCheck size={14} />
            Chỉ dùng dữ liệu giả lập trong prototype này.
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setName("Nova · Service Portal");
                setObjective(
                  "Chuẩn hóa yêu cầu tiếp nhận và theo dõi hỗ trợ khách hàng.",
                );
                setNotes(
                  "Khách hàng cần tạo ticket hỗ trợ và xem trạng thái xử lý.\nPM cần review yêu cầu trước khi bàn giao cho dev.\nChưa xác định người phê duyệt và phạm vi thông báo.",
                );
              }}
            >
              Dùng ví dụ mẫu
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              Tạo project
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
