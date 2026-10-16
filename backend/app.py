import asyncio
import json
import time
import hashlib
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from . import store as db
from . import worker
from . import ba_runtime, ba_adapter, ba_jobs, context_workbench, documents
from .drive_adapter import drive, canonical_url
from .contracts import ProjectInput, TextInput, RunInput, ReviewInput, ChannelInput, SourceInput, ContextInput, DriveInput, REGISTRY

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
async def bounded_upload(request: Request, call_next):
    if request.method == 'POST' and request.url.path.endswith('/documents/upload'):
        from fastapi.responses import JSONResponse
        limit = documents.MAX_UPLOAD + 65536  # bounded multipart envelope before Starlette spools files
        length = request.headers.get('content-length')
        if length and (not length.isdigit() or int(length) > limit):
            return JSONResponse({'detail':'File vượt giới hạn 5 MiB.'}, status_code=413)
        chunks = []; total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > limit:
                return JSONResponse({'detail':'File vượt giới hạn 5 MiB.'}, status_code=413)
            chunks.append(chunk)
        request._body = b''.join(chunks)
    return await call_next(request)

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
    if name not in pack['files']: raise HTTPException(404,'File không có trong phiên bản pack này.')
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
        p['documents'] = documents.list_project(c, pid)
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

@app.get('/api/settings')
def settings():
    return {'google_drive':drive.status(), 'telegram':{'connected':False,'status':'not_configured'},
            'jira':{'connected':False,'status':'planned'}, 'model':{'enabled':False,'mode':'synthetic demo or supplied proposal'},
            'ba':{'version':ba_runtime.REFERENCE['observed_agent_version'],'commit':ba_runtime.REFERENCE['commit'],'tag':ba_runtime.REFERENCE.get('tag')},
            'uploads':{'max_bytes':documents.MAX_UPLOAD,'formats':['txt','md','pdf','docx'],'max_text_bytes':100000}}

