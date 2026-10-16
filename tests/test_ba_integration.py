"""Real pinned CLI tests. No model provider, fake validator or synthetic passing pack."""
import copy
import hashlib
import json
import shutil
import sys
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend import store as db, worker, ba_adapter, ba_runtime
from backend.app import app

@pytest.fixture()
def client(tmp_path,monkeypatch):
    # Missing runtime is a setup failure, not an automatic skipped integration suite.
    ba_runtime.source();ba_runtime.interpreter()
    monkeypatch.setattr(db,'DB',tmp_path/'test.db');db.init()
    return TestClient(app)

def start(client,proposal=None):
    p=client.post('/api/projects',json={'name':'Harness integration','objective':'Fixture integration, no approval','notes':'These arbitrary notes must never become trusted context or authority.'}).json()['id']
    body={'workflow':'ba-harness-fixture'}
    if proposal is not None:body['proposal']=proposal
    r=client.post(f'/api/projects/{p}/runs',json=body)
    assert r.status_code==201,r.text
    return p,r.json()['id']

def step(rid):
    with db.connect() as c:c.execute('UPDATE runs SET due=? WHERE id=?',(time.time()-0.1,rid))
    worker.tick()

def read(client,pid):return client.get('/api/projects/'+pid).json()

def test_real_pack_full_ac_rtm_manifest_and_operator_boundaries(client):
    pid,rid=start(client);step(rid)
    p=read(client,pid);a=p['artifacts'][0];b=a['content']['ba_bundle']
    assert p['runs'][0]['state']=='awaiting_review' and p['runs'][0]['source_id'] is None
    assert a['technical']=='ba_schema_domain_manifest_passed' and a['approval']=='not_approved'
    assert b['project']=='Demo — Báo cáo công nợ' and b['agent_version']=='0.2.0'
    assert {r['id'] for r in b['requirements']}=={'REQ-01','REQ-02'}
    assert b['requirements'][0]['description']=='Xuất báo cáo công nợ Excel theo khoảng ngày'
    assert {ac['kind'] for ac in b['stories'][0]['acceptance_criteria']}=={'happy','edge','error'}
    assert b['stories'][0]['status']=='Blocked'
    assert len(b['tests'])==3 and len(b['rtm'])==2
    assert all(t['actual'] is None and t['status']=='Not Started' for t in b['tests'])
    assert b['baseline_status']==b['uat_signoff']=='Not Approved'
    invocation=client.get(f'/api/runs/{rid}/ba').json()
    assert invocation['context']['reviews']==[]
    assert 'arbitrary notes' not in json.dumps(invocation['context'])
    raw=client.get(f'/api/artifacts/{a["id"]}/ba-pack').json()['files']
    manifest=json.loads(raw['manifest.json'])
    for name,sha in manifest['files'].items():
        downloaded=client.get(f'/api/artifacts/{a["id"]}/ba-pack/{name}')
        assert downloaded.status_code==200 and hashlib.sha256(downloaded.content).hexdigest()==sha
    assert json.loads(raw['audit.json'])['adapter']=='supplied-proposal'
    assert client.get(f'/api/artifacts/{a["id"]}/ba-pack/unknown').status_code==404

def test_invalid_proposal_exit_two_is_escalated_without_artifacts(client):
    proposal=copy.deepcopy(ba_runtime.fixtures()[1])
    proposal['requirements'][0]['evidence'][0]['source_id']='NONEXISTENT-SOURCE'
    pid,rid=start(client,proposal);step(rid)
    p=read(client,pid)
    assert p['runs'][0]['state']=='escalated' and p['artifacts']==[]
    result=client.get(f'/api/runs/{rid}/ba').json()['result']
    assert result['state']=='Escalated' and result['errors']
    assert p['runs'][0]['attempts']==0  # domain rejection is not retried as a runtime failure
    step(rid)
    assert read(client,pid)['artifacts']==[]

def test_request_cannot_supply_trusted_context_or_unbounded_proposal(client):
    pid=client.get('/api/projects').json()[0]['id']
    assert client.post(f'/api/projects/{pid}/runs',json={'workflow':'ba-harness-fixture','context':{'data_authorization':True,'reviews':[{'decision':'confirmed'}]}}).status_code==422
    assert client.post(f'/api/projects/{pid}/runs',json={'workflow':'ba-draft','proposal':{}}).status_code==422
    assert client.post(f'/api/projects/{pid}/runs',json={'workflow':'ba-harness-fixture','proposal':{'text':'x'*200001}}).status_code==422

def test_pack_and_invocation_access_follows_project_membership(client):
    pid,rid=start(client);step(rid);aid=read(client,pid)['artifacts'][0]['id']
    with db.connect() as c:c.execute('UPDATE memberships SET user_id=? WHERE project_id=?',('other-user',pid))
    for endpoint in [f'/api/runs/{rid}/ba',f'/api/artifacts/{aid}/ba-pack',f'/api/artifacts/{aid}/ba-pack/bundle.json']:
        assert client.get(endpoint).status_code==404

