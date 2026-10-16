import { test, expect } from '@playwright/test';

async function create(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', {name:'Tạo project', exact:true}).last().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name:'Dùng ví dụ mẫu'}).click();
  await dialog.getByLabel('Tên project').fill('Context browser '+Date.now());
  await dialog.getByRole('button', {name:'Tạo project', exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', {name:'Agent & Workflow', exact:true}).click();
  return page.getByRole('region', {name:'Bàn chuẩn bị context BA'});
}

test('project context uses canonical preflight, immutable history and explicit authority blockers', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const workbench = await create(page);
  await workbench.getByRole('button', {name:'Kiểm tra và lưu context'}).click();
  await expect(workbench.getByText('Kỹ thuật: Cần bổ sung', {exact:true})).toBeVisible();
  await expect(workbench.getByText('Quyền chạy: bị chặn', {exact:true})).toBeVisible();
  await workbench.getByLabel('PM phụ trách (khai báo)', {exact:true}).fill('PM Demo');
  await workbench.getByLabel('Người duyệt nội bộ (khai báo)', {exact:true}).fill('Lead Demo');
  await workbench.getByRole('checkbox', {name:/Tôi xác nhận/}).check();
  await workbench.getByRole('button', {name:'Kiểm tra và lưu context'}).click();
  await expect(workbench.getByText('Kỹ thuật: Đạt preflight', {exact:true})).toBeVisible();
  const select = workbench.getByLabel('Bản context đã lưu');
  await expect(select.locator('option')).toHaveCount(3);
  const newest = await select.inputValue();
  await workbench.getByText('Thêm notes hoặc SOW giả lập', {exact:true}).click();
  await workbench.getByLabel('Tên tài liệu context').fill('SOW công nợ giả lập');
  await workbench.getByLabel('Nội dung tài liệu context').fill('Phạm vi: xuất báo cáo công nợ.\nThay đổi cần review.\nNghiệm thu cần người duyệt.');
  await workbench.getByRole('button', {name:'Lưu nguồn mới', exact:true}).click();
  await expect(workbench.getByText('SOW công nợ giả lập · v2', {exact:true})).toBeVisible();
  await workbench.getByLabel('Chế độ', {exact:true}).selectOption('client');
  await workbench.getByRole('button', {name:'Kiểm tra và lưu context'}).click();
  await expect(workbench.getByText('Kỹ thuật: Cần bổ sung', {exact:true})).toBeVisible();
  await workbench.getByLabel('Loại hợp đồng', {exact:true}).fill('Fixed-price');
  await workbench.getByLabel('Người duyệt phía khách hàng (khai báo)', {exact:true}).fill('Client Demo');
  await workbench.getByLabel('Nguồn SOW', {exact:true}).selectOption({label:'SOW công nợ giả lập · v2'});
  await workbench.getByLabel('Tham chiếu quy trình thay đổi').fill('SOW:L2');
  await workbench.getByLabel('Tham chiếu quy trình nghiệm thu').fill('SOW:L3');
  await workbench.getByRole('button', {name:'Kiểm tra và lưu context'}).click();
  await expect(workbench.getByText('Kỹ thuật: Đạt preflight', {exact:true})).toBeVisible();
  await select.selectOption(newest);
  await workbench.getByText('Context JSON đã khóa', {exact:true}).click();
  await expect(workbench.locator('pre')).not.toContainText('SOW công nợ giả lập');
  await expect(workbench.locator('pre')).toContainText('"mode": "internal"');
  await page.reload();
  await expect(workbench.getByText('Kỹ thuật: Đạt preflight', {exact:true})).toBeVisible();
  await expect(workbench.getByText('Phê duyệt: not_approved', {exact:true})).toBeVisible();
  await page.screenshot({path:'.local/evidence/11-context-workbench.png', fullPage:true});
  expect(errors).toEqual([]);
});

test('context preparation can be completed on mobile without overflow', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  const workbench = await create(page);
  await workbench.getByLabel('PM phụ trách (khai báo)', {exact:true}).fill('PM Demo');
  await workbench.getByLabel('Người duyệt nội bộ (khai báo)', {exact:true}).fill('Lead Demo');
  await workbench.getByRole('checkbox', {name:/Tôi xác nhận/}).check();
  await workbench.getByRole('button', {name:'Kiểm tra và lưu context'}).click();
  await expect(workbench.getByText('Kỹ thuật: Đạt preflight', {exact:true})).toBeVisible();
  await workbench.getByText('Context JSON đã khóa', {exact:true}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:'.local/evidence/12-context-mobile.png', fullPage:true});
});
