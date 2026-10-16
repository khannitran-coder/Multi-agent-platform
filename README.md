# Agent Desk — multi-agent PM platform MVP

Web platform cục bộ cho PM điều phối nhiều agent, trao đổi làm rõ và review artifact theo phiên bản. UI tiếng Việt, responsive; **không deploy, không gọi model, không kết nối tài khoản ngoài**.

## Chạy và dùng thử

Yêu cầu: Python 3.12+, Node 22+ (đã kiểm tra Node 24.19.0), npm, Bash. Từ repo này:

```bash
cd /workspace/pm-agent-platform
bash scripts/install.sh  # cài platform + dependency BA pin commit
bash scripts/start.sh
```

Server phục vụ cả UI build và API ở địa chỉ loopback `127.0.0.1`, cổng `8000`. Mở địa chỉ đó trong trình duyệt trên máy chạy server. Đây là server phát triển cục bộ; chưa có public preview hay deployment. Dừng bằng Ctrl+C. API health: `curl -fsS http://127.0.0.1:8000/api/health`.

Để sửa UI với hot reload, giữ backend ở cổng 8000 và chạy `npm run dev` trong terminal khác (Vite cổng 5173). Vite proxy API về backend; production build trong lệnh start chỉ là bước đóng gói UI local.

Hành trình mới: **Tạo project → Tài liệu & Chạy BA → upload TXT/MD/PDF/DOCX hoặc dùng tài liệu mẫu → chọn phiên bản → xác nhận dữ liệu giả lập → Chạy BA Agent · mẫu không tốn token → trả lời câu hỏi → xem draft → yêu cầu sửa/review/download**. Link Drive chỉ lưu và báo chưa có quyền đọc, không yêu cầu file công khai. [Hướng dẫn cho người non-tech](docs/LOCAL-GUIDE.md) · [kiến trúc tài liệu/job](docs/MVP-DOCUMENTS.md).

Upload tối đa 5 MiB/file, whitelist extension/MIME và kiểm cấu trúc, trích xuất tối đa 100 KB/100 trang PDF. PDF scan cần bản có text, chưa OCR. Raw upload nằm trong `.local/uploads/`, không đưa vào Git; snapshot job giữ nguyên nguồn cũ khi upload phiên bản mới. Job có thể hủy ở Workspace/Run & Handoff để sửa đầu vào. Trang **Settings** hiển thị Google Drive/BA/model; không chứa token.

Hành trình mô phỏng notes cũ vẫn chạy được:

1. Chọn **Tạo project → Dùng ví dụ mẫu**, sửa tên/notes rồi tạo. Khi tạo project mới, notes có thể để trống và thêm file sau.
2. Trong **Agent Workspace**, chọn **Chạy workflow**. Worker đọc notes và dừng ở câu hỏi làm rõ.
3. Trả lời phạm vi ưu tiên và người review; bấm **Trả lời & chạy tiếp**. Khoảng 2 giây sau có review pack v1.
4. Mở pack, thử các tab Yêu cầu, Stories & AC, RTM, UAT plan, Nguồn & thay đổi.
5. Nhập nhận xét, chọn **Yêu cầu sửa bản nháp**. V2 giữ feedback; v1 còn nguyên và không thể review thay cho v2.
6. Nhập nhận xét v2 và **Ghi nhận đã review**. Phê duyệt chính thức vẫn là “Chưa phê duyệt”; UAT vẫn “Not Started”.
7. Xem **Run & Handoff** và **Kênh thông báo**. Snapshot dùng cùng project/run; nút mở quay lại đúng workspace. Telegram chỉ là preview/inbox cục bộ.
8. Reload trang để kiểm tra dữ liệu còn nguyên. Tạo project thứ hai để thử tách context. Quản lý notes từ Workspace để tạo phiên bản input mới cho run tiếp theo.

## Chuẩn bị context project

Vào **Agent & Workflow → Chuẩn bị context BA**:

1. Chọn phiên bản notes; mở **Thêm notes hoặc SOW giả lập** để lưu tài liệu có tên riêng. Mỗi lần lưu có ID/hash/version mới; không sửa nguồn cũ.
2. Chọn Nội bộ hoặc Khách hàng/SOW. Khai báo PM, người duyệt, SOW và tham chiếu quy trình nếu cần.
3. Bấm **Kiểm tra và lưu context** để thấy các trường thiếu từ canonical schema/preflight BA thật. Chỉ xác nhận synthetic-only khi các nguồn đúng là giả lập.
4. Bổ sung thông tin rồi kiểm tra lại. Chọn bản cũ trong lịch sử hoặc dùng cấu hình cũ để tạo snapshot mới; kết quả cũ giữ nguyên.

Context này có thể dùng trong **Tài liệu & Chạy BA → Nâng cao** với proposal canonical cung cấp sẵn và đúng các phiên bản tài liệu. Chỉ thử nguồn giả lập; không có model hoặc tự dùng proposal công nợ cho tài liệu khác. Schema/preflight đạt chưa xác minh quyền, ý nghĩa SOW hoặc phê duyệt. `execution=blocked` trên preparation là quyền thực thi nghiệp vụ thật; chế độ supplied-proposal chỉ chạy thử offline, business pending và approval not_approved. Tên người khai báo chưa xác thực. Context chuẩn bị bằng phiên bản BA cũ phải được kiểm tra/lưu lại trước khi chạy.

## Thử BA harness thật bằng fixture

Trong **Agent & Workflow**, chọn **Chạy BA harness fixture**. Đã xác nhận tag remote `v0.2.1` có code version 0.2.1, peeled commit **`345a4ef2696922097788736d3e6ea2a8806bf454`**, schema 0.2. Workflow fixture dùng context/proposal công nợ cố định. Workflow nâng cao `ba-project-proposal` dùng snapshot context + supplied proposal của project, không gọi model. Không suy ra quyền từ notes.

- Worker gọi BA CLI `--proposal`, kiểm tra canonical schema + domain, audit/fingerprints và manifest SHA-256, rồi nhập pack vào SQLite.
- **Stories & AC** hiển thị đủ happy/edge/error; **RTM** và **UAT plan** lấy nguyên từ bundle.
- **Nguồn & thay đổi** cho tải `proposal.json`, `bundle.json`, `review-pack.md`, `audit.json`, `manifest.json` nguyên bản đã xác minh.
- Mở **Chỉnh proposal JSON** và **Nạp proposal mẫu** để thử sửa proposal. Ví dụ đổi evidence source ID thành giá trị không tồn tại: BA sẽ trả `Escalated`, hiển thị findings và không nhập artifact.
- **Ghi nhận đã review** chỉ ghi quyết định platform. **Yêu cầu sửa** giữ nguyên pack và dừng tại `changes_requested`; operator sửa proposal và tạo run mới. Chưa có model tự diễn giải feedback hoặc field-level BA confirmations.

`scripts/install.sh` cài BA như dependency cache `.local/agent-runtimes/ba/<commit>/`, từ các Git blob được pin/checksum; không thêm checkout Git nào vào workspace. Interpreter BA riêng cài theo lockfile upstream. Cần Git read access tới `khannitran-coder/Ba-Pm-agent` khi cài lần đầu; dùng authentication hiện có. Runtime sửa byte/file set sẽ bị từ chối, không tự ghi đè để bỏ qua kiểm tra. Có thể cài/kiểm tra lại riêng bằng `python3 scripts/prepare_ba_runtime.py`.

## Thật và mô phỏng

