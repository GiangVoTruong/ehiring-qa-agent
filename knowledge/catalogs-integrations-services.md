---
flow: catalogs-integrations-services
learnedCommit: 3ebed5507
learnedAt: 2026-10-22
tenant: shinhanbank (staging)
status: học từ code + seed (chưa xem UI); CHƯA có flow/test
sources:
  - apps/competencies/backend/src/app/{competencies,competency-groups}/*, apps/job-descriptions, apps/websites
  - apps/integration/backend/src/*, data/mongo/data/stg/shinhanbank/{integration-templates,integrations}.yaml
  - apps/services/{job-scheduler,email-scheduler,integration-scheduler,receive-email,dashboard-scheduler,mailer,...}
---

# Danh mục, tích hợp ngoài, dịch vụ nền

## 1. Danh mục dùng chung (trang Customizations / Competency)

| Danh mục | Route API | Quy tắc đã biết |
| --- | --- | --- |
| **Competency** (tiêu chí đánh giá) | `competencies` | Bắt buộc `name`, `type ∈ {Skill, Attitude, Knowledge}`; có câu hỏi + cấp độ. **Không xoá được tiêu chí đang dùng trong một nhóm** (`Không thể xoá vì tiêu chí đang được sử dụng!` — tìm trong `competencyTeam.competencyContent.competencies` của tenant) |
| **Competency group** (bộ tiêu chí) | `competency-groups` | Bắt buộc `code`, `name`; `code` **tự sinh 8 ký tự** nếu không gửi khi sửa/thay thế. Cấu trúc `competencyTeam[] → competencyContent[] → competencies` kèm `expectedPoint`/`point`. Gắn vào kế hoạch ở bước "Competency Groups" (`competencyGroupRef`) |
| **Job description** | `job-descriptions` | Bắt buộc `title`; nội dung theo `sections[]` (Mô tả công việc / Yêu cầu / Quyền lợi). Kế hoạch **bắt buộc chọn JD** |
| **Website** | `websites` (+ `masterdata/manage/websites`) | Cấu hình site tuyển dụng công khai: domain(s), banner, cấu trúc trang, `defaultPool`. Danh sách kèm `talentCount`, `planCount`. Portal chọn website theo hostname; kế hoạch hiện ở portal khi `websites` chứa website đó |
| **Mail template** | `mail-templates` | Mẫu mail theo tenant (`code`, `private`); seed shinhanbank chỉ có ~10 mẫu (xem `tenant-config-and-notifications.md`) |
| **Form template / dynamic form / forms-fields** | `form-templates`, `dynamic-forms`, `masterdata/manage/forms-fields` | Cấu hình form động (YCTD, kế hoạch, talent portal…); đã dùng làm nguồn trường bắt buộc |
| **Masterdata** | `masterdata`, `masterdata/manage/*` | Danh mục dùng ở ô chọn (phòng họp, địa điểm phỏng vấn, nơi làm việc, trình độ, ngân hàng…) |
| **Configuration** | `configuration`, `masterdata/manage/configurations` | Cấu hình JSONata (mã YCTD, form offer, vòng mặc định…); có mã `AUTO_CLOSE_ON_QUOTA` (bật/tắt đóng tự động theo số lượng, xem mục 2) |

Điểm chung: CRUD khai báo (`@peoplex/crud`), xoá mềm, giới hạn `tenant`; thấy bản ghi của tenant mình **hoặc** bản không có `tenant` (dùng chung toàn hệ thống).

## 2. Tích hợp ngoài (`apps/integration`, `external-interaction`, `webhook`)

- **Mẫu tích hợp** (`integration-templates`, cấu hình trong DB, gọi qua `POST /integration-templates/:code`): shinhanbank có `boundary` (định biên — **đã dùng khi tạo YCTD**, trả `lsLevel1..5Code`, `t<tháng>`, `aM<tháng>`), `VNW_*` (**VietnamWorks**: lấy refresh token, đồng bộ hồ sơ/trạng thái), `BASE_*` (Base Hiring: đồng bộ ứng viên, pool, kế hoạch).
- **Tiến trình tích hợp** (`integrations`): `IntegrationStatusEnum`: `pending` → `in_progress` → `passed` | `failed` | `error` | `sent`. `integration-scheduler` quét và chạy (có runner riêng cho **gửi offer** `APP_OFFER_SENDER_*`, **masterdata** `APP_MASTERDATA_SENDER_*`, **đồng bộ talent** `EHIRING_SYNC_TALENT_*`, **webhook** `APP_WEBHOOK_SYNCHRONIZE_*`).
- **Check-list chuyển ứng viên iHRP** (`ihrp-plan`, template `250826000000000000000001` trong seed `data/mongo/data/stg/shinhanbank/check-list-templates.yaml`; spec: `check-list-templates.employee-info.spec.ts`, `check-list-templates.ihrp.spec.ts`):
  - Body: `dob` và `cccd` lấy từ `talent.basics.dob` và `talent.ids` (type `cccd`), **không** lấy từ `advancedInfo`; mã ứng viên `MaUngVien` = `talent.ids` type `code`.
  - `EmpCode` lấy từ Staff ID nhập ở form cuối (`metaData` `finalForm`), **không** lấy từ offer; form cuối trống thì `EmpCode` rỗng.
  - `DienThoai` lấy từ `basics.landline`; người liên hệ khẩn cấp lấy `emergencyContact[0]`; `StartDate` lấy từ offer; `BasicSalary` lấy từ approver cuối.
  - Kết quả: `code='1'` → `status: passed` + `isUpdateApplication: true`; code khác → `failed`, không đụng application.
- **Đóng theo số lượng sau check-list** (`EmploymentQuotaService`, `employment-quota.service.ts`; spec: `employment-quota.service.spec.ts`, `employment-quota.schema.spec.ts`, `check-list.employment.spec.ts`):
  - Chỉ xử lý khi kết quả `passed` + `isUpdateApplication`. Đặt `application.isEmployee = true` **luôn**, không phụ thuộc cấu hình.
  - Chỉ đóng tự động khi tenant có config `AUTO_CLOSE_ON_QUOTA` với `value.enabled = true`. Config không có `tenant` không được tính.
  - Kế hoạch chưa `finish`, có `quantity`, và số `isEmployee` trong kế hoạch ≥ `quantity` → đóng kế hoạch (lý do `Đã đủ số lượng ứng viên`, source `quota`). Chỉ gửi mail `RecruitmentPlanFinished` khi đóng thành công. Kế hoạch không có `quantity` → không đóng, log warn.
  - YCTD đang mở (`statusCO` = open) có `content.quantity` và tổng `isEmployee` trên **mọi** kế hoạch của YCTD ≥ `quantity` → đóng YCTD. Vẫn kiểm tra YCTD khi đóng kế hoạch bị lỗi.
  - Lỗi trong bước này chỉ được log, không làm hỏng luồng check-list.
- `integration/*` là cổng **nhận** dữ liệu từ hệ thống ngoài: `integration/recruitments`, `integration/applications`, `integration/offers` (+ `multiple-offers`), `integration/users` (đồng bộ người dùng từ HRIS), `integrations/voffice` (ký/duyệt điện tử).
- **iHRP** (hệ thống nhân sự) đang **tắt** trên staging (`EHIRING_INTEGRATION_IHRP_*` bị comment trong `tenant-settings.yaml`); Talent Network (`api.talentnetwork.vn`) cấu hình có khoá (không ghi lại ở đây).
- Tạo YCTD với `approvedType='online'` chạy tích hợp `recruitment-request` — seed shinhanbank **không có** template này (xem `recruitment-requests.md`). Tạo offer chạy tích hợp offer (`handleOfferIntegration`).
- Đóng kế hoạch gỡ tin ngoài qua `RecruitmentPlanCloseService` → `POST {integration.internal_url}/integration-templates/:code` (VNW). Kế hoạch test **không có tin ngoài** nên bước này không có tác dụng.

## 3. Dịch vụ nền (`apps/services/*`) — không có giao diện

| Dịch vụ | Việc làm | Bật bằng | Ghi chú rủi ro |
| --- | --- | --- | --- |
| `job-scheduler` | **recruitmentPlanRunner**: tự **bắt đầu** kế hoạch `is-scheduled` có `startDate` hôm nay (UTC), tự **đóng** kế hoạch `in-progress`/`pending` có `endDate` ≤ hôm nay (UTC). **removeApplicationRunner**: **xoá cứng** mọi hồ sơ `pending-update-info` tạo hơn 1 ngày. **scheduleRunner**, **checkListRunner** (chạy lại checklist API lỗi; kết quả đi qua `EmploymentQuotaService`, xem mục 2), **webhookRunner** | `APP_<X>_RUNNER_ENABLED` / `_INTERVAL` | `APP_SCHEDULE_RUNNER_ENABLED='false'` ở seed staging → cron lịch có thể tắt |
| `job-scheduler` — worker merge file (`merge-file-job`) | Worker gộp file, gọi `EXPORT_SERVICE`, có đọc `Offer` (log `Merge file worker started`) | `config.component_config.merge_file_job: true` trên tenant (`tenants.yaml`); env `MERGE_FILE_JOB_WORKER_ENABLED` ghi đè khi đặt (`true`/`false`) | Thiếu cấu hình thì worker tắt |
| `email-scheduler` | Gửi mail định kỳ: `send-email-birthday-talent`, `send-email-new-year-talent` (**tới mọi talent có tag `send-email-recruitment`**). **Mail kẹt**: mail `SENDING` quá `timeout` giây (boot `emailSender`) → `PENDING` có `retryAt` nếu còn lượt, hết `error_count` thì `FAILED`. Trước khi quét mail kẹt, `runScheduleMail` đợi `scheduleMailEvent` xong | `APP_EMAIL_SENDER_INTERVAL` | ⚠️ chỉ talent tự đăng ký nhận mail |
| `mailer` | Gửi mail thật (SMTP) từ hàng đợi; có `MAILER_ROUTING_ENABLED` | — | Cổng ra duy nhất của mọi mail |
| `receive-email` | Nhận mail đến (vd phản hồi) theo `APP_RECEIVE_EMAIL_RUNNER_INTERVAL` | | |
| `integration-scheduler` / `integration-sender` / `integration-adapter` | Chạy tích hợp: gửi offer, đồng bộ masterdata/talent/webhook | xem trên | Gọi ra ngoài |
| `notifications` | Xử lý sự kiện thông báo → mail + trong app theo `NOTIFICATION_POLICY` | | |
| `dashboard-scheduler`, `metrics`, `export` | Số liệu dashboard, xuất file (`dynamicExport`), metrics | | |
| `cv-parser`, `ai-cv-parser`, `smc-cv-parser`, `embedding`, `gpt`, `azure-gpt` | Phân tích CV, embedding, GPT | | Gọi dịch vụ AI ngoài — có thể tốn phí |

## Đã đổi theo commit mới

- 2026-10-22 · 3ebed5507 · email-scheduler: `getMailTimeouts` trước lọc `updatedAt ≤ now + timeout` (ngược dấu, có thể lấy cả mail đang gửi); nay chỉ lấy mail `SENDING` cũ hơn `timeout` giây và xử lý qua `markFailedOrRetry` (PENDING + `retryAt`, hoặc FAILED khi hết lượt). `runScheduleMail` nay `await scheduleMailEvent()`. Nguồn: `apps/services/email-scheduler/src/app/app.service.ts`.
- 2026-10-22 · 3ebed5507 · job-scheduler: `CheckListService.updateApplication` (đặt `isEmployee`, trước chỉ chạy ở nhánh cron) đã xoá; thay bằng `EmploymentQuotaService.applyCheckListResult`, gọi từ cả nhánh NATS (`check-list-template.service.ts`) và cron (`check-list.service.ts`). Nguồn: `check-list.service.ts`, `check-list-template.service.ts`, `employment-quota.service.ts`.
- 2026-10-22 · 3ebed5507 · job-scheduler: mới có đóng kế hoạch/YCTD tự động khi đủ số lượng, chỉ khi config `AUTO_CLOSE_ON_QUOTA` bật. Nguồn: `employment-quota.service.ts`, `check-list.module.ts`.
- 2026-10-22 · 3ebed5507 · merge-file-job: worker bật theo tenant config `component_config.merge_file_job`; env `MERGE_FILE_JOB_WORKER_ENABLED` nay chỉ ghi đè khi được đặt (trước: mặc định `false`). Nguồn: `merge-file-job/README.md`, `merge-file-job.module.ts`.

## Điểm chưa chắc

- [ ] UI các trang danh mục: `/competencies`, `/competency-groups`, `/job-descriptions`, `/website-configurations`, `/masterdata`, `/email-templates`, `/portal-configs` — chưa xem.
- [ ] Runner nào đang bật trên staging (env `APP_*_ENABLED` không có trong repo) — quyết định liệu test "kế hoạch tự bắt đầu/đóng theo ngày" có chạy được.
- [ ] `removeApplicationRunner`: hồ sơ `pending-update-info` (tạo bởi `createByTalent`, chờ ứng viên điền) bị **xoá cứng** sau 1 ngày — nếu job bật; ảnh hưởng thế nào đến talent đã tạo, mail đã gửi.
- [ ] Danh mục competency/JD/website: trường bắt buộc & ràng buộc xoá của JD và website (JD đang dùng trong kế hoạch có xoá được không? — code `job-descriptions.service` chỉ 17 dòng, không kiểm).
- [ ] `mailer`: nơi mail thực sự ra ngoài; staging dùng SMTP thật hay bắt mail (mailhog)? — **quyết định rủi ro mail**.
- [ ] `AUTO_CLOSE_ON_QUOTA` có được bật cho tenant shinhanbank staging không; seed không có trong diff, spec chỉ mock — nguồn đã xem: `employment-quota.service.spec.ts`, `employment-quota.schema.spec.ts`.
- [ ] Check-list `ihrp-plan` có chạy trên staging không, khi iHRP đang tắt (`EHIRING_INTEGRATION_IHRP_*` bị comment) nhưng template vẫn có trong seed — nguồn đã xem: `check-list.module.spec.ts`, `check-list-templates.employee-info.spec.ts` (đều dùng dữ liệu giả).
- [ ] `merge_file_job` có đang bật trên tenant shinhanbank staging không (`tenants.yaml` không có trong diff) — nguồn đã xem: `merge-file-job/README.md`.
- [ ] Giá trị `emailSender` (`timeout`, `error_count`) trên staging; spec dùng 300 giây và 3 lượt — nguồn đã xem: `app.service.spec.ts`.
- [ ] 37 file đổi trong 3ebed5507 chưa được học (không có trong diff gửi kèm); quy tắc liên quan đến các file đó có thể còn thiếu.

## Nghi bug

- 2026-10-11 · (code, chưa có spec) · Xoá **job description** / **website** đang được kế hoạch tham chiếu không bị chặn (khác competency có chặn "đang được sử dụng"): `job-descriptions.service` không kiểm tham chiếu; `websites` chưa thấy kiểm `planCount`. Cần kiểm trên UI.
- 2026-10-11 · (code, chưa có spec) · `removeUnusedApplication` dùng `deleteOne` (xoá cứng, không soft-delete như phần còn lại) và không xoá các tài liệu liên quan (checklist, extra-info, talent) ⇒ rác mồ côi.