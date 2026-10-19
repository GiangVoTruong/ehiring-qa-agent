# AI Testing Agent: quay thao tác → học nghiệp vụ → chạy lại

Mục tiêu: tester không cần biết nghiệp vụ, chỉ cần **thao tác thật**; hệ thống ghi lại, tách *điều quan sát được* khỏi *giả thuyết*, lưu thành flow có phiên bản và chạy lại để kiểm thử.

## 1. Hiện trạng repo (đã có trước khi làm phần này)

| Có sẵn | Dùng lại thế nào |
| --- | --- |
| `flows/`, `tests/`, `knowledge/` (3 lớp) | Giữ nguyên. Bản quay không thay thế flow viết tay; bổ sung cho luồng chưa có người viết. |
| Playwright + Chrome hệ thống, đăng nhập Keycloak, `.auth/` | Dùng chung cho quay và chạy lại. |
| `web/server.mjs` (Node http, port 4310), `web/index.html` | Thêm tab; không đổi stack. |
| `web/recorder.mjs`, `web/qa-lib.mjs`, `tests/custom/replay.spec.ts` | Nền của recording/replay (nay mở rộng). |
| Registry `[AUTOTEST]`, nút "Dọn dữ liệu test" | Giữ chính sách dữ liệu test. |

**Quyết định kiến trúc**: giữ Node + Playwright + một trang web nội bộ, **không** dựng Angular/NestJS/PostgreSQL riêng. Lý do: đây là công cụ nội bộ chạy trên máy tester; thêm 3 service sẽ tốn nhiều hơn giá trị. Bộ nhớ lâu dài dùng **SQLite có sẵn trong Node** (`node:sqlite`, file `data/qa.db`, không cài thêm). Lớp AI là hàm `ask(prompt, provider)` (Claude CLI hoặc Ollama) nên thay model không đụng phần còn lại. Khi cần nhiều người dùng chung, chỉ cần thay `web/store.mjs` bằng PostgreSQL (cùng schema).

## 2. Thành phần

| Thành phần | File | Việc |
| --- | --- | --- |
| Recording Service | `web/recorder.mjs`, `web/qa-lib.mjs` | Mở Chrome, ghi sự kiện + API ghi + thông báo + ảnh trạng thái form + ảnh màn hình; tạm dừng/tiếp tục; ghi chú |
| Analysis Service | `web/analysis.mjs` | Dữ kiện quan sát (máy), AI có schema + validator, test case dẫn xuất, tìm flow tương tự |
| Flow / Knowledge Store | `web/store.mjs` | flow, phiên bản, quy tắc + mức tin cậy, test case, câu hỏi, lượt chạy |
| Execution Service | `tests/custom/replay.spec.ts` | Chạy lại bằng Playwright, chụp ảnh từng bước, xác minh kết quả |
| Report Service | `web/runlib.mjs` + báo cáo trong tab "Quay & chạy lại" | Trạng thái, phân loại lỗi, đề xuất cập nhật |
| Nav Learner | `web/navmap.mjs` | Học đường vào trang bằng menu |
| API + điều phối | `web/server.mjs` (định tuyến), `web/services.mjs` (nghiệp vụ), `web/jobs.mjs` (chạy nền) | Một bảng định tuyến `METHOD /đường-dẫn → hàm` |
| UI | `web/index.html` | Quay & chạy lại · Luồng có sẵn |

## 3. Event schema (bản quay thô, `recordings/<id>.json`)

Mỗi sự kiện: `t` (ms), `type`, `url`, `ctx` (tên hộp thoại). Theo loại:

- `nav`: `path` (id đã thay `:id`), `shot`
- `click`: `text`, `tag`, `role`, `testid`, `aria`, `field`, `sel` (đường dẫn CSS), `nth`, `menu`/`menuGroup`/`menuToggle`/`siderCollapsed`, `dataChoice`/`dataField`, `shot`
- `input` / `file`: `field`, `value` (**`***` nếu trường nhạy cảm**: mật khẩu, token, OTP…), `secret`, `sel`, `nth`
- `scroll`: `sel`, `top`, `cname` · `key`: `key`
- `api`: `method`, `path`, `status` (chỉ POST/PUT/PATCH/DELETE) · `toast`: `kind`, `text`
- `snap`: ảnh chụp trạng thái form ~0,7s sau thao tác: `fields[{label,kind,required,disabled,filled}]`, `buttons[{text,disabled}]`, `errors[]`
- `note`: ghi chú của tester

