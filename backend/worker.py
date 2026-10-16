"""Durable prototype orchestration: simulation plus pinned BA supplied-proposal jobs."""
import asyncio
import json
import time
from . import store as db
from .contracts import Draft
from . import ba_jobs, ba_adapter

def tick():
    jobs=[]
    with db.connect() as c:
        for raw in c.execute("SELECT * FROM runs WHERE state IN ('queued','running') AND due <= ?", (time.time(),)).fetchall():
            r = dict(raw)
            c.execute('SAVEPOINT worker_step')
            try:
                if r['workflow']==ba_adapter.WORKFLOW:
                    if ba_jobs.claim(c,r):jobs.append(r['id'])
                    c.execute('RELEASE worker_step')
                    continue
                # A crashed/restarted application resumes the persisted step; transitions are atomic.
                if time.time() - r['due'] > 20:
                    c.execute("UPDATE runs SET state='failed',updated_at=? WHERE id=?", (db.now(), r['id']))
                    db.event(c, r['project_id'], r['id'], 'run.timeout', 'Hết hạn bước worker 20 giây.', 'orchestrator')
                    c.execute('RELEASE worker_step')
                    continue
                advance(c, r)
                c.execute('RELEASE worker_step')
            except Exception as exc:
                c.execute('ROLLBACK TO worker_step')
                c.execute('RELEASE worker_step')
                if r['attempts'] < 1:
                    c.execute('UPDATE runs SET attempts=attempts+1,due=? WHERE id=?', (time.time()+1, r['id']))
                    db.event(c, r['project_id'], r['id'], 'run.retry', type(exc).__name__, 'orchestrator')
                else:
                    c.execute("UPDATE runs SET state='failed',updated_at=? WHERE id=?", (db.now(), r['id']))
                    db.event(c, r['project_id'], r['id'], 'run.failed', type(exc).__name__, 'orchestrator')
    for rid in jobs:
        ba_jobs.execute_job(rid)

def advance(c, r):
    pid, rid = r['project_id'], r['id']
    if r['step'] == 'intake':
        c.execute("UPDATE runs SET state='running',step='clarify',attempts=0,due=?,updated_at=? WHERE id=?", (time.time()+0.7, db.now(), rid))
        db.event(c, pid, rid, 'intake.completed', 'Đã khóa phiên bản notes và hash đầu vào.', 'orchestrator')
        db.message(c, rid, 'agent', 'Tôi đã nhận notes. Đây là luồng mô phỏng theo mẫu; tôi sẽ hỏi một câu làm rõ trước khi tạo bản nháp.')
    elif r['step'] == 'clarify':
        c.execute("UPDATE runs SET state='awaiting_input',due=0,updated_at=? WHERE id=?", (db.now(), rid))
        db.message(c, rid, 'question', 'Ai sẽ review/phê duyệt yêu cầu và phạm vi nào cần ưu tiên cho bản đầu tiên? Hãy nêu cả phần để sau nếu có.')
        db.event(c, pid, rid, 'clarification.requested', 'BA → PM: chờ câu trả lời; chưa tạo artifact.', 'ba-simulator')
        snapshot(c, r, 'Cần bạn làm rõ phạm vi và người review. Mở Workspace để trả lời.')
    elif r['step'] == 'draft':
        source = dict(c.execute('SELECT * FROM sources WHERE id=?', (r['source_id'],)).fetchone())
        project = dict(c.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone())
        answer = c.execute("SELECT text FROM messages WHERE run_id=? AND role='user' ORDER BY rowid DESC LIMIT 1", (rid,)).fetchone()[0]
        draft = make_draft(project, source, answer, r['feedback'])
        serialized = json.dumps(draft, ensure_ascii=False, sort_keys=True)
        c.execute('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?)', (db.uid('art'), pid, rid, r['version'], serialized, db.digest(serialized), 'schema_passed', 'pending', 'not_approved', db.now()))
        db.event(c, pid, rid, 'ba.drafted', f'BA tạo bản v{r["version"]} từ mẫu; hash và nguồn đã lưu.', 'ba-simulator')
        c.execute("UPDATE runs SET state='running',step='quality',attempts=0,due=?,updated_at=? WHERE id=?", (time.time()+0.8, db.now(), rid))
    elif r['step'] == 'quality':
        if r['workflow'] == 'requirements-discovery':
            db.event(c, pid, rid, 'handoff.ba_qa', 'BA → QA fixture: schema platform-draft/1 đạt. Chưa kiểm chứng ngữ nghĩa hoặc BA domain.', 'qa-simulator')
            db.event(c, pid, rid, 'handoff.qa_snapshot', 'QA → Snapshot: chỉ chuyển metadata của cùng project/run.', 'orchestrator')
            snapshot(c, r, f'Bản nháp v{r["version"]} sẵn sàng review. Kiểm tra schema prototype đạt; nghiệp vụ chờ review; chưa phê duyệt. UAT chưa chạy.')
        else:
            db.event(c, pid, rid, 'validation.platform', 'Schema platform-draft/1 đạt; workflow BA độc lập không chuyển QA/Snapshot agent.', 'orchestrator')
        c.execute("UPDATE runs SET state='awaiting_review',step='review',due=0,updated_at=? WHERE id=?", (db.now(), rid))
        db.message(c, rid, 'agent', f'Bản nháp v{r["version"]} đã sẵn sàng. Bạn có thể mở Artifact để review hoặc yêu cầu sửa. Nội dung sinh theo mẫu, chưa phải đầu ra BA thật.')

def snapshot(c, r, text):
    c.execute('INSERT INTO snapshots VALUES (?,?,?,?,?)', (db.uid('snap'), r['project_id'], r['id'], text, db.now()))
    db.event(c, r['project_id'], r['id'], 'snapshot.created', 'Snapshot nội bộ đã lưu. Không gửi Telegram.', 'snapshot-simulator')

def make_draft(project, source, answer, feedback):
    lines = [(i,x.strip()) for i,x in enumerate(source['text'].splitlines(), 1) if x.strip()][:3]
    requirements, stories = [], []
    for i, (line_no, quote) in enumerate(lines, 1):
        requirements.append(dict(id=f'REQ-{i:02}', title=quote[:90], description=quote,
            evidence=f'{source["id"]}:L{line_no} · v{source["version"]}', priority='Đề xuất · Must' if i == 1 else 'Cần PM xác nhận'))
        stories.append(dict(id=f'US-{i:02}', requirement_id=f'REQ-{i:02}', text=f'Là thành viên dự án {project["name"]}, tôi muốn: {quote}',
            given='Người dùng là thành viên được cấp quyền trong project', when=f'Thực hiện hành vi được nêu tại REQ-{i:02}',
            then='Kết quả đáp ứng nội dung notes và phạm vi đã làm rõ; cần BA/QA viết tiêu chí đo cụ thể.'))
    return Draft.model_validate(dict(schema_version='platform-draft/1', mode='simulation', title=f'Requirements · {project["name"]}',
        summary=project['objective'], source_id=source['id'], source_hash=source['hash'], answer=answer,
        change_request=feedback, requirements=requirements, stories=stories, uat_status='Not Started')).model_dump()

async def loop():
    while True:
        await asyncio.to_thread(tick)
        await asyncio.sleep(0.3)