def test_review_does_not_fabricate_ba_confirmations_or_auto_rewrite(client):
    pid,rid=start(client);step(rid);a=read(client,pid)['artifacts'][0]
    before=client.get(f'/api/artifacts/{a["id"]}/ba-pack').json()
    assert client.post(f'/api/artifacts/{a["id"]}/reviews',json={'decision':'reviewed','comment':'Review cấu trúc pack, không phê duyệt.'}).json()['approval']=='not_approved'
    assert client.post(f'/api/artifacts/{a["id"]}/reviews',json={'decision':'needs_changes','comment':'Cần sửa AC trước khi xác nhận.'}).status_code==200
    step(rid)
    p=read(client,pid)
    assert p['runs'][0]['state']=='changes_requested' and len(p['artifacts'])==1
    assert p['artifacts'][0]['hash']==a['hash']
    assert client.get(f'/api/artifacts/{a["id"]}/ba-pack').json()==before
    assert client.get(f'/api/runs/{rid}/ba').json()['context']['reviews']==[]

def test_replay_and_tamper_detection(client):
    pid,rid=start(client);step(rid)
    with db.connect() as c:inv=dict(c.execute('SELECT * FROM ba_invocations WHERE run_id=?',(rid,)).fetchone())
    root=db.DB.parent/'ba-runs'/rid
    replay=ba_adapter.execute(inv,root)
    assert replay['result']['reused'] is True
    pack=root/'packs'/replay['result']['run_hash'][:20]
    target=pack/'review-pack.md';target.write_text(target.read_text()+'tamper')
    with pytest.raises(ba_adapter.PackIntegrityError):ba_adapter.read_files(pack,root/'packs')
    # Already imported SQLite bytes remain immutable even if the local staging pack is corrupted.
    a=read(client,pid)['artifacts'][0]
    assert 'tamper' not in client.get(f'/api/artifacts/{a["id"]}/ba-pack').json()['files']['review-pack.md']

def test_pack_paths_and_symlink_rejected(tmp_path):
    packs=tmp_path/'packs';packs.mkdir()
    outside=tmp_path/'outside';outside.mkdir()
    with pytest.raises(ba_adapter.PackIntegrityError):ba_adapter.read_files(outside,packs)
    link=packs/('a'*20);link.symlink_to(outside,target_is_directory=True)
    with pytest.raises(ba_adapter.PackIntegrityError):ba_adapter.read_files(link,packs)

@pytest.mark.parametrize('filename',['bundle.json','audit.json'])
def test_rehashed_tamper_still_fails_independent_verification(client,filename):
    pid,rid=start(client);step(rid)
    with db.connect() as c:inv=dict(c.execute('SELECT * FROM ba_invocations WHERE run_id=?',(rid,)).fetchone())
    root=db.DB.parent/'ba-runs'/rid
    accepted=read(client,pid)['artifacts'][0]
    pack=root/'packs'/accepted['content']['origin']['run_hash'][:20]
    target=pack/filename;data=json.loads(target.read_text())
    if filename=='bundle.json':data['summary']='A maliciously altered but structurally valid summary'
    else:data['fingerprints']['agent.py']='0'*64
    target.write_text(json.dumps(data,ensure_ascii=False))
    manifest_path=pack/'manifest.json';manifest=json.loads(manifest_path.read_text())
    manifest['files'][filename]=hashlib.sha256(target.read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(manifest))
    # The changed file has a matching manifest: a hash-only importer would accept it.
    ba_adapter.read_files(pack,root/'packs')
    with pytest.raises(ba_adapter.PackIntegrityError,match='Independent'):
        ba_adapter.execute(inv,root)

def test_runtime_tamper_is_fail_closed(client,tmp_path,monkeypatch):
    fake=tmp_path/'runtime';shutil.copytree(ba_runtime.source(),fake/'source')
    file=fake/'source/agent.py';file.chmod(0o644);file.write_text(file.read_text()+'\n# modified\n')
    monkeypatch.setattr(ba_runtime,'RUNTIME',fake)
    pid=client.get('/api/projects').json()[0]['id']
    assert client.post(f'/api/projects/{pid}/runs',json={'workflow':'ba-harness-fixture'}).status_code==503
    assert read(client,pid)['runs']==[]

def test_cli_timeout_bounded_and_worker_retry_exhaustion(client,tmp_path,monkeypatch):
    with pytest.raises(ba_adapter.AdapterError,match='timeout'):
        ba_adapter.invoke([sys.executable,'-c','import time; time.sleep(10)'],tmp_path,timeout=0.05)
    pid,rid=start(client)
    def fail(*a):raise ba_adapter.AdapterError('timeout')
    monkeypatch.setattr(ba_adapter,'execute',fail)
    step(rid);assert read(client,pid)['runs'][0]['attempts']==1
    step(rid);assert read(client,pid)['runs'][0]['state']=='failed'
    assert read(client,pid)['artifacts']==[]
