/**
 * Hồ sơ ứng viên GIẢ LẬP nhưng GIỐNG THẬT (tên, CCCD đúng cấu trúc, địa chỉ, học vấn, công việc, người thân…) để điền form bổ sung thông tin.
 * - Nhất quán trong một lần chạy (ngày sinh ↔ CCCD ↔ tuổi ↔ năm học ↔ năm đi làm); mỗi lần chạy sinh một hồ sơ khác nhau (theo seed).
 * - Email LUÔN là hộp thư QA (mọi mail của test chỉ được về đó), không bao giờ sinh email của người thật.
 */

export interface Relative { name: string; relation: string; phone: string; job: string; birthYear: number }
export interface Profile {
  seed: number; gender: 'Nam' | 'Nữ'; fullName: string; birth: Date; age: number; email: string; phone: string; cccd: string; cccdIssued: string; cccdOldIssued: string; cccdOld: string;
  address: string; school: string; major: string; company: string; position: string; salary: number; eduStart: string; eduEnd: string; jobStart: string; jobEnd: string; startWork: string;
  relatives: Relative[]; referee: string; height: number; weight: number; married: boolean; children: number;
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

/** Sinh hồ sơ. `now` chỉ để test cố định thời gian. */
export function makeProfile(seed = Date.now(), email = `${process.env.QA_USERNAME ?? 'qa'}@shinhanbank.com`, now = new Date()): Profile {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const between = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const gender: 'Nam' | 'Nữ' = r() < 0.5 ? 'Nam' : 'Nữ';
  const person = (g: 'Nam' | 'Nữ', surname = pick(SURNAMES)) => `${surname} ${pick(g === 'Nam' ? MIDDLE_M : MIDDLE_F)} ${pick(g === 'Nam' ? GIVEN_M : GIVEN_F)}`;
  const surname = pick(SURNAMES);
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
    seed, gender, fullName: person(gender, surname), birth, age, email, phone: phone(), cccd, cccdIssued: fmtDate(issued), cccdOldIssued: fmtDate(issuedOld), cccdOld,
    address: `Số ${between(1, 120)}, ngõ ${between(1, 300)} ${pick(STREETS)}, phường ${ward}, quận ${district}, Hà Nội`,
    school: pick(SCHOOLS), major: pick(MAJORS), company: pick(COMPANIES), position: pick(POSITIONS), salary: between(15, 35) * 1_000_000,
    eduStart: fmtDate(eduStart), eduEnd: fmtDate(eduEnd), jobStart: fmtDate(jobStart), jobEnd: fmtDate(jobEnd), startWork: fmtDate(startWork),
    relatives, referee: `${person('Nam')} (Trưởng phòng, ${pick(COMPANIES)}, ${phone()})`, height: gender === 'Nam' ? between(165, 180) : between(155, 168), weight: gender === 'Nam' ? between(58, 75) : between(45, 58),
    married, children: married ? between(0, 2) : 0,
  };
}

/**
 * Giá trị cho một ô trống của form cổng ứng viên. `n` = đây là lần thứ mấy gặp nhãn này (kinh nghiệm lần 1, học vấn lần 2, người thân thứ n…).
 * Trả về chuỗi giống dữ liệu thật; ràng buộc đã biết của form: ngày cấp CCCD cũ trước CCCD mới, số người con ≤ 20, SĐT dạng 09xxxxxxxx.
 */