@app.post('/api/projects/{pid}/documents/drive', status_code=201)
def add_drive(pid: str, body: DriveInput):
    with db.connect() as c:
        access(c,pid)
        try: url = canonical_url(body.url)
        except ValueError as exc: raise HTTPException(422,str(exc)) from None
        did = db.uid('doc'); vid = db.uid('docver')
        c.execute('INSERT INTO documents VALUES (?,?,?,?,?,?,?)',(did,pid,body.name,'google_drive',url,'requires_connection',db.now()))
        c.execute('INSERT INTO document_versions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                  (vid,did,1,None,body.name,'',0,'','','requires_connection',drive.status()['message'],db.now()))
        db.event(c,pid,None,'document.drive_link_saved','Đã lưu link Drive; chưa có quyền đọc, không tải nội dung.')
        return {'id':did,'version_id':vid,'status':'requires_connection','message':drive.status()['message']}

@app.post('/api/projects/{pid}/documents/upload', status_code=201)
async def upload_document(pid: str, file: UploadFile = File(...), document_id: str | None = None):
    with db.connect() as c:
        access(c,pid)
        if document_id and not c.execute("SELECT 1 FROM documents WHERE id=? AND project_id=? AND kind='upload'",(document_id,pid)).fetchone():
            raise HTTPException(404,'Không tìm thấy tài liệu upload trong project.')
    try:
        filename, extension = documents.safe_name(file.filename,file.content_type or '')
        data = await file.read(documents.MAX_UPLOAD+1)
        if len(data) > documents.MAX_UPLOAD: raise HTTPException(413,'File vượt giới hạn 5 MiB.')
        if not data: raise ValueError('File rỗng; chọn tài liệu có nội dung.')
        vid, storage_name, parsed = await asyncio.to_thread(documents.parse,data,extension)
    except ValueError as exc:
        raise HTTPException(422,str(exc)) from None
    except ba_adapter.AdapterError:
        raise HTTPException(422,'Không hoàn tất trích xuất trong 10 giây; dùng tài liệu nhỏ hơn hoặc TXT.') from None
    finally:
        await file.close()
    try:
        with db.connect() as c:
            access(c,pid)
            did = document_id or db.uid('doc')
            if not document_id:
                c.execute('INSERT INTO documents VALUES (?,?,?,?,?,?,?)',(did,pid,filename,'upload','','local',db.now()))
            version = (c.execute('SELECT max(version) FROM document_versions WHERE document_id=?',(did,)).fetchone()[0] or 0)+1
            sid = None
            if parsed['status']=='ready':
                sid=db.uid('src')
                source_version=(c.execute('SELECT max(version) FROM sources WHERE project_id=?',(pid,)).fetchone()[0] or 0)+1
                c.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?)',(sid,pid,filename,parsed['text'],source_version,db.digest(parsed['text']),db.now()))
            c.execute('INSERT INTO document_versions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                      (vid,did,version,sid,filename,file.content_type or '',len(data),hashlib.sha256(data).hexdigest(),storage_name,parsed['status'],parsed['detail'],db.now()))
            db.event(c,pid,None,'document.uploaded',f'{filename} v{version}: {parsed["status"]}; nguồn/hash đã lưu, chưa chạy BA.')
            return {'id':did,'version_id':vid,'version':version,'source_id':sid,'status':parsed['status'],'detail':parsed['detail']}
    except Exception:
        (documents.root()/storage_name).unlink(missing_ok=True)
        raise

@app.get('/api/document-versions/{vid}/download')
def download_document(vid: str):
    from urllib.parse import quote
    with db.connect() as c:
        row=c.execute('SELECT v.*,d.project_id FROM document_versions v JOIN documents d ON d.id=v.document_id WHERE v.id=?',(vid,)).fetchone()
        if not row: raise HTTPException(404,'Không tìm thấy phiên bản tài liệu.')
        access(c,row['project_id'])
        if not row['storage_name']: raise HTTPException(409,'Link Drive chưa được tải; không có file local.')
        path=documents.root()/row['storage_name']
        if path.is_symlink() or path.parent.resolve()!=documents.root().resolve() or not path.is_file():
            raise HTTPException(409,'File local không khả dụng.')
        data=path.read_bytes()
        if hashlib.sha256(data).hexdigest()!=row['hash']: raise HTTPException(409,'Hash file không khớp; dừng tải.')
        return Response(data,media_type='application/octet-stream',headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(row['filename'])})

@app.get('/api/jobs/{rid}')
def job_details(rid: str):
    with db.connect() as c:
        run=run_access(c,rid)
        raw=c.execute('SELECT * FROM job_inputs WHERE run_id=?',(rid,)).fetchone()
        return {'job':run,'input_hash':raw['input_hash'] if raw else None,
                'documents':json.loads(raw['documents_json']) if raw else [],
                'approval':'not_approved','live_model_enabled':False}

@app.post('/api/projects/{pid}/sources', status_code=201)
def source(pid: str, body: SourceInput):
    with db.connect() as c:
        access(c, pid)
        version = c.execute('SELECT max(version) FROM sources WHERE project_id=?', (pid,)).fetchone()[0]+1
        sid = db.uid('src')
        c.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?)', (sid, pid, body.name, body.text, version, db.digest(body.text), db.now()))
        db.event(c, pid, None, 'source.versioned', f'Notes v{version} được lưu; các run cũ giữ nguyên nguồn.')
        return {'id':sid, 'version':version}

@app.get('/api/projects/{pid}/context-preparations')
def context_preparations(pid: str):
    with db.connect() as c:
        access(c, pid)
        return [context_workbench.serialize(r) for r in c.execute(
            'SELECT * FROM context_preparations WHERE project_id=? ORDER BY rowid DESC', (pid,))]

