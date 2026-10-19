---
flow: tenant-config-and-notifications
learnedCommit: aa1fe551a
learnedAt: 2026-10-11
tenant: shinhanbank (staging)
status: học từ seed trong repo (data/mongo/data/stg/shinhanbank). Giá trị THẬT trong DB staging có thể khác — cần xác nhận
sources:
  - data/mongo/data/stg/shinhanbank/{tenants,tenant-settings,configurations,configurations.notifications,notification-events,mail-templates}.yaml
  - libs/models/src/tenant/tenant.vm.ts (TenantConfigMetaKey), libs/models/src/configuration/configuration.vm.ts (ConfigurationCode)
---

# Cấu hình tenant và chính sách thông báo (shinhanbank)

Hành vi của hệ thống do **cấu hình theo tenant** quyết định: `tenants.config.meta` (cờ bật/tắt), `tenants.config.component_config` (giao diện/luồng), `tenant-settings` (URL, khoá ngoài), `configurations` (JSONata: sinh mã, biến đổi form, cấu hình vòng mặc định), `NOTIFICATION_POLICY` (sự kiện → kênh → mẫu mail).

## Cờ ảnh hưởng nghiệp vụ (seed `tenants.yaml`)

| Cờ | Giá trị seed | Ý nghĩa / hệ quả |
| --- | --- | --- |
| `component_config.offer.action.auto_send_offer_letter` | **false** | **Thư offer KHÔNG tự gửi** khi duyệt xong; TA phải bấm "gửi thư offer" (`send-offer-letter`). An toàn cho test (không gửi ra ngoài khi duyệt) |
| `APPLICATION_NEXT_STEP_UPDATE_INFO` | true | Ứng viên bổ sung thông tin xong → **tự qua vòng** |
| `ACCEPT_INFO_OVERRIDE_BASICS` | true | Duyệt section `basics` của extra-info **ghi đè thông tin cơ bản của talent** |
| `FORCE_PUBLIC_APPLICATION` | true | Mọi application mới `isPublic=true` |
| `STRICT_CHECK_LIST` | (không đặt = false) | Chuyển vòng **không** bị chặn bởi checklist |
| `APPLICATION_NEXT_STEP_EVALUATION_FORM_ACCEPTED`, `SEND_EMAIL_APPLICATION_EVALUATION_FORM_ACCEPTED` | (không đặt = false) | Phiếu đạt **không** tự chuyển vòng bằng cờ này, và không gửi `PassTalent` tự động bằng đường này |
| `RECRUITMENT_REQUEST_APPROVAL_PROCESS` | true | YCTD có quy trình duyệt |
| `RESUME_AFTER_EVALUATION` | false | |
| `RECRUITMENT_PLAN_PUBLISH_WORK_NETWORK` / `..._INTERNAL_PAGE` | true / false | Đăng tin qua mạng việc làm (Vietnamworks), **không** có tab đăng tin nội bộ; chỉ nhóm `SYS_ADM`, `RECRUITMENT_ADM`, `RECRUITER`, `SYS_ADM_ROOT` được đăng |
| `REJECT_LIST` | `DISQUALIFIED`, `BLACKLIST`, `DECLINE_JOB` | Danh sách lý do từ chối hiện trên UI (không có `KEEP_IN_VIEW`/`OTHER`) |
| `component_config.recruitmentEntry` | `canRevertApplicationStatus`, `canRevertApplicationStage`: true | UI cho **mở lại hồ sơ (rebase)** và **quay lại vòng trước (previous)** |
| `component_config.schedule_create` | `checkConflict: true`, `previewMail: true`, `timeRange: 60`, trường **Phòng họp bắt buộc** (`meeting-room`, phụ thuộc `location`) | Tạo lịch kiểm trùng, xem trước mail, mặc định 60 phút; địa điểm `location-interview` |
| `component_config.talent_confirmation.send_approval_emails` | true | Vòng xác nhận ứng viên gửi mail duyệt |
| `component_config.recruitmentPlanInit` | `talentPoolDefaultName: pending-pool`; 5 bước wizard | Pool mặc định khi tạo ứng viên là `pending-pool`; các bước `initial → setting → mission → valuation → contact` |
| `LINK_INTERVIEW` | `https://meet.ehiring.vn/join/` | Link phỏng vấn online |
| `DEFAULT_LANGUAGE` | `en` | |
| `tenant-settings.EHIRING_TALENT_IDS_VALIDATE` | `or: [basics:phone, basics:email]` | **Kiểm trùng talent theo email HOẶC số điện thoại** |
| `tenant-settings.EHIRING_EMAIL_DISABLE_DEFAULT_CC` | true | Mail chỉ CC theo `content.cc` của mẫu, bỏ CC tự thêm |
| `tenant-settings.APP_SCHEDULE_RUNNER_ENABLED` | `'false'` | Cron lịch **tắt** trong seed staging (xem `recruitment-plans.md`: runner tự bắt đầu/kết thúc kế hoạch có thể không chạy) |
| `EHIRING_PORTAL_URL` | `https://tuyendung-shinhanbank.stg.ehiring.com.vn` | Portal ứng viên |

⚠️ Đây là **seed trong repo**; DB staging do người vận hành quản lý và có thể đã đổi. Cờ nào ảnh hưởng test thì phải kiểm trên staging (đọc `GET /api/tenants/config`, app tự gọi khi tải trang — dùng `component_config` thật).

