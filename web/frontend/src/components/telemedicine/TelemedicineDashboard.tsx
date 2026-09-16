'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

type DemoRole = 'doctor' | 'receptionist';
type CalendarView = 'month' | 'week' | 'list';
type AppointmentState = 'confirmed' | 'upcoming' | 'completed' | 'pending' | 'cancelled';

type Appointment = {
  id: string;
  date: string;
  start: string;
  end: string;
  duration: number;
  mode: string;
  patient: string;
  age: number;
  gender: string;
  phone: string;
  reason: string;
  state: AppointmentState;
  doctor: string;
  specialty: string;
  room: string;
  doctorConfirm: string;
  patientConfirm: string;
  reminder: string;
  source: string;
  createdAt: string;
  createdBy: string;
  aiFinding: string;
  tooth: string;
  confidence: number;
  image: string;
  note: string;
};

const DOCTOR_TABS = ['Lịch hẹn của tôi', 'Phòng khám từ xa', 'Hồ sơ bệnh nhân', 'Kết quả AI', 'Thống kê'];
const RECEPTION_TABS = ['Tất cả lịch hẹn', 'Quản lý lịch bác sĩ', 'Danh sách bác sĩ', 'Hàng chờ & Yêu cầu', 'Báo cáo'];

const APPOINTMENTS: Appointment[] = [
  {
    id: 'TM-260914-018', date: '14/09/2026', start: '08:30', end: '09:00', duration: 30,
    mode: 'Video call', patient: 'Nguyễn Thu Hà', age: 32, gender: 'Nữ', phone: '0903 215 684',
    reason: 'Chảy máu chân răng khi đánh răng, lợi sưng đỏ 5 ngày gần đây.', state: 'completed',
    doctor: 'BS. Nguyễn Minh Anh', specialty: 'Nha chu', room: 'DENT-ONLINE-02',
    doctorConfirm: 'Đã xác nhận', patientConfirm: 'Đã xác nhận', reminder: 'Zalo', source: 'Ứng dụng DentAI',
    createdAt: '12/09/2026 · 09:42', createdBy: 'Bệnh nhân tự đặt',
    aiFinding: 'Dấu hiệu viêm lợi mức độ trung bình, vùng lợi viền có biểu hiện sung huyết.',
    tooth: 'Vùng răng 13–23', confidence: 92, image: '/demo/qa-gingivitis.jpg',
    note: 'Hướng dẫn vệ sinh kẽ răng; tái khám trực tiếp nếu chảy máu kéo dài trên 7 ngày.',
  },
  {
    id: 'TM-260914-021', date: '14/09/2026', start: '10:15', end: '10:45', duration: 30,
    mode: 'Tái khám', patient: 'Trần Quốc Bảo', age: 27, gender: 'Nam', phone: '0918 440 129',
    reason: 'Trao đổi kết quả phim CBCT và hướng xử trí răng nanh ngầm.', state: 'upcoming',
    doctor: 'BS. Trần Hoàng Nam', specialty: 'Chỉnh nha', room: 'DENT-ONLINE-05',
    doctorConfirm: 'Đã xác nhận', patientConfirm: 'Đã xác nhận', reminder: 'SMS', source: 'Lễ tân tạo lịch',
    createdAt: '13/09/2026 · 14:08', createdBy: 'Lê Thảo Nguyên (Lễ tân)',
    aiFinding: 'Răng nanh hàm trên mọc ngầm, hướng lệch gần và tiếp cận chân răng cửa bên.',
    tooth: 'Răng 13', confidence: 89, image: '/demo/qa-teeth.jpg',
    note: 'Đã xem phim; cần giải thích phương án kéo chỉnh nha và thời gian điều trị dự kiến.',
  },
  {
    id: 'TM-260914-027', date: '14/09/2026', start: '14:00', end: '14:20', duration: 20,
    mode: 'Chat tư vấn', patient: 'Lê Minh Khang', age: 41, gender: 'Nam', phone: '0971 662 843',
    reason: 'Ê buốt răng hàm trái khi uống lạnh, cần tư vấn trước khi đến khám.', state: 'pending',
    doctor: 'BS. Nguyễn Minh Anh', specialty: 'Răng Hàm Mặt', room: 'DENT-ONLINE-02',
    doctorConfirm: 'Chờ xác nhận', patientConfirm: 'Đã xác nhận', reminder: 'Zalo', source: 'Tổng đài 1900',
    createdAt: '14/09/2026 · 07:18', createdBy: 'Vũ Mai Anh (Lễ tân)',
    aiFinding: 'Có thể liên quan mòn cổ răng hoặc tổn thương sâu răng sớm; cần ảnh cận cảnh bổ sung.',
    tooth: 'Răng 35–37', confidence: 76, image: '/demo/qa-teeth.jpg',
    note: 'Chưa đủ dữ liệu để kết luận. Khai thác thêm thời điểm và mức độ đau.',
  },
];

