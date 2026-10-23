/**
 * Hồ sơ ứng viên GIẢ LẬP nhưng GIỐNG THẬT (tên, CCCD đúng cấu trúc, địa chỉ, học vấn, công việc, người thân…) để điền form bổ sung thông tin.
 * - Nhất quán trong một lần chạy (ngày sinh ↔ CCCD ↔ tuổi ↔ năm học ↔ năm đi làm); mỗi lần chạy sinh một hồ sơ khác nhau (theo seed).
 * - Email là địa chỉ giả @example.com (thư không gửi tới ai), không bao giờ là email công ty hay của người thật.
 */

export interface Relative { name: string; relation: string; phone: string; job: string; birthYear: number }
export interface Profile {
  seed: number; gender: 'Nam' | 'Nữ'; fullName: string; birth: Date; age: number; email: string; phone: string; cccd: string; cccdIssued: string; cccdOldIssued: string; cccdOld: string;
  address: string; school: string; major: string; company: string; position: string; salary: number; eduStart: string; eduEnd: string; jobStart: string; jobEnd: string; startWork: string;
  relatives: Relative[]; referee: string; height: number; weight: number; married: boolean; children: number; headcount: number;
}

// mulberry32: PRNG nhỏ, đủ để lặp lại được hồ sơ khi cần gỡ lỗi.
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Phan', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE_M = ['Văn', 'Minh', 'Quang', 'Đức', 'Hữu', 'Thành', 'Anh', 'Gia'];
const MIDDLE_F = ['Thị', 'Ngọc', 'Thu', 'Minh', 'Khánh', 'Phương', 'Hồng', 'Mai'];
const GIVEN_M = ['Hùng', 'Dũng', 'Nam', 'Tuấn', 'Long', 'Hiếu', 'Khoa', 'Bình', 'Sơn', 'Đạt', 'Huy', 'Phong'];
const GIVEN_F = ['Lan', 'Hương', 'Linh', 'Trang', 'Hà', 'Ngân', 'Thảo', 'Mai', 'Yến', 'Chi', 'Nhung', 'Vy'];
const PROVINCE_CODES = ['001', '079', '048', '031', '092', '033', '038', '042', '044', '056']; // Hà Nội, TP.HCM, Đà Nẵng, Hải Phòng, Cần Thơ, …
const STREETS = ['Nguyễn Trãi', 'Trần Duy Hưng', 'Láng Hạ', 'Giải Phóng', 'Xuân Thủy', 'Lê Văn Lương', 'Cầu Giấy', 'Tây Sơn', 'Nguyễn Chí Thanh', 'Khuất Duy Tiến'];
const WARDS = [['Trung Hòa', 'Cầu Giấy'], ['Thanh Xuân Trung', 'Thanh Xuân'], ['Láng Hạ', 'Đống Đa'], ['Mễ Trì', 'Nam Từ Liêm'], ['Văn Quán', 'Hà Đông'], ['Bạch Mai', 'Hai Bà Trưng']];
const SCHOOLS = ['Đại học Kinh tế Quốc dân', 'Đại học Bách khoa Hà Nội', 'Học viện Ngân hàng', 'Đại học Ngoại thương', 'Học viện Tài chính', 'Đại học Thương mại'];
const MAJORS = ['Tài chính – Ngân hàng', 'Quản trị kinh doanh', 'Kế toán – Kiểm toán', 'Kinh tế đối ngoại', 'Hệ thống thông tin quản lý', 'Công nghệ thông tin'];
const COMPANIES = ['Ngân hàng TMCP Á Châu', 'Công ty Cổ phần FPT', 'Ngân hàng TMCP Kỹ thương Việt Nam', 'Công ty TNHH Samsung Electronics Việt Nam', 'Tập đoàn Vingroup', 'Công ty Cổ phần Tập đoàn Hòa Phát'];
const POSITIONS = ['Chuyên viên tư vấn khách hàng', 'Chuyên viên kinh doanh', 'Chuyên viên phân tích tín dụng', 'Nhân viên giao dịch', 'Chuyên viên vận hành'];
const JOBS = ['Giáo viên', 'Kỹ sư xây dựng', 'Kế toán', 'Nhân viên văn phòng', 'Kinh doanh tự do', 'Bác sĩ', 'Công chức'];

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Email giả theo tên, không bao giờ là email công ty/thật: miền example.com là miền dành riêng (RFC 2606) nên thư không gửi tới ai. */
export function fakeEmail(fullName: string, seed: number): string {
  const slug = fullName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().split(/\s+/).reverse().join('');
  return `${slug}${seed % 1000}@example.com`;
}

