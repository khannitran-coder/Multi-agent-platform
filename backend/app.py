import asyncio
import json
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from . import store as db
from . import worker
from . import ba_runtime, ba_adapter, ba_jobs
from .contracts import ProjectInput, TextInput, RunInput, ReviewInput, ChannelInput, REGISTRY

@asynccontextmanager
async def lifespan(app):
    db.init()
    task = asyncio.create_task(worker.loop())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task

app = FastAPI(title='Agent Desk · local prototype', lifespan=lifespan)

@app.middleware('http')
async def local_mutations(request: Request, call_next):
    # No live auth: fixed demo actor. Block cross-origin browser mutations to local demo data.
    if request.method in ('POST', 'PUT', 'DELETE', 'PATCH'):
        origin = request.headers.get('origin')
        if origin and origin != str(request.base_url).rstrip('/'):
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail':'Cross-origin mutation denied'}, status_code=403)
    return await call_next(request)

def access(c, pid):
    if not c.execute('SELECT 1 FROM memberships WHERE project_id=? AND user_id=?', (pid, db.ACTOR)).fetchone():
        raise HTTPException(404, 'Project không tồn tại hoặc bạn không có quyền.')

def run_access(c, rid):
    r = c.execute('SELECT * FROM runs WHERE id=?', (rid,)).fetchone()
    if not r:
        raise HTTPException(404, 'Không tìm thấy run.')
    access(c, r['project_id'])
    return dict(r)

@app.get('/api/health')
def health():
    with db.connect() as c:
        c.execute('SELECT 1').fetchone()
    return {'status':'ok', 'mode':'prototype', 'persistence':'sqlite', 'identity':'fixed demo-pm','live_model_enabled':False}

@app.get('/api/agents')
def agents():
    entries=[dict(a) for a in REGISTRY]
    try:
        ba_runtime.source();ba_runtime.interpreter()
        status='ready'
    except ba_runtime.RuntimeIntegrityError:
        status='unavailable'
    entries[0].update(harness_status=status,harness_workflow=ba_adapter.WORKFLOW)
    return entries

@app.get('/api/ba/fixture')
def ba_fixture():
    try:
        context,proposal=ba_runtime.fixtures()
    except ba_runtime.RuntimeIntegrityError as exc:
        raise HTTPException(503,str(exc)) from None
    return {'label':'Fixture — Báo cáo công nợ','context':context,'proposal':proposal,'agent_commit':ba_runtime.REFERENCE['commit']}

@app.get('/api/runs/{rid}/ba')
def ba_invocation(rid: str):
    with db.connect() as c:
        run_access(c,rid)
        raw=c.execute('SELECT * FROM ba_invocations WHERE run_id=?',(rid,)).fetchone()
        if not raw:raise HTTPException(404,'Run không dùng BA harness.')
        value=dict(raw)
        for name in ['context_json','proposal_json','result_json']:
            value[name.removesuffix('_json')]=json.loads(value.pop(name))
        return value

@app.get('/api/artifacts/{aid}/ba-pack')
def ba_pack(aid: str):
    with db.connect() as c:
        artifact=c.execute('SELECT * FROM artifacts WHERE id=?',(aid,)).fetchone()
        if not artifact:raise HTTPException(404,'Không tìm thấy artifact.')
        access(c,artifact['project_id'])
        raw=c.execute('SELECT * FROM ba_packs WHERE artifact_id=?',(aid,)).fetchone()
        if not raw:raise HTTPException(404,'Artifact không phải pack BA.')
        return {'artifact_id':aid,'run_hash':raw['run_hash'],'files':json.loads(raw['files_json'])}

@app.get('/api/artifacts/{aid}/ba-pack/{name}')
def ba_pack_file(aid: str, name: str):
    if name not in ba_adapter.FILES:raise HTTPException(404,'Unknown BA pack file.')
    pack=ba_pack(aid)
    return Response(pack['files'][name],media_type='text/markdown' if name.endswith('.md') else 'application/json',
                    headers={'Content-Disposition':'attachment; filename="'+name+'"'})

@app.get('/api/projects')
def projects():
    with db.connect() as c:
        return db.rows(c, '''SELECT p.*,(SELECT count(*) FROM runs WHERE project_id=p.id) run_count,
            (SELECT count(*) FROM runs WHERE project_id=p.id AND state='awaiting_input') blockers,
            (SELECT count(*) FROM artifacts WHERE project_id=p.id) artifact_count
            FROM projects p JOIN memberships m ON m.project_id=p.id WHERE m.user_id=? ORDER BY p.rowid DESC''', (db.ACTOR,))

