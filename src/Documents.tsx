import { useEffect, useState } from 'react';
import { Download, FileText, Upload, Link2, Play, ArrowRight } from 'lucide-react';
import { api } from './api';
import type { Project, Run } from './types';

export interface DocumentVersion {
  id: string; version: number; source_id: string | null; filename: string;
  size: number; hash: string; status: string; detail: string;
}
export interface ProjectDocument {
  id: string; name: string; kind: string; drive_url: string; access_status: string; versions: DocumentVersion[];
}
const states: Record<string,string> = {ready:'Đọc được', needs_text:'Cần bản có text', requires_connection:'Chưa có quyền đọc Drive'};
interface Preparation { id: string; context: {sources:{id:string}[]}; result:{technical:string}; }

export function DocumentsWorkspace({project, refresh, opened}: {project:Project; refresh:()=>Promise<void>; opened:(rid:string)=>void}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [driveName, setDriveName] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [synthetic, setSynthetic] = useState(false);
  const [preparations, setPreparations] = useState<Preparation[]>([]);
  const [preparation, setPreparation] = useState('');
  const [proposal, setProposal] = useState('');
  const docs = project.documents || [];
  async function action(fn:()=>Promise<void>) {
    setBusy(true);setError('');setNotice('');
    try { await fn(); } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function upload(file:File, documentId?:string) {
    await action(async()=>{
      if (file.size>5*1024*1024) throw new Error('File vượt giới hạn 5 MiB.');
      const body=new FormData();body.append('file',file);
      const response=await fetch('/api/projects/'+project.id+'/documents/upload'+(documentId?'?document_id='+encodeURIComponent(documentId):''),{method:'POST',body});
      const result=await response.json();
      if (!response.ok) throw new Error(typeof result.detail==='string'?result.detail:'Không nhận được file; kiểm tra định dạng.');
      const prior=docs.find(d=>d.id===documentId)?.versions.map(v=>v.id)||[];
      if(result.status==='ready') setSelected(s=>[...s.filter(id=>!prior.includes(id)),result.version_id]);
      await refresh();setNotice(result.status==='ready'?'Đã lưu và chọn phiên bản mới. Chưa chạy BA.':result.detail);
    });
  }
  useEffect(()=>{
    let active=true;
    api<Preparation[]>('/projects/'+project.id+'/context-preparations').then(p=>active&&setPreparations(p)).catch(e=>active&&setError(e.message));
    return ()=>{active=false;};
  },[project.id]);
  async function start(workflow:string) {
    await action(async()=>{
      let supplied:Record<string,unknown>|undefined;
      if(workflow==='ba-project-proposal') {
        supplied=JSON.parse(proposal);
        if(!supplied || Array.isArray(supplied) || typeof supplied!=='object') throw new Error('Proposal cần là JSON object.');
      }
      const result=await api<{id:string}>('/projects/'+project.id+'/runs','POST',{
        workflow,document_version_ids:selected,synthetic_only:synthetic,
        ...(supplied?{proposal:supplied,preparation_id:preparation}:{})
      });
      await refresh();opened(result.id);
    });
  }
  return <>
    <section className="panel documents-intro">
      <div className="eyebrow">PROJECT INPUTS</div><h2>Tài liệu của project</h2>
      <p>Upload và chọn phiên bản để chạy thử BA. Tài liệu là dữ liệu đầu vào; nội dung file không thay đổi quyền hoặc phê duyệt.</p>
      <div className="document-input-grid">
        <div className="upload-box">
          <Upload size={26}/><h3>Upload tài liệu</h3>
          <p>TXT · Markdown · PDF có text · DOCX<br/>Tối đa 5 MiB/file, text tối đa 100 KB. Chỉ dùng dữ liệu giả lập.</p>
          <label className="field">Chọn file<input type="file" aria-label="Upload tài liệu" accept=".txt,.md,.pdf,.docx" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></label>
          <button className="text-button" disabled={busy} onClick={()=>upload(new File(['Khách hàng cần tạo yêu cầu hỗ trợ và xem tiến độ xử lý.\nPM cần review yêu cầu trước khi bàn giao cho đội phát triển.\nKhi yêu cầu bị chặn cần thông báo trong project.'], 'discovery-demo.md',{type:'text/markdown'}))}>Dùng tài liệu mẫu giả lập</button>
        </div>
        <form className="drive-box" onSubmit={e=>{e.preventDefault();void action(async()=>{
          const result=await api<{message:string}>('/projects/'+project.id+'/documents/drive','POST',{name:driveName,url:driveUrl});
          setDriveName('');setDriveUrl('');await refresh();setNotice(result.message);
        });}}>
          <Link2 size={26}/><h3>Thêm link Google Drive</h3>
          <p>Chưa kết nối OAuth: chỉ lưu link, chưa đọc nội dung. Bạn không cần bật “Anyone with the link”.</p>
          <label className="field">Tên tài liệu Drive<input value={driveName} onChange={e=>setDriveName(e.target.value)} required maxLength={120}/></label>
          <label className="field">Link Google Drive<input type="url" value={driveUrl} onChange={e=>setDriveUrl(e.target.value)} required maxLength={2000} placeholder="https://drive.google.com/file/d/…/view"/></label>
          <button className="button secondary" disabled={busy}>Lưu link Drive</button>
        </form>
      </div>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {notice&&<div className="alert neutral" role="status">{notice}</div>}
    </section>
    <section className="panel documents-list" aria-label="Danh sách tài liệu">
      <div className="section-row"><h2>Phiên bản đầu vào</h2><span className="badge">{selected.length} đã chọn</span></div>
      {!docs.length&&<p className="muted">Chưa có file. Upload hoặc dùng tài liệu mẫu để bắt đầu.</p>}
      {docs.map(doc=><article className="project-document" key={doc.id}>
        <div className="section-row"><h3><FileText size={17}/> {doc.name}</h3>{doc.kind==='upload'&&<label className="version-upload">Upload phiên bản mới<input type="file" aria-label={'Phiên bản mới của '+doc.name} accept=".txt,.md,.pdf,.docx" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,doc.id);e.target.value='';}}/></label>}</div>
        {doc.drive_url&&<a href={doc.drive_url} target="_blank" rel="noreferrer">Mở file trên Google Drive ↗</a>}
        {doc.versions.map(v=><div className="document-version" key={v.id}>
          <label className="context-source"><input type="checkbox" aria-label={'Chọn '+doc.name+' v'+v.version} disabled={busy||v.status!=='ready'} checked={selected.includes(v.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,v.id]:s.filter(id=>id!==v.id))}/><span><strong>v{v.version} · {v.filename}</strong><small>{v.size?Math.ceil(v.size/1024)+' KB · ':''}{states[v.status]||v.status}</small><small>{v.detail}</small>{v.hash&&<small className="mono hash">SHA-256 {v.hash}</small>}</span></label>
          {doc.kind==='upload'&&<a className="text-button" href={'/api/document-versions/'+v.id+'/download'} download><Download size={14}/> Tải bản gốc v{v.version}</a>}
        </div>)}
      </article>)}
    </section>
    <section className="panel document-job-launch" aria-label="Chạy BA từ tài liệu">
      <div className="eyebrow">MANUAL RUN / NO MODEL COST</div><h2>Chạy BA Agent</h2>
      <p>Luồng mẫu dùng tối đa 3 dòng không trống từ mỗi tài liệu, hỏi làm rõ rồi tạo bản nháp. Chưa có AI hiểu ngữ nghĩa; bạn review trước khi sử dụng.</p>
      <label className="context-source"><input type="checkbox" checked={synthetic} onChange={e=>setSynthetic(e.target.checked)}/><span>Tôi xác nhận các tài liệu đã chọn chỉ chứa dữ liệu giả lập.</span></label>
      <button className="button primary" disabled={busy||!selected.length||!synthetic} onClick={()=>start('ba-documents-demo')}><Play size={15}/> Chạy BA Agent · mẫu không tốn token</button>
      <details className="project-proposal"><summary>Nâng cao: chạy BA v0.2.1 thật với proposal cung cấp sẵn</summary>
        <p>Chuẩn bị context ở Agent & Workflow, chọn đúng các nguồn của tài liệu này, rồi quay lại đây. Tên người khai báo chưa xác thực; mọi baseline/UAT approval vẫn chưa được cấp. Không dùng proposal công nợ cho tài liệu khác.</p>
        <button className="text-button" disabled={busy} onClick={()=>action(async()=>setPreparations(await api<Preparation[]>('/projects/'+project.id+'/context-preparations')))}>Tải lại danh sách context</button>
        <label className="field">Context đã chuẩn bị<select aria-label="Context cho BA project" value={preparation} onChange={e=>setPreparation(e.target.value)}><option value="">Chọn context</option>{preparations.map(p=><option key={p.id} value={p.id}>{p.id} · {p.result.technical}</option>)}</select></label>
        <details><summary>Source ID để khớp context/proposal</summary>{docs.flatMap(d=>d.versions.filter(v=>selected.includes(v.id)).map(v=><p className="mono hash" key={v.id}>{v.filename}: {v.source_id}</p>))}</details>
        <label className="field">Proposal BA project JSON<textarea aria-label="Proposal BA project JSON" className="json-editor" value={proposal} onChange={e=>setProposal(e.target.value)} maxLength={200000}/></label>
        <button className="button secondary" disabled={busy||!selected.length||!synthetic||!preparation||!proposal.trim()} onClick={()=>start('ba-project-proposal')}>Chạy BA v0.2.1 supplied-proposal <ArrowRight size={15}/></button>
      </details>
    </section>
  </>;
}