/** Sinh hồ sơ. `now` chỉ để test cố định thời gian. */
export function makeProfile(seed = Date.now(), email?: string, now = new Date()): Profile {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const between = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const gender: 'Nam' | 'Nữ' = r() < 0.5 ? 'Nam' : 'Nữ';
  const person = (g: 'Nam' | 'Nữ', surname = pick(SURNAMES)) => `${surname} ${pick(g === 'Nam' ? MIDDLE_M : MIDDLE_F)} ${pick(g === 'Nam' ? GIVEN_M : GIVEN_F)}`;
  const surname = pick(SURNAMES);
  const fullName = person(gender, surname);
  const age = between(25, 36);
  const birth = new Date(now.getFullYear() - age, between(0, 11), between(1, 28));
  const phone = () => `${pick(['090', '091', '093', '094', '096', '097', '098', '032', '035', '038', '070', '079', '081', '085'])}${String(between(0, 9999999)).padStart(7, '0')}`;
  const by = birth.getFullYear();
  const genderDigit = by >= 2000 ? (gender === 'Nam' ? 2 : 3) : gender === 'Nam' ? 0 : 1;
  const cccd = `${pick(PROVINCE_CODES)}${genderDigit}${String(by % 100).padStart(2, '0')}${String(between(0, 999999)).padStart(6, '0')}`;
  const cccdOld = `${pick(PROVINCE_CODES)}${genderDigit}${String(by % 100).padStart(2, '0')}${String(between(0, 999999)).padStart(6, '0')}`; // giấy tờ cũ (form nhận 12 số)
  const issued = new Date(between(2021, Math.min(2023, now.getFullYear())), between(0, 11), between(1, 28));
  const issuedOld = new Date(between(2012, 2016), between(0, 11), between(1, 28));
  const eduStart = new Date(by + 18, 8, 5), eduEnd = new Date(by + 22, 5, 30);
  const jobStart = new Date(by + 22, 8, 1), jobEnd = new Date(Math.min(by + 22 + between(2, 5), now.getFullYear() - 1), 11, 31);
  const startWork = new Date(now.getTime() + 30 * 86400000);
  const [ward, district] = pick(WARDS);
  const married = age >= 28 && r() < 0.6;
  const relatives: Relative[] = [
    { name: person('Nam', surname), relation: 'Bố', phone: phone(), job: pick(JOBS), birthYear: by - between(25, 32) },
    { name: person('Nữ'), relation: 'Mẹ', phone: phone(), job: pick(JOBS), birthYear: by - between(23, 30) },
    { name: person(gender === 'Nam' ? 'Nữ' : 'Nam'), relation: married ? (gender === 'Nam' ? 'Vợ' : 'Chồng') : 'Anh/Chị/Em', phone: phone(), job: pick(JOBS), birthYear: by + between(-3, 3) },
  ];
  return {
    seed, gender, fullName, birth, age, email: email ?? fakeEmail(fullName, seed), phone: phone(), cccd, cccdIssued: fmtDate(issued), cccdOldIssued: fmtDate(issuedOld), cccdOld,
    address: `Số ${between(1, 120)}, ngõ ${between(1, 300)} ${pick(STREETS)}, phường ${ward}, quận ${district}, Hà Nội`,
    school: pick(SCHOOLS), major: pick(MAJORS), company: pick(COMPANIES), position: pick(POSITIONS), salary: between(15, 35) * 1_000_000,
    eduStart: fmtDate(eduStart), eduEnd: fmtDate(eduEnd), jobStart: fmtDate(jobStart), jobEnd: fmtDate(jobEnd), startWork: fmtDate(startWork),
    relatives, referee: `${person('Nam')} (Trưởng phòng, ${pick(COMPANIES)}, ${phone()})`, height: gender === 'Nam' ? between(165, 180) : between(155, 168), weight: gender === 'Nam' ? between(58, 75) : between(45, 58),
    married, children: married ? between(0, 2) : 0, headcount: between(1, 5),
  };
}

/**
 * Giá trị cho một ô trống của form cổng ứng viên. `n` = đây là lần thứ mấy gặp nhãn này (kinh nghiệm lần 1, học vấn lần 2, người thân thứ n…).
 * Trả về chuỗi giống dữ liệu thật; ràng buộc đã biết của form: ngày cấp CCCD cũ trước CCCD mới, số người con ≤ 20, SĐT dạng 09xxxxxxxx.
 */
