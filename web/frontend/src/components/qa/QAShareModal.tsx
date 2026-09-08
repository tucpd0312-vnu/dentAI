'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { qaApi, type QAShareItem } from '@/lib/qa';

interface UserSearchResult {
  id: number;
  username: string;
  full_name: string;
  role: string;
  email: string;
}

interface Props {
  sessionId: number;
  sessionTitle: string;
  currentShares: QAShareItem[];
  onClose: () => void;
  onUpdateShares: (newShares: QAShareItem[]) => void;
}

export default function QAShareModal({
  sessionId,
  sessionTitle,
  currentShares,
  onClose,
  onUpdateShares,
}: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [unsharingId, setUnsharingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setErrorMsg('');
      try {
        const res = await api.get<UserSearchResult[]>(`/users/search/?q=${encodeURIComponent(query.trim())}`);
        // Loại bỏ người đã được chia sẻ
        const existingIds = new Set(currentShares.map((s) => s.shared_with.id));
        setSearchResults(res.data.filter((u) => !existingIds.has(u.id)));
      } catch (err: any) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, currentShares]);

  const handleShare = async (userId: number) => {
    setSharingId(userId);
    setErrorMsg('');
    try {
      const updated = await qaApi.shareSession(sessionId, [userId]);
      onUpdateShares(updated);
      setSearchResults((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Không thể chia sẻ phiên hỏi đáp.');
    } finally {
      setSharingId(null);
    }
  };

  const handleUnshare = async (userId: number) => {
    setUnsharingId(userId);
    setErrorMsg('');
    try {
      await qaApi.unshareSession(sessionId, userId);
      onUpdateShares(currentShares.filter((s) => s.shared_with.id !== userId));
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Không thể huỷ chia sẻ.');
    } finally {
      setUnsharingId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'doctor':
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">Giảng viên / Bác sĩ</span>;
      case 'student':
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">Sinh viên</span>;
      case 'admin':
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-medium">Quản trị viên</span>;
      default:
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">{role}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">share</span>
              Chia sẻ phiên hỏi đáp
            </h2>
            <p className="text-xs text-gray-500 truncate max-w-sm mt-0.5 font-medium">{sessionTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Nội dung modal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 text-xs rounded-xl bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {errorMsg}
            </div>
          )}

          {/* Ô tìm kiếm */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
              Tìm sinh viên hoặc giảng viên
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-gray-400">
                search
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập tên, username hoặc email..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              {searching && (
                <div className="absolute right-3 top-2.5">
                  <span className="material-symbols-outlined text-[18px] text-primary animate-spin">
                    progress_activity
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Kết quả tìm kiếm */}
          {searchResults.length > 0 && (
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden shadow-sm">
              <div className="bg-gray-50 px-3 py-1.5 text-[11px] font-semibold text-gray-500 uppercase">
                Kết quả tìm thấy ({searchResults.length})
              </div>
              {searchResults.map((user) => (
                <div key={user.id} className="p-3 flex items-center justify-between hover:bg-gray-50/80 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">{user.full_name || user.username}</span>
                      {getRoleBadge(user.role)}
                    </div>
                    <div className="text-xs text-gray-500">@{user.username}</div>
                  </div>
                  <button
                    onClick={() => handleShare(user.id)}
                    disabled={sharingId === user.id}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {sharingId === user.id ? (
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px]">person_add</span>
                    )}
                    Chia sẻ
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Danh sách người đã được chia sẻ */}
          <div>
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Đang chia sẻ với ({currentShares.length})
            </h3>
            {currentShares.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl text-gray-400 text-xs">
                Chưa chia sẻ phiên hỏi đáp này với ai.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                {currentShares.map((share) => (
                  <div key={share.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900">
                          {share.shared_with.full_name || share.shared_with.username}
                        </span>
                        {getRoleBadge(share.shared_with.role)}
                      </div>
                      <div className="text-xs text-gray-500">@{share.shared_with.username}</div>
                    </div>
                    <button
                      onClick={() => handleUnshare(share.shared_with.id)}
                      disabled={unsharingId === share.shared_with.id}
                      title="Thu hồi quyền truy cập"
                      className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      {unsharingId === share.shared_with.id ? (
                        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-[18px]">person_remove</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
