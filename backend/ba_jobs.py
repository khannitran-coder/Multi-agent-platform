"""Durable claims; subprocess work happens after committing/releasing the SQLite lock."""
import hashlib
import json
import time
from . import store as db, ba_runtime, ba_adapter

def create(c, rid, context, proposal):
    context_json=ba_adapter.canonical(context);proposal_json=ba_adapter.canonical(proposal)
    digest=hashlib.sha256(ba_adapter.canonical({'context':context,'proposal':proposal}).encode()).hexdigest()
    c.execute('INSERT INTO ba_invocations VALUES (?,?,?,?,?,?,?)',
        (rid,context_json,proposal_json,digest,ba_runtime.REFERENCE['commit'],'queued','{}'))

def claim(c, r):
    if r['step']=='ba_executing':
        failure(c,r,'BA worker lease expired',retry=True)
        return False
    if r['step']!='ba_run':
        failure(c,r,'Unexpected BA step',retry=False)
        return False
    c.execute("UPDATE runs SET state='running',step='ba_executing',due=?,updated_at=? WHERE id=?", (time.time()+35,db.now(),r['id']))
    c.execute("UPDATE ba_invocations SET state='running' WHERE run_id=?",(r['id'],))
    db.event(c,r['project_id'],r['id'],'ba.started','Chạy BA CLI supplied-proposal trên context fixture; không gọi model.','ba-worker')
    return True

def failure(c,r,reason,retry=False):
    if retry and r['attempts']<1:
        c.execute("UPDATE runs SET state='queued',step='ba_run',attempts=attempts+1,due=?,updated_at=? WHERE id=?",(time.time()+1,db.now(),r['id']))
        state='queued'
        db.event(c,r['project_id'],r['id'],'ba.retry',reason,'ba-worker')
    else:
        c.execute("UPDATE runs SET state='failed',updated_at=? WHERE id=?",(db.now(),r['id']))
        state='failed'
        db.event(c,r['project_id'],r['id'],'ba.failed',reason,'ba-worker')
        db.message(c,r['id'],'agent','BA worker dừng: '+reason+'. Không nhập accepted pack.')
    c.execute('UPDATE ba_invocations SET state=?,result_json=? WHERE run_id=?',(state,json.dumps({'reason':reason}),r['id']))

def execute_job(rid):
    with db.connect() as c:
        invocation=dict(c.execute('SELECT * FROM ba_invocations WHERE run_id=?',(rid,)).fetchone())
    try:
        result=ba_adapter.execute(invocation,db.DB.resolve().parent/'ba-runs'/rid)
    except Exception as exc:
        with db.connect() as c:
            r=dict(c.execute('SELECT * FROM runs WHERE id=?',(rid,)).fetchone())
            if r['state']=='running' and r['step']=='ba_executing':
                retry=isinstance(exc,ba_adapter.AdapterError) and not isinstance(exc,ba_adapter.PackIntegrityError)
                # Exception messages may contain paths; expose safe categories only.
                failure(c,r,type(exc).__name__,retry=retry)
        return
    with db.connect() as c:
        r=dict(c.execute('SELECT * FROM runs WHERE id=?',(rid,)).fetchone())
        if r['state']!='running' or r['step']!='ba_executing':return
        c.execute('UPDATE ba_invocations SET state=?,result_json=? WHERE run_id=?',(result['state'],json.dumps(result['result'],ensure_ascii=False),rid))
        if result['state']!='AwaitingPMReview':
            mapped={'AwaitingInput':'awaiting_input','AwaitingProposal':'awaiting_proposal','Escalated':'escalated'}[result['state']]
            c.execute('UPDATE runs SET state=?,step=?,due=0,updated_at=? WHERE id=?',(mapped,'ba_gate',db.now(),rid))
            db.event(c,r['project_id'],rid,'ba.gate',f'BA trả {result["state"]}; exit 2 là trạng thái gate, không phải lỗi process.','ba-worker')
            db.message(c,rid,'agent',f'BA trả {result["state"]}. Xem findings trong Chi tiết run. Không có artifact được nhập.')
            return
        content=ba_adapter.view(result['bundle'],json.loads(invocation['context_json']),result['result']['run_hash'])
        serialized=json.dumps(content,ensure_ascii=False,sort_keys=True,allow_nan=False)
        aid=db.uid('art')
        c.execute('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?)',(aid,r['project_id'],rid,1,serialized,db.digest(serialized),'ba_schema_domain_manifest_passed','pending','not_approved',db.now()))
        c.execute('INSERT INTO ba_packs VALUES (?,?,?)',(aid,json.dumps(result['files'],ensure_ascii=False),result['result']['run_hash']))
        c.execute("UPDATE runs SET state='awaiting_review',step='review',due=0,updated_at=? WHERE id=?",(db.now(),rid))
        db.event(c,r['project_id'],rid,'ba.pack_verified','Canonical schema + domain validation + manifest hash + input/audit fingerprints đạt.','ba-worker')
        db.event(c,r['project_id'],rid,'ba.imported','Đã nhập bundle/review-pack/audit/manifest từ harness 0.2.0. BA verification, business validation và approval vẫn chờ con người.','ba-worker')
        db.message(c,rid,'agent','Pack BA thật (fixture công nợ) đã được nhập. Không phân tích notes project; UAT chưa chạy. Mở Artifact để xem mọi AC, RTM và findings.')
        from .worker import snapshot
        snapshot(c,r,'BA fixture: pack đã qua schema/domain/hash và sẵn sàng review; chưa phê duyệt hoặc nghiệm thu UAT.')