export function DocumentJobDetails({run, refresh}: {run:Run; refresh:()=>Promise<void>}) {
  const [job,setJob]=useState<{input_hash:string;documents:{id:string;name:string;version:number;text_hash:string;text:string}[]}|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;setJob(null);setError('');api<typeof job>('/jobs/'+run.id).then(j=>active&&setJob(j)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[run.id,run.state]);
  return <section className="panel document-job-details"><h3>Đầu vào job đã khóa</h3>{error&&<p role="alert">{error}</p>}{job&&<><p className="mono hash">{job.input_hash}</p>{job.documents.map(d=><details key={d.id}><summary>{d.name} · v{d.version}</summary><p className="mono hash">{d.text_hash}</p><pre className="json-output">{d.text}</pre></details>)}</>}
    {['queued','running','awaiting_input','awaiting_proposal'].includes(run.state)&&<button className="button secondary" onClick={async()=>{try {await api('/jobs/'+run.id+'/cancel','POST');await refresh();}catch(e){setError((e as Error).message);}}}>Hủy job để sửa đầu vào</button>}
  </section>;
}

export function IntegrationSettings(){
  const [data,setData]=useState<{ba:{version:string;commit:string};google_drive:{message:string}}|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{api<typeof data>('/settings').then(setData).catch(e=>setError(e.message));},[]);
  return <section className="panel integration-settings"><h2>Cấu hình tích hợp</h2>{error&&<p role="alert">{error}</p>}<div className="document-input-grid"><div><h3>Google Drive</h3><span className="badge amber">Chưa kết nối</span><p>{data?.google_drive.message||'Chỉ lưu link, chưa đọc nội dung.'}</p><p>OAuth và kho token sẽ ở backend; chưa có nút kết nối tài khoản thật trong MVP.</p></div><div><h3>Model & BA runtime</h3><span className="badge">Model trả phí chưa bật</span><p>BA {data?.ba.version||'…'} · supplied-proposal hoặc dữ liệu mẫu.</p><p className="mono hash">{data?.ba.commit}</p><p>Jira và Confluence: bước tích hợp sau. Chưa ghi dữ liệu ra hệ thống bên ngoài.</p></div></div></section>;
}
