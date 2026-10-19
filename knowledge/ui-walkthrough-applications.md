---
flow: ui-walkthrough-applications
learnedCommit: aa1fe551a
learnedAt: 2026-10-11
tenant: shinhanbank (staging) — UI tiếng Anh
status: HỌC TỪ THAO TÁC THẬT trên giao diện (tài khoản QA, mọi người liên quan = QA). Đã đi hết MỌI vòng tới HRIS (dừng trước nút Create employee), cập nhật 2026-10-11
---

# Hành trình thật của một ứng viên giả: từ tạo talent đến vòng phỏng vấn

Dữ liệu tạo thật (đều `[AUTOTEST]`, mọi mail chỉ về `dev_shinhanbank@shinhanbank.com`): pool `[AUTOTEST] POOL …`, talent `[qa-auto] Ứng Viên …` (tên bị chuẩn hoá chữ thường), YCTD `NI26101`, kế hoạch `NI26101001`, hồ sơ ứng viên, một lịch phỏng vấn online.

## 1. Tạo talent pool (`/talent-pools` → "Create new talent pool")

Modal: nhập **Talent pool name** → `Save`. `POST /api/talent-pools` (response **không có `_id` ở gốc** — id chỉ lấy được bằng cách đọc lại danh sách). Không cần ô khác.

## 2. Tạo talent (`/talents` → "Add a talent" → "Add talent manually" → `/talents/create`)

- Điền **Full Name** (ô `Enter full name...`), **Email** (ô `Enter email...`), **Talent Pools** (ô chọn nhiều, gõ tên pool rồi chọn; "Pending pool" mặc định **vẫn còn** sau khi thêm pool riêng — muốn bỏ phải bấm dấu × trên thẻ).
- Bấm `Save` → hộp thoại **"Do you want to add this new information?"** → `Save` lần nữa.
- API: `POST /api/talents/validate` (kiểm trùng; trả `email:false` = chưa trùng) rồi `POST /api/talents/create` (201). **Email đã tồn tại sẽ bị `validate` báo `email:true`** → ứng viên giả thứ hai cùng email QA sẽ bị coi là trùng: chỉ một talent QA cho một email.
- Sau khi tạo, talent tự thêm vào pool của kế hoạch khi gắn hồ sơ (`plan.talentPoolRef`, ở đây là `TA POOL`).

## 3. Thêm ứng viên vào kế hoạch (trang kế hoạch → nút icon `user-add`)

Modal **Add talent**: **List of Talent Pools** (mặc định tích "All Talent Pools" → ô chọn pool bị khoá; **bỏ tích bằng checkbox** rồi chọn pool riêng) → **Talent Name** (mở ô sẽ liệt kê talent của pool; tên hiển thị kèm email và tên pool) → `Add`. API: `POST /recruitment-plans/:planId/applications/multiple-applications` (201), hồ sơ vào vòng đầu `ScreenCV-0`, hiện ở cột "Application" của kanban. **Tìm theo tên có ký tự `[` / tiếng Việt không ra kết quả** — phải chọn pool rồi mở danh sách.

## 4. Vòng "Application" (ScreenCV) — nút **Pass** là menu xổ xuống

Thẻ ứng viên (`/recruitment-plans/:planId/applications/:applicationId`): các nút `Request for Additional Information`, `Reject ▾`, `Pass ▾` (class `btn-action reject` / `btn-action accept`, **bấm bằng class này** vì chữ "Reject"/"Pass" trùng nhiều chỗ), `Add` (đính kèm), `Previous CV` / `Next CV`.

- **Reject ▾**: `Blacklist` · `Decline job` · `Not met requirements` (= BLACKLIST / DECLINE_JOB / DISQUALIFIED, đúng `REJECT_LIST` của tenant).
- **Pass ▾**: `Meet expectation` · `Special` · `Special to offer`.
- **Pass → Meet expectation** ở vòng kế sau ScreenCV là **vòng duyệt CV (`ApproveInterview`)**: modal *"Are you sure you want to move this talent to the next round? Send Interview confirmation email template to confirmer"* (có ô chọn **mẫu mail "Interview confirmation email template"**) → `Confirm`. API: `POST …/multiple-applications/approve-interview/email-preview` rồi `POST …/multiple-applications/approve-interview` `{reason:"QUALIFIED", applications:[id], confirmationEmail:{mailTemplate:{…}}}` (201). Kết quả: hồ sơ sang `ApproveInterview-1` (cột "2 - CV tiềm năng"), tạo **phiếu xác nhận CV** cho từng người xác nhận (người duyệt vòng) và gửi mail **"Please confirm 1 candidate CVs"** (có link `/evaluations/multiple/<mã>`) cho họ.

