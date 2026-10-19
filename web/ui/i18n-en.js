// Từ điển Việt → Anh (EN_EXACT, EN_PATTERNS) và nhãn Anh → Việt (VI_LABELS, VI_PATTERNS) cho i18n.js.
// Chữ không có trong từ điển được giữ nguyên. Mẫu regex dịch cả các câu do server sinh ra theo khuôn cố định (tên bước, dữ kiện, kết quả chạy).

export const EN_EXACT = {
  // --- Khung ---
  'Tìm test flow…': 'Search test flows…', 'Môi trường test cấu hình trong .env (chỉ staging được phép)': 'Test environment configured in .env (staging only)',
  'Trạng thái trình duyệt ghi hình': 'Recording browser status', 'Đổi giao diện sáng / tối': 'Switch light / dark theme', 'Đổi giao diện sáng hoặc tối': 'Switch light or dark theme', 'Ngôn ngữ': 'Language',
  'Browser sẵn sàng': 'Browser ready', 'Đang quay': 'Recording', 'Đang tạm dừng quay': 'Recording paused', 'Chạy luồng có sẵn, quy trình tự soạn, dọn dữ liệu test': 'Run built-in flows, custom procedures, clean test data',
  'Đang xem DỮ LIỆU MẪU (?mock=1) — không phải kết quả thật.': 'Viewing SAMPLE DATA (?mock=1): not real results.', 'Tiếng Việt': 'Vietnamese',
  // --- Overview ---
  'Quay một lần, AI học nghiệp vụ, chạy lại để kiểm thử hồi quy.': 'Record once, let AI learn the business logic, replay for regression testing.', 'Test flows gần đây': 'Recent test flows', 'Xem tất cả': 'View all',
  'Lượt chạy gần đây': 'Recent runs', 'Cần chú ý': 'Needs attention', 'Tổng hợp': 'Summary', 'Lần chạy': 'Runs', 'Tỷ lệ đạt': 'Pass rate', 'Câu hỏi mở': 'Open questions', 'chưa chạy': 'not run yet',
  'Chưa có Test Flow': 'No test flows yet', 'Bấm “New Recording”, thao tác như bình thường, rồi dừng quay.': 'Click “New Recording”, work as usual, then stop recording.', 'Chưa có lượt chạy': 'No runs yet', 'Không có gì cần xử lý': 'Nothing needs attention',
  // --- Record & Learn ---
  'Tên luồng': 'Flow name', 'Ví dụ: Tạo phiếu yêu cầu tuyển dụng PATD': 'e.g. Create a recruitment request form', 'URL website cần test': 'Website URL to test', 'Bắt đầu quay': 'Start recording', 'Tạm dừng': 'Pause', 'Tiếp tục': 'Resume', 'Dừng & lưu': 'Stop & save',
  'Chỉ ghi nhận trên môi trường staging được cấu hình.': 'Only the configured staging environment is recorded.', 'Dùng tài khoản đã nhớ:': 'Using the remembered account:', 'Đăng nhập bằng tài khoản khác': 'Sign in with a different account',
  'Chưa nhớ tài khoản nào: Chrome sẽ mở ở màn hình đăng nhập. Nhập tài khoản của bạn, hệ thống nhớ để dùng cho các lần quay và chạy lại sau.': 'No account remembered yet: Chrome opens on the sign-in screen. Enter your account and it will be remembered for later recordings and replays.',
  'Đang ghi nhận': 'Recording in progress', 'Tạm dừng, thao tác không được ghi': 'Paused: actions are not recorded', 'thao tác': 'actions', 'API ghi dữ liệu': 'data-writing APIs', 'Dòng thời gian các thao tác': 'Action timeline',
  'bấm': 'click', 'chuyển trang': 'navigation', 'chọn dữ liệu': 'data choice', 'nhập': 'input', 'ghi dữ liệu (API)': 'data write (API)', 'Ghi chú (không bắt buộc) rồi Enter': 'Note (optional), then press Enter',
  'Thêm ghi chú trong lúc quay (không bắt buộc) rồi Enter': 'Add a note while recording (optional), then press Enter', 'Chưa có thao tác': 'No actions yet',
  'Hãy thao tác trên cửa sổ Chrome vừa mở. Mỗi thao tác sẽ hiện ở đây ngay khi bạn làm.': 'Work in the Chrome window that just opened. Each action appears here as you do it.',
  'Máy quan sát trong lúc quay, không gọi AI nên không làm chậm thao tác.': 'The machine observes while you record. No AI is called, so nothing slows you down.', 'dữ kiện đã quan sát': 'seen directly', 'gợi ý suy ra từ dữ kiện, chưa phải quy tắc': 'hints inferred from facts, not rules yet', 'điểm chưa rõ': 'open points',
  'Chưa có, sẽ cập nhật khi bạn thao tác.': 'Nothing yet; this updates as you work.', 'Không có.': 'None.', 'Suy luận sâu hơn có sau khi bạn dừng quay và bấm “Phân tích bằng AI”.': 'Deeper reasoning is available after you stop recording and click “Analyze with AI”.',
  'Recording saved — chờ phân tích': 'Recording saved: awaiting analysis', 'Đã lưu': 'Saved', 'Tổng thời gian': 'Total time', 'Trang đã đi qua': 'Pages visited', 'Ghi chú của bạn:': 'Your notes:', 'Ghi chú': 'Notes',
  'Phân tích bằng AI': 'Analyze with AI', 'Lưu recording': 'Save recording', '“Lưu recording” lưu thành Test Flow dùng dữ kiện máy quan sát được (không gọi AI). Muốn quay lại từ đầu: bắt đầu một lần quay mới ở trên.': '“Save recording” saves a Test Flow from machine-observed facts (no AI call). To start over, begin a new recording above.',
  'Đã lưu recording — xem lại trước khi phân tích.': 'Recording saved: review it before analysis.', 'Đã thêm ghi chú': 'Note added', 'Đã lưu thành Test Flow.': 'Saved as a Test Flow.', 'Bản quay đã dừng (cửa sổ Chrome đã đóng) và được lưu.': 'Recording stopped (Chrome window closed) and saved.',
  // --- Phân tích ---
  'Phân tích hoàn tất': 'Analysis completed', 'Đang phân tích': 'Analyzing', 'Chạy thử': 'Run a trial', 'Lưu thành Test Flow': 'Save as Test Flow', 'trạng thái phản ánh việc backend đã xử lý xong từng phần': 'status reflects what the backend has actually finished',
  'Đang tái dựng quy trình': 'Rebuilding the flow', 'Đang xác định các trường dữ liệu': 'Identifying data fields', 'Đang phân tích quy tắc nghiệp vụ': 'Analyzing business rules', 'Đang đề xuất test case': 'Proposing test cases', 'Hoàn tất phân tích': 'Analysis complete',
  'AI chưa phân tích được.': 'AI could not analyze this yet.', 'Kết quả máy quan sát vẫn dùng được.': 'The machine-observed results are still usable.', 'Thử lại': 'Try again',
  'Chưa có bước nghiệp vụ': 'No business steps yet', 'Bấm “Phân tích bằng AI” để AI gom các thao tác nhỏ thành bước nghiệp vụ.': 'Click “Analyze with AI” so AI groups small actions into business steps.', 'Chưa có quy tắc': 'No rules yet',
  'Mức tin cậy là trạng thái xác minh, không phải xác suất:': 'Confidence is a verification status, not a probability:', 'là máy thấy trực tiếp;': 'means the machine saw it directly;', 'là AI suy luận;': 'means AI inferred it;', 'là chưa đủ bằng chứng. Xác nhận quy tắc sau khi lưu Test Flow.': 'means there is not enough evidence. Confirm rules after saving the Test Flow.',
  'Điều kiện': 'Prerequisite', 'Dữ liệu test': 'Test data', 'Các bước': 'Steps', 'Mức sẵn sàng': 'Readiness', 'Cho phép chạy trên môi trường test': 'Allow running on the test environment', 'Dữ liệu như bản quay': 'Same data as the recording', 'Chọn dữ liệu khác (mục đầu tiên)': 'Choose different data (first item)',
  'Chưa có test case': 'No test cases yet', 'Chưa có bằng chứng': 'No evidence yet', 'Bản quay này không có ảnh chụp (ảnh chỉ được lưu từ phiên bản mới).': 'This recording has no screenshots (screenshots are only saved by newer versions).',
  'Test case “Needs review” chưa tự chạy được.': 'Test cases marked “Needs review” cannot run automatically yet.', 'Bằng chứng:': 'Evidence:', 'chưa có': 'none', 'Xác nhận': 'Confirm', 'Cần kiểm tra': 'Needs checking', 'AI suy luận': 'AI inferred', 'Máy quan sát': 'Machine observed',
  'Đã có flow tương tự — dùng lại để không tạo trùng:': 'A similar flow exists: reuse it to avoid duplicates:', 'Tạo Test Flow mới': 'Create a new Test Flow', 'Tên Test Flow': 'Test Flow name', 'Lưu': 'Save', 'Lưu & chạy thử': 'Save & run trial', 'Lưu & chạy': 'Save & run', 'Huỷ': 'Cancel',
  'Dữ liệu có thể thay đổi': 'Data that may vary', 'Câu hỏi cần xác nhận': 'Questions to confirm',
  // --- Test Flows ---
  'Thư viện luồng đã học — chạy lại để kiểm thử hồi quy.': 'Library of learned flows. Replay them for regression testing.', 'Tất cả module': 'All modules', 'Mọi trạng thái': 'All statuses', 'Chỉ một môi trường được cấu hình trong .env': 'Only one environment is configured in .env', 'Dạng bảng': 'Table view', 'Dạng thẻ': 'Card view',
  'Tìm theo tên, module hoặc URL': 'Search by name, module or URL', 'đề xuất cập nhật': 'update proposed', 'Chưa có test flow': 'No test flows yet', 'Quay một luồng ở “Record & Learn” rồi lưu thành Test Flow.': 'Record a flow in “Record & Learn” and save it as a Test Flow.', 'Thao tác': 'Actions',
  'Đổi tên Test Flow': 'Rename Test Flow', 'Tên': 'Name', 'Đã đổi tên.': 'Renamed.', 'Đã xoá Test Flow.': 'Test Flow deleted.', 'Xoá luồng': 'Delete flow',
  'Mất cả phiên bản, quy tắc đã học, test case và lịch sử chạy; không khôi phục được. Bản quay thô vẫn còn trong thư mục': 'This removes all versions, learned rules, test cases and run history and cannot be undone. The raw recording stays in the folder',
  'Thông tin': 'Details', 'Phiên bản': 'Version', 'Trạng thái': 'Status', 'Cập nhật': 'Updated', 'Mô tả': 'Description', 'Kết quả mong đợi': 'Expected results', 'Câu hỏi xác minh': 'Verification questions', 'có thể bỏ qua': 'can be skipped', 'Trả lời': 'Answer', 'Gửi': 'Submit', 'Bỏ qua': 'Skip',
  'Bản quay không có API ghi hay thông báo để đối chiếu — chạy lại chỉ biết các thao tác chạy được.': 'The recording has no write API or notification to compare against, so a replay only shows that the actions run.',
  'Bỏ xác nhận': 'Remove confirmation', 'Xác nhận đúng nghiệp vụ': 'Confirm it is correct', 'AI phân tích sâu': 'Deep AI analysis', 'Thêm': 'More', 'Xem phiên bản': 'View versions', 'phiên bản đề xuất đang chờ bạn xem.': 'proposed version(s) waiting for your review.', 'Có': 'There are',
  'Số bước': 'Steps', 'Tạo lúc': 'Created', 'Chấp nhận': 'Accept', 'Từ chối': 'Reject', 'Đang dùng': 'In use', 'Đề xuất': 'Proposed', 'Đã thay thế': 'Superseded', 'Chấp nhận phiên bản này?': 'Accept this version?', 'Phiên bản hiện tại vẫn được giữ trong lịch sử.': 'The current version stays in the history.',
  'Chạy lại': 'Replay', 'Chạy': 'Run', 'Bắt đầu chạy': 'Start run', 'Tôi cho phép chạy trên môi trường test': 'I allow running on the test environment', 'Replay sẽ GHI dữ liệu thật trên môi trường test:': 'Replay will WRITE real data on the test environment:',
  'Test case này có thể thay đổi dữ liệu trên môi trường test.': 'This test case may change data on the test environment.', 'Dữ liệu chọn (để trống = lấy mục đầu tiên của danh sách):': 'Data to choose (leave empty = first item in the list):', 'Danh sách chọn': 'Selection list',
  // --- Test Runs ---
  'Lịch sử chạy lại các Test Flow.': 'Replay history of the Test Flows.', 'Lịch sử chạy của một Test Flow.': 'Run history of one Test Flow.', 'Báo cáo lượt chạy': 'Run report', 'Tất cả lượt chạy': 'All runs', 'Mở Test Flow': 'Open Test Flow', 'Đang mở trình duyệt…': 'Opening the browser…', 'Chạy lại một Test Flow để thấy báo cáo ở đây.': 'Replay a Test Flow to see its report here.',
  'Tìm phần tử bằng:': 'Element found by:', 'Đã chọn:': 'Chosen:', 'Bị chặn bởi chính sách an toàn': 'Blocked by safety policy', 'Unknown — Needs investigation': 'Unknown: needs investigation',
  'Giao diện đã đổi nhưng flow vẫn chạy được: hệ thống đề xuất': 'The UI changed but the flow still runs: the system proposes', '(chưa ghi đè). Xem ở trang chi tiết flow.': '(not overwritten yet). See it on the flow details page.', 'Quy tắc bắt buộc được cập nhật:': 'Required-field rule updated:',
  'Không chạy vì một bước trước đã lỗi / bị chặn.': 'Not run because an earlier step failed or was blocked.', 'Không xác minh được vì luồng dừng giữa chừng.': 'Cannot verify because the flow stopped midway.', 'Đăng nhập đã được làm trước khi chạy nên bỏ qua bước này.': 'Sign-in was done before the run, so this step is skipped.',
  'Kết quả cuối': 'Final result', 'Xác minh kết quả': 'Verify results', 'Bản quay không có API ghi hay thông báo để đối chiếu — chưa xác minh được kết quả, chỉ biết các thao tác chạy được.': 'The recording has no write API or notification to compare against: results are unverified, only that the actions ran.',
  'Chỉ xác minh qua phản hồi API và thông báo trên giao diện; không đọc database backend nên chưa chứng minh được dữ liệu đã lưu đúng.': 'Verified only through API responses and on-screen notifications. The backend database is not read, so correct saving is not proven.',
  'Phần tử chỉ tìm được bằng đường dẫn CSS (cách cuối cùng) — giao diện có thể đã đổi; xem đề xuất cập nhật.': 'The element was found only by CSS path (last resort). The UI may have changed; see the proposed update.',
  // --- Knowledge ---
  'Kiến thức nghiệp vụ AI tích luỹ từ các lần quay và chạy lại. Quy tắc đã xác nhận không bao giờ bị suy luận mới ghi đè.': 'Business knowledge AI accumulates from recordings and replays. Confirmed rules are never overwritten by new inferences.',
  'AI chưa học được gì': 'AI has not learned anything yet', 'Kiến thức được tích luỹ từ các bản quay đã lưu thành Test Flow.': 'Knowledge builds up from recordings saved as Test Flows.', 'Trường': 'Field', 'Loại': 'Type', 'Bắt buộc': 'Required', 'Có dấu hiệu': 'Looks required', 'Xuất hiện ở flow': 'Appears in flow',
  'Chưa thấy trường nào (bản quay cũ không có ảnh trạng thái form).': 'No fields seen yet (older recordings have no form snapshots).', 'Chưa thấy quan hệ giữa các trường': 'No relationships between fields yet', 'Quan hệ chỉ được ghi nhận khi quan sát thấy trường xuất hiện/biến mất/bị khoá sau một thao tác.': 'Relationships are recorded only when a field is seen appearing, disappearing or being locked after an action.',
  'Đã cập nhật mức tin cậy.': 'Confidence updated.', '(chưa rõ module)': '(unknown module)',
  // --- Settings ---
  'Cấu hình môi trường test và nhà cung cấp AI.': 'Configure the test environment and the AI provider.', 'Môi trường test': 'Test environment', 'Host cho phép': 'Allowed hosts', 'Tài khoản .env': '.env account', 'Menu đã học': 'Menu learned', 'Đã học': 'Learned', 'Chưa học (sẽ học khi khởi động lại)': 'Not learned (learned on restart)',
  'Môi trường chỉ đổi được trong file': 'The environment can only be changed in the file', 'Ghi nhận và chạy lại bị khoá ở các tên miền staging được liệt kê ở trên.': 'Recording and replay are locked to the staging domains listed above.',
  'Tài khoản đăng nhập': 'Sign-in account', 'Tài khoản': 'Account', 'Đã nhớ lúc': 'Remembered at', 'Quên tài khoản này': 'Forget this account', 'Chưa nhớ tài khoản nào. Lần quay đầu tiên, nhập tài khoản ở màn hình đăng nhập của Chrome là hệ thống nhớ.': 'No account remembered yet. On the first recording, enter your account on Chrome’s sign-in screen and it will be remembered.',
  'Mật khẩu chỉ lưu trong file': 'The password is stored only in the file', 'trên máy này (git bỏ qua). Không nằm trong bản quay và không gửi cho AI. Khi chạy lại, hệ thống dùng đúng tài khoản này thay cho tài khoản trong': 'on this machine (ignored by git). It is not in recordings and never sent to AI. On replay, the system uses this account instead of the one in',
  'Quên tài khoản đã nhớ?': 'Forget the remembered account?', 'Quên tài khoản': 'Forget account', 'Lần quay sau Chrome sẽ hỏi đăng nhập lại. Các flow đã lưu không bị ảnh hưởng.': 'The next recording will ask you to sign in again. Saved flows are not affected.', 'Đã quên tài khoản.': 'Account forgotten.',
  'Dữ liệu': 'Data', 'Cơ sở dữ liệu': 'Database', 'Bản quay thô': 'Raw recordings', 'Ảnh bằng chứng': 'Evidence screenshots', 'Ngôn ngữ giao diện': 'Interface language', 'Dùng khi bấm “Phân tích bằng AI”': 'Used when you click “Analyze with AI”', 'Ollama (chạy local, miễn phí, chậm)': 'Ollama (local, free, slow)',
  'Dữ liệu gửi cho AI đã được che email, số điện thoại, token và id. Không gửi mật khẩu.': 'Data sent to AI has emails, phone numbers, tokens and ids masked. Passwords are never sent.', 'Đã lưu lựa chọn AI.': 'AI choice saved.', 'Công cụ khác': 'Other tools', 'Chạy các luồng có sẵn, quy trình tự soạn, dọn dữ liệu test (giao diện cũ).': 'Run built-in flows, custom procedures and clean test data (the old interface).',
  '(BASE_URL). Ghi nhận và chạy lại bị khoá ở các tên miền staging được liệt kê ở trên.': '(BASE_URL). Recording and replay are locked to the staging domains listed above.', 'Giá trị đã chọn/nhập': 'Value chosen / entered',
  // --- Nội dung server hay gặp ---
  'Luồng thành công: làm lại đúng như đã quay': 'Successful flow: redo exactly as recorded', 'Mọi bước chạy được và API ghi / thông báo xảy ra giống bản quay.': 'Every step runs and the write APIs / notifications match the recording.', 'Hồi quy: chạy lại luồng đã lưu để phát hiện lỗi mới': 'Regression: replay the saved flow to catch new bugs',
  'Giống luồng thành công; khác đi là dấu hiệu hồi quy hoặc giao diện đổi.': 'Same as the successful flow; any difference signals a regression or a UI change.', 'Chạy định kỳ.': 'Run periodically.', 'Chỉ chạy khi bạn cho phép trên môi trường test.': 'Runs only when you allow it on the test environment.',
  'Giả thuyết (chưa xác minh): hệ thống từ chối hoặc báo lỗi, không tạo bản ghi. Kết quả chạy sẽ xác nhận hoặc bác bỏ.': 'Hypothesis (unverified): the system rejects or reports an error and creates no record. The run result will confirm or refute it.',
  'Luồng vẫn hoàn thành; nếu khác bản quay thì ghi nhận là nhánh khác.': 'The flow still completes; if it differs from the recording, it is noted as a different branch.', 'Chưa kiểm tra được.': 'Cannot be checked yet.', 'Bản quay chưa có bước lưu/gửi — quay tiếp tới bước lưu rồi phân tích lại để kiểm chứng trường bắt buộc.': 'The recording has no save/submit step. Record through to saving, then analyze again to verify required fields.',
};