export function portalValue(p: Profile, label: string, placeholder: string, tag: string, n: number): string {
  const l = label.toLowerCase(), ph = placeholder.toLowerCase(), both = `${l} ${ph}`;
  const rel = p.relatives[(Math.max(1, n) - 1) % p.relatives.length];
  const isEdu = n % 2 === 0; // trong form: lần 1 = kinh nghiệm làm việc, lần 2 = học vấn
  if (/số điện thoại|điện thoại|sđt/.test(both)) return n <= 1 ? p.phone : rel.phone;
  if (/ngày cấp cccd cũ|ngày cấp cmnd/.test(l)) return p.cccdOldIssued;
  if (/ngày cấp/.test(l)) return p.cccdIssued; // phải đứng trước luật số CCCD vì nhãn «Ngày cấp CCCD» cũng chứa chữ cccd
  if (/cccd cũ|cmnd/.test(l)) return p.cccdOld;
  if (/cccd|căn cước/.test(l)) return p.cccd;
  if (/email/.test(l)) return p.email;
  if (/nơi cấp/.test(l)) return 'Cục Cảnh sát quản lý hành chính về trật tự xã hội';
  if (/khi nào/.test(l)) return p.startWork;
  if (/ngày bắt đầu/.test(l)) return isEdu ? p.eduStart : p.jobStart;
  if (/ngày kết thúc/.test(l)) return isEdu ? p.eduEnd : p.jobEnd;
  if (/ngày sinh/.test(both)) return fmtDate(p.birth);
  if (/ngày bổ sung|dd\/mm\/yyyy/.test(ph)) return p.startWork;
  if (/lương/.test(both)) return String(p.salary);
  if (/số người/.test(l)) return String(Math.min(p.children, 20) || 1);
  if (/tuổi/.test(l)) return String(p.age);
  if (/chiều cao/.test(l)) return String(p.height);
  if (/cân nặng/.test(l)) return String(p.weight);
  if (/quan hệ/.test(both) && !/phòng ban/.test(both)) return rel.relation;
  if (/nghề nghiệp|công việc hiện tại/.test(both) && !/vị trí/.test(l)) return rel.job;
  if (/năm sinh/.test(both)) return String(rel.birthYear);
  if (/họ và tên|họ tên|tên người|tên đầy đủ/.test(both)) return n <= 1 && /ứng viên|của bạn/.test(both) ? p.fullName : rel.name;
  if (/địa chỉ|nơi ở|thường trú|tạm trú/.test(both)) return p.address;
  if (/người tham chiếu|tham chiếu/.test(both)) return p.referee;
  if (/tên & quan hệ phòng ban|phòng ban làm việc/.test(both)) return `${p.relatives[2].name} (${p.relatives[2].relation}), Phòng Kế toán – Hội sở`;
  if (/vị trí & thời gian|vị trí và thời gian/.test(both)) return `${p.position}, ${p.jobStart.slice(6)}–${p.jobEnd.slice(6)}`;
  if (/tên trường|trường/.test(both)) return p.school;
  if (/chuyên ngành|ngành/.test(both)) return p.major;
  if (/công ty|nơi làm việc|đơn vị công tác|tên tổ chức/.test(both)) return p.company;
  if (/chức vụ|chức danh|vị trí/.test(both)) return p.position;
  if (/kết quả|chứng chỉ|bằng cấp|xếp loại/.test(both)) return isEdu ? 'Tốt nghiệp loại Khá' : 'IELTS 6.5, MOS Excel';
  if (/khóa đào tạo|khoá đào tạo|chương trình đào tạo|đào tạo/.test(both)) return 'Kỹ năng tư vấn và chăm sóc khách hàng';
  if (/kỹ năng/.test(both)) return 'Giao tiếp, đàm phán, phân tích dữ liệu bằng Excel';
  if (/trình độ/.test(both)) return 'Đại học';
  if (/điểm mạnh/.test(both)) return 'Chủ động, có trách nhiệm, làm việc nhóm tốt, học hỏi nhanh';
  if (/điểm yếu/.test(both)) return 'Đôi khi quá cầu toàn, đang cải thiện kỹ năng quản lý thời gian';
  if (/sở thích/.test(both)) return 'Đọc sách, chạy bộ, chơi cầu lông';
  if (/tổ chức|vai trò/.test(both)) return 'Thành viên câu lạc bộ tình nguyện của trường, phụ trách truyền thông';
  if (/thành tựu/.test(both)) return 'Đạt danh hiệu nhân viên xuất sắc năm cuối; vượt chỉ tiêu doanh số 120%';
  if (/mô tả|nhiệm vụ|trách nhiệm/.test(both)) return 'Tư vấn sản phẩm, chăm sóc khách hàng hiện hữu và đạt chỉ tiêu doanh số hằng tháng';
  if (/lý do/.test(both)) return 'Mong muốn có môi trường phát triển nghề nghiệp lâu dài hơn';
  if (tag === 'TEXTAREA') return 'Không có thông tin bổ sung thêm so với hồ sơ đã nộp.';
  return p.fullName.split(' ').pop()!; // ô không nhận diện được: một chữ giống tên thật còn hơn chuỗi vô nghĩa
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
