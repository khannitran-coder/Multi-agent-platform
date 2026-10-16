import { useEffect, useState } from 'react';
import { api } from './api';
import type { Project } from './types';

interface Form {
  source_ids: string[]; mode: string; method: string; audience: string;
  pm_owner: string; internal_approver: string; client_approver: string;
  contract_type: string; sow_source_id: string; change_process_ref: string;
  acceptance_process_ref: string; synthetic_only: boolean;
}
interface Preparation {
  id: string; context_hash: string; agent_commit: string; created_at: string;
  input: Form; context: Record<string, unknown>;
  result: { technical: string; execution: string; business: string; approval: string;
    schema_findings: string[]; preflight_findings: string[]; authority_blockers: string[] };
}
export function ContextWorkbench({ project, refresh }: { project: Project; refresh: () => Promise<void> }) {
  const [form, setForm] = useState<Form>({source_ids: [project.sources[0].id], mode: 'internal', method: 'Agile',
    audience: 'PM, dev và QA', pm_owner: '', internal_approver: '', client_approver: '', contract_type: '',
    sow_source_id: '', change_process_ref: '', acceptance_process_ref: '', synthetic_only: false});
  const [history, setHistory] = useState<Preparation[]>([]);
  const [selected, setSelected] = useState<Preparation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  useEffect(() => {
    let active = true;
    api<Preparation[]>('/projects/'+project.id+'/context-preparations').then(items => {
      if (active) { setHistory(items); setSelected(items[0] || null); }
    }).catch(e => active && setError(e.message));
    return () => { active = false; };
  }, [project.id]);
  const update = (key: keyof Form, value: string | boolean | string[]) => setForm(f => ({...f, [key]: value}));
  async function prepare() {
    setBusy(true); setError('');
    try {
      const snapshot = await api<Preparation>('/projects/'+project.id+'/context-preparations', 'POST', form);
      setHistory(h => [snapshot, ...h]); setSelected(snapshot); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function saveSource() {
    setBusy(true); setError('');
    try {
      const source = await api<{ id: string }>('/projects/'+project.id+'/sources', 'POST', {name, text});
      setForm(f => ({...f, source_ids: [...f.source_ids, source.id]}));
      setName(''); setText(''); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel context-workbench" aria-label="Bàn chuẩn bị context BA">
    <div className="eyebrow">PROJECT CONTEXT / PREPARATION ONLY</div>
    <h2>Chuẩn bị context BA</h2>
    <p>Chọn phiên bản notes/SOW của project và khai báo vai trò để kiểm tra đầu vào bằng BA preflight thật. Không suy ra thẩm quyền từ nội dung tài liệu; chưa chạy BA trên context này.</p>
    <div className="context-columns">
      <div>
        <fieldset disabled={busy}>
          <legend>1. Nguồn đầu vào đã lưu</legend>
          <div className="context-sources">
            {project.sources.map(s => <label key={s.id} className="context-source">
              <input type="checkbox" checked={form.source_ids.includes(s.id)} onChange={e => {
                const ids = e.target.checked ? [...form.source_ids, s.id] : form.source_ids.filter(id => id !== s.id);
                setForm(f => ({...f, source_ids: ids, sow_source_id: ids.includes(f.sow_source_id) ? f.sow_source_id : ''}));
              }} />
              <span><strong>{s.name} · v{s.version}</strong><small className="mono hash">{s.hash}</small><small>{s.text.slice(0, 140)}</small></span>
            </label>)}
          </div>
        </fieldset>
        <details>
          <summary>Thêm notes hoặc SOW giả lập</summary>
          <label className="field">Tên tài liệu<input aria-label="Tên tài liệu context" value={name} onChange={e => setName(e.target.value)} maxLength={120} /></label>
          <label className="field">Nội dung giả lập<textarea aria-label="Nội dung tài liệu context" value={text} onChange={e => setText(e.target.value)} maxLength={5000} /></label>
          <button className="button secondary" disabled={busy || !name.trim() || text.trim().length < 3} onClick={saveSource}>Lưu nguồn mới</button>
        </details>
        <fieldset disabled={busy}>
          <legend>2. Cấu hình context dự kiến</legend>
          <label className="field">Chế độ<select aria-label="Chế độ" value={form.mode} onChange={e => update('mode', e.target.value)}><option value="internal">Nội bộ</option><option value="client">Khách hàng / SOW</option></select></label>
          {([['method', 'Phương pháp'], ['audience', 'Đối tượng sử dụng'], ['pm_owner', 'PM phụ trách (khai báo)'], ['internal_approver', 'Người duyệt nội bộ (khai báo)']] as const).map(([key, label]) => <label className="field" key={key}>{label}<input value={form[key]} maxLength={key === 'audience' ? 500 : 120} onChange={e => update(key, e.target.value)} /></label>)}
          {form.mode === 'client' && <>
            {([['contract_type', 'Loại hợp đồng'], ['client_approver', 'Người duyệt phía khách hàng (khai báo)'], ['change_process_ref', 'Tham chiếu quy trình thay đổi'], ['acceptance_process_ref', 'Tham chiếu quy trình nghiệm thu']] as const).map(([key, label]) => <label className="field" key={key}>{label}<input value={form[key]} maxLength={key.endsWith('_ref') ? 500 : 120} onChange={e => update(key, e.target.value)} /></label>)}
            <label className="field">Nguồn SOW<select aria-label="Nguồn SOW" value={form.sow_source_id} onChange={e => update('sow_source_id', e.target.value)}><option value="">Chưa chọn</option>{project.sources.filter(s => form.source_ids.includes(s.id)).map(s => <option value={s.id} key={s.id}>{s.name} · v{s.version}</option>)}</select></label>
          </>}
          <label className="context-source"><input type="checkbox" checked={form.synthetic_only} onChange={e => update('synthetic_only', e.target.checked)} /><span>Tôi xác nhận các nguồn được chọn chỉ chứa dữ liệu giả lập. Khai báo này không cấp quyền xử lý dữ liệu thật.</span></label>
        </fieldset>
        <button className="button primary" disabled={busy || !form.source_ids.length} onClick={prepare}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra và lưu context'}</button>
        {error && <p className="alert error" role="alert">{error}</p>}
      </div>
      <div aria-live="polite">
        <h3>3. Kết quả & lịch sử</h3>
        <label className="field">Bản context đã lưu<select aria-label="Bản context đã lưu" value={selected?.id || ''} onChange={e => setSelected(history.find(h => h.id === e.target.value) || null)}><option value="">Chưa có</option>{history.map(h => <option key={h.id} value={h.id}>{h.id} · {h.result.technical}</option>)}</select></label>
        {selected ? <>
          <div className="context-status"><span className={'badge '+(selected.result.technical === 'passed' ? 'green' : 'amber')}>Kỹ thuật: {selected.result.technical === 'passed' ? 'Đạt preflight' : 'Cần bổ sung'}</span><span className="badge amber">Quyền chạy: bị chặn</span><span className="badge">Review nghiệp vụ: pending</span><span className="badge">Phê duyệt: not_approved</span></div>
          <p className="muted">Kết quả thuộc bản đã lưu {selected.id}, không tự cập nhật theo form đang sửa.</p>
          <h3>Thông tin cần bổ sung ({selected.result.preflight_findings.length})</h3>
          {selected.result.preflight_findings.length ? <ul>{selected.result.preflight_findings.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p>Schema và preflight canonical đạt. Chưa xác minh ý nghĩa tài liệu, quyền hoặc coverage requirements.</p>}
          <h3>Điều kiện còn thiếu để chạy context project</h3>
          <ul>{selected.result.authority_blockers.map(f => <li key={f}>{f}</li>)}</ul>
          <dl><dt>Context SHA-256</dt><dd className="mono hash">{selected.context_hash}</dd><dt>BA commit</dt><dd className="mono hash">{selected.agent_commit}</dd></dl>
          <button className="text-button" disabled={busy} onClick={() => setForm(selected.input)}>Dùng cấu hình này để tạo bản mới</button>
          <details><summary>Context JSON đã khóa</summary><pre className="json-output">{JSON.stringify(selected.context, null, 2)}</pre></details>
        </> : <p className="muted">Kiểm tra để nhận câu hỏi đầu vào. Mỗi lần kiểm tra lưu một snapshot độc lập; không tạo run hoặc phê duyệt.</p>}
      </div>
    </div>
  </section>;
}