## 5. Vòng "2 - CV tiềm năng" — người xác nhận duyệt CV

- Thẻ ứng viên hiện khối **Interview Confirmation Form**: `Confirmed By` · `Form Creation Time` · `Status` (**Waiting for confirmation** → **Accepted**). Bấm vào trạng thái **không** mở gì.
- Người xác nhận mở **link trong mail** `/evaluations/multiple/<mã>` → trang **"POTENTIAL CV CONFIRMATION FORM"**: thông tin kế hoạch (mã, tên, người giám sát, số lượng, nội dung tuyển dụng) và bảng ứng viên: `Confirm` / `Reject` từng người, ô **Note** (textarea "Please enter interview schedule proposal notes" — **bắt buộc**), `Confirm All` / `Decline All`, nút **Send evaluation**.
- Thao tác: `Confirm` → điền Note → `Send evaluation` → `PATCH /api/evaluation-form-groups/by-code/<nhóm>/approve-cv` `{accept:[{id,note}],reject:[]}` (200) → toast **"Sent evaluation confirmation successfully"**. Gửi mail **"CV of candidate … has been confirmed"** cho người phụ trách kế hoạch.
- ⚠️ Xác nhận CV **không tự đẩy hồ sơ sang vòng sau** (cờ `APPLICATION_NEXT_STEP_EVALUATION_FORM_ACCEPTED` tắt): TA phải bấm **Pass** lần nữa.

## 6. Pass sang vòng phỏng vấn

Sau khi xác nhận, `Pass` **không còn menu**: hiện hộp *"Are you sure you want to pass this talent to the next round?"* → `Confirm` → `PATCH /recruitment-plans/:planId/applications/:applicationId/accept` `{reason:"QUALIFIED", applicationId}` (200). Hồ sơ sang "3 - Phỏng vấn 1". Thẻ lúc này có nút **Create Interview** và bảng **Interview Stages**.

## 7. Create Interview (nút trên thẻ ứng viên, modal)

| Trường | Ghi chú |
| --- | --- |
| Method | **On-site Interview** / **Online Interview** (online không cần phòng) |
| Send email to talent / Send email to interview panel | hai checkbox, mặc định bật |
| Title | tự điền `<tên vòng> - <tên kế hoạch> - <tên ứng viên>` |
| Interview Board | người phỏng vấn (mặc định người đang đăng nhập) |
| Approver | người duyệt kết quả (mặc định người đăng nhập) |
| Information | tuỳ chọn, ≤1000 ký tự |
| On-site: Interview Location, Meeting Room — Online: **Interview link** | **bắt buộc** (online: link; on-site: địa điểm + phòng). Lưu thiếu báo **"Mandatory Field!"** |
| Interview Date, Start Time, End Time | mặc định = khung rảnh gần nhất (làm tròn 5 phút); panel kiểm trùng ("This slot is free") và liệt kê lịch trong ngày |

`Create` → **khung xem trước mail** "Contact email template" (hai thẻ: *Talent Email* và *Interview Panel Email*, có Subject, To, CC, nội dung — người nhận đều là hộp thư QA) → **Send and Create** → `POST /schedule-groups/by-recruitment-plan/:planId/email-preview` rồi `POST /schedule-groups/by-recruitment-plan/:planId` (201). Hồ sơ hiện bảng **Interview Stages**: `Round Name | Time | Interviewers | Status` với **Not started**.

## 8. (Đã giải quyết ở mục 9) Điểm dừng cũ — chưa học được

- (Đã giải quyết: phiếu bắt đầu khi người đánh giá mở link, xem mục 11.) Trạng thái "Not started" của buổi phỏng vấn không bấm được từ thẻ. Màn quản lý buổi phỏng vấn của kế hoạch: `/recruitment-plans/:planId/interviews/:stageIndex` (menu trái "Interview"; tab "3 - Phỏng vấn 1", "4 - Phỏng vấn 2"; ô chọn **Interview session** hiện *"No Interview session available"* và bảng ứng viên trống) — **không thấy buổi phỏng vấn vừa tạo** (có thể lọc theo ngày/giờ hoặc chỉ hiện sau khi "bắt đầu").
- Cách **bắt đầu buổi phỏng vấn** (API `schedule-groups/:id/start` → tạo phiếu đánh giá cho từng người phỏng vấn) ở UI chưa tìm ra; có thể chỉ chạy tự động theo giờ (cron lịch `scheduleRunner`, seed `APP_SCHEDULE_RUNNER_ENABLED=false`) hoặc qua link trong mail hội đồng.