## Chính sách thông báo (`NOTIFICATION_POLICY`)

Mỗi **sự kiện** có kênh (`email`, `inApp`) và mẫu mail (`templateCode`). Người nhận: `recipe` (quy tắc: `emailRecipients`, `explicit`, `approversOf`…) hoặc `from: data.recipients`.

| Nhóm | Sự kiện → kênh (mẫu) |
| --- | --- |
| **YCTD** | `recruitment-request.created` → email (RecruitmentRequestApprover) · `.pending-approval` → email (RecruitmentRequestApprover) · `.approval-completed` → email (RecruitmentRequestCreated) · `.approved-notify` → email (RecruitmentRequestNotify) |
| **Ứng viên / hồ sơ** | `application.advanced-info-requested` → email (TalentAdvancedInfo) · `application.extra-info-completed` → email (TalentInfoUpdated) · `application.sent-to-employer` → email (ApplicationToEmployer) · `application.portal-code-created` → email (CodeTalentPortal) · `application.verification-code-resent` → email (VerificationCode) · `application.portal-recruitment-submitted` / `..-campaign-submitted` → email (PortalRecruitment / PortalCampaign) · `application.evaluation-passed` → inApp+email (PassTalent) |
| **Offer** | `offer.pending-approval` (OfferApprover) · `offer.approval-completed` (OfferCreated) · `offer.letter-sent` (OfferLetter → **ứng viên**) · `offer.letter-notify` (OfferLetterNotify) · `offer.letter-response` (OfferLetterResponse) · `offer.signed-published` (OfferSignedAndPuslished) — đều email |
| **Lịch phỏng vấn** | `schedule.talent-invited/updated/cancelled` (ScheduleTalent / ScheduleChangeTalent / ScheduleCancelTalent) · `schedule.interviewer-invited/updated/cancelled` (ScheduleUser…) · bản `schedule-group.*` — đều **inApp + email** |
| **Phiếu đánh giá** | `evaluation-form.requested` (EvaluationForm), `evaluation-form-group.requested`, `...confirmation-requested` (chỉ inApp), `evaluation-form.interview-completed`, `...interview-approval-completed`, `...cv-approval-completed` và bản `-group` — inApp + email |

- Sự kiện **không có trong chính sách** thì không gửi qua đường sự kiện (vd **không thấy** sự kiện cho "thêm ứng viên vào kế hoạch" `APPLICATION_ADDED_NOTIFY_*` — đi đường mail handler cũ, cần template `private:true`; seed `mail-templates.yaml` shinhanbank **không có** template đó ⇒ **mail "thêm vào kế hoạch" có thể không gửi**, lỗi bị nuốt → xác nhận bằng cách đọc `emails/v2` sau khi thêm hồ sơ).
- Mẫu mail của sự kiện lấy theo `templateCode` — **không nhất thiết nằm trong `mail-templates.yaml`**; kho mẫu thông báo khác (`NOTIFICATION_TEXT`, 300 dòng trong `configurations.notifications.yaml`) — chưa đọc.
- Đã kiểm chứng trên staging (2026-10-10): 66 mail `[AUTOTEST]` trong `emails/v2`, toàn bộ tới hộp thư QA, loại: duyệt YCTD, hoàn tất, kế hoạch… (khớp chính sách).

## Điểm chưa chắc

- [ ] Giá trị thật các cờ trên staging DB (database `ehiring-tanlong-stg`, chứa mọi tenant) (đọc `tenants/config` qua UI để chốt `auto_send_offer_letter`, `STRICT_CHECK_LIST`, `APPLICATION_NEXT_STEP_*`).
- [ ] `APP_SCHEDULE_RUNNER_ENABLED=false` vs `recruitmentPlanRunner` (APP_RECRUITMENTPLAN_RUNNER_ENABLED): job tự bắt đầu/kết thúc kế hoạch có chạy trên staging không.
- [ ] Mail "thêm hồ sơ vào kế hoạch" có gửi không (thiếu template seed) — kiểm bằng `emails/v2` sau lần thêm đầu.
- [ ] `NOTIFICATION_TEXT` (nội dung thông báo trong app) — chưa đọc; `notification-events.yaml` chỉ có 2 sự kiện định kỳ (sinh nhật, năm mới → `send-email-*-talent`: **gửi mail hàng loạt tới ứng viên**; xem service `email-scheduler`).
- [ ] Danh sách recipe (`emailRecipients`, `explicit`, `approversOf`): định nghĩa ở đâu, `emailRecipients` lấy từ đâu.

## Nghi bug

- 2026-10-11 · (cấu hình, chưa kiểm) · `tenants.yaml` đặt `component_config.offer.action.auto_send_offer_letter: false` nhưng `NOTIFICATION_POLICY` vẫn có `offer.letter-sent` → email: nếu đường **`action-by-talent-acquisition` (APPROVED)** gửi thư offer **không kiểm cờ này** (đúng như code: gọi thẳng `notifyOfferLetterSent`), TA bấm duyệt theo đường đó sẽ gửi thư offer ra **ngay cả khi tenant cấu hình gửi thủ công** — hai đường gửi hành xử khác nhau.
