# Bản mô tả sản phẩm v0.1 — cần PM góp ý

Agent Desk là bàn làm việc của PM, nơi context được chuyển thành công việc có kiểm soát cho các agent. Kết quả của agent luôn là proposal có nguồn, phiên bản và người review. Telegram/Slack là kênh trạng thái phụ; dữ liệu và quyết định dùng cùng một nền tảng.

## Người dùng và công việc chính

| Vai trò mục tiêu | Công việc | Quyền thiết kế |
|---|---|---|
| PM / project owner | Nhập context, chọn workflow, trả lời câu hỏi, giao review | Quản lý project/run; không mặc nhiên có quyền phê duyệt mọi loại quyết định |
| BA / QA / chuyên gia review | Đối chiếu nguồn, sửa tiêu chí, review đúng version | Review phạm vi project được cấp |
| Approver / sponsor | Chốt baseline hoặc quyết định theo ủy quyền | Quyền riêng, gắn artifact hash và bằng chứng thẩm quyền |
| Project member / viewer | Xem trạng thái và kết quả được phép | Read-only theo project và mức phân loại tài liệu |

Prototype dùng một danh tính PM demo cố định, chưa thực thi các vai trò thật.

## Hành trình chính

Tạo project và objective → nhập notes/SOW → chọn BA hoặc Requirements Discovery → nhận câu hỏi → trả lời → worker tiếp tục → xem bản nháp và nguồn → yêu cầu sửa hoặc ghi nhận review → nhận snapshot nội bộ. Người dùng có thể quay lại đúng run từ snapshot và xem toàn bộ quyết định trước đó.

“Run hoàn thành” chỉ là đã có đầu ra để review. Kiểm tra kỹ thuật đạt không xác nhận tính đúng của nghiệp vụ. Ghi nhận review không phê duyệt baseline; UAT plan không phải kết quả UAT.

## MVP sản phẩm đề xuất

- Project membership, context có version/hash, phân loại dữ liệu và quyền cho phép sử dụng.
- Registry versioned theo capability/schema/worker artifact; pin agent và workflow cho mỗi run.
- Durable orchestration: bounded handoff, timeout/retry/cancel, idempotency, budget reservations và pause/resume.
- Conversation có câu hỏi/owner/deadline; câu trả lời là nguồn dữ liệu mới, không phải lệnh nâng quyền.
- Artifact store bất biến, comparison v1/v2, evidence links, schema/domain checks và review theo hash.
- Decision log và approval gate riêng với reviewer/approver thực sự được xác thực.
- Telegram read-only `/status`, `/latest`, snapshot sau opt-in và identity linking; detailed review về web.

Prototype hiện đã cho thử UX của phần lớn hành trình này. Auth, BA adapter thật, artifact diff, cancel, deadline và budget model chưa được triển khai. File input chỉ có nhập text; không có parser PDF/DOCX hoặc quản lý kho file.

## Để sau

Live models và đánh giá chất lượng; risk/progress/weekly-report adapters; Slack; workflow editor; cron; enterprise SSO; đa tổ chức; retention/encryption/object storage; báo cáo KPI; service/event bus riêng; deploy production. Chỉ tách service khi số worker, isolation, độ trễ hoặc nhu cầu scale tạo ra vấn đề đo được.

## Gợi ý cho vòng feedback

1. Một inbox “Cần tôi xử lý” gom câu hỏi, review, blocker và decision deadline có hữu ích hơn nhiều trang rời không?
2. PM và người phê duyệt baseline có thường là hai người khác nhau? Loại artifact nào cần thêm BA/QA reviewer?
3. Review cần theo từng requirement/claim hay toàn bộ pack? Contract BA hiện cần exact field/revision/hash cho confirmation.
4. Có cần compare thay đổi và giải thích impact khi notes/SOW đổi không?
5. Telegram chỉ nên mang metadata/link, hay được phép chứa nội dung nhạy cảm? Mặc định đề xuất chỉ metadata.

Đây là câu hỏi để PM thử và phản hồi sau khi thao tác, không chặn prototype.

## Lát cắt triển khai kế tiếp

Ưu tiên một vertical slice **web → BA supplied-proposal fixture → canonical/domain validation → manifest import → artifact review**. Pin commit remote đã xác minh, giữ harness ở repo riêng, không dùng live model. Acceptance: input/operator trust tách khỏi notes; AwaitingInput/AwaitingProposal không bị báo lỗi máy; pack được kiểm tra schema/hash/path; review gắn đúng revision; integration test mô phỏng lỗi và replay. Sau lát cắt này, làm auth/project roles/approval và đánh giá live model trong runtime được phép; Telegram chỉ kết nối sau identity linking và authorization tests.