## Bài học vận hành

- **Mọi mail đều về hộp thư QA** khi tất cả người liên quan là QA: đã kiểm chứng bằng `emails/v2` sau từng bước (YCTD, xác nhận CV, đã tạo lịch).
- Mail của team khác trên staging **có người nhận thật** (vd `*@gmail.com`, `*@example.com`, cc `cbtd_`/`qltd_shinhanbank`) — bộ test không được dùng email ngoài hộp thư QA.
- Chọn user bằng gõ từng ký tự; ô chọn của form tìm theo tên có `[`/dấu thường không ra → ưu tiên chọn từ danh sách đã lọc theo pool/phạm vi.
- Mỗi lượt học thật **tạo** dữ liệu: 1 pool, 1 talent (không xoá được), 1 YCTD, 1 kế hoạch, 1 hồ sơ, 1 phiếu xác nhận, 1 buổi phỏng vấn, ~6 mail. Hồ sơ/phiếu/lịch gắn vào kế hoạch **không có cách dọn qua API cleanup hiện tại** (chỉ xoá kế hoạch + YCTD + pool).

## 9. Cập nhật 2026-10-11 — đi tiếp tới vòng Offer (kế hoạch thử `[AUTOTEST] PATD 20261011104235810`, ứng viên = talent QA)

Các vòng của kế hoạch mẫu: `Application → 2 CV tiềm năng → 3 Phỏng vấn 1 → 4 Phỏng vấn 2 → 5 BSTT UV 1 → 6 Offer → 7 BSTT UV 2 → 8 Kiểm tra thông tin ứng viên → HRIS` (BSTT UV = bổ sung thông tin ứng viên).

- **Thêm ứng viên**: kế hoạch phải **đã Bắt đầu** (kế hoạch chưa chạy: bấm icon `svg:user-add` không mở modal). Modal Add talent: bỏ tích "All Talent Pools" (nút `button.ant-checkbox-wrapper`), chọn pool (TA POOL), mở ô Talent Name → chọn dòng. **Ô tìm theo tên/email không ra kết quả**; talent đã ở trong kế hoạch **biến khỏi danh sách** (mỗi kế hoạch thêm 1 lần). `POST …/multiple-applications` 201. **Không có mail** "thêm vào kế hoạch" (đã kiểm `emails/v2`).
- **Xác nhận CV**: lấy link `/evaluations/multiple/<mã>` trong mail "Please confirm 1 candidate CVs" (đọc `emails/v2` bằng token lấy từ request của app: `page.waitForRequest(/api/recruitment-requests)` rồi `fetch` trong `page.evaluate`). Trang form: **điền Note trước**, rồi mới bấm `Confirm` (nút nhạt khi chưa có note), `Send evaluation` → `PATCH /evaluation-form-groups/by-code/<id>/approve-cv` 200. Thẻ ứng viên hiện **Accepted**.
- **Pass sang Phỏng vấn 1**: `Pass` **vẫn là menu** (Meet expectation / Special / Special to offer) → modal "pass this talent to the next round" → Confirm → `PATCH …/applications/<id>/accept` 200. (Khác ghi chú cũ "không còn menu".)
- **Create Interview (Online)**: ô "Interview link" (placeholder đúng `Interview link`; **không** dùng `getByPlaceholder(/link/i)` vì trúng ô Information "Meeting link, meeting room…"). Create → khung xem trước mail → `Send and Create` → `POST /schedule-groups/by-recruitment-plan/<planId>` 201. Mail gửi: "Interview Invitation" (cho ứng viên), "Interview Invitation for Interviewers".
- **Buổi phỏng vấn TỰ BẮT ĐẦU ngay** (≈8 giây sau khi tạo): mail **"Interview Evaluation Form"** với link `/evaluations/multiple/<mã>` đến người phỏng vấn (QA). Không cần nút "bắt đầu". Trạng thái "Not started" ở thẻ/bảng chỉ là nhãn cũ, không bấm được.
- **Form đánh giá** `/evaluations/multiple/<mã>`: mỗi tiêu chí có checkbox mức 1–5 (4 tiêu chí × 5 ô = 20 checkbox đầu trang: ô mức n của tiêu chí i là `i*5+n-1`), nút **Passed / Failed**, textarea General Comments, checkbox **"I confirm this is the final result"** (checkbox cuối), nút `Finish` → `PATCH /evaluation-form-groups/by-code/<id>/end` 200, thông báo **"Sent evaluation successfully"**. Trạng thái buổi phỏng vấn trên thẻ chuyển **Passed**.
- **Màn quản lý phỏng vấn của kế hoạch** `/recruitment-plans/:planId/interviews/<chỉ số vòng>` (vòng "3 - Phỏng vấn 1" = chỉ số 2): chọn thẻ phiên (**Individual**) bên trái → bảng ứng viên (cột Session Status, Time, Operation có ✓/✕) + nút **Interview Information** (xem form tạo) và **View Evaluation Results** (điểm từng tiêu chí, kết quả, nút `Send confirmation` của người duyệt kết quả, "Confirmed results"). Buổi chưa có thẻ ở danh sách khi còn "No Interview session available" lúc trang mới tải — chờ tải xong rồi mới chọn.
- **Pass sau phỏng vấn**: thẻ có `Print interview result`. `Pass` → **Special to offer** → modal "pass … to the next round" → Confirm → `PATCH …/applications/<id>/accept-to/Other` 200 → hồ sơ **nhảy thẳng tới vòng Offer** (bỏ qua Phỏng vấn 2 và BSTT UV 1). `Meet expectation` thì vào vòng kế tiếp và có modal **"Send Talent – Result Letter to talent"** (gửi thư kết quả cho ứng viên).
- **Vòng Offer**: các tab Screen CV / Shortlist / Interview / Add Candidate Information / **Offer letter** / Mission; nút **"Create a recruitment proposal"** (tờ trình) mở modal **Recruitment proposal**: Full name (điền sẵn), DOB, Job title, Maximum Job Grade (J1), Head Office/Business Unit, Cluster, Division/Region, Department, Team, Workplace, Job acceptance date, Line Manager, link thông tin/đánh giá HĐPV, Lương thử việc, Số ngày thử việc, Base salary, Phụ cấp ăn trưa/vị trí/khác, Gross, Notes, `Reference check`, `Import`, nút **Create draft**. API đọc: `GET /applications/<id>/offers`, `/form-templates`, `/dynamic-forms/by-code/offer-request-form`.
- (Đã học tiếp ở mục 10.)