const CALENDAR_DATA: Record<number, { doctor: string; patient: string; state: AppointmentState; count?: number; unassigned?: boolean }[]> = {
  1: [{ doctor: 'BS. Minh Anh', patient: 'Ngọc Mai · 08:30', state: 'completed' }, { doctor: 'BS. Hoàng Nam', patient: 'Văn Hải · 14:00', state: 'completed' }],
  2: [{ doctor: 'BS. Hoàng Nam', patient: 'Thu Trang · 09:00', state: 'completed' }, { doctor: 'BS. Minh Anh', patient: 'Đức Long · 15:30', state: 'completed' }],
  3: [{ doctor: 'BS. Võ Thanh Tùng', patient: 'Gia Bảo · 10:00', state: 'completed' }, { doctor: 'BS. Minh Anh', patient: 'Hương Giang · 16:00', state: 'completed' }],
  4: [{ doctor: 'BS. Minh Anh', patient: 'Mai Linh · 08:00', state: 'completed' }, { doctor: 'BS. Hoàng Nam', patient: 'Quốc Việt · 13:30', state: 'cancelled' }],
  5: [{ doctor: 'BS. Võ Thanh Tùng', patient: 'Hoàng Anh · 09:30', state: 'completed' }],
  7: [{ doctor: 'BS. Minh Anh', patient: 'Thuỳ Dung · 08:30', state: 'completed' }, { doctor: 'BS. Hoàng Nam', patient: 'Minh Đức · 15:00', state: 'completed', count: 2 }],
  8: [{ doctor: 'BS. Hoàng Nam', patient: 'Thanh Hà · 09:15', state: 'completed' }, { doctor: 'BS. Võ Thanh Tùng', patient: 'Anh Khoa · 14:30', state: 'completed' }],
  9: [{ doctor: 'BS. Minh Anh', patient: 'Bảo Trân · 08:00', state: 'completed' }, { doctor: 'Chưa gán bác sĩ', patient: '1 yêu cầu mới', state: 'pending', unassigned: true }],
  10: [{ doctor: 'BS. Võ Thanh Tùng', patient: 'Minh Châu · 10:30', state: 'completed' }, { doctor: 'BS. Minh Anh', patient: 'Tuấn Kiệt · 16:30', state: 'completed' }],
  11: [{ doctor: 'BS. Hoàng Nam', patient: 'Khánh Ly · 09:00', state: 'completed' }, { doctor: 'BS. Minh Anh', patient: 'Yến Nhi · 14:00', state: 'completed', count: 1 }],
  12: [{ doctor: 'BS. Võ Thanh Tùng', patient: 'Đăng Khoa · 11:00', state: 'completed' }],
  14: [{ doctor: 'BS. Minh Anh', patient: 'Thu Hà · 08:30', state: 'completed' }, { doctor: 'BS. Hoàng Nam', patient: 'Quốc Bảo · 10:15', state: 'upcoming' }, { doctor: 'BS. Minh Anh', patient: 'Minh Khang · 14:00', state: 'pending', count: 2 }],
  15: [{ doctor: 'BS. Võ Thanh Tùng', patient: 'Hoài An · 08:45', state: 'confirmed' }, { doctor: 'BS. Minh Anh', patient: 'Ngọc Sơn · 13:00', state: 'confirmed' }],
  16: [{ doctor: 'BS. Hoàng Nam', patient: 'Quỳnh Như · 09:30', state: 'confirmed' }, { doctor: 'Chưa gán bác sĩ', patient: '2 yêu cầu mới', state: 'pending', unassigned: true }],
  17: [{ doctor: 'BS. Minh Anh', patient: 'Hữu Phúc · 10:00', state: 'confirmed' }, { doctor: 'BS. Võ Thanh Tùng', patient: 'Thanh Thảo · 15:00', state: 'confirmed' }],
  18: [{ doctor: 'BS. Hoàng Nam', patient: 'Bảo Ngọc · 08:30', state: 'confirmed' }, { doctor: 'BS. Minh Anh', patient: 'Hải Yến · 14:30', state: 'confirmed', count: 1 }],
  19: [{ doctor: 'BS. Võ Thanh Tùng', patient: 'Nhật Minh · 09:00', state: 'confirmed' }],
  21: [{ doctor: 'BS. Minh Anh', patient: 'Hà My · 08:30', state: 'confirmed' }, { doctor: 'BS. Hoàng Nam', patient: 'Đức Anh · 15:30', state: 'confirmed' }],
  22: [{ doctor: 'BS. Võ Thanh Tùng', patient: 'Minh Khoa · 09:00', state: 'confirmed' }, { doctor: 'Chưa gán bác sĩ', patient: '1 yêu cầu mới', state: 'pending', unassigned: true }],
  23: [{ doctor: 'BS. Minh Anh', patient: 'Thảo Vy · 10:30', state: 'confirmed' }, { doctor: 'BS. Hoàng Nam', patient: 'Quang Huy · 14:00', state: 'confirmed' }],
  24: [{ doctor: 'BS. Hoàng Nam', patient: 'Ngọc Bích · 08:45', state: 'confirmed' }, { doctor: 'BS. Võ Thanh Tùng', patient: 'Gia Hân · 16:00', state: 'confirmed' }],
  25: [{ doctor: 'BS. Minh Anh', patient: 'Khôi Nguyên · 09:30', state: 'confirmed' }, { doctor: 'BS. Hoàng Nam', patient: 'Mai Chi · 15:00', state: 'confirmed', count: 2 }],
  26: [{ doctor: 'BS. Võ Thanh Tùng', patient: 'Hồng Phúc · 10:00', state: 'confirmed' }],
  28: [{ doctor: 'BS. Minh Anh', patient: 'Thanh Tâm · 08:30', state: 'confirmed' }, { doctor: 'BS. Hoàng Nam', patient: 'Lâm Anh · 13:30', state: 'confirmed' }],
  29: [{ doctor: 'BS. Võ Thanh Tùng', patient: 'Minh Tú · 09:15', state: 'confirmed' }, { doctor: 'BS. Minh Anh', patient: 'Kim Ngân · 16:00', state: 'confirmed' }],
  30: [{ doctor: 'BS. Hoàng Nam', patient: 'Phúc An · 10:00', state: 'confirmed' }, { doctor: 'Chưa gán bác sĩ', patient: '1 yêu cầu mới', state: 'pending', unassigned: true }],
};

