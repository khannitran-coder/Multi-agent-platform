"""Behavior checks with isolated SQLite; no fixtures written to agent repositories."""
import json
import time
import pytest
from fastapi.testclient import TestClient
from backend import store as db, worker
from backend.app import app

@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'DB', tmp_path/'test.db')
    db.init()
    return TestClient(app)

def project(client, notes='Khách hàng tạo ticket.\n\nPM xem trạng thái.\nCần giới hạn quyền.'):
    r=client.post('/api/projects',json={'name':'Test project','objective':'Quản lý yêu cầu hỗ trợ','notes':notes})
    assert r.status_code==201
    return r.json()['id']

def data(client,pid):
    return client.get('/api/projects/'+pid).json()

def step(rid):
    with db.connect() as c:
        c.execute('UPDATE runs SET due=? WHERE id=?',(time.time()-0.1,rid))
    worker.tick()

def draft(client,pid):
    response=client.post(f'/api/projects/{pid}/runs',json={})
    assert response.status_code==201
    rid=response.json()['id']
    step(rid);step(rid)
    assert data(client,pid)['runs'][0]['state']=='awaiting_input'
    assert client.post(f'/api/runs/{rid}/answers',json={'text':'PM review, ưu tiên ticket; email để sau.'}).status_code==200
    step(rid);step(rid)
    return rid,data(client,pid)['artifacts'][0]

def test_complete_journey_versions_review_and_snapshot(client):
    pid=project(client)
    rid,a=draft(client,pid)
    assert a['technical']=='schema_passed' and a['approval']=='not_approved'
    assert a['content']['uat_status']=='Not Started'
    assert ':L3' in a['content']['requirements'][1]['evidence']
    original_hash=a['hash']
    body={'decision':'needs_changes','comment':'Bổ sung giới hạn quyền xem ticket.'}
    assert client.post(f'/api/artifacts/{a["id"]}/reviews',json=body).status_code==200
    assert client.post(f'/api/artifacts/{a["id"]}/reviews',json=body).status_code==409
    step(rid);step(rid)
    p=data(client,pid); latest,old=p['artifacts']
    assert latest['version']==2 and latest['content']['change_request']==body['comment']
    assert old['hash']==original_hash and old['content']==a['content']
    assert client.post(f'/api/artifacts/{old["id"]}/reviews',json=body).status_code==409
    result=client.post(f'/api/artifacts/{latest["id"]}/reviews',json={'decision':'reviewed','comment':'Đã review, cần BA xác nhận AC.'})
    assert result.json()=={'business':'reviewed','approval':'not_approved'}
    p=data(client,pid)
    assert p['runs'][0]['state']=='reviewed'
    assert p['artifacts'][0]['approval']=='not_approved'
    assert any(e['kind']=='handoff.ba_qa' for e in p['events'])
    assert 'không phải phê duyệt' in p['snapshots'][0]['text']

def test_project_access_and_cross_project_isolation(client):
    mine=project(client); other=project(client)
    rid,a=draft(client,other)
    with db.connect() as c:
        c.execute('UPDATE memberships SET user_id=? WHERE project_id=?',('another-user',other))
    assert other not in [p['id'] for p in client.get('/api/projects').json()]
    assert client.get(f'/api/projects/{other}').status_code==404
    assert client.post(f'/api/runs/{rid}/answers',json={'text':'Unauthorized answer'}).status_code==404
    assert client.post(f'/api/artifacts/{a["id"]}/reviews',json={'decision':'reviewed','comment':'Forged review'}).status_code==404
    assert client.put(f'/api/projects/{other}/channel',json={'enabled':True,'schedule':'daily'}).status_code==404
    assert data(client,mine)['artifacts']==[]
    assert data(client,mine)['messages']==[]