Dữ liệu tạo thêm lượt này (mọi mail về hộp thư QA): YCTD + kế hoạch `NI26113001`, 1 hồ sơ, 1 phiếu xác nhận CV, 1 lịch phỏng vấn, 1 phiếu đánh giá, ~8 mail. Dọn bằng "Dọn dữ liệu test" (kế hoạch + YCTD); hồ sơ/phiếu/lịch không dọn được qua API.

## 10. Cập nhật 2026-10-11 (tiếp) — Offer → BSTT UV 2 → Kiểm tra thông tin → HRIS

**Tờ trình (Recruitment proposal) ở vòng Offer**
- Modal lấy dữ liệu từ **hồ sơ talent**: **DOB bị khoá (disabled) và bắt buộc** — talent chưa có ngày sinh thì không tạo được. Phải sửa talent trước: `/talents/<id>/edit` → ô "Enter date of birth..." (gõ `dd/mm/yyyy`) → `Save` → hộp "Do you want to save these changes?" → `Save` (`PATCH /api/talents/<id>` 200). Thẻ hồ sơ hiện ngày sinh sau khi tải lại.
- Bắt buộc thêm: **Line Manager** (nz-select user: gõ từng ký tự, **chờ đúng dòng chứa `dev_shinhanbank`** rồi bấm; danh sách ban đầu có người thật như `213123@gmail.com`; xong nhấn Escape để đóng dropdown, nếu không overlay che nút) và **Base salary** (ô placeholder `Vd: 8,000,000`; ô `Vd: 6,000,000` là *Lương thử việc*, không bắt buộc). Job title/Grade/Business Unit/Cluster/Division/Department tự điền theo kế hoạch.
- `Create draft` → `POST /integration-templates/boundary` (gọi tích hợp ngoài kiểm khung lương, trả SUCCESS) + `POST /applications/<id>/offers/config` 201; toast "Create recruitment proposal successfully"; danh sách hiện dòng **Transfer 1 — Draft**. Mở lại bằng menu ⋮ của dòng → **See report** (cũng có **Refresh**); modal có tab **Form / Approval Flow** (bước "Create offer — Success", "Grant approval 1 — Waiting for approval" = QA) và nút **Edit / Submitted for Approval**.
- `Submitted for Approval` → `POST /offers/<id>/process-integration` → trạng thái **Waiting for signature**; mail "Recruitment Proposal … is pending your approval" (link `/recruitment-task?tab=offer-letter`).
- **Người duyệt** vào `/recruitment-task?tab=offer-letter` (tab "Recruitment proposals to approve"): bảng có nút `View / Reject / Approve`. ⚠️ **Bảng chứa cả tờ trình của người khác đang chờ QA duyệt** (Truc Quynh, Lee Jun…) → chỉ bấm dòng có tên YCTD `[AUTOTEST]` của mình. `Approve` → modal "Approve recruitment proposal" (xem lại các khoản lương) → `Agree` → `PATCH /offers/<id>/approve` 200; trạng thái **Approved**; mail "Recruitment Proposal Approval Result …".
- Chưa chạy: `Reject` tờ trình, `Edit` bản nháp, `Import`, `Reference check`.