export function valueOrNull(p: Profile, label: string, placeholder: string, tag: string, n: number): string | null {
  const l = label.toLowerCase(), ph = placeholder.toLowerCase(), both = `${l} ${ph}`;
  const rel = p.relatives[(Math.max(1, n) - 1) % p.relatives.length];
  const isEdu = n % 2 === 0; // trong form: lần 1 = kinh nghiệm làm việc, lần 2 = học vấn
  if (/số điện thoại|điện thoại|sđt|phone|mobile/.test(both)) return n <= 1 ? p.phone : rel.phone;
  if (/ngày cấp cccd cũ|ngày cấp cmnd/.test(l)) return p.cccdOldIssued;
  if (/ngày cấp/.test(l)) return p.cccdIssued; // phải đứng trước luật số CCCD vì nhãn «Ngày cấp CCCD» cũng chứa chữ cccd
  if (/cccd cũ|cmnd/.test(l)) return p.cccdOld;
  if (/cccd|căn cước/.test(l)) return p.cccd;
  if (/e-?mail/.test(l)) return p.email;
  if (/nơi cấp/.test(l)) return 'Cục Cảnh sát quản lý hành chính về trật tự xã hội';
  if (/khi nào/.test(l)) return p.startWork;
  if (/ngày bắt đầu/.test(l)) return isEdu ? p.eduStart : p.jobStart;
  if (/ngày kết thúc/.test(l)) return isEdu ? p.eduEnd : p.jobEnd;
  if (/ngày sinh|ngày tháng năm sinh/.test(both)) return fmtDate(p.birth);
  if (/ngày bổ sung|dd\/mm\/yyyy/.test(ph)) return p.startWork;
  if (/lương|salary/.test(both)) return String(p.salary);
  if (/số người/.test(l)) return String(Math.min(p.children, 20) || 1);
  if (/number of recruit|headcount|quantity|số lượng/.test(l)) return String(p.headcount);
  if (/tuổi/.test(l)) return String(p.age);
  if (/chiều cao/.test(l)) return String(p.height);
  if (/cân nặng/.test(l)) return String(p.weight);
  if (/quan hệ/.test(both) && !/phòng ban/.test(both)) return rel.relation;
  if (/nghề nghiệp|công việc hiện tại/.test(both) && !/vị trí/.test(l)) return rel.job;
  if (/năm sinh/.test(both)) return String(rel.birthYear);
  if (/họ và tên|họ tên|tên người|tên đầy đủ|full name|candidate name|contact name/.test(both)) return n <= 1 && /ứng viên|của bạn/.test(both) ? p.fullName : rel.name;
  if (/địa chỉ|nơi ở|thường trú|tạm trú|address/.test(both)) return p.address;
  if (/người tham chiếu|tham chiếu/.test(both)) return p.referee;
  if (/tên & quan hệ phòng ban|phòng ban làm việc/.test(both)) return `${p.relatives[2].name} (${p.relatives[2].relation}), Phòng Kế toán – Hội sở`;
  if (/vị trí & thời gian|vị trí và thời gian/.test(both)) return `${p.position}, ${p.jobStart.slice(6)}–${p.jobEnd.slice(6)}`;
  if (/tên trường|trường|school|university/.test(both)) return p.school;
  if (/chuyên ngành|ngành/.test(both)) return p.major;
  if (/công ty|nơi làm việc|đơn vị công tác|tên tổ chức|company|employer/.test(both)) return p.company;
  if (/chức vụ|chức danh|vị trí|job title|position/.test(both)) return p.position;
  if (/kết quả|chứng chỉ|bằng cấp|xếp loại/.test(both)) return isEdu ? 'Tốt nghiệp loại Khá' : 'IELTS 6.5, MOS Excel';
  if (/khóa đào tạo|khoá đào tạo|chương trình đào tạo|đào tạo/.test(both)) return 'Kỹ năng tư vấn và chăm sóc khách hàng';
  if (/kỹ năng/.test(both)) return 'Giao tiếp, đàm phán, phân tích dữ liệu bằng Excel';
  if (/trình độ/.test(both)) return 'Đại học';
  if (/điểm mạnh/.test(both)) return 'Chủ động, có trách nhiệm, làm việc nhóm tốt, học hỏi nhanh';
  if (/điểm yếu/.test(both)) return 'Đôi khi quá cầu toàn, đang cải thiện kỹ năng quản lý thời gian';
  if (/tổ chức & vai trò|các tổ chức|vai trò/.test(l)) return 'Thành viên câu lạc bộ tình nguyện của trường, phụ trách truyền thông';
  if (/tên giấy tờ/.test(l)) return 'Giấy xác nhận bổ sung theo yêu cầu';
  if (/sở thích/.test(both)) return 'Đọc sách, chạy bộ, chơi cầu lông';
  if (/tổ chức|vai trò/.test(both)) return 'Thành viên câu lạc bộ tình nguyện của trường, phụ trách truyền thông';
  if (/thành tựu/.test(both)) return 'Đạt danh hiệu nhân viên xuất sắc năm cuối; vượt chỉ tiêu doanh số 120%';
  if (/mô tả|nhiệm vụ|trách nhiệm/.test(both)) return 'Tư vấn sản phẩm, chăm sóc khách hàng hiện hữu và đạt chỉ tiêu doanh số hằng tháng';
  if (/lý do/.test(both)) return 'Mong muốn có môi trường phát triển nghề nghiệp lâu dài hơn';
  if (tag === 'TEXTAREA' || /notes?|comment|remark|description|ghi chú/.test(both)) return 'Không có thông tin bổ sung thêm so với hồ sơ đã nộp.';
  return null;
}

