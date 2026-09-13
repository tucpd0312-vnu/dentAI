import type { CaseListItem } from './api';
import type { AuthUser } from './auth';
import type { ScanListItem } from './scans';

export interface PatientHistoryDemo {
  id: string;
  kind: 'gingivitis' | 'canine3d';
  title: string;
  date: string;
  doctor: string;
  specialty: string;
  count: number;
  reason: string;
  conclusion: string;
  advice: string;
  followUp: string;
  consultation: { code: string; date: string; duration: number; title: string };
}

// Frontend fixtures only: never persist these records or use their IDs in API requests.
export const PATIENT_HISTORY_DEMO: PatientHistoryDemo[] = [
  {
    id: 'demo-follow-up', kind: 'gingivitis', title: 'Đánh giá lại tình trạng viêm lợi',
    date: '2026-09-05T09:15:00+07:00', doctor: 'BS. Nguyễn Minh Anh',
    specialty: 'Nha chu', count: 3,
    reason: 'Theo dõi sau lần khám trước; giảm chảy máu lợi khi chải răng.',
    conclusion: 'Hình ảnh theo dõi ghi nhận lợi bớt đỏ và sưng so với lần đầu. Còn viêm nhẹ vùng răng cửa hàm dưới, cần tiếp tục theo dõi tại phòng khám.',
    advice: 'Buổi tư vấn đã trao đổi về cách vệ sinh vùng kẽ răng và ghi nhận thói quen chăm sóc răng miệng của bệnh nhân.',
    followUp: 'Hẹn kiểm tra trực tiếp ngày 03/10/2026 để đánh giá lại sức khỏe nha chu.',
    consultation: { code: 'TV-260906-018', date: '2026-09-06T19:30:00+07:00', duration: 20, title: 'Tái tư vấn sau chăm sóc nha chu' },
  },
  {
    id: 'demo-canine', kind: 'canine3d', title: 'Đánh giá răng nanh ngầm hàm trên',
    date: '2026-08-20T14:10:00+07:00', doctor: 'BS. Trần Hoàng Nam',
    specialty: 'Chỉnh nha', count: 320,
    reason: 'Răng nanh hàm trên bên trái chưa mọc; đánh giá vị trí trên phim CBCT.',
    conclusion: 'Hồ sơ mẫu ghi nhận răng 23 nằm ngầm, hướng về phía khẩu cái. Cần khám chỉnh nha trực tiếp và đối chiếu phim trước khi lập kế hoạch điều trị.',
    advice: 'Bác sĩ đã giải thích vị trí răng trên phim, các bước thăm khám bổ sung và phương án phối hợp chỉnh nha với chuyên khoa phẫu thuật.',
    followUp: 'Đã hẹn khám chuyên khoa chỉnh nha ngày 29/08/2026.',
    consultation: { code: 'TV-260822-011', date: '2026-08-22T10:00:00+07:00', duration: 30, title: 'Giải thích kết quả CBCT và hướng điều trị' },
  },
  {
    id: 'demo-initial', kind: 'gingivitis', title: 'Khám lần đầu · Viêm lợi vùng răng cửa',
    date: '2026-08-08T08:45:00+07:00', doctor: 'BS. Nguyễn Minh Anh',
    specialty: 'Nha chu', count: 4,
    reason: 'Lợi đỏ, dễ chảy máu khi chải răng trong khoảng hai tuần.',
    conclusion: 'Ảnh trong miệng gợi ý viêm lợi mức độ nhẹ đến trung bình vùng răng cửa, có mảng bám quanh viền lợi. Đã trao đổi kết quả và đề nghị kiểm tra trực tiếp.',
    advice: 'Đã tư vấn về vệ sinh răng miệng, làm sạch kẽ răng và thăm khám để đánh giá mảng bám, cao răng.',
    followUp: 'Hẹn gửi ảnh theo dõi đầu tháng 09/2026; đã có hồ sơ đánh giá lại ngày 05/09/2026.',
    consultation: { code: 'TV-260809-006', date: '2026-08-09T18:00:00+07:00', duration: 25, title: 'Tư vấn kết quả viêm lợi lần đầu' },
  },
];

export function createPatientDemoRows(user: AuthUser | null) {
  const patient = {
    id: null,
    name: user?.full_name || user?.username || 'Bệnh nhân',
    patient_code: 'HS-MAU-2026',
    notes: null, created_at: null, is_redacted: false,
  };
  return PATIENT_HISTORY_DEMO.map((demo, index) => {
    const common = { id: -(index + 1), patient, created_at: demo.date, updated_at: demo.date };
    if (demo.kind === 'gingivitis') {
      const item: CaseListItem = {
        ...common, status: 'done', image_count: demo.count, owner: null,
        permission: 'view', is_shared_with_me: false,
      };
      return { kind: 'gingivitis' as const, case: item, demo };
    }
    const scan: ScanListItem = {
      ...common, status: 'ready', modality: 'CBCT', n_slices: demo.count,
      file_size: 0, uploaded_by: null, access_level: 'view', can_manage_shares: false, note: demo.reason,
    };
    return { kind: 'canine3d' as const, scan, demo };
  });
}