const inner = (s) => s.replace(/ \(hộp «/g, ' (dialog «').replace(/, rồi nhấn Enter/g, ', then press Enter');
// Mẫu cho tên bước có thể kèm tiền tố "N. " (báo cáo lượt chạy); fn nhận các nhóm bắt được (không gồm tiền tố).
const stepP = (body, fn) => [new RegExp('^((?:\\d+\\. )?)' + body + '$'), (...m) => m[1] + inner(fn(...m.slice(2, -2)))];
const plural = (n) => (n === '1' ? '' : 's');

export const EN_PATTERNS = [
  // --- Tên bước (server) ---
  stepP('Chuyển tới trang (\\S+?) — vào bằng menu(?: «(.+?)»)? → «(.+?)»( rồi mở dòng cần xem)?', (u, g, t, more) => `Go to ${u}, via menu${g ? ` «${g}»` : ''} → «${t}»${more ? ', then open the row' : ''}`),
  stepP('Chuyển tới trang (.+)', (u) => `Go to ${u}`),
  stepP('Nhập «(.*)» vào «(.*?)»(.*)', (v, f, rest) => `Enter «${v}» in «${f}»${rest}`),
  stepP('Tải file «(.*)» vào «(.*?)»(.*)', (v, f, rest) => `Upload file «${v}» to «${f}»${rest}`),
  stepP('Nhấn phím (\\S+)(?: ở «(.*)»)?', (k, f) => `Press ${k}${f ? ` in «${f}»` : ''}`),
  stepP('Chọn/đổi «(.*?)»(.*)', (t, rest) => `Toggle «${t}»${rest}`),
  stepP('Chọn dữ liệu «(.*?)»(?: ở «(.*?)»)?(.*?) \\(dữ liệu có thể khác\\)', (t, f, rest) => `Select data «${t}»${f ? ` in «${f}»` : ''}${rest} (data may vary)`),
  stepP('Chọn «(.*?)»(.*)', (t, rest) => `Choose «${t}»${rest}`),
  stepP('(Thu gọn|Mở rộng) menu bên trái', (a) => `${a === 'Thu gọn' ? 'Collapse' : 'Expand'} the left menu`),
  stepP('Bấm menu «(.*?)»(?: \\(trong nhóm «(.*?)»(, menu thu gọn: di chuột vào nhóm để hiện)?\\))?', (t, g, hv) => `Click menu «${t}»${g ? ` (in group «${g}»${hv ? '; collapsed menu: hover the group to reveal it' : ''})` : ''}`),
  stepP('Mở tab «(.*?)»', (t) => `Open tab «${t}»`),
  stepP('Mở ô chọn «(.*?)»(.*)', (f, rest) => `Open select «${f}»${rest}`),
  stepP('Bấm «(.*?)»(.*)', (t, rest) => `Click «${t}»${rest}`),
  stepP('Cuộn (.+?) (xuống|lên) tới (\\d+)px', (x, d, n) => `Scroll ${({ 'danh sách chọn': 'selection list', 'hộp thoại': 'dialog', trang: 'page', form: 'form' })[x] ?? x} ${d === 'xuống' ? 'down' : 'up'} to ${n}px`),
  [/^\(trước thao tác đầu\)$/, '(before the first action)'],
  // --- Dữ kiện máy quan sát (server) ---
  [/^Trường «(.*)» đã có sẵn giá trị khi form mở \(chưa ai thao tác trên trường này\)\.$/, 'Field «$1» already had a value when the form opened (nobody has acted on it yet).'],
  [/^Sau «(.*)», (\d+) trường xuất hiện trên form: (.*)\.$/, 'After «$1», $2 field(s) appeared on the form: $3.'],
  [/^Sau «(.*)», (\d+) trường biến mất khỏi form: (.*)\.$/, 'After «$1», $2 field(s) disappeared from the form: $3.'],
  [/^Sau «(.*)», trường «(.*)» (bị khoá|được mở \(hết khoá\))\.$/, (m, a, f, s) => `After «${a}», field «${f}» ${s === 'bị khoá' ? 'became locked' : 'was unlocked'}.`],
  [/^Sau «(.*)», nút «(.*)» chuyển từ (khoá sang mở|mở sang bị khoá)\.$/, (m, a, b, s) => `After «${a}», button «${b}» went from ${s === 'khoá sang mở' ? 'locked to enabled' : 'enabled to locked'}.`],
  [/^Sau «(.*)», form báo lỗi: «(.*)»\.$/, 'After «$1», the form shows an error: «$2».'],
  [/^Sau «(.*)», hệ thống gọi (\w+) (\S+) → HTTP (\d+)\.$/, 'After «$1», the system called $2 $3 → HTTP $4.'],
  [/^Sau «(.*)», hiện thông báo (\w+): «(.*)»\.$/, 'After «$1», a $2 notification appeared: «$3».'],
  [/^Trường «(.*)» có dấu hiệu bắt buộc trên giao diện(?: \(ký hiệu \* \/ nhãn bắt buộc\))?\. Chưa kiểm tra bằng cách bỏ trống\.$/, 'Field «$1» looks required on screen (asterisk / required label). Not yet checked by leaving it empty.'],
  [/^Lựa chọn «(.*)» có thể quyết định các trường hiển thị tiếp theo — mới thấy 1 lần với «(.*)»\.$/, 'The choice «$1» may decide which fields appear next; seen only once, with «$2».'],
  [/^Thao tác «(.*)» có thể làm hiện thêm trường — chưa thử cách khác\.$/, 'The action «$1» may reveal more fields; no other way tried yet.'],
  [/^Trạng thái nút có thể phụ thuộc điều kiện nhập liệu — cần thử bỏ trống để biết\.$/, 'Button state may depend on input conditions; try leaving fields empty to find out.'],
  [/^(.*) Cần xác nhận đây là quy tắc hay chỉ là dữ liệu nhập sai\.$/, '$1 Confirm whether this is a rule or just wrong input.'],
  [/^Mới chọn một giá trị «(.*)» ở «(.*)» — chưa biết các lựa chọn khác có dẫn tới luồng khác không\.$/, 'Only one value «$1» was chosen in «$2»; unknown whether other choices lead to a different flow.'],
  // --- Test case / kết quả chạy (server) ---
  [/^Bỏ trống «(.*)» rồi lưu$/, 'Leave «$1» empty, then save'],
  [/^Dữ liệu khác ở bước (\d+): (.*) \(lấy mục đầu tiên\)$/, 'Different data at step $1: $2 (first item)'],
  [/^Bỏ trống bước (.+)$/, 'Leave step(s) $1 empty'],
  [/^Phát lại (\d+) bước, bỏ (\d+) bước$/, 'Replay $1 steps, skipping $2'],
  [/^Phát lại (\d+) bước đã quay$/, 'Replay the $1 recorded steps'],
  [/^Không tìm thấy phần tử: (.*)$/, 'Element not found: $1'],
  [/^Kết quả: (\w+) (\S+) trả (\d+)$/, 'Result: $1 $2 returned $3'],
  [/^Kết quả: (\w+) (\S+)$/, 'Result: $1 $2'],
  [/^Giả thuyết «bỏ trống thì không tạo được»$/, 'Hypothesis: “leaving it empty prevents creation”'],
  [/^API này không được gọi trong lượt chạy \(bản quay có gọi\)\..*$/, 'This API was not called during the run (the recording did). The flow did not reach the save step or the system rejected it earlier.'],
  [/^Mong đợi 2xx \(bản quay: (\d+)\) nhưng thực tế (.*)\.$/, 'Expected 2xx (recording: $1) but got $2.'],
  [/^Business error — kết quả khác kỳ vọng$/, 'Business error: result differs from expectation'],
  [/^Automation error — không tìm\/bấm được phần tử$/, 'Automation error: element not found or not clickable'],
  // --- Số lượng / thời gian ---
  [/^(\d+) thao tác$/, (m, n) => `${n} action${plural(n)}`], [/^(\d+) bước$/, (m, n) => `${n} step${plural(n)}`], [/^(\d+) trường$/, (m, n) => `${n} field${plural(n)}`], [/^(\d+) quy tắc$/, (m, n) => `${n} rule${plural(n)}`], [/^(\d+) lần chạy$/, (m, n) => `${n} run${plural(n)}`],
  [/^(\d+) quy tắc chưa xác minh$/, (m, n) => `${n} unverified rule${plural(n)}`], [/^(\d+) bước trên (.+)$/, '$1 steps on $2'], [/^(\d+) flow$/, (m, n) => `${n} flow${plural(n)}`],
  [/^(\d+) bước trên$/, '$1 steps on'], [/^Các bước \((\d+)\)$/, 'Steps ($1)'], [/^Tìm phần tử bằng: (.+)$/, 'Element found by: $1'], [/^Dữ liệu chọn \((\d+)\)$/, 'Data to choose ($1)'], [/^Điều hệ thống đã học \((\d+)\)$/, 'What the system learned ($1)'],
  [/^Thông báo (\w+): (.+)$/, '$1 notification: $2'],
  [/^bước (.+)$/, 'step $1'], [/^Bước (\d+)$/, 'Step $1'], [/^(\d+)\/(\d+) flow$/, '$1/$2 flows'],
  [/^(\d+) đạt, (\d+) lỗi, (\d+) bị chặn$/, '$1 passed, $2 failed, $3 blocked'],
  [/^(\d+) phút trước$/, '$1 min ago'], [/^(\d+) giờ trước$/, '$1 h ago'], [/^(\d+) ngày trước$/, '$1 d ago'], [/^vừa xong$/, 'just now'],
  [/^Đã chọn (\d+)\/(\d+) test case để lưu vào thư viện\. Test case “Needs review” chưa tự chạy được\.$/, '$1/$2 test cases selected to save to the library. Test cases marked “Needs review” cannot run automatically yet.'],
  [/^Sẽ lưu (\d+) test case đã chọn\.(.*)$/, 'Will save $1 selected test case(s).$2'],
  [/^Thêm phiên bản đề xuất vào «(.*)»$/, 'Add a proposed version to «$1»'], [/^\((tên gần giống|cùng API ghi dữ liệu)\)$/, (m, r) => `(${r === 'tên gần giống' ? 'similar name' : 'same data-writing API'})`],
  [/^«(.*)» còn (\d+) quy tắc chưa xác minh$/, '«$1» still has $2 unverified rule(s)'], [/^«(.*)» có (\d+) phiên bản đề xuất đang chờ xác nhận$/, '«$1» has $2 proposed version(s) waiting for confirmation'], [/^«(.*)» lần chạy gần nhất bị lỗi$/, '«$1»: the latest run failed'], [/^(\d+) câu hỏi xác minh đang chờ bạn$/, '$1 verification question(s) waiting for you'],
  [/^Đã nhớ tài khoản (.+) cho các lần quay và chạy lại sau\.$/, 'Remembered account $1 for later recordings and replays.'], [/^Xoá Test Flow «(.*)»\?$/, 'Delete Test Flow «$1»?'], [/^Giao diện đổi: (\d+) phần tử chỉ tìm được bằng đường dẫn CSS\.$/, 'UI changed: $1 element(s) found only by CSS path.'],
  [/^AI thêm (\d+) quy tắc, (\d+) câu hỏi\.$/, 'AI added $1 rule(s) and $2 question(s).'], [/^Luồng (\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/, 'Flow $1'], [/^Đã thêm phiên bản v(\d+) \(đề xuất\) — chờ bạn chấp nhận\.$/, 'Added version v$1 (proposed), awaiting your acceptance.'],
];

// --- Nhãn tiếng Anh theo thiết kế → tiếng Việt khi chọn giao diện Việt ---
export const VI_LABELS = {
  'Overview': 'Tổng quan', 'Record & Learn': 'Ghi & học', 'Test Flows': 'Luồng test', 'Test Runs': 'Lượt chạy', 'AI Knowledge': 'Kiến thức AI', 'Settings': 'Cài đặt', 'Classic runner': 'Bộ chạy cũ', 'AI Analysis': 'Phân tích AI',
  'AI Live Insights': 'Nhận định AI trực tiếp', 'Recorded Actions': 'Thao tác đã ghi', 'Observed': 'Đã quan sát', 'Inferred': 'Suy luận', 'Needs verification': 'Cần xác minh', 'Needs Verification': 'Cần xác minh', 'Possible Rules': 'Quy tắc có thể có', 'Confirmed': 'Đã xác nhận',
  'Passed': 'Đạt', 'Failed': 'Lỗi', 'Blocked': 'Bị chặn', 'Needs review': 'Cần xem lại', 'Skipped': 'Bỏ qua', 'Ready': 'Sẵn sàng', 'Draft': 'Nháp', 'Recording': 'Đang quay', 'Paused': 'Tạm dừng', 'Ready to record': 'Sẵn sàng quay', 'Browser ready': 'Trình duyệt sẵn sàng',
  'Record your testing workflow. Let AI discover the business logic.': 'Quay lại quy trình test của bạn. Để AI khám phá nghiệp vụ.', 'Navigate': 'Chuyển trang', 'Click': 'Bấm', 'Fill': 'Nhập', 'Select': 'Chọn', 'Upload': 'Tải lên', 'Press': 'Nhấn phím', 'Scroll': 'Cuộn', 'toast': 'thông báo',
  'Replay': 'Chạy lại', 'Replay test flow': 'Chạy lại Test Flow', 'Review recording': 'Xem lại bản quay', 'Business Flow': 'Luồng nghiệp vụ', 'Discovered Rules': 'Quy tắc phát hiện', 'Suggested Test Cases': 'Test case đề xuất', 'Evidence': 'Bằng chứng', 'Test Cases': 'Test case', 'Versions': 'Phiên bản', 'History': 'Lịch sử', 'Rules': 'Quy tắc',
  'Fields': 'Trường', 'Relationships': 'Quan hệ', 'Update history': 'Lịch sử cập nhật', 'Flow name': 'Tên luồng', 'Last run': 'Lần chạy gần nhất', 'Pass rate': 'Tỷ lệ đạt', 'Status': 'Trạng thái', 'Steps': 'Số bước',
  'Run ID': 'Mã lượt chạy', 'Test flow': 'Test flow', 'Test flows': 'Test flow', 'Environment': 'Môi trường', 'Start time': 'Bắt đầu lúc', 'Duration': 'Thời lượng', 'Passed / Failed / Blocked': 'Đạt / Lỗi / Bị chặn', 'Trigger': 'Kích hoạt', 'Result': 'Kết quả', 'Manual': 'Thủ công',
  'New Recording': 'Quay mới', 'View details': 'Xem chi tiết', 'Edit name': 'Đổi tên', 'View history': 'Xem lịch sử', 'Delete': 'Xoá', 'Automation error': 'Lỗi automation', 'Field dependency': 'Phụ thuộc giữa các trường', 'Required field': 'Trường bắt buộc', 'Conditional UI': 'Giao diện có điều kiện',
  'Default value': 'Giá trị mặc định', 'Workflow': 'Quy trình', 'Save': 'Lưu', 'Test case': 'Test case', 'Expected result': 'Kết quả mong đợi', 'AI provider': 'Nhà cung cấp AI', 'Flow': 'Luồng', 'Validation': 'Kiểm tra dữ liệu', 'Rule': 'Quy tắc',
  'Unknown — Needs investigation': 'Chưa rõ — cần điều tra', 'Environment error': 'Lỗi môi trường',
  'happy': 'luồng thành công', 'alternative': 'nhánh khác', 'negative': 'tiêu cực', 'regression': 'hồi quy', 'required-validation': 'kiểm tra bắt buộc', 'boundary': 'giá trị biên',
};
export const VI_PATTERNS = [
  [/^(\d+) steps$/, '$1 bước'], [/^(\d+) actions?$/, '$1 thao tác'], [/^Flow #(\d+)$/, 'Luồng #$1'], [/^Run (.+)$/, 'Lượt chạy $1'], [/^(\d+)\/(\d+) flows$/, '$1/$2 flow'],
];