/** Dùng cho form của cổng ứng viên: ô lạ vẫn có giá trị (một chữ giống tên thật còn hơn chuỗi vô nghĩa). */
export function portalValue(p: Profile, label: string, placeholder: string, tag: string, n: number): string {
  return valueOrNull(p, label, placeholder, tag, n) ?? p.fullName.split(' ').pop()!;
}

/** Lựa chọn ưu tiên cho ô chọn (Radix) theo nhãn; không có thì dùng mục đầu tiên. */
export function preferOption(p: Profile, label: string): RegExp | undefined {
  const l = label.toLowerCase();
  if (/^tỉnh|thành phố/.test(l)) return /Hà Nội/;
  if (/giới tính/.test(l)) return p.gender === 'Nam' ? /^Nam$/ : /^Nữ$/;
  if (/trình độ|bằng cấp|học vị/.test(l)) return /Đại học/;
  if (/hôn nhân/.test(l)) return p.married ? /Đã kết hôn/ : /Độc thân/;
  if (/dân tộc/.test(l)) return /^Kinh$/;
  if (/quốc tịch/.test(l)) return /Việt Nam/;
  if (/quan hệ/.test(l)) return /Bố|Cha|Mẹ|Anh|Chị|Em/;
  return undefined;
}

// ---------- Tự điền khi chạy lại luồng đã quay ----------
export interface AutoOpts { n?: number; shiftDays?: number }
const DATE_FORMATS: [RegExp, (d: number, m: number, y: number) => string][] = [
  [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (d, m, y) => `${pad(d)}/${pad(m)}/${y}`],
  [/^(\d{1,2})-(\d{1,2})-(\d{4})$/, (d, m, y) => `${pad(d)}-${pad(m)}-${y}`],
];
/** Dời một ngày đã quay đi `days` ngày, giữ nguyên định dạng (dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd). Không phải ngày → null. */
export function shiftDate(text: string, days: number): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) { const d = new Date(+iso[1], +iso[2] - 1, +iso[3] + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  for (const [re, fmt] of DATE_FORMATS) {
    const m = re.exec(text);
    if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1] + days); return fmt(d.getDate(), d.getMonth() + 1, d.getFullYear()); }
  }
  return null;
}
/** Chuỗi duy nhất ngắn theo seed để các lần chạy không tạo bản ghi trùng tên. */
const tag = (p: Profile) => (p.seed % 1679616).toString(36).toUpperCase().padStart(4, '0');

/**
 * Giá trị mới giống thật thay cho giá trị đã quay. Ưu tiên theo hình dạng giá trị (ngày, email, SĐT, CCCD), rồi theo nhãn trường
 * (tên, địa chỉ, chức danh, số lượng…); văn bản tự do giữ nội dung đã quay nhưng thêm mã duy nhất. Số ngắn (số lượng, thứ tự) giữ nguyên.
 * Ngày được dời cùng một số ngày (hôm nay − ngày quay) nên thứ tự "bắt đầu < kết thúc" của bản quay vẫn đúng.
 */
export function autoValue(p: Profile, label: string, recorded: string, opts: AutoOpts = {}): string {
  const r = (recorded ?? '').trim();
  if (!r) return recorded;
  const date = shiftDate(r, opts.shiftDays ?? 0);
  if (date) return date;
  if (/@/.test(r)) return p.email;
  const digits = r.replace(/[\s.()+-]/g, '');
  if (/^(\+?84|0)\d{9,10}$/.test(digits)) return p.phone;
  if (/^\d{12}$/.test(digits)) return p.cccd;
  const byLabel = valueOrNull(p, label, '', 'INPUT', opts.n ?? 1);
  if (byLabel != null && !/^\d+$/.test(r)) return byLabel;
  if (/^\d+$/.test(r)) return byLabel != null && r.length <= 3 ? byLabel : r.length <= 3 ? r : r.slice(0, -4) + String(p.seed % 10000).padStart(4, '0');
  return /\d{4,}$/.test(r) ? r.replace(/\d{4,}$/, tag(p)) : `${r} ${tag(p)}`;
}
