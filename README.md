# ehiring-autotest — dự án này là gì?

**Mục đích:** một bộ công cụ để **kiểm thử tự động** web eHiring (`shinhanbank.stg.ehiring.com.vn`) và **ghi nhớ nghiệp vụ** của hệ thống thành tài liệu, để không phải đọc lại code hay test tay mỗi lần.

Nó **không sửa code eHiring** (repo `D:\CTY\SMC\ehiring` chỉ được đọc). Nó chỉ mở trình duyệt Chrome, đăng nhập bằng tài khoản QA `dev_shinhanbank`, rồi bấm/nhập giống người thật.

## Cài đặt nhanh

Cần Node.js ≥ 20 và Google Chrome (dùng Chrome hệ thống, không tải Chromium).

```bash
npm install
copy .env.example .env   # rồi điền BASE_URL, QA_USERNAME, QA_PASSWORD (và QA_TOTP_SECRET nếu Keycloak đòi OTP)
npm run test:unit        # kiểm tra nhanh, không mở web
npm test                 # chạy toàn bộ trên staging
```

## Bức tranh tổng thể (3 lớp)

```
 knowledge/   →  "SÁCH": nghiệp vụ đã học (trạng thái, luật, mail, trường form...)  — người đọc được
 flows/       →  "TAY":  các hàm thao tác trên web (tạo YCTD, duyệt, tạo kế hoạch...) — code
 tests/       →  "BÀI THI": kịch bản ghép các thao tác + kiểm tra kết quả đúng như sách
```

- Sách (`knowledge/`) là **nguồn sự thật**. Bài thi (`tests/`) kiểm tra web có chạy đúng như sách không.
- Test chạy lại được bất cứ lúc nào, **không cần AI**, bằng lệnh `npm test`.
- AI (Claude) chỉ dùng để **học nghiệp vụ** (viết sách), **viết/sửa test** khi cần.

## Thư mục có gì

| Thư mục / file | Là gì |
| --- | --- |
| `knowledge/*.md` | Tài liệu nghiệp vụ (xem bảng dưới) |
| `flows/` | Hàm thao tác web dùng lại: `recruitment-requests.ts` (YCTD), `recruitment-plans.ts` (kế hoạch), `applications.ts` (ứng viên), `offer.ts` (tờ trình/bổ sung thông tin), `common.ts` (tiện ích chung) |
| `tests/recruitment-requests/` | Test YCTD (6 kịch bản) |
| `tests/recruitment-plans/` | Test kế hoạch tuyển dụng (1 kịch bản dài) |
| `tests/auth.setup.ts` | Đăng nhập một lần cho cả bộ test |
| `tests/seed.spec.ts` | Test nhỏ "đã đăng nhập chưa" |
| `tests/custom/` | Chạy lại flow/quy trình do tester ghi từ web (`replay.spec.ts`, `procedure.spec.ts`) |
| `tests/unit/` | Test logic nhỏ (không mở web) |
| `tests/cleanup/` | **Dọn dữ liệu test** (chỉ chạy khi bạn gọi `npm run cleanup`) |
| `web/` | Web nội bộ (`npm run web`): `server.mjs` định tuyến HTTP · `services.mjs` quay→phân tích→flow→chạy lại · `jobs.mjs` chạy test nền · `procedure.mjs` quy trình tự soạn · `recorder.mjs`/`qa-lib.mjs` ghi thao tác · `analysis.mjs` phân tích · `store.mjs` SQLite · `runlib.mjs` xác minh kết quả · `ai.mjs` Claude/Ollama · `navmap.mjs` học đường đi qua menu · `cleanup-all.mjs` dọn dữ liệu test · `config.mjs` cấu hình chung (cổng, đường dẫn) · `ui/` giao diện mới (Overview · Record & Learn · Test Flows · Test Runs · AI Knowledge · Settings; thêm `?mock=1` để xem dữ liệu mẫu) · `index.html` giao diện cũ, mở ở `/classic` |
| `scripts/purge-test-emails.mongosh.js` | Script xoá hẳn mail test trong DB (bạn tự chạy) |
| `.claude/agents/` | 4 "trợ lý AI": `ehiring-learner` (học nghiệp vụ), `playwright-test-planner/generator/healer` (lập kế hoạch/viết/sửa test) |
| `CLAUDE.md` | **Luật cho AI** (an toàn dữ liệu, không sửa eHiring…) |
| `.env` | Tài khoản đăng nhập (không đưa lên git) |
| `.qa-registry.json` | Sổ ghi lại **mọi bản ghi test đã tạo** (để dọn sau) |
| `docs/ai/` | Hồ sơ dự án (yêu cầu, thiết kế, kế hoạch) — không đưa lên git |