**Sau khi tờ trình Approved**: `Pass` (menu Meet expectation / Special / Special to offer) → modal "pass this talent to the next round" (không có tuỳ chọn mail) → `PATCH …/accept` 200 → sang **vòng 7 "BSTT UV 2" (Additional information)**.

**Bổ sung thông tin (BSTT UV 2)** — thẻ hiện "Additional information — No data available" + nút **Request for Additional Information** → modal "request additional information from the talent?" (tuỳ chọn **Send notification email to the talent**) → `Confirm` → `PATCH …/email-advanced-info` 200 → trả `url` portal `https://tuyendung-shinhanbank.stg.ehiring.com.vn/extra-info/<mã>` và gửi mail **"Notice to Update Personal Information"** (cũng tự gửi khi Pass sang vòng này).
- **Form ứng viên trên portal** (không cần đăng nhập, có chọn ngôn ngữ VI/EN): "Ứng viên bổ sung hồ sơ", **15 mục tài liệu**: Sơ yếu lý lịch, Phiếu thông tin ứng viên, Căn cước công dân, Giấy tờ cư trú (2 ô chọn), Bản khai bổ sung điều kiện lao động & tuyển dụng, Chứng từ nghỉ việc công ty cũ (2 ô chọn), Bằng cấp-chứng chỉ (2 ô chọn), Giấy khám sức khoẻ, Cam kết làm việc, Cam kết đạo đức nghề nghiệp, Cam kết bảo mật, Chấp thuận dữ liệu cá nhân, Chứng chỉ chuyên môn-hành nghề, Hợp đồng thử việc, Chứng từ khác (thêm ô **Tên giấy tờ**). Mỗi mục: **tải file** (PDF/DOC/JPG ≤10MB) **hoặc** nếu chưa có thì bắt buộc **Loại giấy tờ + Ngày bổ sung dự kiến (DD/MM/YYYY) + Lý do**. Cuối trang **2 ô cam kết bắt buộc** ("Không vi phạm pháp luật…", "Bổ sung các chứng từ còn thiếu đúng hạn"); bộ đếm **n/15**; nút `Lưu nháp` / `Xác nhận gửi` (chỉ bật khi 15/15 + 2 cam kết). `POST /api/portals/applications/<id>/talent-extra-info` 201 → "Đã gửi hồ sơ thành công".
- Cách điền tự động: ô chọn là dropdown tuỳ biến (không phải ant-select): bấm ô rồi **ArrowDown + Enter**; điền `Nhập tên giấy tờ`, `DD/MM/YYYY`, `Nhập lý do`, bấm 2 dòng "Cam kết: …".
- Phía tuyển dụng: vòng 7 hiện **Form for additional information** gồm 15 mục (mở từng mục xem Document type / Expected submission date / Reason; **chỉ đọc**) và lịch sử "Supplementary Date Form <giờ>" ở cột trái.
- `Pass` ở vòng này chỉ có **Special / Special to offer** (không Meet expectation).

**Vòng 8 "Kiểm tra thông tin ứng viên" (Review Candidate Information)**: mỗi mục có **Passed / Failed**; nút **Pass all items** (modal "Are you sure? … pass all information sections" → Confirm), **Save changes** (modal "Confirm saving this review? Once saved, the sections marked as Passed are final…" → Confirm → `POST /applications/<id>/talent-extra-info/review` 201), **Send onboarding email**. Sau khi lưu, `Pass` có lại **Meet expectation** → `PATCH …/accept` 200.

