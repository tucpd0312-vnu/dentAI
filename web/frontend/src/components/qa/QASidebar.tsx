'use client';

import { useState } from 'react';
import type { QASessionListItem } from '@/lib/qa';
import type { Role } from '@/lib/auth';

interface Props {
  sessions: QASessionListItem[];
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  userRole?: Role;
  scope: string;
  onScopeChange: (scope: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function QASidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  userRole,
  scope,
  onScopeChange,
  searchQuery,
  onSearchChange,
}: Props) {
  const isTeacher = userRole === 'doctor' || userRole === 'admin';

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
            Đã giải đáp
          </span>
        );
      case 'closed':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-medium">
            Đã đóng
          </span>
        );
      default:
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
            Đang mở
          </span>
        );
    }
  };

  return (
    <aside className="w-80 h-full border-r border-gray-200 bg-white flex flex-col shrink-0 select-none">
      {/* Top action: New Session button */}
      <div className="p-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <button
          onClick={onNewSession}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold shadow-sm transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Phiên hỏi đáp mới
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-2 text-[18px] text-gray-400">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm theo chủ đề hoặc người hỏi..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Scope Tabs */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1 overflow-x-auto no-scrollbar text-xs font-medium">
        <button
          onClick={() => onScopeChange('all')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            scope === 'all'
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Tất cả
        </button>

        {isTeacher && (
          <button
            onClick={() => onScopeChange('unanswered')}
            className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 flex items-center gap-1 ${
              scope === 'unanswered'
                ? 'bg-amber-100 text-amber-900 font-semibold'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Cần giải đáp
          </button>
        )}

        <button
          onClick={() => onScopeChange('mine')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            scope === 'mine'
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Của tôi
        </button>

        <button
          onClick={() => onScopeChange('shared')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            scope === 'shared'
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Được chia sẻ
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {sessions.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-400">
            <span className="material-symbols-outlined text-3xl mb-1 text-gray-300 block">
              chat_bubble_outline
            </span>
            Không tìm thấy phiên hỏi đáp nào
          </div>
        ) : (
          sessions.map((item) => {
            const isActive = activeSessionId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => onSelectSession(item.id)}
                className={`p-3 cursor-pointer transition-colors text-left flex flex-col gap-1.5 ${
                  isActive
                    ? 'bg-primary/5 border-l-4 border-primary pl-2.5'
                    : 'hover:bg-gray-50'
                }`}
              >
                {/* Header item: Title & Status */}
                <div className="flex items-center justify-between gap-1.5">
                  <h4
                    className={`text-xs font-semibold truncate flex-1 ${
                      isActive ? 'text-primary' : 'text-gray-900'
                    }`}
                  >
                    {item.title}
                  </h4>
                  {getStatusBadge(item.status)}
                </div>

                {/* Sender name & role & updated time */}
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span className="truncate max-w-[130px] font-medium text-gray-700">
                    {item.created_by.full_name || item.created_by.username}
                  </span>
                  <span className="tabular-nums text-[10px] text-gray-400">
                    {formatTime(item.updated_at)}
                  </span>
                </div>

                {/* Latest message snippet */}
                {item.latest_message && (
                  <p className="text-[11px] text-gray-500 line-clamp-1 italic">
                    <span className="font-medium not-italic text-gray-600">
                      {item.latest_message.sender_name}:{' '}
                    </span>
                    {item.latest_message.content || '[Vùng đánh dấu trên ảnh]'}
                  </p>
                )}

                {/* Footer metadata: Box count, messages count, shares count */}
                <div className="flex items-center gap-2 pt-0.5 text-[10px] text-gray-400">
                  <span className="flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">forum</span>
                    {item.messages_count}
                  </span>
                  {item.image_url && (
                    <span className="flex items-center gap-0.5 text-blue-600 font-medium">
                      <span className="material-symbols-outlined text-[12px]">image</span>
                      Ảnh ca bệnh
                    </span>
                  )}
                  {item.shared_with_count > 0 && (
                    <span className="flex items-center gap-0.5 text-purple-600 font-medium">
                      <span className="material-symbols-outlined text-[12px]">share</span>
                      {item.shared_with_count}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