## Tài liệu nghiệp vụ trong `knowledge/` — đọc theo thứ tự

1. `_overview.md` — **bắt đầu từ đây**: bản đồ toàn hệ thống eHiring và trạng thái học.
2. `recruitment-requests.md` — Yêu cầu tuyển dụng (YCTD) ✅ có test.
3. `recruitment-plans.md` — Kế hoạch tuyển dụng ✅ có test.
4. `applications.md`, `ui-walkthrough-applications.md` — Hồ sơ ứng viên, chuyển vòng (đã đi thật tới phỏng vấn).
5. `interviews.md`, `offers-and-onboarding.md`, `talents.md`, `portal.md`/`portal-ui.md`, `users-and-permissions.md` — các nhóm còn lại (mức đọc code, vài phần đã xem giao diện).
6. `tenant-config-and-notifications.md` — các cờ cấu hình và chính sách gửi mail.
7. `ui-map.md`, `ui-forms.md` — các trang và form: nhãn nút, trường bắt buộc.
8. `catalogs-integrations-services.md` — danh mục, tích hợp ngoài, dịch vụ nền.

Mỗi file có mục **"Điểm chưa chắc"** (việc chưa rõ) và **"Nghi bug"** (chỗ web có vẻ làm sai so với luật).

## Web đối chiếu luồng (cho tester)

Chạy `npm run web` rồi mở **http://127.0.0.1:4310** (chỉ truy cập được từ máy bạn).

> Lỗi `EADDRINUSE ... 4310`: web đã chạy sẵn (mở thẳng link trên) hoặc cổng bị tiến trình khác giữ. Tắt tiến trình cũ bằng `Get-NetTCPConnection -LocalPort 4310 | % { Stop-Process -Id $_.OwningProcess }` (PowerShell) hoặc đổi cổng: `set WEB_PORT=4311&& npm run web`.

1. Tester **dán URL** trang eHiring (chỉ nhận `*.stg.ehiring.com.vn`) và **mô tả luồng** bằng lời của mình.
2. Web mở trang bằng Chrome + tài khoản QA (**chỉ đọc**: mọi request ghi bị chặn) và đọc nút, cột bảng, trường nhập, ảnh chụp.
3. Web tự nhận diện **luồng cũ hay mới** (không dùng AI):
   - **Luồng cũ** (đã học sâu: YCTD, kế hoạch, ứng viên→phỏng vấn) → trả lời **từ tài liệu**, miễn phí, tức thì.
   - **Luồng mới / đã đổi / mới học nông** → hiện nút **Phân tích bằng AI** (Ollama miễn phí ~vài phút, hoặc Claude ~30 giây, ~0,1 USD).
4. AI nêu **khác gì luồng cũ** và đề xuất cập nhật. Bấm **Áp dụng vào tài liệu** để thêm mục vào `knowledge/*.md` (bản cũ sao lưu ở `knowledge/_history/`, ghi nhật ký `knowledge/_changes.md`) — lần sau luồng đó thành "luồng cũ".