**Vòng cuối "HRIS" (Final Stage)**: thẻ hiện nút **Convert candidates to employees** và **Re-in progress** (đưa hồ sơ về lại). `Convert candidates…` mở modal **Create employee** (Full name, Phone, DOB, Gender, địa chỉ thường trú/tạm trú, ID card + ngày cấp, Email, Job acceptance date, **Staff ID**, khối thông tin tờ trình, các cấp duyệt, nút `Create`). ⚠️ **KHÔNG bấm Create khi test**: đẩy nhân viên sang HRIS thật (chưa kiểm xem staging có sandbox không). Đã chỉ mở modal, không gửi.

**Các trang của một kế hoạch (PATD)**
| Đường dẫn | Nội dung |
| --- | --- |
| `/recruitment-plans/<id>/applications` | Kanban các vòng, mỗi vòng có tab Ongoing / Rejected; icon `svg:user-add` thêm ứng viên |
| `/recruitment-plans/<id>/applications/<appId>` | Thẻ ứng viên (các nút theo vòng như trên) |
| `/recruitment-plans/<id>/interviews/<chỉ số vòng>` | Quản lý buổi phỏng vấn (mục 9) |
| `/recruitment-plans/<id>/talent-confirmation` | "Review Candidate Information": bảng ứng viên cần xác nhận thông tin (cột Status, Operation) |
| `/recruitment-plans/<id>/edit/{initial,setting-begin,setting,contact,mission,valuation}` | Sửa kế hoạch: 5 bước (Recruitment information, Setup hiring stages, Background check, Competency Groups, Setup communication); nút `Cancel` / `Save` |
| `/recruitment-plans/<id>/publish/news` | "Post job opening": Posting Types (Job Network, Post to job board), danh sách tin đăng |
| `/recruitment-plans/<id>/publish/source` | Thiết lập nguồn ứng viên: từ Talent Pool / Đăng tải CV |

**Chuỗi mail của một ứng viên đi hết luồng (tất cả về hộp thư QA)**: duyệt YCTD (3 mail) → "Please confirm 1 candidate CVs" → "CV of candidate … has been confirmed" → Interview Invitation (ứng viên) + Invitation for Interviewers → Interview Evaluation Form → "Interview results have been confirmed" → "Recruitment Proposal … pending your approval" → "Approval Result" → "Notice to Update Personal Information" (×2). **Không có** mail khi thêm ứng viên vào kế hoạch.

**Chưa kiểm**: Reject từng loại (Blacklist / Decline job / Not met requirements) và mail kèm theo; Reject tờ trình; vòng Phỏng vấn 2 & BSTT UV 1 (bị bỏ qua bởi "Special to offer"); Failed ở form đánh giá phỏng vấn; `Send onboarding email`; `Re-in progress`; đăng tin (`publish`) và ứng tuyển từ portal; sửa kế hoạch.

## 11. Cập nhật 2026-10-11 (tiếp 2) — Reject, khôi phục, đánh giá "Failed", đăng tin, sửa kế hoạch

Kế hoạch thử thứ hai: `NI26114001` (`[AUTOTEST] PATD reject …`), cùng talent QA.

**Reject ứng viên** (nút `Reject ▾` ở thẻ ứng viên, class `btn-action reject`): menu **Blacklist / Decline job / Not met requirements** — cả 3 mở **cùng một modal** "Are you sure you want to remove this talent?" + tuỳ chọn **Send Reject notification email template to talent** (đang tích sẵn). Không có ô lý do.
- `Confirm` → `PATCH /recruitment-plans/<id>/applications/<appId>/reject` 200; nếu còn tích → `POST /api/emails` 201 (mẫu tag `auto_send`) → mail **"[SHINHANBANK] Application result for <tên kế hoạch> position"** gửi ứng viên (ở đây = hộp thư QA). Bỏ tích → chỉ có PATCH reject, **không có mail**.
- Checkbox là `button.ant-checkbox-wrapper` (dùng `.click()` trên wrapper; `uncheck()` của Playwright báo lỗi "did not change its state").
- Sau reject thẻ chỉ còn nút `Request for Additional Information`, **Re-in progress**, `Add`.
- **Chưa chạy `Blacklist`** (có thể đưa talent QA vào danh sách đen → mất khả năng dùng lại cho các lần test sau); chỉ đã chạy Not met requirements và Decline job.

**Khôi phục (Re-in progress)**: nút trên hồ sơ đã bị loại → modal "Do you want to bring this talent back to the **<tên vòng>** stage?" (`Filter CV` với hồ sơ bị loại ở vòng Application) → `OK` → `PATCH …/applications/<appId>/rebase` 200 → hồ sơ trở lại đúng vòng, hiện lại `Reject / Pass`. Ở vòng cuối HRIS cùng nút này cho "bring back to the Final Stage".

