---
flow: offers-and-onboarding
learnedCommit: aa1fe551a
learnedAt: 2026-10-11
tenant: shinhanbank (staging)
status: học từ code (chưa xem UI); CHƯA có flow/test
sources:
  - apps/recruitment/backend/src/app/offer/offer.{service,controller}.ts
  - apps/recruitment/backend/src/app/offer-group/offer-group.{service,controller}.ts
  - apps/recruitment/backend/src/app/talent-extra-info/talent-extra-info.service.ts
  - apps/recruitment/backend/src/app/talent-advanced-info/talent-advanced-info.service.ts
  - apps/recruitment/backend/src/app/check-list/check-list.service.ts
  - libs/models/src/{offer,offer-group,check-list,check-list-template,talent-extra-info}/*.vm.ts
---

# Offer, bổ sung thông tin ứng viên (TalentUpdating), checklist, vòng cuối

Các vòng sau phỏng vấn của một application: **TalentUpdating** (ứng viên bổ sung thông tin) → **Offer** → **ContractSigning** → **CheckList** → **Final**.

## Offer

- `OfferStatus`: `draft` · `creating` · `created` · `submitting` → `submitted` · `sending` · `signed` · `signed-and-published` · `approved` · `rejected` · `job-accepted` · `job-not-accepted` · `cancelling` → `cancelled` · lỗi `submit-error` / `merge-error`. Phản hồi ứng viên: `talent-approved` / `talent-rejected` / `none`.
- `OfferGroupStatus`: `Created` · `Submitting` · `Submitted` — nhóm offer theo kế hoạch.
- **Cây duyệt (`approverTree`)**: mỗi người trong `assignTo` của vòng `Other` (Offer) của kế hoạch là một cấp, trạng thái đầu `pending`; duyệt **tuần tự** như YCTD.

| Thao tác | API | Luật | Tác dụng phụ |
| --- | --- | --- | --- |
| Tạo offer | `POST /applications/:applicationId/offers/config` `{hasDraft?, extra?…}` | Nội dung sinh từ cấu hình JSONata `TRANSFORM_OFFER_FORM` (hoặc `transformCode` của vòng). `hasDraft` → `draft`; có job gộp file → `creating` | Không phải draft: chạy **tích hợp offer** (hệ thống ngoài, `handleOfferIntegration`) và tạo `offer-group`; thông báo duyệt |
| Gửi duyệt | `PATCH /offers/:id/submit` | — | |
| Sửa nội dung | `PATCH /offers/:id/update-content` | — | |
| Duyệt | `PATCH /offers/:id/approve` | Có node `pending` (`No pending approval found`); ghi nguyên tử theo ô `approverTree.i.status` (hai người cùng duyệt → người sau `Approval has already been processed by another user`) | Cấp giữa: thông báo `OFFER_APPROVER` cho cấp kế. **Cấp cuối** → `status=approved`, thông báo `OFFER_CREATED` (hoàn tất) cho người phụ trách kế hoạch; nếu tenant **tự gửi thư offer** (mặc định) → gửi **thư offer cho ứng viên** + thông báo nội bộ `OFFER_LETTER_NOTIFY` |
| Từ chối | `PATCH /offers/:id/reject` | như duyệt | `status=rejected`; thông báo hoàn tất |
| Gửi thư offer (thủ công) | `PATCH /offers/:id/send-offer-letter` | Chỉ khi tenant tắt `component_config.offer.action.auto_send_offer_letter` (=== `false`); offer phải `approved`; chưa gửi (`offerLetterSentAt`) | Thư offer cho **ứng viên** + thông báo nội bộ. Chống gửi trùng nguyên tử |
| TA xử lý | `PATCH /offers/:id/action-by-talent-acquisition` `{action,note}` | Thiếu `action` → `Action is required`; `APPROVED` bỏ qua cây duyệt | `approved` → **gửi thư offer cho ứng viên** (+ tách file lương `split-offer` nếu có `fileSalary`); khác → `rejected` |
| Huỷ | `PATCH /offers/:id/cancel` | — | `cancelling` rồi gọi tích hợp huỷ offer |
| Chạy lại tích hợp | `POST /offers/:id/process-integration` | — | Gọi hệ thống ngoài |

- Cờ tenant quan trọng: `auto_send_offer_letter`. Mặc định của code là **tự gửi** khi duyệt xong cấp cuối, nhưng **seed shinhanbank đặt `false`** (xem `tenant-config-and-notifications.md`) ⇒ shinhanbank gửi **thủ công** bằng `send-offer-letter`; duyệt xong cấp cuối **không** gửi thư. Riêng `action-by-talent-acquisition` (APPROVED) **luôn gửi** thư offer, không kiểm cờ.
- Mail/thông báo liên quan: `OFFER_CREATED`, `OFFER_APPROVER`, `OFFER_LETTER` (cho ứng viên), `OFFER_LETTER_RESPONSE`, `OFFER_LETTER_NOTIFY`, `OFFER_SIGNED_AND_PUBLISHED`. Seed shinhanbank **có** template `OfferCreated`, `OfferApprover`, `OfferLetter`, `OfferLetterResponse`, `OfferLetterNotify` (đây là luồng ít bị thiếu template nhất).

## Bổ sung thông tin ứng viên (TalentUpdating / extra-info)

- Ứng viên điền thông tin ở **portal** (form `portal-talent-extra-info`), dữ liệu lưu theo **section** (`basics`, `education`, `experience`, `skills`, `training-course`, …) vào `talent-extra-info` gắn application.
- `TalentExtraInfoStatus`: `pending` · `approved` · `rejected` — mỗi section; người duyệt (cán bộ TA) review từng **card** của form.
- `POST /applications/:id/talent-extra-info/status` (mảng `{id,status,note}`): cần quyền vòng; **section đã `approved` không được đổi** (`assertApprovedSectionsUntouched`); có section `rejected` → application quay về cập nhật + **gửi lại mail yêu cầu bổ sung cho ứng viên** (`RESEND_TALENT_ADVANCED_INFO`). Cờ tenant `ACCEPT_INFO_OVERRIDE_BASICS=true` → duyệt section `basics` **ghi đè thông tin cơ bản của talent**.
- `POST /applications/:id/talent-extra-info/onboarding-email`: gửi **hai mail** `TALENT_INFO_APPROVED_MANAGER` + `TALENT_INFO_APPROVED_ONBOARDING` **một lần** (`onboardingEmailSentAt`); từ chối nếu thông tin bị reject (`TALENT_ONBOARDING_EMAIL_REJECTED`) hoặc chưa tới vòng (`..._STAGE_NOT_REACHED`).
- `talent-advanced-info`: dữ liệu thông tin nâng cao ứng viên đã điền (link gửi bằng `TALENT_ADVANCED_INFO`).

## Checklist (và ký hợp đồng / vòng cuối)

- `CheckListStatusEnum`: `pending` · `in_progress` · `passed` · `failed` · `error` · `sent`; loại mẫu `API` / `MANUAL` / `ALL`; lịch `SCHEDULE` / `DEFAULT` / `UPDATE`. Mẫu checklist mặc định (`DEFAULT`) được gắn vào **mọi kế hoạch khi tạo**.
- Checklist loại `API` gọi hệ thống ngoài (`callApi`, `syncData`, `syncLMS`, `sendDocument`) theo cấu hình mẫu; `MANUAL` do người duyệt đánh dấu. Tenant bật `STRICT_CHECK_LIST` ⇒ chuyển vòng yêu cầu mọi checklist của vòng `passed`.
- Vòng **Final**: khi rời vòng cuối tạo checklist `ams` (gửi hồ sơ sang hệ thống nhân sự ngoài); `notifyApplicationSentToEmployer` thông báo cho **người phụ trách kế hoạch** (`APPLICATION_TO_EMPLOYER`) — lỗi ném nếu kế hoạch **không có người phụ trách**.

## Điểm chưa chắc

- [ ] UI: màn Offer (`/offers`), tạo offer (form nào, trường bắt buộc), duyệt offer, màn bổ sung thông tin (`/talent-updating`), ký hợp đồng (`/contract-signing`), checklist (`/checklist`), vòng cuối (`/final`) — **chưa xem**.
- [ ] Giá trị thật của `auto_send_offer_letter` và `STRICT_CHECK_LIST`, `ACCEPT_INFO_OVERRIDE_BASICS` trên tenant shinhanbank staging (đọc ở `tenant-settings.yaml`/DB).
- [ ] Tạo offer gọi **tích hợp ngoài** (`handleOfferIntegration`): staging có endpoint thật không, lỗi thì offer ở `submit-error`? Có gửi gì ra ngoài không?
- [ ] `action-by-talent-acquisition` với `APPROVED` **bỏ qua cây duyệt** và gửi thư offer cho ứng viên — không kiểm offer đã `submitted`/quyền TA?
- [ ] `cancelOffer` không kiểm trạng thái nguồn (đã `signed-and-published`, `cancelled`?).
- [ ] ContractSigning: luật riêng (route `/contract-signing`), liên quan tích hợp ký điện tử — chưa đọc.
- [ ] Mẫu mail ứng viên (offer letter, TalentAdvancedInfo, onboarding): nội dung & autoSend theo kế hoạch.

## Nghi bug

- 2026-10-11 · (code, chưa có spec) · `handleActionByTalentAcquisition` nhánh `APPROVED`: `if (!offer?.content?.fileSalary) return;` trả `undefined` (không `rs`) cho offer **không có file lương** → API trả body rỗng dù đã cập nhật; chỉ offer có `fileSalary` mới trả `rs`. Hành vi trả về không nhất quán.
- 2026-10-11 · (code, chưa có spec) · `approve` cấp cuối khi offer **không còn node pending** ném 400 nhưng `approve` trên offer `rejected`/`cancelled` mà còn node pending (ví dụ từ chối bởi TA rồi cấp sau vẫn `pending`) vẫn ghi được `status=approved` — backend không kiểm `status` offer trước khi duyệt (cùng họ nghi bug YCTD đã huỷ vẫn duyệt được).
