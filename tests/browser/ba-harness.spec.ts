import { test, expect } from "@playwright/test";
import fs from "node:fs";

async function createProject(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Tạo project", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Dùng ví dụ mẫu" }).click();
  await dialog.getByLabel("Tên project").fill(name);
  await dialog
    .getByRole("button", { name: "Tạo project", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Agent & Workflow", exact: true })
    .click();
}

test("real BA fixture imports a verified pack, exposes all AC and records review without approval", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createProject(page, "BA fixture browser " + Date.now());
  await page.getByRole("button", { name: "Chạy BA harness fixture" }).click();
  await expect(
    page.getByRole("button", { name: /Requirements draft · v1/ }),
  ).toBeVisible();
  await expect(
    page.getByText("BA CLI thật · fixture · không LLM", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Trả lời câu hỏi làm rõ")).toBeDisabled();
  await page.getByRole("button", { name: /Requirements draft · v1/ }).click();
  await expect(
    page.getByText("Schema + domain + manifest đạt", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "BA · Demo — Báo cáo công nợ" }),
  ).toBeVisible();
  await expect(page.getByText("REQ-02", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stories & AC", exact: true }).click();
  for (const kind of ["happy", "edge", "error"])
    await expect(
      page.getByRole("heading", { name: new RegExp("· " + kind + "$") }),
    ).toBeVisible();
  await expect(page.getByText("Blocked", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "RTM", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "REQ-02", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nguồn & thay đổi", exact: true })
    .click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "manifest.json", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("manifest.json");
  const file = await download.path();
  const manifest = JSON.parse(fs.readFileSync(file!, "utf8"));
  expect(manifest.run_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.keys(manifest.files).sort()).toEqual([
    "audit.json",
    "bundle.json",
    "proposal.json",
    "review-pack.md",
  ]);
  await page.getByRole("button", { name: "Yêu cầu", exact: true }).click();
  await page
    .getByLabel("Nhận xét review")
    .fill("Review cấu trúc fixture, chưa phê duyệt baseline.");
  await page.getByRole("button", { name: "Ghi nhận đã review" }).click();
  await expect(
    page.getByText("Đã ghi nhận review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Chưa phê duyệt chính thức", { exact: true }),
  ).toBeVisible();
  fs.mkdirSync(".local/evidence", { recursive: true });
  await page.screenshot({
    path: ".local/evidence/08-ba-harness-review.png",
    fullPage: true,
  });
  await page
    .getByLabel("Nhận xét review")
    .fill("Cần operator chỉnh proposal trước khi xác nhận.");
  await page.getByRole("button", { name: "Yêu cầu sửa bản nháp" }).click();
  await expect(
    page
      .getByRole("combobox", { name: "Chọn run artifact" })
      .locator("option:checked"),
  ).toContainText("Đã yêu cầu sửa");
  await expect(
    page.getByRole("button", { name: "Ghi nhận đã review" }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Phiên bản artifact").locator("option"),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("invalid supplied proposal shows BA findings and publishes no artifact", async ({
  page,
}) => {
  await createProject(page, "BA gate browser " + Date.now());
  await page
    .getByText("Chỉnh proposal JSON (tùy chọn)", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nạp proposal mẫu", exact: true })
    .click();
  const editor = page.getByLabel("Proposal BA JSON");
  await expect(editor).toHaveValue(/REQ-01/);
  const proposal = JSON.parse(await editor.inputValue());
  proposal.requirements[0].evidence[0].source_id = "NONEXISTENT-SOURCE";
  await editor.fill(JSON.stringify(proposal));
  await page.getByRole("button", { name: "Chạy BA harness fixture" }).click();
  await expect(page.getByTestId("ba-state")).toHaveText("Escalated");
  await expect(
    page.getByText("Cần operator xử lý", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Không có artifact được nhập.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Requirements draft ·/ }),
  ).toHaveCount(0);
  await expect(page.locator(".json-output")).toContainText(
    "REQ-01: unknown source",
  );
  await page.screenshot({
    path: ".local/evidence/09-ba-gate-rejection.png",
    fullPage: true,
  });
});

test("mobile BA workflow and canonical artifact fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createProject(page, "BA mobile");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByText("Chỉnh proposal JSON (tùy chọn)", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nạp proposal mẫu", exact: true })
    .click();
  await expect(page.getByLabel("Proposal BA JSON")).toHaveValue(/REQ-01/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Chạy BA harness fixture" }).click();
  await page.getByRole("button", { name: /Requirements draft · v1/ }).click();
  await expect(
    page.getByText("Schema + domain + manifest đạt", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "Nguồn & thay đổi", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "manifest.json", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: ".local/evidence/10-ba-mobile.png",
    fullPage: true,
  });
});