@app.post('/api/projects/{pid}/context-preparations', status_code=201)
def prepare_context(pid: str, body: ContextInput):
    with db.connect() as c:
        access(c, pid)
        project = dict(c.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone())
        sources = []
        for sid in body.source_ids:
            row = c.execute('SELECT * FROM sources WHERE id=? AND project_id=?', (sid, pid)).fetchone()
            if not row: raise HTTPException(404, 'Nguồn không tồn tại hoặc không thuộc project.')
            sources.append(dict(row))
        context = context_workbench.build(project, sources, body)
    # Immutable source versions snapshotted above; release write lock for the subprocess.
    try:
        result = context_workbench.check(context)
    except ba_runtime.RuntimeIntegrityError as exc:
        raise HTTPException(503, str(exc)) from None
    except ba_adapter.AdapterError:
        raise HTTPException(503, 'Không hoàn tất preflight; không lưu kết quả đạt.') from None
    serialized = ba_adapter.canonical(context)
    cid = db.uid('ctx')
    with db.connect() as c:
        access(c, pid)
        c.execute('INSERT INTO context_preparations VALUES (?,?,?,?,?,?,?,?)',
            (cid, pid, serialized, body.model_dump_json(), db.digest(serialized), ba_runtime.REFERENCE['commit'],
             json.dumps(result, ensure_ascii=False), db.now()))
        db.event(c, pid, None, 'context.prepared',
                 f'{cid}: technical={result["technical"]}; execution blocked; human approval not_approved.')
        return context_workbench.serialize(c.execute('SELECT * FROM context_preparations WHERE id=?', (cid,)).fetchone())

@app.post('/api/projects/{pid}/runs', status_code=201)
def start_run(pid: str, body: RunInput):
    fixture=None
    if body.workflow in ba_adapter.WORKFLOWS:
        try:
            ba_runtime.source();ba_runtime.interpreter()
            if body.workflow==ba_adapter.WORKFLOW: fixture=ba_runtime.fixtures()
        except ba_runtime.RuntimeIntegrityError as exc:
            raise HTTPException(503,str(exc)) from None
    with db.connect() as c:
        access(c, pid)
        if c.execute("SELECT 1 FROM runs WHERE project_id=? AND state IN ('queued','running','awaiting_input')", (pid,)).fetchone():
            raise HTTPException(409, 'Project đã có một run đang xử lý hoặc chờ câu trả lời.')
        selected=[]; project_context=None
        if body.document_version_ids:
            try: selected=documents.versions(c,pid,body.document_version_ids)
            except ValueError as exc: raise HTTPException(422,str(exc)) from None
        if body.workflow==ba_adapter.PROJECT_WORKFLOW:
            prep=c.execute('SELECT * FROM context_preparations WHERE id=? AND project_id=?',(body.preparation_id,pid)).fetchone()
            if not prep: raise HTTPException(404,'Context chuẩn bị không thuộc project.')
            if prep['agent_commit']!=ba_runtime.REFERENCE['commit'] or db.digest(prep['context_json'])!=prep['context_hash']:
                raise HTTPException(409,'Context cũ hoặc hash không khớp. Kiểm tra và lưu context mới.')
            project_context=json.loads(prep['context_json'])
            expected_sources={r['source_id']:r for r in selected}
            if {s['id'] for s in project_context['sources']}!=set(expected_sources):
                raise HTTPException(422,'Tài liệu đã chọn phải khớp chính xác nguồn của context chuẩn bị.')
            for s in project_context['sources']:
                row=expected_sources[s['id']]
                if s['text']!=row['text'] or s['content_hash']!=row['text_hash'] or s['version']!='v'+str(row['source_version']):
                    raise HTTPException(409,'Snapshot nguồn không khớp. Tạo context mới.')
            if project_context.get('data_authorization') is not True or not json.loads(prep['input_json']).get('synthetic_only'):
                raise HTTPException(422,'Context chưa xác nhận dữ liệu giả lập; không được tự cấp quyền từ notes.')
            if len(ba_adapter.canonical(project_context).encode())+1>200_000:
                raise HTTPException(422,'Context vượt giới hạn 200 KB của BA.')
        is_harness=body.workflow in ba_adapter.WORKFLOWS
        sid = None if is_harness else (selected[0]['source_id'] if selected else c.execute('SELECT id FROM sources WHERE project_id=? ORDER BY version DESC LIMIT 1', (pid,)).fetchone()[0])
        rid = db.uid('run')
        c.execute('INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', (rid,pid,body.workflow,'queued','ba_run' if is_harness else 'intake',1,1,0,time.time()+0.3,db.now(),db.now(),sid,''))
        if selected: documents.job_input(c,rid,selected)
        if fixture:
            context,default_proposal=fixture
            ba_jobs.create(c,rid,context,body.proposal if body.proposal is not None else default_proposal)
            db.message(c,rid,'system','BA harness thật, context công nợ fixture cố định. Proposal cung cấp sẵn; không gọi model, không dùng notes project để tạo trusted context.')
        elif project_context:
            ba_jobs.create(c,rid,project_context,body.proposal)
            db.event(c,pid,rid,'ba.context_bound','Context '+body.preparation_id+'; chỉ chạy thử supplied-proposal trên dữ liệu giả lập, không xác thực thẩm quyền.')
            db.message(c,rid,'system','BA v0.2.1 thật dùng tài liệu đã chọn + proposal cung cấp sẵn. Không gọi model; mọi quyền/phê duyệt vẫn chưa được xác thực.')
        db.event(c, pid, rid, 'run.queued',
            'BA CLI: timeout 15s, verify 10s, lease 35s, 1 retry runtime; chi phí model = 0.' if is_harness
            else 'Giới hạn: 6 lượt, 3 phiên bản, 1 retry/bước, 20s/bước; chi phí model = 0.')
        if not is_harness:db.message(c, rid, 'system', 'Workflow mô phỏng đã được xếp hàng. Input đã khóa theo phiên bản tài liệu/notes; chưa có model phân tích.')
        return {'id':rid}