**Đánh giá phỏng vấn "Failed"** (kế hoạch thứ hai, làm trọn chuỗi bằng script): link phiếu `/evaluations/multiple/<mã>` → mở trang thì app tự gọi **`PATCH /evaluation-form-groups/by-code/<id>/start`** (200) — đây mới là chỗ "bắt đầu buổi phỏng vấn" — rồi chọn mức (mức 1 cho 4 tiêu chí), bấm **Failed**, ghi nhận xét, tích "final result", `Finish` → `PATCH …/end` 200. Kết quả: trạng thái buổi phỏng vấn trên thẻ = **Failed**; thẻ **vẫn còn** `Create Interview`, `Reject`, `Pass` (có thể tạo buổi phỏng vấn khác hoặc loại thủ công — hệ thống **không tự loại** khi Failed). Mail "Interview results have been confirmed" vẫn gửi.

**Đăng tin tuyển dụng** (`/recruitment-plans/<id>/publish/news`): nút **Post to job board** → modal "Post a job listing: <kế hoạch> (Maximum 1 job network/1 posting)": (1) **Select a posting platform** (ô chọn, gõ từ khoá hoặc chọn từ danh sách), (2) **Talent Pool** nhận ứng viên (mặc định `TA POOL`), nút `Post job`, ghi chú "Your job posting has been created. Please enable it to display on the website and allow talents to apply." (tin tạo xong phải **bật** mới hiện ra website). **Chưa bấm `Post job`** vì sẽ công khai tin lên cổng ứng viên thật.

**Sửa kế hoạch** (`/recruitment-plans/<id>/edit/initial`): trang giống wizard tạo kế hoạch với 5 mục (Recruitment information · Setup hiring stages · Background check · Competency Groups · Setup communication) và nút `Cancel` / `Save`; hiển thị Recruitment Request Code `[NI26114]`, "Recruitment Plans under this Request", Job title, Number of recruitment, Recruitment Method (Increase), Person in charge, **Recruitment Plan Start Method = Schedule manually**, Job Description. Các đường `edit/setting-begin|setting|contact|mission|valuation` đều mở cùng khung (bước nội dung khác nhau theo tab).

**Chưa học** (còn lại): `Blacklist` thật và ảnh hưởng tới talent; Reject tờ trình (`Reject` ở bảng duyệt); `Edit` bản nháp tờ trình; `Send onboarding email` (nút ở vòng 8); vòng Phỏng vấn 2 / BSTT UV 1 theo đường tuần tự (chưa thử `Meet expectation` thay `Special to offer`); `Post job` thật và ứng tuyển từ cổng; lưu thay đổi ở màn sửa kế hoạch; luồng "Convert candidates to employees" (`Create`).

## 12. Đọc code: khi nào phiếu đánh giá phỏng vấn được gửi (2026-10-11)

