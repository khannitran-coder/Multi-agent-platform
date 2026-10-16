"""Actual parsing, immutable inputs, ACL and pinned BA v0.2.1 supplied-proposal flow."""
import io
import json
import time
import zipfile
import hashlib
import pytest
from pypdf import PdfWriter
from fastapi.testclient import TestClient
from backend import store as db, worker, ba_runtime, documents
from backend.app import app

@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db,'DB',tmp_path/'documents.db');db.init()
    return TestClient(app)

def project(client):
    response=client.post('/api/projects',json={'name':'Documents project','objective':'Synthetic BA workflow'})
    assert response.status_code==201,response.text
    return response.json()['id']

def upload(client,pid,name='notes.md',content=b'Customer creates a ticket.\nPM reviews the request.',mime='text/markdown',did=None):
    return client.post(f'/api/projects/{pid}/documents/upload'+('?document_id='+did if did else ''),files={'file':(name,content,mime)})

def data(client,pid):return client.get('/api/projects/'+pid).json()

def step(rid):
    with db.connect() as c:c.execute('UPDATE runs SET due=? WHERE id=?',(time.time()-.1,rid))
    worker.tick()

def start(client,pid,versions,**extra):
    return client.post(f'/api/projects/{pid}/runs',json={'workflow':'ba-documents-demo','document_version_ids':versions,'synthetic_only':True,**extra})

def docx(text):
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as archive:
        archive.writestr('[Content_Types].xml','<Types/>')
        archive.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+text+'</w:t></w:r></w:p></w:body></w:document>')
    return stream.getvalue()

def pdf(text=None):
    # Construct a real readable one-page PDF with a standard font and content stream.
    from pypdf.generic import NameObject, DictionaryObject, DecodedStreamObject
    writer=PdfWriter();page=writer.add_blank_page(width=612,height=792)
    if text:
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
        stream=DecodedStreamObject();stream.set_data(('BT /F1 12 Tf 72 720 Td ('+text+') Tj ET').encode())
        page[NameObject('/Contents')]=writer._add_object(stream)
    out=io.BytesIO();writer.write(out);return out.getvalue()