const DAYS = Array.from({ length: 35 }, (_, index) => {
  const date = new Date(2026, 7, 31 + index);
  return { day: date.getDate(), month: date.getMonth() + 1, outside: date.getMonth() !== 8, sunday: index % 7 === 6 };
});

const stateLabel: Record<AppointmentState, string> = {
  confirmed: 'Đã xác nhận', upcoming: 'Sắp diễn ra', completed: 'Hoàn tất', pending: 'Chờ xác nhận', cancelled: 'Đã huỷ',
};

const stateStyle: Record<AppointmentState, string> = {
  confirmed: 'border-blue-200 bg-blue-50 text-blue-700',
  upcoming: 'border-blue-300 bg-blue-100 text-blue-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
};

function Icon({ children, className = '' }: { children: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{children}</span>;
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase();
}

function ActionButton({ icon, children, primary = false, danger = false, onClick }: { icon: string; children: React.ReactNode; primary?: boolean; danger?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors ${primary ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : danger ? 'border-red-200 bg-white text-red-600 hover:bg-red-50' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'}`}>
      <Icon className="text-[18px]">{icon}</Icon>{children}
    </button>
  );
}

function StatusBadge({ state }: { state: AppointmentState }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${stateStyle[state]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{stateLabel[state]}</span>;
}

function PersonAvatar({ name, color = 'blue' }: { name: string; color?: 'blue' | 'emerald' | 'violet' }) {
  const colors = { blue: 'bg-blue-100 text-blue-700', emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700' };
  return <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black ${colors[color]}`}>{initials(name)}</span>;
}

function TelemedicineNav({ role, activeTab, setActiveTab }: { role: DemoRole; activeTab: string; setActiveTab: (tab: string) => void }) {
  const { user, logout } = useAuth();
  const tabs = role === 'doctor' ? DOCTOR_TABS : RECEPTION_TABS;
  const profile = role === 'doctor'
    ? { name: user?.role === 'doctor' ? user.full_name || 'BS. Nguyễn Minh Anh' : 'BS. Nguyễn Minh Anh', email: user?.role === 'doctor' ? user.email : 'minhanh@dentai.vn' }
    : { name: user?.role === 'receptionist' ? user.full_name || 'Lê Thảo Nguyên' : 'Lê Thảo Nguyên', email: user?.role === 'receptionist' ? user.email : 'letan@dentai.vn' };

  async function handleLogout() {
    await logout();
    window.location.href = '/login/';
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex min-h-[68px] max-w-[1900px] items-center gap-5 px-5 2xl:px-8">
        <div className="flex shrink-0 items-center gap-3 border-r border-slate-200 pr-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm"><Icon className="text-[25px]">dentistry</Icon></span>
          <div><div className="flex items-baseline gap-1.5"><span className="text-lg font-black tracking-tight text-slate-900">DentAI</span><span className="text-sm font-bold text-blue-600">Telemedicine</span></div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Chăm sóc nha khoa từ xa</p></div>
        </div>

        <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto xl:flex" aria-label="Điều hướng Telemedicine">
          {tabs.map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${activeTab === tab ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>{tab}</button>)}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Thông báo"><Icon className="text-[21px]">notifications</Icon><span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-red-500" /></button>
          <div className="hidden items-center gap-2.5 lg:flex"><PersonAvatar name={profile.name} /><div className="max-w-36"><p className="truncate text-xs font-bold text-slate-800">{profile.name}</p><p className="truncate text-[10px] text-slate-400">{profile.email}</p></div></div>
          <button onClick={handleLogout} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600"><Icon className="text-[18px]">logout</Icon><span className="hidden 2xl:inline">Đăng xuất</span></button>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 xl:hidden">{tabs.map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${activeTab === tab ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>{tab}</button>)}</div>
    </header>
  );
}

function CalendarChip({ item, role }: { item: (typeof CALENDAR_DATA)[number][number]; role: DemoRole }) {
  if (item.unassigned) return <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/60 px-2 py-1.5 text-[10px] font-bold leading-tight text-amber-800"><span className="block truncate">Chưa gán bác sĩ</span><span className="mt-0.5 block truncate font-medium">{item.patient}</span></div>;
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] leading-tight ${stateStyle[item.state]}`}>
      <span className="block truncate font-bold">{role === 'doctor' ? item.patient : item.doctor}</span>
      <span className="mt-0.5 block truncate font-medium opacity-80">{role === 'doctor' ? item.doctor.replace('BS. ', '') : item.patient}</span>
    </div>
  );
}

function MonthCalendar({ role, selectedDay, setSelectedDay }: { role: DemoRole; selectedDay: number; setSelectedDay: (day: number) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
        {['T2|Thứ Hai', 'T3|Thứ Ba', 'T4|Thứ Tư', 'T5|Thứ Năm', 'T6|Thứ Sáu', 'T7|Thứ Bảy', 'CN|Chủ Nhật'].map((label, index) => {
          const [short, full] = label.split('|');
          return <div key={label} className={`py-3 text-center ${index === 6 ? 'text-red-600' : 'text-slate-500'}`}><p className="text-[10px] font-black uppercase">{short}</p><p className="mt-0.5 text-xs font-bold">{full}</p></div>;
        })}
      </div>
      <div className="grid grid-cols-7">
        {DAYS.map((date, index) => {
          const entries = date.outside ? [] : CALENDAR_DATA[date.day] || [];
          const selected = date.day === selectedDay && !date.outside;
          const today = date.day === 14 && !date.outside;
          return (
            <button key={`${date.month}-${date.day}`} onClick={() => !date.outside && setSelectedDay(date.day)} className={`relative min-h-[148px] border-b border-r border-slate-100 p-2 text-left align-top transition hover:z-10 hover:bg-blue-50/30 ${date.outside ? 'bg-slate-50/70 text-slate-300' : 'bg-white'} ${selected ? 'z-10 ring-2 ring-inset ring-blue-500' : ''}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className={`flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-xs font-black ${today ? 'bg-blue-600 text-white' : date.sunday ? 'text-red-600' : date.outside ? 'text-slate-300' : 'text-slate-700'}`}>{date.day}</span>
                <span className={`text-[9px] font-medium ${date.sunday ? 'text-red-400' : 'text-slate-400'}`}>{date.outside ? `Thg ${date.month}` : date.sunday ? 'Nghỉ định kỳ' : index % 7 === 5 ? '08:00–17:00' : '08:00–20:00'}</span>
              </div>
              <div className="space-y-1.5">{entries.slice(0, 3).map((item, chipIndex) => <CalendarChip key={chipIndex} item={item} role={role} />)}</div>
              {entries.some(entry => entry.count) && <span className="mt-1.5 block pl-1 text-[10px] font-bold text-blue-600">+{entries.find(entry => entry.count)?.count} lịch hẹn</span>}
              {date.outside && <span className="absolute inset-x-0 top-1/2 text-center text-[10px] italic text-slate-300">Kế hoạch tháng kế tiếp</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-[11px] font-medium text-slate-500">
        <span className="font-bold text-slate-700">Chú thích trạng thái:</span>
        {[['bg-blue-500', 'Đã xác nhận / Sắp tới'], ['bg-emerald-500', 'Hoàn tất'], ['bg-amber-400', 'Chờ xác nhận / Chưa gán'], ['bg-red-500', 'Huỷ / Quá hạn'], ['bg-violet-500', 'Có phân tích AI']].map(([color, text]) => <span key={text} className="inline-flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-sm ${color}`} />{text}</span>)}
      </div>
    </div>
  );
}

function AlternateCalendarView({ view, role }: { view: CalendarView; role: DemoRole }) {
  if (view === 'week') return (
    <div className="grid min-w-[1000px] grid-cols-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {[14, 15, 16, 17, 18, 19, 20].map((day, index) => <div key={day} className={`min-h-[420px] border-r border-slate-100 p-3 ${day === 14 ? 'bg-blue-50/50' : ''}`}><div className="border-b border-slate-100 pb-3 text-center"><p className={`text-[10px] font-black uppercase ${index === 6 ? 'text-red-500' : 'text-slate-400'}`}>{index === 6 ? 'CN' : `T${index + 2}`}</p><p className={`mt-1 text-xl font-black ${day === 14 ? 'text-blue-600' : 'text-slate-700'}`}>{day}</p></div><div className="mt-3 space-y-2">{(CALENDAR_DATA[day] || []).map((item, i) => <CalendarChip key={i} item={item} role={role} />)}</div></div>)}
    </div>
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Mã hẹn</th><th className="px-5 py-4">Ngày & giờ</th><th className="px-5 py-4">Bệnh nhân</th><th className="px-5 py-4">Bác sĩ phụ trách</th><th className="px-5 py-4">Hình thức</th><th className="px-5 py-4">Trạng thái</th></tr></thead><tbody className="divide-y divide-slate-100">{APPOINTMENTS.map(item => <tr key={item.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-mono text-xs font-bold text-blue-700">{item.id}</td><td className="px-5 py-4"><b>{item.date}</b><p className="text-xs text-slate-500">{item.start}–{item.end}</p></td><td className="px-5 py-4 font-semibold">{item.patient}<p className="text-xs font-normal text-slate-500">{item.phone}</p></td><td className="px-5 py-4">{item.doctor}<p className="text-xs text-slate-500">{item.specialty}</p></td><td className="px-5 py-4">{item.mode}</td><td className="px-5 py-4"><StatusBadge state={item.state} /></td></tr>)}</tbody></table></div>
  );
}

function DoctorAppointmentCard({ item, onAction }: { item: Appointment; onAction: (message: string) => void }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center gap-3"><div><p className="text-lg font-black text-slate-900">{item.start} – {item.end}</p><p className="text-[11px] font-medium text-slate-400">{item.duration} phút · {item.mode} · {item.date}</p></div><span className="font-mono text-[11px] font-black text-blue-700">{item.id}</span><StatusBadge state={item.state} /></div>
        <div className="flex flex-wrap gap-2"><ActionButton icon="folder_shared" onClick={() => onAction(`Đã mở bệnh án của ${item.patient}.`)}>Xem bệnh án</ActionButton><ActionButton icon="schedule" onClick={() => onAction(`Đã gửi yêu cầu đổi giờ cho lịch ${item.id}.`)}>Xin đổi giờ</ActionButton><ActionButton icon="videocam" primary onClick={() => onAction(`Đang chuẩn bị phòng khám ${item.room}…`)}>Vào phòng khám</ActionButton></div>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[.9fr_1fr_1.35fr]">
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Bác sĩ phụ trách</p><div className="mt-2 flex items-center gap-3"><PersonAvatar name={item.doctor} /><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{item.doctor}</p><p className="text-[11px] text-slate-500">{item.specialty} · {item.room}</p><p className="mt-1 text-[10px] font-bold text-emerald-700">{item.doctorConfirm}</p></div></div></div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Bệnh nhân</p><div className="mt-2 flex items-center gap-3"><PersonAvatar name={item.patient} color="emerald" /><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{item.patient}</p><p className="text-[11px] text-slate-500">{item.age} tuổi · {item.gender}</p><p className="mt-1 text-xs font-bold text-slate-700">{item.phone}</p></div></div></div>
        <div className="grid grid-cols-[68px_1fr] gap-3 rounded-xl border border-slate-200 p-3"><div className="relative min-h-20 overflow-hidden rounded-lg bg-slate-900"><Image src={item.image} alt={`Ảnh của ${item.patient}`} fill className="object-cover opacity-90" sizes="68px" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nội dung tư vấn</p><p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-700">{item.reason}</p><div className="mt-1.5 flex items-center gap-2 text-[10px] text-violet-700"><Icon className="text-[14px]">auto_awesome</Icon><b>DentAI {item.confidence}%</b><span>· {item.tooth}</span><button onClick={() => onAction(`Đã mở kết quả AI của lịch ${item.id}.`)} className="ml-auto font-bold hover:underline">Xem AI</button></div></div></div>
      </div>
    </article>
  );
}

function ReceptionAppointmentCard({ item, onAction }: { item: Appointment; onAction: (message: string) => void }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center gap-3"><div><p className="text-lg font-black text-slate-900">{item.start} – {item.end}</p><p className="text-[11px] font-medium text-slate-400">{item.duration} phút · {item.mode} · {item.date}</p></div><span className="font-mono text-[11px] font-black text-blue-700">{item.id}</span><StatusBadge state={item.state} /></div>
        <div className="flex flex-wrap gap-2"><ActionButton icon="person_swap" onClick={() => onAction(`Đang mở danh sách bác sĩ thay thế cho ${item.id}.`)}>Đổi bác sĩ</ActionButton><ActionButton icon="schedule" onClick={() => onAction(`Đang chọn khung giờ mới cho ${item.id}.`)}>Đổi giờ</ActionButton><ActionButton icon="send" onClick={() => onAction(`Đã gửi nhắc hẹn qua ${item.reminder} cho ${item.patient}.`)}>Gửi nhắc</ActionButton><ActionButton icon="event_busy" danger onClick={() => onAction(`Yêu cầu huỷ lịch ${item.id} đang chờ xác nhận.`)}>Huỷ hẹn</ActionButton></div>
      </div>
      <div className="mt-3 grid items-stretch gap-3 lg:grid-cols-[1fr_36px_1fr_1.15fr]">
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Bác sĩ phụ trách</p><div className="mt-2 flex items-center gap-3"><PersonAvatar name={item.doctor} /><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{item.doctor}</p><p className="text-[11px] text-slate-500">{item.specialty} · {item.room}</p><p className="mt-1 text-[10px] font-bold text-emerald-700">{item.doctorConfirm}</p></div></div></div>
        <div className="flex items-center justify-center"><span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm"><Icon className="text-[20px]">sync_alt</Icon></span></div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Bệnh nhân</p><div className="mt-2 flex items-center gap-3"><PersonAvatar name={item.patient} color="emerald" /><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{item.patient}</p><p className="text-[11px] text-slate-500">{item.age} tuổi · {item.gender}</p><p className="mt-1 text-xs font-bold text-slate-700">{item.phone}</p></div></div><div className="mt-2 flex items-center justify-between text-[10px]"><span className="font-bold text-emerald-700">{item.patientConfirm}</span><span className="font-bold text-slate-500">Nhắc qua {item.reminder}</span></div></div>
        <div className="rounded-xl bg-slate-50 p-3 text-[11px]"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Thông tin lịch hẹn</p><p className="mt-1.5 line-clamp-2 font-medium leading-5 text-slate-700">{item.reason}</p><div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2"><div><span className="text-slate-400">Nguồn</span><p className="truncate font-bold text-slate-600">{item.source}</p></div><div><span className="text-slate-400">Tạo lúc</span><p className="truncate font-bold text-slate-600">{item.createdAt.split(' · ')[1]}</p></div><div><span className="text-slate-400">Người tạo</span><p className="truncate font-bold text-slate-600">{item.createdBy}</p></div></div></div>
      </div>
    </article>
  );
}

function DoctorStatusStrip() {
  const doctors = [
    ['BS. Nguyễn Minh Anh', 'Online', '3 slot trống', 'emerald'], ['BS. Trần Hoàng Nam', 'Đang khám', '2 slot trống', 'blue'], ['BS. Võ Thanh Tùng', 'Bận', '1 slot trống', 'amber'], ['BS. Phạm Thu Hiền', 'Online', '4 slot trống', 'emerald'], ['BS. Lê Quang Huy', 'Nghỉ', '0 slot trống', 'slate'],
  ];
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-black text-slate-900">Tình trạng bác sĩ hôm nay</h3><p className="text-xs text-slate-500">Cập nhật thời gian thực · 09:42</p></div><button className="text-xs font-bold text-blue-700">Xem lịch trực →</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{doctors.map(([name, status, slots, color]) => <div key={name} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="relative"><PersonAvatar name={name} color={color === 'emerald' ? 'emerald' : color === 'blue' ? 'blue' : 'violet'} /><i className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${color === 'emerald' ? 'bg-emerald-500' : color === 'blue' ? 'bg-blue-500' : color === 'amber' ? 'bg-amber-400' : 'bg-slate-400'}`} /></div><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{name}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-500">{status} · {slots}</p></div></div>)}</div></section>;
}

function WaitingQueue({ onAssign }: { onAssign: (patient: string) => void }) {
  const rows = [
    ['09:12', 'Hoàng Ngọc Lan', 'Sưng đau vùng răng khôn, khó há miệng', 'Khẩn', '94'],
    ['08:48', 'Đinh Văn Trung', 'Chảy máu lợi kéo dài sau điều trị', 'Cao', '82'],
    ['08:31', 'Phan Hà My', 'Tư vấn kết quả X-quang răng 38', 'Trung bình', '67'],
    ['07:55', 'Ngô Minh Quân', 'Ê buốt sau tẩy trắng răng', 'Thấp', '41'],
  ];
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="text-sm font-black text-slate-900">Hàng chờ & Yêu cầu mới</h3><p className="text-xs text-slate-500">AI hỗ trợ xếp mức ưu tiên theo triệu chứng khai báo</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">4 yêu cầu chờ</span></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Giờ gửi</th><th className="px-5 py-3">Bệnh nhân</th><th className="px-5 py-3">Triệu chứng</th><th className="px-5 py-3">AI ưu tiên</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(([time, patient, symptom, priority, score]) => <tr key={patient} className="hover:bg-slate-50"><td className="px-5 py-3 font-mono font-bold text-slate-700">{time}</td><td className="px-5 py-3 font-bold text-slate-800">{patient}</td><td className="px-5 py-3 text-slate-600">{symptom}</td><td className="px-5 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${priority === 'Khẩn' ? 'bg-red-50 text-red-700' : priority === 'Cao' ? 'bg-amber-50 text-amber-700' : priority === 'Trung bình' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}><Icon className="text-[14px]">auto_awesome</Icon>{priority} · {score}/100</span></td><td className="px-5 py-3 text-right"><button onClick={() => onAssign(patient)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Phân bác sĩ</button></td></tr>)}</tbody></table></div></section>;
}

export default function TelemedicineDashboard() {
  const { user } = useAuth();
  const role: DemoRole = user?.role === 'receptionist' ? 'receptionist' : 'doctor';
  const [activeTab, setActiveTab] = useState(role === 'doctor' ? DOCTOR_TABS[0] : RECEPTION_TABS[0]);
  const [view, setView] = useState<CalendarView>('month');
  const [selectedDay, setSelectedDay] = useState(14);
  const [monthOffset, setMonthOffset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [doctorFilter, setDoctorFilter] = useState(role === 'doctor' ? 'Tất cả hình thức tư vấn' : 'Tất cả bác sĩ');
  const [statusFilter, setStatusFilter] = useState('Tất cả trạng thái');
  const monthLabel = useMemo(() => {
    const date = new Date(2026, 8 + monthOffset, 1);
    return `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`;
  }, [monthOffset]);
  const selectedAppointments = selectedDay === 14 ? APPOINTMENTS : APPOINTMENTS.slice(0, selectedDay % 3 === 0 ? 3 : 2).map(item => ({ ...item, id: `${item.id.slice(0, -2)}${String(selectedDay).padStart(2, '0')}`, date: `${String(selectedDay).padStart(2, '0')}/09/2026` }));

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3400);
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-800">
      <TelemedicineNav role={role} activeTab={activeTab} setActiveTab={setActiveTab} />
      {notice && <div className="fixed right-5 top-20 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><Icon className="text-[19px]">check_circle</Icon></span><span>{notice}</span><button onClick={() => setNotice(null)} className="ml-2 text-slate-400"><Icon className="text-[18px]">close</Icon></button></div>}

      <main className="mx-auto max-w-[1900px] space-y-4 px-4 py-5 2xl:px-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-black tracking-tight text-slate-900">{role === 'doctor' ? 'Lịch hẹn của tôi' : 'Quản lý lịch hẹn Telemedicine'}</h1><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Đã đồng bộ DentAI</span></div><p className="mt-2 text-sm text-slate-500"><b className="text-slate-700">Cơ sở chính:</b> Phòng khám Răng Hàm Mặt – Nhà G6 <span className="mx-2 text-slate-300">|</span> Chuyên khoa Răng Hàm Mặt & Điều trị từ xa</p></div>
            <div className="flex flex-wrap gap-2">{role === 'doctor' ? <><ActionButton icon="video_camera_front" onClick={() => showNotice('Phòng khám từ xa đã sẵn sàng.')}>Mở phòng khám</ActionButton><ActionButton icon="event_note" onClick={() => showNotice('Đã mở khung đăng ký lịch làm việc.')}>Đăng ký lịch làm việc</ActionButton><ActionButton icon="add" primary onClick={() => showNotice('Đã mở form tạo ghi chú tư vấn nhanh.')}>Tạo ghi chú nhanh</ActionButton></> : <><ActionButton icon="download" onClick={() => showNotice('Đã tạo bản xuất Excel/PDF demo.')}>Xuất Excel/PDF</ActionButton><ActionButton icon="add" primary onClick={() => showNotice('Đã mở biểu mẫu tạo lịch hẹn mới.')}>Tạo lịch hẹn mới</ActionButton><ActionButton icon="save" primary onClick={() => showNotice('Đã lưu toàn bộ thay đổi lịch hẹn.')}>Lưu thay đổi</ActionButton></>}</div>
          </div>

          <div className="mt-5 grid items-end gap-3 border-t border-slate-100 pt-4 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto_auto]">
            <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">{role === 'doctor' ? 'Phòng khám / Hình thức' : 'Bác sĩ phụ trách'}</span><select value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"><option>{role === 'doctor' ? 'Tất cả hình thức tư vấn' : 'Tất cả bác sĩ'}</option><option>{role === 'doctor' ? 'Video call' : 'BS. Nguyễn Minh Anh'}</option><option>{role === 'doctor' ? 'Chat tư vấn' : 'BS. Trần Hoàng Nam'}</option><option>{role === 'doctor' ? 'Tái khám' : 'Chưa gán bác sĩ'}</option></select></label>
            <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">Trạng thái lịch hẹn</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400"><option>Tất cả trạng thái</option><option>Đã xác nhận</option><option>Sắp diễn ra</option><option>Hoàn tất</option><option>Chờ xác nhận</option><option>Đã huỷ</option></select></label>
            <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white p-1"><button onClick={() => setMonthOffset(value => value - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Icon className="text-[19px]">chevron_left</Icon></button><span className="min-w-32 text-center text-sm font-black text-slate-800">{monthLabel}</span><button onClick={() => setMonthOffset(value => value + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Icon className="text-[19px]">chevron_right</Icon></button></div>
            <div className="flex items-center gap-2"><button onClick={() => { setMonthOffset(0); setSelectedDay(14); }} className="h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700">Hôm nay</button><div className="flex h-11 rounded-xl bg-slate-100 p-1">{([['month', 'Lịch tháng'], ['week', 'Lịch tuần'], ['list', 'Danh sách']] as [CalendarView, string][]).map(([value, label]) => <button key={value} onClick={() => setView(value)} className={`rounded-lg px-3 text-xs font-bold transition ${view === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div></div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0f2b68] via-[#1646ae] to-[#3c328a] text-white shadow-lg shadow-blue-900/10">
          <div className="grid items-stretch lg:grid-cols-[1fr_auto]">
            <div className="p-5 lg:p-6"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">Kỳ lịch Telemedicine · Tháng 09/2026</span><span className="rounded-full bg-cyan-300/20 px-2.5 py-1 text-[10px] font-bold text-cyan-100">Quy chế TM-2026.03</span></div><h2 className="mt-3 text-xl font-black tracking-tight">{role === 'doctor' ? 'LỊCH TƯ VẤN TRỰC TUYẾN CỦA BS. NGUYỄN MINH ANH' : 'LỊCH HẸN TELEMEDICINE TOÀN CƠ SỞ'}</h2><p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-100"><span className="inline-flex items-center gap-1.5"><Icon className="text-[16px]">schedule</Icon>Thứ 2 – Thứ 6: 08:00–20:00</span><span>Thứ 7: 08:00–17:00</span><span>Chủ Nhật: Trực cấp cứu online</span></p></div>
            <div className="grid grid-cols-3 divide-x divide-white/10 bg-black/10 lg:min-w-[570px]">{(role === 'doctor' ? [['Tổng hẹn tháng', '32 ca', ''], ['Đã hoàn tất', '18 ca', ''], ['Đã xác nhận', '11 ca', '']] : [['Tổng lịch hẹn', '148 ca', ''], ['Bác sĩ tham gia', '16 BS', ''], ['Chờ phân bác sĩ', '4 ca', 'amber']]).map(([label, value, tone]) => <div key={label} className={`flex flex-col items-center justify-center px-5 py-5 text-center ${tone === 'amber' ? 'bg-amber-400/15' : ''}`}><span className="text-[11px] font-semibold text-blue-100">{label}</span><strong className={`mt-1 text-2xl font-black ${tone === 'amber' ? 'text-amber-300' : 'text-white'}`}>{value}</strong></div>)}</div>
          </div>
        </section>

        {role === 'receptionist' && <DoctorStatusStrip />}

        <div className="overflow-x-auto">{view === 'month' ? <MonthCalendar role={role} selectedDay={selectedDay} setSelectedDay={setSelectedDay} /> : <AlternateCalendarView view={view} role={role} />}</div>

        <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3"><span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-blue-600 text-white"><b className="text-lg leading-none">{selectedDay}</b><small className="mt-1 text-[7px] font-black uppercase">Thứ Hai</small></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black text-slate-900">Lịch hẹn ngày {selectedDay} Tháng 9, 2026</h2><span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold text-blue-700">{selectedDay === 14 ? 'Hôm nay' : `${selectedAppointments.length} lịch hẹn`}</span></div><p className="mt-1 text-[11px] text-slate-500">Phòng khám Răng Hàm Mặt – Nhà G6 · 08:00–20:00</p></div></div>
            <div className="flex flex-wrap gap-2">{role === 'doctor' ? <><ActionButton icon="print" onClick={() => showNotice('Đã mở bản in lịch làm việc trong ngày.')}>In lịch ngày</ActionButton><ActionButton icon="notifications_active" onClick={() => showNotice('Đã bật nhắc trước 15 phút cho các ca sắp tới.')}>Bật nhắc lịch</ActionButton></> : <><ActionButton icon="swap_horiz" onClick={() => showNotice('Đã mở chế độ điều phối lịch hàng loạt.')}>Điều phối lịch</ActionButton><ActionButton icon="sms" onClick={() => showNotice('Đã gửi thông báo Zalo/SMS cho lịch trong ngày.')}>Gửi thông báo Zalo/SMS</ActionButton></>}</div>
          </div>
          <div className="mt-3 space-y-2.5">{selectedAppointments.map(item => role === 'doctor' ? <DoctorAppointmentCard key={item.id} item={item} onAction={showNotice} /> : <ReceptionAppointmentCard key={item.id} item={item} onAction={showNotice} />)}</div>
        </section>

        {role === 'receptionist' && <WaitingQueue onAssign={patient => showNotice(`Đã mở bảng phân bác sĩ cho ${patient}.`)} />}

        <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3 text-[11px] text-slate-400"><span>DentAI Telemedicine © 2026 · Dữ liệu trên màn hình là dữ liệu demo</span><span>Đồng bộ lần cuối: 14/09/2026 · 09:42:18</span></footer>
      </main>
    </div>
  );
}
