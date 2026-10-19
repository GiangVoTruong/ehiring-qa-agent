---
flow: ui-forms
learnedCommit: aa1fe551a
learnedAt: 2026-10-11
tenant: shinhanbank (staging) — UI tiếng Anh, tài khoản dev_shinhanbank
status: đọc từ giao diện, CHỈ ĐỌC (điền/bấm lưu khi form trống để lộ trường bắt buộc; mọi request ghi bị chặn). Chưa lưu bản ghi nào
---

# Form tạo bản ghi: trường, kiểu ô, bắt buộc, dữ liệu cần có

Cách xác định "bắt buộc": bấm nút lưu khi form còn trống, form báo lỗi tại trình duyệt (không gửi gì). Số lỗi = số trường bắt buộc còn thiếu (đã trừ giá trị mặc định).

## Talent — "Add a talent" (`/talents`)

Nút mở menu: **Add talent manually** (→ trang `/talents/create`) · **Upload talent** (modal tải CV).

### Add talent manually (`/talents/create`, tiêu đề "Add talent information", nút Cancel / Save, ô **Upload CV** bên phải để tự điền từ CV)

| Tab / nhóm | Trường | Kiểu | Bắt buộc | Dữ liệu cần có / ghi chú |
| --- | --- | --- | --- | --- |
| Basic › Required information | **Full Name** | text ("Enter full name...") | ✅ | chuỗi tên; hệ thống chuẩn hoá (viết hoa chữ đầu, tách họ/tên) |
| | **Email** | text ("Enter email...") | ✅ | email hợp lệ; **tenant kiểm trùng theo email HOẶC số điện thoại** (`EHIRING_TALENT_IDS_VALIDATE`); với ứng viên giả dùng email hộp thư QA |
| | **Talent Pools** | select nhiều ("Select and search for a pool...") | ✅ (mặc định đã chọn **Pending pool**) | ≥1 pool có sẵn (xem danh sách bên dưới); talent phải luôn thuộc ≥1 pool |
| Basic › Optional information | Gender | select ("Select gender...") | | |
| | Date of Birth | date | | |
| | Phone number | text | | trùng điện thoại bị coi là trùng talent |
| | Address | text | | |
| | ID number · Place of issue · Date of issue | text · select ("Select or search...") · date | | **hai bộ** (CMND và CCCD: nhãn "ID number (9 digits)" cho bộ thứ hai) |
| Basic › Other Information | Source | select ("Select or search source...") | | nguồn ứng viên (`meta.source`: `portal`/`external`/…) |
| | Campaign | select | | chiến dịch có sẵn |
| | Tags | thêm bằng nút **Add tag** | | |
| Advanced Information | Introduction (Note) · Skills · Work Experience · Education · Certificate | khối nhập; mỗi khối nút **Add**, ban đầu "No information available" | | thông tin chi tiết |

- Lưu form trống báo **2 lỗi "Required Field!"** (Full Name, Email) rồi hộp thoại "Please check the entered information again — OK".
- Ảnh đại diện: bấm biểu tượng sửa ảnh (tuỳ chọn).

### Upload talent (modal)

"Please select a Talent pool to add talents": ô chọn pool (**mặc định "Pending pool"**) + vùng kéo thả **file PDF** (CV) → nút `Upload`, `Cancel`, `Continue`. Gọi phân tích CV (dịch vụ AI/parser).

## Talent pool — "Create new talent pool" (`/talent-pools`, modal)

| Trường | Kiểu | Bắt buộc | Ghi chú |
| --- | --- | --- | --- |
| Talent pool name ("Enter Talent Pool name") | text | (có — chưa lộ lỗi khi bấm Save trống; xác nhận khi thử thật) | tên pool |
| Members ("Enter name... — Optional Field") | select nhiều (user) | không | danh sách user có sẵn (213123@gmail.com-Triết Test 5, …) |
| Description ("Enter description") | textarea | không | |
| **Is this a restricted pool?** | checkbox | không | **Pool hạn chế tuyển dụng** (tự gỡ hạn chế hết hạn hằng ngày) — **không bật cho pool test** |

Nút: `Cancel` / `Save`.

## Chiến dịch — "Thêm Chiến dịch" (`/campaigns/create`)

Wizard, nút `Cancel` / `Continue`; tiêu đề **"Create new Campaign"**, mô tả "This information applies to the automatic creation of recruitment plan in the campaign" (chiến dịch **tự tạo kế hoạch tuyển dụng**). Các trường của bước 1 là form động (chưa lộ nhãn khi không có dữ liệu mẫu) — cần mở từng bước khi có dữ liệu để đọc.

## Job description template — "Create JD template" (`/job-descriptions/create`)

| Trường | Kiểu | Bắt buộc | Ghi chú |
| --- | --- | --- | --- |
| **Template Job Description Name** | text ("Enter Template Job Description Name") | ✅ | |
| Sections: **3 mục mặc định** (tên "nhập tên section...") | text tên + nội dung (trình soạn) | ✅ (lưu trống báo **4 lỗi "Required Field!"**: tên template + nội dung các mục) | các mục thường là Mô tả công việc / Yêu cầu / Quyền lợi; có nút **Move Up / Move Down / Delete** mục |

