'use client';

import Link from 'next/link';
import { useState } from 'react';
import { updateCurrentUser, type AuthUser } from '@/lib/auth';
import { useAuth } from '@/components/providers/AuthProvider';

const input = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

export default function ReceptionistProfile({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const { refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: user.first_name, last_name: user.last_name, phone: user.phone });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await updateCurrentUser(form);
      await refreshUser();
      setEditing(false);
      setNotice('Đã lưu thông tin hồ sơ lễ tân.');
    } catch {
      setNotice('Không thể lưu thông tin. Vui lòng thử lại.');
    } finally { setSaving(false); }
  }

  const name = user.full_name || user.username;
  const initials = name.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase();
  const cards = [
    ['calendar_month', 'Lịch hẹn telemedicine', 'Theo dõi lịch đã xác nhận và hỗ trợ bệnh nhân vào phòng tư vấn.', '/telemedicine/', 'Quản lý lịch hẹn'],
    ['folder_shared', 'Kho phim bệnh nhân', 'Tra cứu mã bệnh nhân, tải phim mới và theo dõi dữ liệu toàn hệ thống.', '/reception/data/', 'Mở kho dữ liệu'],
    ['support_agent', 'Hỗ trợ bệnh nhân', 'Kiểm tra thông tin trước giờ hẹn và nhắc lịch theo quy trình của phòng khám.', '/telemedicine/', 'Mở danh sách hôm nay'],
  ];

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-5 lg:p-7">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-primary to-blue-700 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-5 px-6 py-6 lg:px-8">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium"><span className="material-symbols-outlined text-[16px]">badge</span>Hồ sơ lễ tân</span>
            <h2 className="mt-3 font-serif text-2xl font-semibold">{name}</h2>
            <p className="mt-1 text-sm text-white/80">Không gian điều phối lịch hẹn, hồ sơ và phim bệnh nhân.</p>
          </div>
          <Link href="/telemedicine/" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-primary shadow-sm hover:bg-blue-50">
            <span className="material-symbols-outlined text-[19px]">calendar_month</span>Quản lý lịch hẹn
          </Link>
        </div>
      </section>

      {notice && <p className="rounded-xl border border-primary/15 bg-primary-50 px-4 py-3 text-sm text-primary">{notice}</p>}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-lg font-semibold text-teal-700">{initials}</span>
            <div><h3 className="font-serif text-lg font-semibold text-gray-900">Thông tin cá nhân</h3><p className="text-xs text-gray-500">Tài khoản lễ tân đang hoạt động</p></div>
          </div>
          {editing ? (
            <form onSubmit={save} className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3"><input className={input} placeholder="Họ" value={form.last_name} onChange={e => setForm(x => ({ ...x, last_name: e.target.value }))}/><input className={input} placeholder="Tên" value={form.first_name} onChange={e => setForm(x => ({ ...x, first_name: e.target.value }))}/></div>
              <input className={input} placeholder="Số điện thoại" value={form.phone} onChange={e => setForm(x => ({ ...x, phone: e.target.value }))}/>
              <div className="flex gap-2"><button disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button><button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600">Huỷ</button></div>
            </form>
          ) : <>
            <dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-gray-500">Email</dt><dd className="text-right text-gray-800">{user.email}</dd></div><div className="flex justify-between gap-3"><dt className="text-gray-500">Điện thoại</dt><dd className="text-right text-gray-800">{user.phone || 'Chưa cập nhật'}</dd></div><div className="flex justify-between gap-3"><dt className="text-gray-500">Vai trò</dt><dd className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Lễ tân</dd></div></dl>
            <button onClick={() => setEditing(true)} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><span className="material-symbols-outlined text-[17px]">edit</span>Chỉnh sửa hồ sơ</button>
          </>}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between"><div><h3 className="font-serif text-lg font-semibold text-gray-900">Công việc lễ tân</h3><p className="mt-1 text-xs text-gray-500">Các tác vụ tiếp nhận, quản lý phim và hỗ trợ lịch hẹn.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Khu vực lễ tân</span></div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">{cards.map(([icon, title, description, href, action]) => <Link key={title} href={href} className="group rounded-xl border border-gray-200 p-4 transition hover:border-primary/30 hover:shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary"><span className="material-symbols-outlined text-[21px]">{icon}</span></span><h4 className="mt-3 text-sm font-semibold text-gray-900">{title}</h4><p className="mt-1 min-h-12 text-xs leading-relaxed text-gray-500">{description}</p><span className="mt-3 inline-flex text-xs font-medium text-primary group-hover:underline">{action}</span></Link>)}</div>
        </div>
      </section>

      <section id="work-files">{children}</section>
    </div>
  );
}
