import { test, expect } from '@playwright/test';

async function create(page:import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button',{name:'Tạo project',exact:true}).last().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Tên project').fill('Upload journey '+Date.now());
  await dialog.getByLabel('Mục tiêu',{exact:true}).fill('Review synthetic document requirements.');
  await dialog.getByRole('button',{name:'Tạo project',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'Tài liệu & Chạy BA',exact:true}).click();
}

test('upload and Drive link → pinned job → answer → revision → review and downloads',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await create(page);
  await page.getByLabel('Upload tài liệu',{exact:true}).setInputFiles({name:'scope-demo.md',mimeType:'text/markdown',buffer:Buffer.from('Khách hàng cần tạo ticket hỗ trợ.\nPM cần xem trạng thái xử lý.')});
  await expect(page.getByRole('checkbox',{name:'Chọn scope-demo.md v1',exact:true})).toBeChecked();
  await page.getByLabel('Tên tài liệu Drive').fill('SOW riêng tư');
  await page.getByLabel('Link Google Drive',{exact:true}).fill('https://drive.google.com/file/d/synthetic_private_123/view');
  await page.getByRole('button',{name:'Lưu link Drive',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Chọn SOW riêng tư v1',exact:true})).toBeDisabled();
  await expect(page.getByText('Chưa có quyền đọc Drive',{exact:true})).toBeVisible();
  await page.screenshot({path:'.local/evidence/13-documents.png',fullPage:true});
  await page.getByRole('checkbox',{name:'Tôi xác nhận các tài liệu đã chọn chỉ chứa dữ liệu giả lập.',exact:true}).check();
  await page.getByRole('button',{name:'Chạy BA Agent · mẫu không tốn token',exact:true}).click();
  await expect(page.getByText('Cần bạn làm rõ · Q-01')).toBeVisible();
  await page.getByRole('button',{name:'Tài liệu & Chạy BA',exact:true}).click();
  await page.getByLabel('Phiên bản mới của scope-demo.md',{exact:true}).setInputFiles({name:'scope-demo-v2.md',mimeType:'text/markdown',buffer:Buffer.from('Changed content not included in existing job.')});
  await expect(page.getByRole('checkbox',{name:'Chọn scope-demo.md v2',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Agent Workspace',exact:true}).click();
  await page.getByLabel('Trả lời câu hỏi làm rõ').fill('PM review. Ưu tiên tạo ticket, thông báo để sau.');
  await page.getByRole('button',{name:'Trả lời & chạy tiếp',exact:true}).click();
  await page.getByRole('button',{name:/Requirements draft · v1/}).click();
  await expect(page.getByRole('heading',{name:'Khách hàng cần tạo ticket hỗ trợ.',exact:true})).toBeVisible();
  await expect(page.getByText('Changed content not included in existing job.',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Nguồn & thay đổi',exact:true}).click();
  await expect(page.getByRole('heading',{name:'scope-demo.md · v1',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Câu hỏi',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Câu hỏi cần làm rõ',exact:true})).toBeVisible();
  await page.getByLabel('Nhận xét review').fill('Bổ sung người sở hữu thông báo.');
  await page.getByRole('button',{name:'Yêu cầu sửa bản nháp',exact:true}).click();
  await expect(page.getByLabel('Phiên bản artifact')).toContainText('Phiên bản 2');
  await page.getByLabel('Nhận xét review').fill('Đã review bản mẫu, chưa phê duyệt.');
  await page.getByRole('button',{name:'Ghi nhận đã review',exact:true}).click();
  await expect(page.getByText('Chưa phê duyệt chính thức',{exact:true})).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Tải artifact JSON',exact:true}).click();
  expect((await downloadPromise).suggestedFilename()).toContain('.json');
  await page.getByRole('button',{name:'Run & Handoff',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Đầu vào job đã khóa',exact:true})).toBeVisible();
  await page.screenshot({path:'.local/evidence/13-documents-job.png',fullPage:true});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Google Drive',exact:true})).toBeVisible();
  await expect(page.getByText('BA 0.2.1 · supplied-proposal hoặc dữ liệu mẫu.',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('document upload errors and mobile selection remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await create(page);
  await page.getByLabel('Upload tài liệu',{exact:true}).setInputFiles({name:'fake.pdf',mimeType:'application/pdf',buffer:Buffer.from('not pdf')});
  await expect(page.getByRole('alert')).toContainText('không phải PDF');
  await page.getByRole('button',{name:'Dùng tài liệu mẫu giả lập',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Chọn discovery-demo.md v1',exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:'Tôi xác nhận các tài liệu đã chọn chỉ chứa dữ liệu giả lập.',exact:true}).check();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.local/evidence/14-documents-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Chạy BA Agent · mẫu không tốn token',exact:true}).click();
  await expect(page.getByText('Cần bạn làm rõ · Q-01')).toBeVisible();
  await page.getByRole('button',{name:'Hủy job để sửa đầu vào',exact:true}).click();
  await expect(page.getByText('Đã hủy',{exact:true}).first()).toBeVisible();
});

test('advanced project workflow invokes pinned BA with selected document versions',async({page})=>{
  await create(page);
  const pid=new URLSearchParams(new URL(page.url()).hash.slice(1)).get('project')!;
  const fixture=await (await page.request.get('/api/ba/fixture')).json();
  const mapping:Record<string,{id:string;version:string}>={};
  for(const source of fixture.context.sources) {
    const response=await page.request.post('/api/projects/'+pid+'/documents/upload',{multipart:{file:{name:source.id+'.txt',mimeType:'text/plain',buffer:Buffer.from(source.text)}}});
    expect(response.status()).toBe(201);const added=await response.json();
    const project=await (await page.request.get('/api/projects/'+pid)).json();
    const row=project.sources.find((s:{id:string})=>s.id===added.source_id);
    mapping[source.id]={id:row.id,version:'v'+row.version};
  }
  function remap(value:unknown):unknown {
    if(Array.isArray(value))return value.map(remap);
    if(value&&typeof value==='object') {
      const v=value as Record<string,unknown>;const result=Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)]));
      if(typeof v.source_id==='string'&&mapping[v.source_id])Object.assign(result,{source_id:mapping[v.source_id].id,source_version:mapping[v.source_id].version});
      if('requester' in result)result.requester='PM Demo';
      return result;
    }
    return value;
  }
  const prepared=await page.request.post('/api/projects/'+pid+'/context-preparations',{data:{source_ids:Object.values(mapping).map(s=>s.id),mode:'client',pm_owner:'PM Demo',internal_approver:'Delivery Lead',client_approver:'Client Sponsor',contract_type:'Fixed-price',sow_source_id:mapping['SOW-01'].id,change_process_ref:'SOW:L2',acceptance_process_ref:'SOW:L3',synthetic_only:true}});
  expect(prepared.status()).toBe(201);const prep=await prepared.json();
  await page.reload();
  await page.getByRole('checkbox',{name:'Chọn SOW-01.txt v1',exact:true}).check();
  await page.getByRole('checkbox',{name:'Chọn NOTES-01.txt v1',exact:true}).check();
  await page.getByRole('checkbox',{name:'Tôi xác nhận các tài liệu đã chọn chỉ chứa dữ liệu giả lập.',exact:true}).check();
  await page.getByText('Nâng cao: chạy BA v0.2.1 thật với proposal cung cấp sẵn',{exact:true}).click();
  await page.getByLabel('Context cho BA project').selectOption(prep.id);
  await page.getByLabel('Proposal BA project JSON').fill(JSON.stringify(remap(fixture.proposal)));
  await page.getByRole('button',{name:'Chạy BA v0.2.1 supplied-proposal',exact:true}).click();
  await expect(page.getByText('BA CLI thật · project · không LLM',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Requirements draft · v1/}).click();
  await expect(page.getByText('Schema + domain + manifest đạt',{exact:true})).toBeVisible();
  await expect(page.getByText('Pack này dùng context project giả lập và proposal cung cấp sẵn.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Nguồn & thay đổi',exact:true}).click();
  await expect(page.getByRole('link',{name:'proposal.json',exact:true})).toBeVisible();
  await page.screenshot({path:'.local/evidence/15-project-ba-v021.png',fullPage:true});
});