Nhận diện "mới": route chưa thuộc luồng đã học sâu, hoặc >30% từ mô tả chưa có trong tài liệu, hoặc ≥4 nhãn trên trang (chiếm >25%) tài liệu chưa nhắc.

### Tab "Chạy luồng"

**Một nút "▶ Chạy full luồng"** chạy cả luồng tuyển dụng từ đầu đến cuối (11 bước: tạo YCTD → duyệt → tạo kế hoạch → bắt đầu / tạm dừng / tiếp tục / đóng / gia hạn → đóng YCTD). Các bước hiện sẵn trước khi chạy; khi chạy mỗi bước đổi ⏳ → ✓ / ✗ kèm thời gian. Tích **"Chạy kèm các nhánh"** để chạy thêm 6 kịch bản YCTD (từ chối, huỷ, đã huỷ không duyệt được, đóng/mở lại…). Sau khi chạy xong có kết quả xanh/đỏ, dòng lỗi (nếu đỏ), **danh sách dữ liệu `[AUTOTEST]` vừa tạo**, log chi tiết, và **lịch sử các lượt chạy**. Có nút **Dừng**, tuỳ chọn **hiện cửa sổ Chrome**, nút **Dọn dữ liệu test**. Mục "Nâng cao" cho chạy riêng từng kịch bản. Tên các bước lấy thẳng từ `test.step` trong `tests/recruitment-plans/lifecycle.spec.ts` — đổi tên ở spec là đổi trên web.

## Các lệnh dùng hằng ngày

```bash
npm test                 # chạy toàn bộ test trên staging (TẠO dữ liệu [AUTOTEST] thật)
npm run test:unit        # chỉ test logic nhỏ, không mở web
npm run report           # xem báo cáo HTML của lần chạy gần nhất
npm run web              # mở web đối chiếu luồng cho tester (http://127.0.0.1:4310)
npm run cleanup          # DỌN dữ liệu test: kế hoạch, YCTD, mail (xoá mềm)
npx playwright test tests/recruitment-requests   # chạy riêng một nhóm
```

Muốn **xem trình duyệt chạy**: `set SLOWMO=400&& npx playwright test --headed tests/recruitment-requests` (mặc định chạy ngầm).

## Quy tắc an toàn quan trọng

- **Staging dùng chung** với team: chỉ tạo/đụng dữ liệu có tiền tố **`[AUTOTEST]`**.
- Mọi người nhận mail trong test (người duyệt, người phỏng vấn, ứng viên giả) đều là **hộp thư QA** `dev_shinhanbank@shinhanbank.com` để không gửi mail cho người thật.
- Mỗi lần chạy test **tạo thêm dữ liệu** (YCTD, kế hoạch…) → chạy `npm run cleanup` để dọn. **Talent (ứng viên) không xoá được qua API**, nên hạn chế tạo thêm.
- Không chạy lệnh xoá trên DB nếu chưa chắc; script `purge-test-emails` mặc định chỉ đếm (dry-run).

## Đang ở đâu / còn gì

- ✅ Học xong: YCTD, kế hoạch (có test); các nhóm khác đã đọc code.
- 🟡 Đang học bằng thao tác thật: ứng viên → phỏng vấn → đánh giá → offer.
- ⬜ Chưa có test cho: ứng viên, phỏng vấn, offer, portal, danh mục, phân quyền.
- Mã nguồn: https://github.com/GiangVoTruong/ehiring-qa-agent (private, nhánh `feature-ehiring-qa-agent`).

## Quay thao tác → AI học → chạy lại

`npm run web` → tab **Ghi & học** / **Thư viện flow**. Tester tự thao tác, hệ thống ghi lại, phân tích (dữ kiện quan sát vs giả thuyết), lưu flow có phiên bản và chạy lại để kiểm thử. Kiến trúc, schema, quy trình AI, giới hạn: [docs/ai-testing-agent.md](docs/ai-testing-agent.md). Dữ liệu lưu ở `data/qa.db` (không commit).