@app.post('/api/projects', status_code=201)
def create_project(body: ProjectInput):
    with db.connect() as c:
        return {'id':db.create_project(c, body.name, body.objective, body.notes)}

@app.get('/api/projects/{pid}')
def project(pid: str):
    with db.connect() as c:
        access(c, pid)
        p = dict(c.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone())
        p['sources'] = db.rows(c, 'SELECT * FROM sources WHERE project_id=? ORDER BY rowid DESC', (pid,))
        p['runs'] = db.rows(c, 'SELECT * FROM runs WHERE project_id=? ORDER BY rowid DESC', (pid,))
        p['artifacts'] = db.rows(c, 'SELECT * FROM artifacts WHERE project_id=? ORDER BY rowid DESC', (pid,))
        for a in p['artifacts']:
            a['content'] = json.loads(a['content'])
            a['reviews'] = db.rows(c, 'SELECT * FROM reviews WHERE artifact_id=? ORDER BY rowid DESC', (a['id'],))
        p['messages'] = db.rows(c, 'SELECT m.* FROM messages m JOIN runs r ON m.run_id=r.id WHERE r.project_id=? ORDER BY m.rowid', (pid,))
        p['events'] = db.rows(c, 'SELECT * FROM events WHERE project_id=? ORDER BY rowid DESC', (pid,))
        p['snapshots'] = db.rows(c, 'SELECT * FROM snapshots WHERE project_id=? ORDER BY rowid DESC', (pid,))
        cfg = c.execute('SELECT * FROM channels WHERE project_id=?', (pid,)).fetchone()
        p['channel'] = dict(cfg) if cfg else {'enabled':False, 'schedule':'blockers'}
        return p

@app.post('/api/projects/{pid}/sources', status_code=201)
def source(pid: str, body: TextInput):
    with db.connect() as c:
        access(c, pid)
        version = c.execute('SELECT max(version) FROM sources WHERE project_id=?', (pid,)).fetchone()[0]+1
        sid = db.uid('src')
        c.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?)', (sid, pid, 'Discovery notes', body.text, version, db.digest(body.text), db.now()))
        db.event(c, pid, None, 'source.versioned', f'Notes v{version} được lưu; các run cũ giữ nguyên nguồn.')
        return {'id':sid, 'version':version}

@app.post('/api/projects/{pid}/runs', status_code=201)
def start_run(pid: str, body: RunInput):
    fixture=None
    if body.workflow==ba_adapter.WORKFLOW:
        try:
            fixture=ba_runtime.fixtures();ba_runtime.interpreter()
        except ba_runtime.RuntimeIntegrityError as exc:
            raise HTTPException(503,str(exc)) from None
    with db.connect() as c:
        access(c, pid)
        if c.execute("SELECT 1 FROM runs WHERE project_id=? AND state IN ('queued','running','awaiting_input')", (pid,)).fetchone():
            raise HTTPException(409, 'Project đã có một run đang xử lý hoặc chờ câu trả lời.')
        sid = None if fixture else c.execute('SELECT id FROM sources WHERE project_id=? ORDER BY version DESC LIMIT 1', (pid,)).fetchone()[0]
        rid = db.uid('run')
        c.execute('INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', (rid,pid,body.workflow,'queued','ba_run' if fixture else 'intake',1,1,0,time.time()+0.3,db.now(),db.now(),sid,''))
        if fixture:
            context,default_proposal=fixture
            ba_jobs.create(c,rid,context,body.proposal if body.proposal is not None else default_proposal)
            db.message(c,rid,'system','BA harness thật, context công nợ fixture cố định. Proposal cung cấp sẵn; không gọi model, không dùng notes project để tạo trusted context.')
        db.event(c, pid, rid, 'run.queued',
            'BA fixture: CLI timeout 15s, verify 10s, lease 35s, 1 retry runtime; chi phí model = 0.' if fixture
            else 'Giới hạn: 6 lượt, 3 phiên bản, 1 retry/bước, 20s/bước; chi phí model = 0.')
        if not fixture:db.message(c, rid, 'system', 'Workflow mô phỏng đã được xếp hàng. Input đã khóa theo phiên bản notes.')
        return {'id':rid}

