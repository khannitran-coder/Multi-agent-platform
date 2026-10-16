import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("PM creates project, clarifies, revises, reviews, and opens shared snapshot", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  fs.mkdirSync(".local/evidence", { recursive: true });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Atlas · Customer Portal").first()).toBeVisible();
  await page.screenshot({
    path: ".local/evidence/01-overview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Tạo project", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Dùng ví dụ mẫu" }).click();
  const name = "Nova browser journey " + Date.now();
  await dialog.getByLabel("Tên project").fill(name);
  await dialog
    .getByRole("button", { name: "Tạo project", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Chạy workflow", exact: true })
    .click();
  await expect(page.getByText("Cần bạn làm rõ · Q-01")).toBeVisible();
  await page.screenshot({
    path: ".local/evidence/02-clarification.png",
    fullPage: true,
  });
  await page
    .getByLabel("Trả lời câu hỏi làm rõ")
    .fill(
      "PM Khánh review. Bản đầu hỗ trợ tạo ticket và xem trạng thái. Telegram để sau.",
    );
  await page.getByRole("button", { name: "Trả lời & chạy tiếp" }).click();
  await expect(
    page.getByRole("button", { name: /Requirements draft · v1/ }),
  ).toBeVisible();
  const currentUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Requirements draft · v1/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Requirements draft · v1/ }).click();
  await expect(
    page.getByRole("heading", { name: "Requirements review pack" }),
  ).toBeVisible();
  await expect(
    page.getByText("Schema prototype đạt", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Nhận xét review")
    .fill("Bổ sung quyền xem ticket theo project, cần BA viết AC cụ thể.");
  await page.getByRole("button", { name: "Yêu cầu sửa bản nháp" }).click();
  await expect(page.getByLabel("Phiên bản artifact")).toHaveValue(/art-/);
  await expect(
    page.getByText("Yêu cầu sửa đã được đưa vào bản v2"),
  ).toBeVisible();
  await page
    .getByLabel("Phiên bản artifact")
    .selectOption({ label: "Phiên bản 1" });
  await expect(
    page.getByRole("button", { name: "Ghi nhận đã review" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Bổ sung quyền xem ticket theo project, cần BA viết AC cụ thể.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Phiên bản artifact")
    .selectOption({ label: "Phiên bản 2 · mới nhất" });
  await page
    .getByLabel("Nhận xét review")
    .fill("Đã review cấu trúc và phạm vi, chưa phê duyệt baseline.");
  await page.getByRole("button", { name: "Ghi nhận đã review" }).click();
  await expect(
    page.getByText("Đã ghi nhận review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Chưa phê duyệt chính thức", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "RTM", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "REQ-01", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "UAT plan", exact: true }).click();
  await expect(
    page.getByText("Kế hoạch UAT nháp · không phải kết quả kiểm thử."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yêu cầu", exact: true }).click();
  await page.screenshot({
    path: ".local/evidence/03-review.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Run & Handoff", exact: true })
    .click();
  await expect(
    page.getByText("handoff.ba_qa", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: ".local/evidence/04-run.png", fullPage: true });
  await page
    .getByRole("button", { name: "Kênh thông báo", exact: true })
    .click();
  await expect(
    page.getByText("PM đã ghi nhận review bản v2.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Bật tùy chọn snapshot").check();
  await page.getByLabel("Tần suất thông báo").selectOption("daily");
  await page.getByRole("button", { name: "Lưu tùy chọn mô phỏng" }).click();
  await expect(
    page.getByRole("button", { name: "Kết nối bot" }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Bật tùy chọn snapshot")).toBeChecked();
  await expect(page.getByLabel("Tần suất thông báo")).toHaveValue("daily");
  await page.screenshot({
    path: ".local/evidence/05-channels.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Agent & Workflow", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "BA Requirements", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/evidence/06-registry.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sắp tới", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Risk Monitor" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "BA Requirements", exact: true }),
  ).toHaveCount(0);
  await page.goto(currentUrl);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile layout navigates and project switching isolates workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "Agent Workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Agent Workspace", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Project hiện tại")
    .selectOption({ label: "Atlas · Customer Portal" });
  await expect(page.getByText("Bắt đầu cuộc trao đổi đầu tiên")).toBeVisible();
  await expect(page.getByText("Requirements draft · v2")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: ".local/evidence/07-mobile.png",
    fullPage: true,
  });
});
