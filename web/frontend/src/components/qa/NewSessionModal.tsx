'use client';

import { useState } from 'react';
import { qaApi, type QASessionDetail } from '@/lib/qa';

interface Props {
  initialImageUrl?: string;
  initialCaseId?: number;
  initialImageIndex?: number;
  onClose: () => void;
  onCreated: (session: QASessionDetail) => void;
}

export default function NewSessionModal({
  initialImageUrl = '',
  initialCaseId,
  initialImageIndex,
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState(
    initialCaseId ? `Trao đổi về ca #${initialCaseId}` : 'Phiên trao đổi chẩn đoán mới'
  );
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [initialContent, setInitialContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề phiên hỏi đáp.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const session = await qaApi.createSession({
        title: title.trim(),
        case: initialCaseId || null,
        image_url: imageUrl.trim(),
        initial_content: initialContent.trim() || undefined,
      });
      onCreated(session);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Không thể tạo phiên hỏi đáp.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">add_comment</span>
            Tạo phiên hỏi đáp mới
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-xl bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Tiêu đề phiên thảo luận <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Thắc mắc về viền lợi răng 21..."
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Đường dẫn ảnh chẩn đoán (URL)
            </label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="/media/cases/... hoặc link ảnh"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            {imageUrl && (
              <p className="mt-1 text-[11px] text-gray-500">
                Ảnh này sẽ hiển thị làm tài liệu để bạn và giảng viên trao đổi, đánh dấu vùng quan tâm.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Câu hỏi ban đầu cho giảng viên (tuỳ chọn)
            </label>
            <textarea
              rows={3}
              value={initialContent}
              onChange={(e) => setInitialContent(e.target.value)}
              placeholder="Nhập câu hỏi hoặc băn khoăn của bạn về ảnh kết quả này..."
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {loading && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
              Tạo phiên
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
