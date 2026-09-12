'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { changePassword, updateCurrentUser } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/users';
import { useRequireRole } from '@/lib/useRequireRole';

const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { allowed, checking } = useRequireRole(['patient']);
  const [profile, setProfile] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ old: '', next: '', confirm: '' });
  const [changing, setChanging] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setProfile({ first_name: user.first_name, last_name: user.last_name, email: user.email, phone: user.phone });
  }, [user]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      await updateCurrentUser(profile);
      await refreshUser();
      setProfileMessage('Đã cập nhật hồ sơ cá nhân.');
    } catch (error) {
      setProfileError(apiErrorMessage(error, 'Không thể cập nhật hồ sơ.'));
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    if (passwords.next !== passwords.confirm) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setChanging(true);
    try {
      await changePassword(passwords.old, passwords.next);
      setPasswords({ old: '', next: '', confirm: '' });
      setPasswordMessage('Đổi mật khẩu thành công.');
    } catch (error) {
      setPasswordError(apiErrorMessage(error, 'Không thể đổi mật khẩu.'));
    } finally {
      setChanging(false);
    }
  }

  if (checking || !allowed || !user) {
    return <div className="flex h-64 items-center justify-center"><span className="material-symbols-outlined animate-spin text-4xl text-gray-300">autorenew</span></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="font-serif text-xl font-semibold text-gray-900">Hồ sơ cá nhân</h1>
        <p className="mt-1 text-sm text-gray-500">Thông tin này sẽ được dùng khi kết nối và đặt hẹn với Telemedicine.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={saveProfile} className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4"><h2 className="text-sm font-semibold text-gray-900">Thông tin liên hệ</h2></div>
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-600">Họ
                <input value={profile.last_name} onChange={e => setProfile(value => ({ ...value, last_name: e.target.value }))} className={`${inputClass} mt-1.5`} />
              </label>
              <label className="text-xs font-medium text-gray-600">Tên
                <input value={profile.first_name} onChange={e => setProfile(value => ({ ...value, first_name: e.target.value }))} className={`${inputClass} mt-1.5`} />
              </label>
            </div>
            <label className="block text-xs font-medium text-gray-600">Email
              <input type="email" required value={profile.email} onChange={e => setProfile(value => ({ ...value, email: e.target.value }))} className={`${inputClass} mt-1.5`} />
            </label>
            <label className="block text-xs font-medium text-gray-600">Số điện thoại
              <input value={profile.phone} onChange={e => setProfile(value => ({ ...value, phone: e.target.value }))} className={`${inputClass} mt-1.5`} placeholder="Ví dụ: 0901234567" />
            </label>
            <label className="block text-xs font-medium text-gray-600">Tên đăng nhập
              <input value={user.username} readOnly className={`${inputClass} mt-1.5 bg-gray-50 text-gray-500`} />
            </label>
            {profileError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{profileError}</p>}
            {profileMessage && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{profileMessage}</p>}
            <div className="flex justify-end"><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50">
              <span className={`material-symbols-outlined text-[18px] ${saving ? 'animate-spin' : ''}`}>{saving ? 'autorenew' : 'save'}</span>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button></div>
          </div>
        </form>

        <div className="space-y-5">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{(user.full_name || user.username).slice(0, 2).toUpperCase()}</span>
              <div><p className="font-medium text-gray-900">{user.full_name || user.username}</p><p className="text-xs text-gray-500">Bệnh nhân · @{user.username}</p></div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              <span className="material-symbols-outlined text-[17px]">verified</span>{user.email_verified ? 'Email đã xác thực' : 'Email chưa xác thực'}
            </div>
          </section>

          <form onSubmit={savePassword} className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4"><h2 className="text-sm font-semibold text-gray-900">Đổi mật khẩu</h2></div>
            <div className="space-y-3 p-5">
              <input type="password" required value={passwords.old} onChange={e => setPasswords(value => ({ ...value, old: e.target.value }))} className={inputClass} placeholder="Mật khẩu hiện tại" />
              <input type="password" required minLength={8} value={passwords.next} onChange={e => setPasswords(value => ({ ...value, next: e.target.value }))} className={inputClass} placeholder="Mật khẩu mới" />
              <input type="password" required minLength={8} value={passwords.confirm} onChange={e => setPasswords(value => ({ ...value, confirm: e.target.value }))} className={inputClass} placeholder="Xác nhận mật khẩu mới" />
              {passwordError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{passwordError}</p>}
              {passwordMessage && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{passwordMessage}</p>}
              <button disabled={changing} className="w-full rounded-xl border border-primary/20 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">{changing ? 'Đang cập nhật…' : 'Đổi mật khẩu'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