@pytest.mark.parametrize('name,content,mime,expected',[
    ('notes.txt',b'TXT synthetic customer request.','text/plain','TXT synthetic'),
    ('notes.md',b'# Markdown synthetic customer request.','text/markdown','Markdown synthetic'),
    ('scope.docx',docx('DOCX synthetic scope.'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document','DOCX synthetic'),
    ('scope.pdf',pdf('PDF synthetic scope.'),'application/pdf','PDF synthetic'),
])
def test_all_supported_formats_extract_and_download_exact_bytes(client,name,content,mime,expected):
    pid=project(client);response=upload(client,pid,name,content,mime)
    assert response.status_code==201,response.text
    value=response.json();assert value['status']=='ready'
    p=data(client,pid);assert expected in next(s['text'] for s in p['sources'] if s['id']==value['source_id'])
    version=p['documents'][0]['versions'][0]
    assert version['hash']==hashlib.sha256(content).hexdigest() and 'storage_name' not in version
    assert client.get('/api/document-versions/'+value['version_id']+'/download').content==content

def test_blank_pdf_is_not_readable_and_cannot_be_run(client):
    pid=project(client);res=upload(client,pid,'scan.pdf',pdf(),'application/pdf').json()
    assert res['status']=='needs_text' and res['source_id'] is None
    assert start(client,pid,[res['version_id']]).status_code==422

@pytest.mark.parametrize('name,content,mime',[
    ('../escape.md',b'text content','text/markdown'),
    ('bad.exe',b'executable','application/octet-stream'),
    ('fake.pdf',b'not a pdf','application/pdf'),
    ('fake.docx',b'not a zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ('fake.md',b'\x00binary','text/markdown'),
    ('mismatch.txt',b'text','image/png'),
])
def test_invalid_uploads_are_rejected_without_source_or_file(client,name,content,mime):
    pid=project(client);before=len(data(client,pid)['sources'])
    assert upload(client,pid,name,content,mime).status_code==422
    assert data(client,pid)['documents']==[] and len(data(client,pid)['sources'])==before
    assert not list(documents.root().iterdir())

def test_upload_body_and_extracted_text_limits(client):
    pid=project(client)
    assert upload(client,pid,content=b'x'*(documents.MAX_UPLOAD+1)).status_code==413
    assert upload(client,pid,content=b'x'*100001).status_code==422
    assert not list(documents.root().iterdir())

def test_docx_entities_and_compressed_bomb_are_not_parsed(client):
    pid=project(client)
    bomb=io.BytesIO()
    with zipfile.ZipFile(bomb,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml','<Types/>')
        archive.writestr('word/document.xml','x'*1_000_000)
    assert upload(client,pid,'bomb.docx',bomb.getvalue(),'application/vnd.openxmlformats-officedocument.wordprocessingml.document').status_code==422
    raw=io.BytesIO()
    with zipfile.ZipFile(raw,'w') as archive:
        archive.writestr('[Content_Types].xml','<Types/>')
        archive.writestr('word/document.xml','<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><document>&xxe;</document>')
    assert upload(client,pid,'entity.docx',raw.getvalue(),'application/vnd.openxmlformats-officedocument.wordprocessingml.document').status_code==422

def test_drive_saves_only_canonical_link_without_network_or_read_permission(client,monkeypatch):
    pid=project(client)
    from backend.drive_adapter import drive
    monkeypatch.setattr(drive,'read',lambda *a:pytest.fail('Must not fetch Drive links'))
    res=client.post(f'/api/projects/{pid}/documents/drive',json={'name':'Private SOW','url':'https://docs.google.com/document/d/synthetic_drive_123/edit?usp=sharing'})
    assert res.status_code==201 and res.json()['status']=='requires_connection'
    doc=data(client,pid)['documents'][0]
    assert doc['drive_url']=='https://drive.google.com/file/d/synthetic_drive_123/view'
    assert doc['versions'][0]['source_id'] is None
    assert start(client,pid,[res.json()['version_id']]).status_code==422
    for url in ['http://127.0.0.1/private','https://drive.google.com.evil.test/file/d/12345/view','https://drive.google.com/drive/folders/12345','https://user:pass@drive.google.com/file/d/12345/view']:
        assert client.post(f'/api/projects/{pid}/documents/drive',json={'name':'Invalid','url':url}).status_code==422

def test_document_journey_versions_review_and_job_input_pinning(client):
    pid=project(client);a=upload(client,pid).json()
    b=upload(client,pid,'risk.txt',b'PM needs blocker alerts.','text/plain').json()
    res=start(client,pid,[a['version_id'],b['version_id']]);assert res.status_code==201,res.text
    rid=res.json()['id'];original=client.get('/api/jobs/'+rid).json()
    assert len(original['documents'])==2 and original['job']['state']=='queued'
    new=upload(client,pid,content=b'Changed document after starting job.',did=a['id']).json()
    assert new['version']==2
    step(rid);step(rid)
    assert data(client,pid)['runs'][0]['state']=='awaiting_input'
    assert client.post(f'/api/runs/{rid}/answers',json={'text':'PM reviews synthetic scope. No approval granted.'}).status_code==200
    step(rid);step(rid)
    p=data(client,pid);artifact=p['artifacts'][0]
    assert p['runs'][0]['state']=='awaiting_review'
    assert any('blocker alerts' in r['description'] for r in artifact['content']['requirements'])
    assert not any('Changed document' in r['description'] for r in artifact['content']['requirements'])
    assert client.get('/api/jobs/'+rid).json()['documents']==original['documents']
    assert artifact['content']['uat_status']=='Not Started' and artifact['approval']=='not_approved'
    assert client.post(f'/api/artifacts/{artifact["id"]}/reviews',json={'decision':'needs_changes','comment':'Clarify alert owner.'}).status_code==200
    step(rid);step(rid)
    newest=data(client,pid)['artifacts'][0];assert newest['version']==2
    assert client.post(f'/api/artifacts/{newest["id"]}/reviews',json={'decision':'reviewed','comment':'Reviewed synthetic draft only.'}).json()['approval']=='not_approved'
    db.init();assert len(data(client,pid)['documents'])==2

def test_cross_project_documents_jobs_and_downloads_denied(client):
    pid=project(client);other=project(client);doc=upload(client,other).json()
    assert start(client,pid,[doc['version_id']]).status_code==422
    assert upload(client,pid,did=doc['id']).status_code==404
    rid=start(client,other,[doc['version_id']]).json()['id']
    with db.connect() as c:c.execute('UPDATE memberships SET user_id=? WHERE project_id=?',('other-user',other))
    assert client.get('/api/jobs/'+rid).status_code==404
    assert client.get('/api/document-versions/'+doc['version_id']+'/download').status_code==404
    assert client.post('/api/jobs/'+rid+'/cancel').status_code==404

def project_harness_setup(client):
    pid=project(client);context,proposal=ba_runtime.fixtures();mapping={};versions=[]
    for source in context['sources']:
        added=upload(client,pid,source['id']+'.txt',source['text'].encode(),'text/plain').json()
        versions.append(added['version_id'])
        row=next(s for s in data(client,pid)['sources'] if s['id']==added['source_id'])
        mapping[source['id']]={'id':row['id'],'version':'v'+str(row['version'])}
    def remap(value):
        if isinstance(value,dict):
            result={k:remap(v) for k,v in value.items()}
            if value.get('source_id') in mapping:
                result.update(source_id=mapping[value['source_id']]['id'],source_version=mapping[value['source_id']]['version'])
            if 'requester' in result:result['requester']='PM Demo'
            return result
        if isinstance(value,list):return [remap(v) for v in value]
        return value
    prep=client.post(f'/api/projects/{pid}/context-preparations',json={'source_ids':[v['id'] for v in mapping.values()],
        'mode':'client','pm_owner':'PM Demo','internal_approver':'Delivery Lead','client_approver':'Client Sponsor','contract_type':'Fixed-price',
        'sow_source_id':mapping['SOW-01']['id'],'change_process_ref':mapping['SOW-01']['id']+':L2',
        'acceptance_process_ref':mapping['SOW-01']['id']+':L3','synthetic_only':True})
    assert prep.status_code==201 and prep.json()['result']['technical']=='passed',prep.text
    return pid,versions,prep.json()['id'],remap(proposal)

def test_actual_v021_harness_with_project_sources_and_exact_provenance(client):
    pid,versions,prep,proposal=project_harness_setup(client)
    res=start(client,pid,versions,workflow='ba-project-proposal',preparation_id=prep,proposal=proposal)
    assert res.status_code==201,res.text
    rid=res.json()['id'];step(rid);p=data(client,pid)
    assert p['runs'][0]['state']=='awaiting_review',client.get('/api/runs/'+rid+'/ba').text
    artifact=p['artifacts'][0];assert artifact['content']['ba_bundle']['project']=='Documents project'
    assert artifact['content']['mode']=='ba-project-proposal'
    assert {d['id'] for d in artifact['content']['document_sources']}==set(versions)
    pack=client.get('/api/artifacts/'+artifact['id']+'/ba-pack').json()
    assert set(pack['files'])=={'proposal.json','bundle.json','review-pack.md','audit.json','manifest.json'}
    assert json.loads(pack['files']['proposal.json'])==proposal
    assert artifact['approval']=='not_approved'
    inv=client.get('/api/runs/'+rid+'/ba').json()
    assert inv['context']['reviews']==[] and inv['agent_commit']==ba_runtime.REFERENCE['commit']
    client.post(f'/api/artifacts/{artifact["id"]}/reviews',json={'decision':'needs_changes','comment':'Edit supplied proposal in new job.'})
    assert len(data(client,pid)['artifacts'])==1

def test_context_selection_mismatch_gates_and_cancel_recovery(client):
    pid,versions,prep,proposal=project_harness_setup(client)
    assert start(client,pid,versions[:1],workflow='ba-project-proposal',preparation_id=prep,proposal=proposal).status_code==422
    # Wrong evidence produces a domain gate and no imported artifact.
    proposal['requirements'][0]['evidence'][0]['source_id']='wrong-source'
    res=start(client,pid,versions,workflow='ba-project-proposal',preparation_id=prep,proposal=proposal)
    rid=res.json()['id'];step(rid)
    assert data(client,pid)['runs'][0]['state']=='escalated' and data(client,pid)['artifacts']==[]
    rid=start(client,pid,versions).json()['id'];step(rid);step(rid)
    assert client.post('/api/jobs/'+rid+'/cancel').json()['state']=='cancelled'
    step(rid);assert data(client,pid)['runs'][0]['state']=='cancelled'
    assert start(client,pid,versions).status_code==201

def test_chunked_body_limit_and_pdf_page_encryption_limits(client):
    pid=project(client)
    # No Content-Length: the stream itself must be bounded before multipart parsing.
    res=client.post(f'/api/projects/{pid}/documents/upload',content=iter([b'x'*(documents.MAX_UPLOAD+65537)]),
                    headers={'Content-Type':'multipart/form-data; boundary=limit'})
    assert res.status_code==413
    writer=PdfWriter()
    for _ in range(101):writer.add_blank_page(width=612,height=792)
    raw=io.BytesIO();writer.write(raw)
    assert upload(client,pid,'long.pdf',raw.getvalue(),'application/pdf').status_code==422
    writer=PdfWriter();writer.add_blank_page(width=612,height=792);writer.encrypt('synthetic-password')
    raw=io.BytesIO();writer.write(raw)
    assert upload(client,pid,'locked.pdf',raw.getvalue(),'application/pdf').status_code==422
    assert data(client,pid)['documents']==[]