@app.post('/api/runs/{rid}/answers')
def answer(rid: str, body: TextInput):
    with db.connect() as c:
        r = run_access(c, rid)
        if r['workflow']==ba_adapter.WORKFLOW:
            raise HTTPException(409,'Fixture BA không nhận câu trả lời để tạo authority. Tạo run mới với proposal đã sửa.')
        if r['state'] != 'awaiting_input':
            raise HTTPException(409, 'Run không chờ câu trả lời; dữ liệu có thể đã được cập nhật.')
        db.message(c, rid, 'user', body.text)
        db.event(c, r['project_id'], rid, 'clarification.answered', 'PM đã trả lời; dữ liệu câu trả lời không cấp quyền phê duyệt.')
        c.execute("UPDATE runs SET state='queued',step='draft',turns=turns+1,due=?,updated_at=? WHERE id=?", (time.time()+0.5,db.now(),rid))
        return {'state':'queued'}

@app.post('/api/artifacts/{aid}/reviews')
def review(aid: str, body: ReviewInput):
    with db.connect() as c:
        raw = c.execute('SELECT * FROM artifacts WHERE id=?', (aid,)).fetchone()
        if not raw:
            raise HTTPException(404, 'Không tìm thấy artifact.')
        a = dict(raw)
        r = run_access(c, a['run_id'])
        if r['state'] not in ('awaiting_review', 'reviewed') or a['version'] != r['version']:
            raise HTTPException(409, 'Chỉ review phiên bản mới nhất của run khi đã hoàn thành kiểm tra.')
        if body.decision == 'needs_changes' and (r['version'] >= 3 or r['turns'] >= 6):
            raise HTTPException(409, 'Đạt giới hạn 3 phiên bản/6 lượt. Tạo run mới sau khi PM rà soát notes.')
        # A recorded review never changes the approval column or content/hash of an artifact.
        c.execute('INSERT INTO reviews VALUES (?,?,?,?,?,?)', (db.uid('rev'),aid,body.decision,body.comment,db.ACTOR,db.now()))
        c.execute('UPDATE artifacts SET business=? WHERE id=?', (body.decision,aid))
        db.event(c, r['project_id'], r['id'], 'review.'+body.decision, f'Artifact v{a["version"]}: {body.comment}')
        if body.decision == 'needs_changes':
            if r['workflow']==ba_adapter.WORKFLOW:
                c.execute("UPDATE runs SET state='changes_requested',feedback=?,updated_at=? WHERE id=?",(body.comment,db.now(),r['id']))
                db.message(c,r['id'],'system','Đã ghi nhận yêu cầu sửa fixture BA. Chỉnh proposal JSON và tạo run mới; harness không tự diễn giải feedback.')
            else:
                c.execute("UPDATE runs SET state='queued',step='draft',version=version+1,turns=turns+1,attempts=0,due=?,feedback=?,updated_at=? WHERE id=?", (time.time()+0.5,body.comment,db.now(),r['id']))
            db.message(c, r['id'], 'system', 'PM yêu cầu sửa: '+body.comment)
        else:
            c.execute("UPDATE runs SET state='reviewed',updated_at=? WHERE id=?", (db.now(),r['id']))
            worker.snapshot(c, r, f'PM đã ghi nhận review bản v{a["version"]}. Đây không phải phê duyệt baseline hay nghiệm thu UAT.')
        return {'business':body.decision, 'approval':'not_approved'}

@app.put('/api/projects/{pid}/channel')
def channel(pid: str, body: ChannelInput):
    with db.connect() as c:
        access(c, pid)
        c.execute('INSERT INTO channels VALUES (?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET enabled=excluded.enabled,schedule=excluded.schedule,updated_at=excluded.updated_at', (pid,body.enabled,body.schedule,db.now()))
        db.event(c, pid, None, 'channel.preferences_saved', 'Đã lưu tùy chọn mô phỏng; không tạo liên kết Telegram hay gửi tin.')
        return {'saved':True, 'connected':False}

DIST = Path(__file__).resolve().parents[1] / 'dist'
app.mount('/assets', StaticFiles(directory=DIST/'assets', check_dir=False), name='assets')

@app.get('/{path:path}', include_in_schema=False)
def frontend(path: str):
    if path.startswith('api/') or not (DIST/'index.html').exists():
        raise HTTPException(404, 'Build UI trước bằng npm run build. API tại /api/health.')
    return FileResponse(DIST/'index.html')