| Thành phần | Trạng thái hiện tại |
|---|---|
| React UI, API FastAPI, SQLite | Chạy thật; dữ liệu tồn tại sau reload/restart |
| Project, notes versions/hash, conversation | Lưu thật; run khóa source ID/hash lúc khởi chạy |
| Worker và run state machine | Chạy thật trong background task cùng process API, journal SQLite |
| Run limits, timeout/retry, stale review guard | Có thực thi và kiểm thử; chỉ có các workflow cố định |
| Artifact versions, JSON export, review, audit, snapshot | Lưu thật; content bất biến, review metadata được cập nhật |
| Requirements Discovery / BA Draft | Mô phỏng theo notes; chưa có model phân tích |
| Context workbench | Nguồn/snapshot/hash/audit và canonical preflight thật; nối supplied-proposal project ở chế độ giả lập |
| Upload/Drive | Parser TXT/MD/PDF/DOCX thật; Drive chỉ lưu link, chưa có OAuth/read access |
| BA Documents Demo | Lấy tối đa 3 dòng từ mỗi tài liệu đã chọn; không diễn giải ngữ nghĩa bằng model |
| BA Project Proposal | BA v0.2.1 thật kiểm tra proposal cung cấp sẵn trên context project giả lập |
| BA Harness Fixture | BA CLI thật với fixture/supplied proposal; canonical/domain/manifest checks thật, không gọi model |
| QA handoff, Snapshot Writer | Vẫn là các bước mô phỏng/tóm tắt nội bộ |
| Nội dung bản nháp | Dùng tối đa 3 dòng notes không trống đầu, answer và feedback; không hiểu ngữ nghĩa, không tự giải quyết feedback |
| Technical validation | Luồng mô phỏng: Pydantic `platform-draft/1`; luồng harness: canonical BA schema/domain + provenance/manifest thật |
| BA pack / nguồn / review | Pack gốc và normalized view lưu riêng; không biến whole-pack review thành BA claim confirmation |
| Project permission | Backend kiểm tra membership với danh tính `demo-pm` cố định; chưa đăng nhập, chưa có nhiều user thật |
| Telegram | Lưu preferences và xem cùng snapshot thật; chưa có bot, webhook, scheduler, command hoặc identity linking |
| Approval / UAT sign-off | Không triển khai; review không phải approval hoặc nghiệm thu |
| Risk / progress / Slack | Đề xuất, chưa có worker hoặc connector |

SQLite mặc định `.local/platform.db` (ignored). Chọn file khác bằng `PLATFORM_DB`. Không xóa DB để “reset” nếu muốn giữ feedback. Chạy instance thử sạch bằng `PLATFORM_DB=.local/another-demo.db bash scripts/start.sh`. Cổng đổi bằng `PORT=8002`. Prototype chỉ nên dùng dữ liệu giả lập với một process server.

## Kiểm thử

```bash
.venv/bin/python -m pytest tests -q
npm run build
npm run test:e2e
```

Browser suite dùng Chromium đã cài tại `/usr/bin/chromium`, server riêng cổng 8001 và DB riêng `.local/browser-test-<timestamp>.db` cho mỗi lần chạy. Nếu ở máy khác, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` tới Chromium/Chrome hoặc cài trình duyệt tin cậy của hệ điều hành. Không cần tải browser từ dịch vụ ngoài trong môi trường hiện tại. Báo cáo/screenshot ở `.local/evidence/`; không chứa dữ liệu thật. Xem [kết quả kiểm chứng](docs/VALIDATION.md).

## Tài liệu để review

- [Sản phẩm, MVP, câu hỏi gợi ý và lát cắt tiếp theo](docs/PRODUCT.md)
- [Kiến trúc, mô hình dữ liệu, sequence và giới hạn](docs/ARCHITECTURE.md)
- [Khảo sát 6 repo và xác nhận phiên bản BA remote](docs/REPOSITORY-SURVEY.md)
- [Contract tích hợp BA, trạng thái và ranh giới tin cậy](docs/BA-CONTRACT.md)
- [Cách chạy và giới hạn của BA fixture integration](docs/BA-INTEGRATION.md)
- [Worker invocation schema đề xuất](contracts/agent-invocation.schema.json)
- [Bằng chứng và giới hạn kiểm chứng](docs/VALIDATION.md)

Repository GitHub của platform: [khannitran-coder/Multi-agent-platform](https://github.com/khannitran-coder/Multi-agent-platform), nhánh `main`. Người dùng đã xác nhận để repo public ở giai đoạn này; việc đổi private có thể thực hiện sau trong GitHub Settings. Checkout cloud hiện ở `/workspace/pm-agent-platform`; khi clone về máy khác, chạy các script từ thư mục clone. Sáu checkout agent/reference cũ đã được gỡ theo yêu cầu; chỉ giữ platform. Repository trên GitHub của các agent không bị xóa. Cấu hình onboarding có hướng dẫn install/start; chưa kiểm chứng khôi phục môi trường trong một cloud task mới. Lưu mã lên GitHub không tạo hosting hoặc public web preview.
