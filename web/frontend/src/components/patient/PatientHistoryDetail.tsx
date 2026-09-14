'use client';

import { useEffect, useRef } from 'react';
import type { PatientHistoryDemo } from '@/lib/patient-history-demo';

export default function PatientHistoryDetail({ record, consultation, onClose }: {
  record: PatientHistoryDemo;
  consultation: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} onCancel={onClose} onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }} aria-labelledby="patient-history-title"
      className="m-auto max-h-[85vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl p-0 shadow-xl backdrop:bg-black/40">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
        <div>
          <span className="text-xs font-medium text-primary">Hồ sơ mẫu · {consultation ? record.consultation.code : 'Kết quả chẩn đoán'}</span>
          <h2 id="patient-history-title" className="mt-1 font-serif text-lg font-semibold text-gray-900">
            {consultation ? record.consultation.title : record.title}
          </h2>
        </div>
        <button autoFocus onClick={onClose} aria-label="Đóng chi tiết" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="space-y-5 px-6 py-5 text-sm">
        <div className="rounded-xl bg-primary-50 p-4">
          <p className="font-medium text-gray-900">{record.doctor} · {record.specialty}</p>
          <p className="mt-1 text-xs text-gray-600">
            {new Date(consultation ? record.consultation.date : record.date).toLocaleString('vi-VN')}
            {consultation ? ` · Video online · ${record.consultation.duration} phút · Đã hoàn tất` : ` · ${record.count} ${record.kind === 'gingivitis' ? 'ảnh trong miệng' : 'lát cắt CBCT'}`}
          </p>
        </div>
        {[
          ['Lý do khám', record.reason],
          ['Kết luận', record.conclusion],
          ['Nội dung tư vấn', record.advice],
          ['Theo dõi và tái khám', record.followUp],
        ].map(([label, content]) => (
          <div key={label}>
            <h3 className="font-semibold text-gray-900">{label}</h3>
            <p className="mt-1 leading-relaxed text-gray-600">{content}</p>
          </div>
        ))}
      </div>
    </dialog>
  );
}