Nút `Cancel` / `Save` / `Delete`.

## Competency — "Create a competency" (`/competencies/create`)

| Trường | Kiểu | Bắt buộc | Ghi chú |
| --- | --- | --- | --- |
| **Criterion name** ("Enter criterion name") | text | ✅ ("Field cannot be left blank!") | |
| **Type** | select ("Select") | ✅ ("Mandatory field!") | `Skill` / `Attitude` / `Knowledge` |
| Câu hỏi gợi ý ("What is your job objective?" — Optional) | text | không | câu hỏi phỏng vấn (nhiều dòng) |
| Cấp độ (levels) | nhiều ô | không | mô tả từng mức |

Lưu trống báo **2 lỗi** + "Please check the information entered again — Agree".

## Competency group — "Create a group" (`/competency-groups/create`)

| Trường | Bắt buộc | Ghi chú |
| --- | --- | --- |
| **Competency Group Name** | ✅ | `code` tự sinh 8 ký tự (không nhập tay) |
| Description (Optional) | không | |
| **Add criteria group** (nút) → nhóm tiêu chí chứa các competency + `expectedPoint` | ✅ (lưu trống báo **2 lỗi "Field cannot be left blank!"**: tên nhóm + ít nhất một nhóm tiêu chí) | cần competency có sẵn |

## Email template — "Create email template" (`/email-templates/create`)

| Trường | Kiểu | Bắt buộc | Ghi chú |
| --- | --- | --- | --- |
| **Email template name** | text | ✅ ("Field cannot be empty!") | tên mẫu; mẫu có sẵn đặt tiền tố tenant `[SHINHANBANK] …` |
| **Select email type** | select | ✅ ("Field cannot be empty!") | loại mail (khớp `MailType`/`templateCode`) |
| Email Subject · Secondary Email Subject | text | (tiêu đề) | |
| To: · cc: | text/thẻ email | | người nhận/cc |
| Send one email to all recipients | checkbox | | gộp một mail cho mọi người nhận |
| Nội dung | trình soạn HTML (có biến `{{...}}`) | | |
| Bật/tắt mẫu | nz-switch | | trong danh sách mẫu |

## Dữ liệu có sẵn trên staging để chọn trong các ô

- **Talent pool**: `Pending pool` (mặc định), `LOAN POOL`, `TA POOL`, `Pool NhiNHY`, `hello world`, `Keep in view`, và các pool hạn chế (`Hạn chế tuyển dụng`, `Nga pool hạn chế tuyển dụng nè`).
- **Talent** (126): nhiều bản ghi thử của team (vd "Mai Đức Anh", "Lâm Quốc Việt", "Huynh Minh Thonq", "Trần Khánh Minh Test Cuv", "Jun Kim Chuyển Uv", "Võ Hạ Anh Nga").
- **Người dùng** (chọn người): `userName - Họ tên` + chức danh, ví dụ `213123@gmail.com-Triết Test 5 · Backend Engineering Officer`, `dev_shinhanbank - Thong Quản trị Hệ thống`.
- **Competency**: "Mức độ phù hợp với văn hóa"…; **Competency group**: "[4TA6C-926WE] Phỏng vấn chuyên môn vòng 2"; **JD**: Backend Developer, Chuyên viên Phân tích nghiệp vụ, Chuyên viên Kiểm thử phần mềm (Tester), Chuyên viên Tuyển dụng, Nhân viên kinh doanh, Chuyên viên tài chính marketing, Tester.
- **Email template**: "[SHINHANBANK] Email thông báo Offer letter cần phê duyệt 1", "[SHINHANBANK] Mẫu mail thông báo đến cấp duyệt…".

## Để tạo một ứng viên giả an toàn (gợi ý, chưa thực hiện)

Add talent manually → Full Name `[AUTOTEST] Ứng viên …`, Email = hộp thư QA, Talent Pools = một pool riêng `[AUTOTEST] pool` (tạo trước bằng "Create new talent pool", **không** restricted, không có thành viên khác), Save. Sau đó trong kế hoạch QA: nút `user-add` → chọn pool đó → tìm tên → `Add`. Lưu ý: talent tạo ra **không xoá được qua API** (chỉ gỡ khỏi pool) — chấp nhận để lại hoặc dùng một ứng viên giả cố định tái sử dụng (email cố định ⇒ chỉ **một hồ sơ in-progress/lần**).

## Điểm chưa chắc

- [ ] Pool: trường bắt buộc thực sự (chưa lộ lỗi khi lưu trống) — xác nhận khi tạo thật.
- [ ] Bước 2+ của wizard chiến dịch; modal Pass/Reject, Create Interview, form portal ứng tuyển — chưa mở.
- [ ] Email template: các biến `{{…}}` hợp lệ theo loại mail; danh sách `email type`.