def test_source_version_is_pinned_and_duplicate_answer_rejected(client):
    pid=project(client)
    initial=data(client,pid)['sources'][0]
    rid=client.post(f'/api/projects/{pid}/runs',json={}).json()['id']
    assert client.post(f'/api/projects/{pid}/runs',json={}).status_code==409
    client.post(f'/api/projects/{pid}/sources',json={'text':'New source changed the project scope.'})
    step(rid);step(rid)
    assert client.post(f'/api/runs/{rid}/answers',json={'text':'PM reviews first version'}).status_code==200
    assert client.post(f'/api/runs/{rid}/answers',json={'text':'Duplicate response'}).status_code==409
    step(rid);step(rid)
    a=data(client,pid)['artifacts'][0]
    assert a['content']['source_id']==initial['id'] and a['content']['source_hash']==initial['hash']

def test_revision_limit(client):
    pid=project(client);rid,a=draft(client,pid)
    for version in (2,3):
        assert client.post(f'/api/artifacts/{a["id"]}/reviews',json={'decision':'needs_changes','comment':f'Change version {version}'}).status_code==200
        step(rid);step(rid)
        a=data(client,pid)['artifacts'][0]
        assert a['version']==version
    assert client.post(f'/api/artifacts/{a["id"]}/reviews',json={'decision':'needs_changes','comment':'One revision too many'}).status_code==409
    assert len(data(client,pid)['artifacts'])==3

def test_real_sqlite_persistence_and_channel_no_credentials(client):
    pid=project(client);rid,a=draft(client,pid)
    res=client.put(f'/api/projects/{pid}/channel',json={'enabled':True,'schedule':'daily'})
    assert res.json()=={'saved':True,'connected':False}
    db.init()  # repeated initialization must preserve projects and versions
    p=data(client,pid)
    assert p['channel']['enabled']==1 and p['artifacts'][0]['id']==a['id']
    assert client.post('/api/projects',json={'name':'x','objective':'a','notes':'b'}).status_code==422
    assert client.post('/api/projects',headers={'Origin':'https://untrusted.example'},json={}).status_code==403

def test_worker_timeout_and_recovery_without_partial_pack(client,monkeypatch):
    pid=project(client)
    rid=client.post(f'/api/projects/{pid}/runs',json={}).json()['id']
    with db.connect() as c:
        c.execute('UPDATE runs SET due=? WHERE id=?',(time.time()-25,rid))
    worker.tick()
    assert data(client,pid)['runs'][0]['state']=='failed'
    rid=client.post(f'/api/projects/{pid}/runs',json={}).json()['id']
    step(rid);step(rid)
    client.post(f'/api/runs/{rid}/answers',json={'text':'PM, internal review only'})
    original=worker.make_draft
    monkeypatch.setattr(worker,'make_draft',lambda *a: (_ for _ in ()).throw(ValueError('fixture failure')))
    step(rid)
    p=data(client,pid)
    assert p['runs'][0]['attempts']==1 and p['artifacts']==[]
    monkeypatch.setattr(worker,'make_draft',original)
    step(rid);step(rid)
    assert data(client,pid)['runs'][0]['state']=='awaiting_review'

def test_worker_retry_exhaustion_does_not_publish(client,monkeypatch):
    pid=project(client)
    rid=client.post(f'/api/projects/{pid}/runs',json={}).json()['id']
    step(rid);step(rid)
    client.post(f'/api/runs/{rid}/answers',json={'text':'PM handles review'})
    monkeypatch.setattr(worker,'make_draft',lambda *a: (_ for _ in ()).throw(ValueError('fixture failure')))
    step(rid);step(rid)
    p=data(client,pid)
    assert p['runs'][0]['state']=='failed' and p['artifacts']==[]
    assert any(e['kind']=='run.failed' for e in p['events'])

def test_standalone_ba_has_no_qa_or_snapshot_handoff(client):
    pid=project(client)
    rid=client.post(f'/api/projects/{pid}/runs',json={'workflow':'ba-draft'}).json()['id']
    step(rid);step(rid)
    before=len(data(client,pid)['snapshots'])
    client.post(f'/api/runs/{rid}/answers',json={'text':'PM reviews. Ticket first.'})
    step(rid);step(rid)
    p=data(client,pid)
    assert len(p['snapshots'])==before  # blocker snapshot only; no final summary agent
    assert p['runs'][0]['state']=='awaiting_review'
    assert any(e['kind']=='validation.platform' for e in p['events'])
    assert not any(e['kind'].startswith('handoff.') for e in p['events'])