Ảnh: `data/shots/<recId>/<n>.jpg`. Bước (`buildSteps`) gộp sự kiện thô: bỏ bấm vào ô nhập (chỉ giữ giá trị cuối), gộp Enter, cuộn đi-về-chỗ-cũ, chuyển hướng đăng nhập; gắn API/thông báo/ghi chú/`before`/`after` vào bước gây ra chúng.

**Locator** (thứ tự thử khi chạy lại, ghi `how` vào báo cáo): `data-testid` → chữ hiển thị (trong hộp thoại rồi cả trang) + thứ tự → `aria-label` → nhãn trường (form động) → đường dẫn CSS. Dùng đường dẫn CSS (cách cuối) thì bước bị đánh dấu **Needs review** và sinh đề xuất cập nhật. Không tìm được thì **dừng**, không bấm bừa.

## 4. Database schema (`web/store.mjs`)

`flows(id, name, module, url, description, signature, status draft|confirmed, current_version)` ·
`flow_versions(flow_id, version, state current|proposed|superseded|rejected, steps_json, expected_json, params_json, analysis_json, source_recording, note)` ·
`rules(flow_id, version, kind, statement, status Observed|Inferred|Needs verification|Confirmed, evidence_json, source)` ·
`test_cases(flow_id, kind, title, variant_json, expected, requires_permission, executable, note)` ·
`questions(flow_id, text, why, answer, state open|answered|skipped)` ·
`runs(id, flow_id, version, test_case_id, status, summary_json, params_json)` ·
`run_steps(run_id, idx, title, status Passed|Failed|Blocked|Needs review|Skipped, classification automation|business|policy, error, evidence_json)`.

`expected_json` = `{writes:[{method,path,status}], toasts:[{kind,text}]}` — **chỉ những gì quan sát được** trong bản quay.

## 5. AI chuyển bản quay thành flow thế nào

1. **Máy (miễn phí)** — `observeFacts`: so sánh `before`/`after` của từng bước → trường xuất hiện/biến mất, trường bị khoá/mở, nút Save mở/khoá, lỗi hiện ra, giá trị mặc định có sẵn, dấu hiệu bắt buộc (ký hiệu *), API ghi + mã HTTP, thông báo. Tất cả là **Observed**.
2. **AI (tuỳ chọn)** — prompt chứa các bước đã đánh số (đã `redact` email/SĐT/token/id), dữ kiện máy đã thấy, flow tương tự, tài liệu đã học. AI trả JSON theo schema: bước nghiệp vụ, quy tắc (`evidence` = chỉ số bước), câu hỏi, test case, tham số.
3. **`validateAnalysis`** ép kỷ luật: AI chỉ được `Inferred`/`Needs verification` (tự nhận `Observed`/`Confirmed` bị hạ); quy tắc không bằng chứng → `Needs verification`; bằng chứng trỏ bước không tồn tại bị loại; test case negative/boundary do AI đề xuất **không tự chạy** (`executable=false`, ghi "cần khám phá gì").
4. **Test case dẫn xuất** (`deriveTestCases`, chạy được): happy path, regression, "bỏ trống trường bắt buộc" (chỉ khi có dấu hiệu bắt buộc, trường đã được nhập **và bản quay có bước lưu**), "dữ liệu khác" cho mỗi bước chọn dữ liệu.
5. **Tái sử dụng**: `findSimilar` (cùng chữ ký API ghi hoặc tên gần giống) → lưu thành *phiên bản đề xuất* của flow cũ thay vì tạo trùng.
6. **`Confirmed`** chỉ có khi người dùng bấm xác nhận, hoặc test kiểm chứng "bỏ trống" chạy xong với kết quả rõ (không có lỗi automation) — xem `applyVerification`.

## 6. Chạy lại & tự cải thiện

