---
flow: ui-map
learnedCommit: aa1fe551a
learnedAt: 2026-10-11
tenant: shinhanbank (staging) — UI tiếng Anh, tài khoản dev_shinhanbank
status: bản đồ giao diện từ lượt duyệt CHỈ ĐỌC (mọi request không phải GET tới /api bị chặn; trang chi tiết/modal chưa mở)
---

# Bản đồ giao diện (các trang chính)

Lượt duyệt vào từng route ở thanh điều hướng, ghi tiêu đề, nút, cột bảng, số dòng. **Không mở trang chi tiết/nút ghi.** Nhãn tiếng Anh là nhãn thật hiển thị khi ép `locale=en`; vài nhãn **chưa dịch** (tiếng Việt lẫn trong UI tiếng Anh).

## ⚠️ Điều chỉnh so với suy đoán từ code

- Các route kiểu **`/interviews`, `/examination`, `/talent-updating`, `/talent-confirmation`, `/contract-signing`, `/offers`, `/final`, `/final-v`, `/checklist`, `/cv`, `/submission`, `/interview-confirmation`, `/process-approval`, `/statistical`** **không phải màn làm việc với ứng viên**. Cả 14 trang đều là cùng một màn **"SLA"** với cột `Job title | SLA days | Created Date | Operation` (cấu hình thời hạn xử lý theo chức danh; hiện `No data available`). Việc xử lý ứng viên ở từng vòng diễn ra **trong trang kế hoạch** (`/recruitment-plans/:planId/applications` — kanban — và thẻ ứng viên), không ở các route này.
- `/user-groups` **chuyển sang `/unauthorized`** ("Back to Login Screen") với tài khoản QA ⇒ **`dev_shinhanbank` KHÔNG có quyền vào trang quản lý nhóm người dùng**, dù hiển thị "System Admin". Ý nghĩa: tài khoản QA không phải toàn quyền; sửa lại mô tả "allowAll mọi nơi" trong `users-and-permissions.md` (quyền theo từng tính năng).

## Từng trang

| Route | Tiêu đề / nội dung | Cột / nút |
| --- | --- | --- |
| `/talents` | **List of Talents**, 15 dòng/trang | Cột: Full name · Recruitment Plan participated · Age · Gender · Address · Talent Pool · Latest Position · Latest Company · Source · Category · Skills · Candidate Creator · Created Date · Updated Date · Operation. Nút: **Add a talent**. Dữ liệu thật của người khác (tên, địa chỉ) — **chỉ đọc** |
| `/talent-pools` | **List of Talent Pools** (dạng thẻ, không có bảng) | Nút: **Create new talent pool** |
| `/recruitment-requests` | List of Recruitment Requests | Nút **New Request** (xem `recruitment-requests.md`) |
| `/recruitment-plans` | List of Recruitment Plans | Nút **Create recruitment plan** (xem `recruitment-plans.md`) |
| `/recruitment-task` | Hai tab: **Recruitment Request** · **Recruitment proposals to approve** (YCTD chờ tôi duyệt) | 12 dòng; cột Code · Recruitment Request · Quantity · Request date · Đơn vị · Job title · Workplace · Recruitment Method · Status · Operation; nút New Request |
| `/campaigns` | **Chiến dịch** (nhãn tiếng Việt) | Nút **Thêm Chiến dịch** (chưa dịch) |
| `/rankings` | Ranking list · Talent ranking | — |
| `/evaluations` | Trống (không có tiêu đề) | — |
| `/job-descriptions` | **Job Description Templates** (danh sách thẻ, vd "Backend Developer") | Nút **Create JD template** |
| `/competencies` | **Competencies** (vd "Mức độ phù hợp với văn hóa") | Nút **Create a competency** |
| `/competency-groups` | **Competency Groups** (vd "[4TA6C-926WE] Phỏng vấn chuyên môn vòng 2") | Nút **Create a group** |
| `/email-templates` | **Email Templates** (vd "[SHINHANBANK] Email thông báo Offer letter cần phê duyệt 1") | Nút **Create email template** — mẫu mail đặt tên có tiền tố tenant |
| `/user-permission` | Danh sách người dùng + chức danh (vd "Triết Test 5 · Hiring Manager") | Phân quyền theo người dùng |
| `/user-groups` | **Không vào được** (`/unauthorized`) | — |
| `/masterdata` | **Masterdata**, 15 dòng | Cột: Name · Code · Data · Describe · Updated Date · Operation |
| `/dashboard` | Bảng "Recruitment Plan Name · Status · Time" — **No Data**; trang gọi `POST /api/dashboard/schedules` và `.../recruitment-plans` (truy vấn đọc) | — |
| `/website-configurations` | **Website configurations** · **Theme Customization** | — |
| `/portal-configs` | `shinhanbank` (cấu hình portal) | — |
| `/recruitment-plans/create` | **Trang rỗng** (khớp nhầm route `:planId`) — phải vào bằng nút "Create recruitment plan" → `/recruitment-plans/create/initial` | — |

## Quan sát thêm

- `/talents` hiển thị cột **"Talent Pool"** kèm **"+1"** (nhiều pool) và nhiều ứng viên ở **"Pending pool"** (pool mặc định `pending-pool`).
- Danh sách ứng viên/talent chứa **dữ liệu của người thật hoặc dữ liệu thử của team khác** (tên, địa chỉ, công ty): không tạo/sửa/xoá, chỉ đọc; không mở thẻ chi tiết nếu không cần (mở thẻ hồ sơ ghi `POST /api/interactions`).
- Dashboard trống: số liệu tính nền theo lịch (`dashboard-scheduler`) — chưa có dữ liệu hoặc job tắt.
- Ba request bị chặn do khác GET: `POST /api/monitoring/traces` (log trình duyệt — vô hại), `POST /api/dashboard/schedules`, `POST /api/dashboard/recruitment-plans` (truy vấn đọc dùng POST; **bị chặn nên dashboard có thể hiển thị rỗng do chính lượt duyệt này, không phải do thiếu dữ liệu**).

## Việc cần xem tiếp (chưa mở)

- Trang chi tiết: thẻ ứng viên (đã xem 1 lần), modal Pass/Reject, Create Interview, Add a talent (form tạo talent), Create talent pool, Create campaign, Create JD/competency/email template.
- Portal ứng viên (domain riêng).
- Trang quản trị nhóm (cần tài khoản có quyền).
