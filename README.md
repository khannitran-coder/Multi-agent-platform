# Agent Desk — AI project operations prototype

Web platform cục bộ cho PM điều phối nhiều agent, trao đổi làm rõ và review artifact theo phiên bản. UI tiếng Việt, responsive; **không deploy, không gọi model, không kết nối tài khoản ngoài**.

## Chạy và dùng thử

Yêu cầu: Python 3.12+, Node 22+ (đã kiểm tra Node 24.19.0), npm, Bash. Từ repo này:

```bash
cd /workspace/pm-agent-platform
bash scripts/install.sh
bash scripts/start.sh
```

Server phục vụ cả UI build và API ở địa chỉ loopback `127.0.0.1`, cổng `8000`. Mở địa chỉ đó trong trình duyệt trên máy chạy server. Đây là server phát triển cục bộ; chưa có public preview hay deployment. Dừng bằng Ctrl+C. API health: `curl -fsS http://127.0.0.1:8000/api/health`.

Để sửa UI với hot reload, giữ backend ở cổng 8000 và chạy `npm run dev` trong terminal khác (Vite cổng 5173). Vite proxy API về backend; production build trong lệnh start chỉ là bước đóng gói UI local.

Hành trình thử trong khoảng 3 phút:

1. Chọn **Tạo project → Dùng ví dụ mẫu**, sửa tên/notes rồi tạo. Notes là văn bản nhập trực tiếp, chưa có upload PDF/DOCX.
2. Trong **Agent Workspace**, chọn **Chạy workflow**. Worker đọc notes và dừng ở câu hỏi làm rõ.
3. Trả lời phạm vi ưu tiên và người review; bấm **Trả lời & chạy tiếp**. Khoảng 2 giây sau có review pack v1.
4. Mở pack, thử các tab Yêu cầu, Stories & AC, RTM, UAT plan, Nguồn & thay đổi.
5. Nhập nhận xét, chọn **Yêu cầu sửa bản nháp**. V2 giữ feedback; v1 còn nguyên và không thể review thay cho v2.
6. Nhập nhận xét v2 và **Ghi nhận đã review**. Phê duyệt chính thức vẫn là “Chưa phê duyệt”; UAT vẫn “Not Started”.
7. Xem **Run & Handoff** và **Kênh thông báo**. Snapshot dùng cùng project/run; nút mở quay lại đúng workspace. Telegram chỉ là preview/inbox cục bộ.
8. Reload trang để kiểm tra dữ liệu còn nguyên. Tạo project thứ hai để thử tách context. Quản lý notes từ Workspace để tạo phiên bản input mới cho run tiếp theo.

## Thật và mô phỏng

| Thành phần | Trạng thái hiện tại |
|---|---|
| React UI, API FastAPI, SQLite | Chạy thật; dữ liệu tồn tại sau reload/restart |
| Project, notes versions/hash, conversation | Lưu thật; run khóa source ID/hash lúc khởi chạy |
| Worker và run state machine | Chạy thật trong background task cùng process API, journal SQLite |
| Run limits, timeout/retry, stale review guard | Có thực thi và kiểm thử; chỉ có các workflow cố định |
| Artifact versions, JSON export, review, audit, snapshot | Lưu thật; content bất biến, review metadata được cập nhật |
| Sinh BA, QA handoff, Snapshot Writer | Mô phỏng: mẫu cố định, không gọi BA harness hoặc LLM từ web |
| Nội dung bản nháp | Dùng tối đa 3 dòng notes không trống đầu, answer và feedback; không hiểu ngữ nghĩa, không tự giải quyết feedback |
| Schema validation trong UI | Pydantic `platform-draft/1` thật; không phải BA canonical/domain validation |
| BA harness độc lập | Đã khảo sát và chạy test/demo fixture ngoài web; xem bằng chứng trong docs |
| Project permission | Backend kiểm tra membership với danh tính `demo-pm` cố định; chưa đăng nhập, chưa có nhiều user thật |
| Telegram | Lưu preferences và xem cùng snapshot thật; chưa có bot, webhook, scheduler, command hoặc identity linking |
| Approval / UAT sign-off | Không triển khai; review không phải approval hoặc nghiệm thu |
| Risk / progress / Slack | Đề xuất, chưa có worker hoặc connector |

SQLite mặc định `.local/platform.db` (ignored). Chọn file khác bằng `PLATFORM_DB`. Không xóa DB để “reset” nếu muốn giữ feedback. Chạy instance thử sạch bằng `PLATFORM_DB=.local/another-demo.db bash scripts/start.sh`. Cổng đổi bằng `PORT=8002`. Prototype chỉ nên dùng dữ liệu giả lập với một process server.

## Kiểm thử

```bash
.venv/bin/python -m pytest tests/test_api.py -q
npm run build
npm run test:e2e
```

Browser suite dùng Chromium đã cài tại `/usr/bin/chromium`, server riêng cổng 8001 và DB riêng `.local/browser-test-<timestamp>.db` cho mỗi lần chạy. Nếu ở máy khác, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` tới Chromium/Chrome hoặc cài trình duyệt tin cậy của hệ điều hành. Không cần tải browser từ dịch vụ ngoài trong môi trường hiện tại. Báo cáo/screenshot ở `.local/evidence/`; không chứa dữ liệu thật. Xem [kết quả kiểm chứng](docs/VALIDATION.md).

## Tài liệu để review

- [Sản phẩm, MVP, câu hỏi gợi ý và lát cắt tiếp theo](docs/PRODUCT.md)
- [Kiến trúc, mô hình dữ liệu, sequence và giới hạn](docs/ARCHITECTURE.md)
- [Khảo sát 6 repo và xác nhận phiên bản BA remote](docs/REPOSITORY-SURVEY.md)
- [Contract tích hợp BA, trạng thái và ranh giới tin cậy](docs/BA-CONTRACT.md)
- [Worker invocation schema đề xuất](contracts/agent-invocation.schema.json)
- [Bằng chứng và giới hạn kiểm chứng](docs/VALIDATION.md)

Repository GitHub của platform: [khannitran-coder/Multi-agent-platform](https://github.com/khannitran-coder/Multi-agent-platform), nhánh `main`. Người dùng đã xác nhận để repo public ở giai đoạn này; việc đổi private có thể thực hiện sau trong GitHub Settings. Checkout cloud hiện ở `/workspace/pm-agent-platform`; khi clone về máy khác, chạy các script từ thư mục clone. Sáu repo agent/reference ban đầu giữ nguyên. Cấu hình onboarding có hướng dẫn install/start; chưa kiểm chứng khôi phục môi trường trong một cloud task mới. Lưu mã lên GitHub không tạo hosting hoặc public web preview.