@app.post('/api/runs/{rid}/answers')
def answer(rid: str, body: TextInput):
    with db.connect() as c:
        r = run_access(c, rid)
        if r['workflow'] in ba_adapter.WORKFLOWS:
            raise HTTPException(409,'BA harness không tự chuyển câu trả lời thành authority. Hủy job đang chờ, sửa context/proposal và tạo run mới.')
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
            if r['workflow'] in ba_adapter.WORKFLOWS:
                c.execute("UPDATE runs SET state='changes_requested',feedback=?,updated_at=? WHERE id=?",(body.comment,db.now(),r['id']))
                db.message(c,r['id'],'system','Đã ghi nhận yêu cầu sửa BA. Chỉnh context/proposal và tạo run mới; harness không tự diễn giải feedback.')
            else:
                c.execute("UPDATE runs SET state='queued',step='draft',version=version+1,turns=turns+1,attempts=0,due=?,feedback=?,updated_at=? WHERE id=?", (time.time()+0.5,body.comment,db.now(),r['id']))
            db.message(c, r['id'], 'system', 'PM yêu cầu sửa: '+body.comment)
        else:
            c.execute("UPDATE runs SET state='reviewed',updated_at=? WHERE id=?", (db.now(),r['id']))
            worker.snapshot(c, r, f'PM đã ghi nhận review bản v{a["version"]}. Đây không phải phê duyệt baseline hay nghiệm thu UAT.')
        return {'business':body.decision, 'approval':'not_approved'}

@app.post('/api/jobs/{rid}/cancel')
def cancel_job(rid: str):
    with db.connect() as c:
        r=run_access(c,rid)
        if r['state'] not in ('queued','running','awaiting_input','awaiting_proposal'):
            raise HTTPException(409,'Job không ở trạng thái có thể hủy.')
        c.execute("UPDATE runs SET state='cancelled',updated_at=? WHERE id=?",(db.now(),rid))
        c.execute("UPDATE ba_invocations SET state='cancelled' WHERE run_id=?",(rid,))
        db.event(c,r['project_id'],rid,'job.cancelled','PM hủy job; worker không nhập kết quả vào job đã hủy.')
        return {'state':'cancelled'}

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
