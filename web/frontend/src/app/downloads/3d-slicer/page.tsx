'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  clearSlicerSetupConfirmation,
  confirmSlicerSetup,
  isSlicerSetupConfirmed,
} from '@/lib/slicer';

type DesktopOS = 'windows' | 'macos' | 'linux' | 'unknown';

const OS_LABEL: Record<DesktopOS, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  unknown: 'Không xác định',
};

const INSTALL_COMMAND: Record<DesktopOS, string> = {
  windows: 'powershell -ExecutionPolicy Bypass -File .\\install_windows.ps1',
  macos: 'chmod +x install_macos.sh && ./install_macos.sh',
  linux: 'chmod +x install_linux.sh && ./install_linux.sh',
  unknown: 'Mở README.md trong gói và chọn hướng dẫn cho hệ điều hành của bạn.',
};

export default function SlicerDownloadPage() {
  const router = useRouter();
  const [os, setOS] = useState<DesktopOS>('unknown');
  const [returnTo, setReturnTo] = useState('/scans/');
  const [testState, setTestState] = useState<'idle' | 'waiting' | 'left' | 'stayed'>('idle');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const platform = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
    if (platform.includes('win')) setOS('windows');
    else if (platform.includes('mac')) setOS('macos');
    else if (platform.includes('linux')) setOS('linux');

    const candidate = new URLSearchParams(window.location.search).get('return');
    // Chỉ chấp nhận đường dẫn nội bộ để không biến nút quay lại thành open redirect.
    if (candidate?.startsWith('/') && !candidate.startsWith('//')) setReturnTo(candidate);
    setConfirmed(isSlicerSetupConfirmed());
  }, []);

  function finishSetup() {
    confirmSlicerSetup();
    setConfirmed(true);
    router.push(returnTo);
  }

  function resetSetup() {
    clearSlicerSetupConfirmation();
    setConfirmed(false);
    setTestState('idle');
  }

  function testIntegration() {
    setTestState('waiting');
    let leftBrowser = false;
    const mark = () => { leftBrowser = true; };
    window.addEventListener('blur', mark, { once: true });
    document.addEventListener('visibilitychange', mark, { once: true });
    const server = window.location.origin;
    window.location.href = `dentai://open?token=test&server=${encodeURIComponent(server)}`;
    window.setTimeout(() => {
      window.removeEventListener('blur', mark);
      document.removeEventListener('visibilitychange', mark);
      setTestState(leftBrowser ? 'left' : 'stayed');
    }, 2800);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href={returnTo} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <span className="material-symbols-outlined text-[15px]">arrow_back</span>
          Quay lại phim
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-gray-900">Cài đặt 3D Slicer</h1>
        <p className="mt-1 text-sm text-gray-500">
          Máy được nhận diện gần đúng là <strong className="text-gray-700">{OS_LABEL[os]}</strong>.
          Hoàn thành hai bước dưới đây một lần trên mỗi máy.
        </p>
      </div>

      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
          confirmed
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        <div className="flex items-center gap-2.5 text-sm">
          <span className="material-symbols-outlined text-[20px]">
            {confirmed ? 'verified' : 'warning'}
          </span>
          <div>
            <p className="font-semibold">
              {confirmed
                ? 'Máy này đã được xác nhận thiết lập 3D Slicer'
                : 'Máy này chưa được xác nhận thiết lập 3D Slicer'}
            </p>
            <p className="text-xs opacity-80">
              Trạng thái được lưu riêng trong trình duyệt hiện tại.
            </p>
          </div>
        </div>
        {confirmed && (
          <button
            type="button"
            onClick={resetSetup}
            className="text-xs font-medium underline underline-offset-2"
          >
            Kiểm tra/cài đặt lại
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <span className="material-symbols-outlined">deployed_code</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Bước 1</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-gray-900">Cài 3D Slicer</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Tải bản Stable phù hợp với hệ điều hành từ trang chính thức của dự án 3D Slicer,
            sau đó cài như một ứng dụng desktop thông thường.
          </p>
          <a
            href="https://download.slicer.org/"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Tải 3D Slicer chính thức
          </a>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <span className="material-symbols-outlined">link</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Bước 2</p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-gray-900">Cài DentAI Slicer Bridge</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Tải gói bridge, giải nén, mở terminal tại thư mục vừa giải nén rồi chạy lệnh:
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">
            {INSTALL_COMMAND[os]}
          </code>
          <a
            href="/api/downloads/slicer-bridge/"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-primary px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary-50"
          >
            <span className="material-symbols-outlined text-[18px]">folder_zip</span>
            Tải DentAI Slicer Bridge (.zip)
          </a>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="font-serif text-lg font-semibold text-gray-900">Kiểm tra tích hợp</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              Bấm kiểm tra. Nếu Slicer mở và báo HTTP 404 với token thử nghiệm thì bridge đã
              được đăng ký đúng; lỗi 404 ở phép thử này là kết quả mong đợi.
            </p>
          </div>
          <button
            type="button"
            onClick={testIntegration}
            disabled={testState === 'waiting'}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">cable</span>
            {testState === 'waiting' ? 'Đang kiểm tra…' : 'Kiểm tra mở Slicer'}
          </button>
        </div>

        {testState === 'left' && (
          <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Trình duyệt đã chuyển tiêu điểm ra ngoài. Nếu 3D Slicer đã mở, hãy bấm
            <strong> Xác nhận đã cài đặt</strong> bên dưới.
          </p>
        )}
        {testState === 'stayed' && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Trình duyệt chưa ghi nhận việc mở ứng dụng. Hãy cài lại bridge, cho phép trình duyệt mở liên kết
            <code className="mx-1">dentai://</code> rồi thử lại.
          </p>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-500">
          <span className="material-symbols-outlined mt-0.5 text-[16px]">info</span>
          <span>
            Trình duyệt không cung cấp API xác nhận chắc chắn ứng dụng desktop đã cài. DentAI dùng
            thay đổi tiêu điểm/độ hiển thị làm tín hiệu gần đúng và luôn giữ phương án tải ZIP thủ công.
          </span>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={finishSetup}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
        >
          Xác nhận đã cài đặt · Quay lại phim
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