- Điều kiện: có API ghi/test case thay đổi dữ liệu → bắt buộc tích "Tôi cho phép chạy trên môi trường test" (server từ chối nếu thiếu). Chỉ chạy được trên `*.stg.talentx.vn` / `*.stg.ehiring.com.vn`.
- Bước có chữ `Create employee / Convert candidates / Post job / Blacklist / Send onboarding email / Delete…` bị **Blocked**, các bước sau Blocked.
- Mỗi bước chụp ảnh; dữ liệu chọn là tham số (đổi hoặc lấy mục đầu tiên, tự cuộn danh sách dài); vào trang bằng menu như người dùng.
- **Xác minh kết quả thật** (`verifyExpected`): API ghi phải trả 2xx như bản quay; thông báo thành công phải xuất hiện. Thiếu/khác → `Failed` (nghiệp vụ) hoặc `Needs review`. Không có gì để đối chiếu → `Needs review`, **không** coi là Passed.
- Phân loại lỗi: `automation` (không thấy/bấm được phần tử) ≠ `business` (kết quả khác kỳ vọng) ≠ `policy` (bị chặn an toàn).
- Giao diện đổi nhưng vẫn chạy được (phải dùng đường dẫn CSS) → tạo **phiên bản đề xuất**, không ghi đè; không bao giờ sửa kỳ vọng cho khớp kết quả. Chấp nhận phiên bản = người dùng bấm.
- **Giới hạn nói rõ trong mỗi báo cáo**: chỉ xác minh qua phản hồi API và giao diện, không đọc database backend.

## 7. Kế hoạch theo giai đoạn

| Giai đoạn | Nội dung | Trạng thái |
| --- | --- | --- |
| 1. Recording | Ghi sự kiện, ảnh, tạm dừng/tiếp tục, ghi chú, che dữ liệu nhạy cảm | Xong |
| 2. AI Analysis | Dữ kiện quan sát, AI có schema + validator, test case, câu hỏi, lưu flow | Xong |
| 3. Replay | Chạy lại, xác minh kết quả, báo cáo pass/fail + ảnh | Xong |
| 4. Persistent learning | Phiên bản, flow tương tự, đề xuất cập nhật khi giao diện đổi, kiểm chứng quy tắc | Xong mức cơ bản (xem giới hạn) |

## 8. Chạy local

```bash
npm install
cp .env.example .env        # điền BASE_URL, QA_USERNAME, QA_PASSWORD
npm run web                 # mở http://127.0.0.1:4310
npm run test:unit           # 20 unit test (logic không cần trình duyệt)
```

## 9. Demo: học luồng tạo PATD

1. Tab **Quay & chạy lại** → đặt tên "Tạo PATD" → **Bắt đầu quay**. Chrome mở sẵn đã đăng nhập.
2. Làm như người dùng thường: vào danh sách, bấm tạo mới, chọn đơn vị/phòng ban/vị trí, nhập các trường, chọn người duyệt, lưu. Cần ghi chú thì gõ vào ô ghi chú; cần nghỉ thì **Tạm dừng** (thao tác lúc tạm dừng không được ghi).
3. **Dừng & lưu** → hệ thống tự phân tích (máy, miễn phí) và lưu thành luồng; đã có luồng giống thì hỏi cập nhật hay lưu mới. Muốn AI suy luận thêm: **🤖 Nhờ AI phân tích sâu**.
4. **Chi tiết** của luồng: các bước, dữ liệu chọn, điều đã học (*Observed* máy thấy · *Inferred*/*Needs verification* giả thuyết), câu hỏi, test case, phiên bản, lịch sử.
5. **▶ Chạy lại**: luồng ghi dữ liệu sẽ hỏi xác nhận cho phép chạy trên môi trường test. Báo cáo hiện ngay bên dưới ô quay; test case (vd bỏ trống một trường bắt buộc) chạy từ mục **Test case**.

## 10. Chưa làm / giới hạn

- Chỉ **quan sát được UI + phản hồi API**; không đọc backend nên chưa chứng minh dữ liệu lưu đúng.
- Mức "quy tắc phụ thuộc giữa các trường" chỉ có bằng chứng khi trường *xuất hiện/biến mất/bị khoá* sau thao tác; giá trị danh sách phụ thuộc (dropdown lọc theo đơn vị) chưa so sánh được nội dung option.
- Test **negative/boundary** do AI đề xuất chưa tự chạy được (cần biết giới hạn); mới chạy được "bỏ trống trường bắt buộc" và "dữ liệu khác".
- Ảnh màn hình là ảnh chụp trang: chỉ che dữ liệu bằng cơ chế của trình duyệt (ô mật khẩu); chưa làm mờ vùng chứa thông tin cá nhân khác.
- Chưa có hàng đợi/worker riêng: mỗi lúc chạy một lượt (như "Chạy luồng"); chưa chạy nhóm flow theo module.
- Chưa có khả năng ghi qua tab khác/ứng dụng ngoài Chrome do hệ thống mở (đúng chủ ý an toàn).