`apps/services/job-scheduler/src/schedules/schedules.service.ts` → `startSchedule()` (cron của service `job-scheduler`):
- Chuyển mọi `schedule` đang `pending` có `startTime ≤ now ≤ endTime` sang `happening`.
- Tìm `schedule-group` có `status: 'pending'` và **`startTime` trong khoảng [now, now + 30 phút]` → với mỗi nhóm gọi `createEvaluationForm` (tạo phiếu + gửi mail "Interview Evaluation Form" kèm link `/evaluations/multiple/<mã>`) rồi đặt nhóm `happening`.
- Hệ quả: **buổi phỏng vấn chỉ "tự bắt đầu" khi giờ bắt đầu nằm trong 30 phút tới.** Buổi hẹn xa hơn (vd khung rảnh gợi ý 08:30 hôm sau) **không phát phiếu** cho tới khi gần giờ; buổi có `startTime` đã qua (< now) cũng **không** được cron nhặt (điều kiện `$gte now`). Lần học trước "tự bắt đầu sau ~8 giây" chỉ vì giờ mặc định (làm tròn 5 phút tới) rơi trong 30 phút.
- Modal Create Interview mặc định giờ gần nhất; nếu **Clash** với buổi khác của người phỏng vấn (QA là người phỏng vấn của mọi buổi test), nút `Create` bị khoá và các "Nearest free slots" thường ở xa → không phát phiếu. Khi test liên tiếp, đợi các buổi cũ của QA kết thúc (mỗi buổi 1 giờ) hoặc dùng người phỏng vấn khác.
- Cron còn phụ thuộc `APP_SCHEDULE_RUNNER_ENABLED` (tenant setting); trên staging đang chạy (đã quan sát tự bắt đầu).

## 13. Form bổ sung thông tin trên cổng có hai dạng (2026-10-11)

Lần học đầu (kế hoạch `NI26113001`) form `/extra-info/<mã>` chỉ có **15 mục bàn giao hồ sơ**. Với kế hoạch `NI26117001` cùng link dạng đó nhưng form là bản **đầy đủ "Thông tin 1/10 mục"**: (1) Thông tin chung (vị trí ứng tuyển, họ tên, giới tính*, ngày sinh*, nơi sinh*, điện thoại*, email*, ảnh), (2) Thông tin cá nhân (CCCD*, ngày cấp*, nơi cấp*, CCCD cũ, tình trạng hôn nhân*, địa chỉ thường trú* và tạm trú* theo Tỉnh/Phường/Địa chỉ, chiều cao/cân nặng/nhóm máu/sức khoẻ), (3) Gia đình (thêm thành viên), (4) Người liên hệ khẩn cấp* (họ tên, SĐT, quan hệ), (5) Kinh nghiệm làm việc* (công ty, chức vụ, ngày bắt đầu/kết thúc, người tham chiếu, lương, lý do nghỉ), (6) Học vấn* (trường, bậc học, chuyên ngành, ngày, xếp loại), (7) Đào tạo ngắn hạn, … rồi tới các mục bàn giao hồ sơ. Nhiều ô bắt buộc là ô chọn (nơi sinh, nơi cấp, tỉnh/phường…). **Chưa tự động hoá được** — `flows/offer.ts › additionalInfo` mới điền được dạng 15 mục; dạng đầy đủ cần dò từng ô chọn.

**Form cổng bổ sung thông tin — bắt buộc tải ảnh**: mục 1 "Thông tin chung" phải có ảnh chân dung (dropzone `input[type=file]`, nút "Xoá" hiện khi đã có) thì bộ đếm mới đủ 25/25 và "Xác nhận gửi" mới bật. Flow dùng `fixtures/qa-photo.png`. Sau Pass "Special" (BSTT UV 2 → Kiểm tra thông tin) UI cần tải lại trang mới hiện nút **Pass all items**.

**Menu trái (sidebar `nz-sider`)**: mặc định thu gọn (102px, chỉ biểu tượng nhóm: Recruitments / Talents / Competency Evaluations / Customizations / Statistics). Mục con (vd Recruitment Requests, Recruitment Plans, Manage Tasks) **chỉ có trong DOM khi di chuột vào biểu tượng nhóm** — hiện ở lớp phủ `.ant-menu-submenu-popup`, không nằm trong sider. Khi mở rộng (nút `.trigger-button`, nằm ngoài sider) thì nhóm là accordion, bấm tiêu đề để mở. Quay/chạy lại thao tác (web/qa-lib.mjs) ghi nhớ nhóm của mục con và tự hover đúng nhóm rồi bấm, không cần mở rộng menu.

**Ô chọn (nz-select) nạp dữ liệu sau khi mở**: mở ô chọn thì danh sách hiện "No Data" + biểu tượng quay rồi mới có mục → phải chờ có mục mới chọn. Danh sách dài là virtual-scroll (`cdk-virtual-scroll-viewport`): mục chỉ có trong DOM khi cuộn tới; tìm mục bằng cách cuộn từng đoạn tới khi thấy. Chọn dữ liệu là THAM SỐ (có thể đổi sang mục khác hoặc lấy mục đầu tiên), không phải giá trị cố định.

**Điền form bổ sung thông tin bằng dữ liệu giống thật** (`flows/fake-person.ts`): mỗi lần chạy sinh một hồ sơ nhất quán (tên Việt, CCCD đúng cấu trúc theo tỉnh/giới/năm sinh, SĐT đầu số thật, địa chỉ Hà Nội, trường/ngành, công ty/chức vụ, lương 15–35 triệu, người thân, điểm mạnh/yếu…). Ràng buộc form được giữ: ngày cấp CCCD cũ trước CCCD mới, số người con ≤ 20, SĐT 10 số bắt đầu 0, ngày kết thúc sau ngày bắt đầu, ngày có thể đi làm ở tương lai. Email luôn là hộp thư QA. Ô chọn ưu tiên theo nhãn (Tỉnh = Hà Nội, giới tính khớp hồ sơ, trình độ = Đại học…), không có thì lấy mục đầu.
