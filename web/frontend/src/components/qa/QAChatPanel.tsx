'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { QASessionDetail, BoundingBox, QAShareItem, QAMessage } from '@/lib/qa';
import { qaApi } from '@/lib/qa';
import type { Role } from '@/lib/auth';
import InteractiveImageAnnotator from './InteractiveImageAnnotator';
import QAShareModal from './QAShareModal';

interface Props {
  session: QASessionDetail;
  currentUser: { id: number; username: string; full_name: string; role: Role } | null;
  onSessionUpdated: (updated: QASessionDetail) => void;
  onDeleteSession?: (id: number) => void;
}

export default function QAChatPanel({
  session,
  currentUser,
  onSessionUpdated,
  onDeleteSession,
}: Props) {
  const [content, setContent] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
  const [boxComment, setBoxComment] = useState('');
  const [activeHighlightBox, setActiveHighlightBox] = useState<BoundingBox | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showImagePanel, setShowImagePanel] = useState(Boolean(session.image_url));
  const [sending, setSending] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState(session.title);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isTeacher = currentUser?.role === 'doctor' || currentUser?.role === 'admin';
  const isOwner = session.created_by.id === currentUser?.id;

  // Tự động cuộn xuống dưới cùng khi có tin nhắn mới
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages.length]);

  // Cập nhật title khi session đổi
  useEffect(() => {
    setNewTitle(session.title);
    setShowImagePanel(Boolean(session.image_url));
    setCurrentBox(null);
    setBoxComment('');
    setIsDrawing(false);
    setActiveHighlightBox(null);
  }, [session.id, session.title, session.image_url]);

  // Danh sách các bounding boxes từ tất cả tin nhắn
  const existingBoxes = session.messages
    .filter((m) => m.bounding_box)
    .map((m) => ({
      id: m.id,
      box: m.bounding_box as BoundingBox,
      comment: m.box_comment || m.content,
      senderName: m.sender.full_name || m.sender.username,
      isTeacher: m.sender.role === 'doctor' || m.sender.role === 'admin',
    }));

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() && !currentBox) return;

    setSending(true);
    try {
      const newMsg = await qaApi.sendMessage(session.id, {
        content: content.trim(),
        bounding_box: currentBox,
        box_comment: boxComment.trim() || undefined,
      });

      // Cập nhật state session với tin nhắn mới
      const updatedSession: QASessionDetail = {
        ...session,
        messages: [...session.messages, newMsg],
        updated_at: new Date().toISOString(),
      };
      onSessionUpdated(updatedSession);

      // Reset form
      setContent('');
      setCurrentBox(null);
      setBoxComment('');
      setIsDrawing(false);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Không thể gửi tin nhắn.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleStatusChange = async (newStatus: 'open' | 'resolved' | 'closed') => {
    try {
      const updated = await qaApi.updateSession(session.id, { status: newStatus });
      onSessionUpdated({ ...session, status: updated.status });
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Không thể cập nhật trạng thái.');
    }
  };

  const handleSaveTitle = async () => {
    if (!newTitle.trim()) return;
    try {
      const updated = await qaApi.updateSession(session.id, { title: newTitle.trim() });
      onSessionUpdated({ ...session, title: updated.title });
      setIsEditingTitle(false);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Không thể đổi tiêu đề.');
    }
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Tiêu đề phiên (có thể sửa nhanh) */}
          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="px-2.5 py-1 text-sm font-bold border border-primary rounded-lg focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={handleSaveTitle}
                  className="text-xs px-2.5 py-1 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                  Lưu
                </button>
                <button
                  onClick={() => {
                    setIsEditingTitle(false);
                    setNewTitle(session.title);
                  }}
                  className="text-xs px-2.5 py-1 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Huỷ
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900 truncate">
                  {session.title}
                </h2>
                {(isOwner || isTeacher) && (
                  <button
                    onClick={() => setIsEditingTitle(true)}
                    title="Đổi tiêu đề"
                    className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <span>
                Người tạo:{' '}
                <strong className="text-gray-700 font-semibold">
                  {session.created_by.full_name || session.created_by.username}
                </strong>{' '}
                ({session.created_by.role === 'student' ? 'Sinh viên' : session.created_by.role === 'doctor' ? 'Giảng viên' : session.created_by.role})
              </span>
              <span>•</span>
              {session.case && (
                <Link
                  href={`/analysis/${session.case}/results/0/`}
                  target="_blank"
                  className="text-primary hover:underline flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  Ca bệnh #{session.case}
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons & Status */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle xem ảnh kết quả */}
          {session.image_url && (
            <button
              onClick={() => setShowImagePanel((v) => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                showImagePanel
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {showImagePanel ? 'visibility_off' : 'image'}
              </span>
              {showImagePanel ? 'Thu gọn ảnh' : 'Xem ảnh chẩn đoán'}
            </button>
          )}

          {/* Nút chia sẻ phiên */}
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">share</span>
            Chia sẻ ({session.shares.length})
          </button>

          {/* Trạng thái phiên */}
          {(isOwner || isTeacher) ? (
            <select
              value={session.status}
              onChange={(e) => handleStatusChange(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="open">🟢 Đang trao đổi</option>
              <option value="resolved">✅ Đã giải đáp</option>
              <option value="closed">⚪ Đã đóng</option>
            </select>
          ) : (
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                session.status === 'resolved'
                  ? 'bg-emerald-100 text-emerald-800'
                  : session.status === 'closed'
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {session.status === 'resolved'
                ? 'Đã giải đáp'
                : session.status === 'closed'
                ? 'Đã đóng'
                : 'Đang trao đổi'}
            </span>
          )}
        </div>
      </header>

      {/* ── Main content (Split Image Annotator & Chat Messages) ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Panel Ảnh & Bounding Box Annotator */}
        {showImagePanel && session.image_url && (
          <div className="w-1/2 p-4 border-r border-gray-200 bg-gray-950/90 flex flex-col items-center justify-center overflow-y-auto">
            <div className="w-full max-w-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[18px]">biotech</span>
                  Ảnh kết quả chẩn đoán AI
                </span>
                <button
                  type="button"
                  onClick={() => setIsDrawing((v) => !v)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg flex items-center gap-1 transition-all ${
                    isDrawing
                      ? 'bg-amber-500 text-white shadow-md animate-pulse'
                      : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">crop_square</span>
                  {isDrawing ? 'Đang vẽ vùng... (Bấm để huỷ)' : 'Đánh dấu vùng cần hỏi'}
                </button>
              </div>

              <InteractiveImageAnnotator
                imageUrl={session.image_url}
                isDrawing={isDrawing}
                currentBox={currentBox}
                onBoxChange={(box) => {
                  setCurrentBox(box);
                  if (box) setIsDrawing(false);
                }}
                activeHighlightBox={activeHighlightBox}
                existingBoxes={existingBoxes}
                onSelectBox={(boxId) => {
                  const targetMsg = session.messages.find((m) => m.id === boxId);
                  if (targetMsg?.bounding_box) {
                    setActiveHighlightBox(targetMsg.bounding_box);
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Panel Tin nhắn (Hỏi đáp Zalo/ChatGPT style) */}
        <div className={`flex-1 flex flex-col h-full bg-white ${showImagePanel && session.image_url ? 'w-1/2' : 'w-full'}`}>
          {/* Danh sách tin nhắn */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {session.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-6">
                <span className="material-symbols-outlined text-5xl mb-2 text-gray-300">
                  forum
                </span>
                <p className="text-sm font-medium text-gray-600">Chưa có câu hỏi nào trong phiên này.</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">
                  {currentUser?.role === 'student'
                    ? 'Hãy đánh dấu vùng trên ảnh và nhập câu hỏi để gửi tới giảng viên.'
                    : 'Đang đợi sinh viên đặt câu hỏi hoặc bạn có thể gửi phản hồi mở đầu.'}
                </p>
              </div>
            ) : (
              session.messages.map((msg) => {
                const isMsgTeacher = msg.sender.role === 'doctor' || msg.sender.role === 'admin';
                const isSelf = msg.sender.id === currentUser?.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-full animate-fadeIn`}
                  >
                    {/* Header tin nhắn: Tên và Vai trò */}
                    <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-gray-500">
                      <span className="font-semibold text-gray-700">
                        {msg.sender.full_name || msg.sender.username}
                      </span>
                      {isMsgTeacher ? (
                        <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-medium text-[10px] flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px]">verified</span>
                          Giảng viên / Bác sĩ
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-medium text-[10px]">
                          Sinh viên
                        </span>
                      )}
                      <span>•</span>
                      <span className="tabular-nums text-[10px]">{formatMessageTime(msg.created_at)}</span>
                    </div>

                    {/* Bong bóng tin nhắn */}
                    <div
                      className={`rounded-2xl px-4 py-3 max-w-[85%] text-sm shadow-sm transition-all ${
                        isSelf
                          ? 'bg-primary text-white rounded-br-none'
                          : isMsgTeacher
                          ? 'bg-emerald-50 text-emerald-950 border border-emerald-200 rounded-bl-none'
                          : 'bg-gray-100 text-gray-900 rounded-bl-none'
                      }`}
                    >
                      {/* Bounding box badge nếu có */}
                      {msg.bounding_box && (
                        <div
                          onClick={() => {
                            setActiveHighlightBox(msg.bounding_box);
                            setShowImagePanel(true);
                          }}
                          className={`mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                            isSelf
                              ? 'bg-white/20 text-white hover:bg-white/30'
                              : 'bg-blue-100 text-blue-900 hover:bg-blue-200'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px]">crop_free</span>
                          <span>
                            Vùng đánh dấu {msg.bounding_box.label ? `(${msg.bounding_box.label})` : ''}
                          </span>
                          <span className="material-symbols-outlined text-[13px] opacity-70">visibility</span>
                        </div>
                      )}

                      {/* Ghi chú vùng đánh dấu */}
                      {msg.box_comment && (
                        <div
                          className={`text-xs p-2 rounded-lg mb-2 italic border ${
                            isSelf
                              ? 'bg-black/10 border-white/20 text-white/90'
                              : 'bg-white/70 border-emerald-300 text-emerald-900'
                          }`}
                        >
                          📌 <strong>Ghi chú vùng hỏi:</strong> {msg.box_comment}
                        </div>
                      )}

                      {/* Nội dung tin nhắn chính */}
                      {msg.content && (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Khu vực soạn câu hỏi / phản hồi */}
          <div className="p-3 border-t border-gray-200 bg-gray-50/80">
            {/* Thanh hiển thị vùng đang chọn trước khi gửi */}
            {currentBox && (
              <div className="mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900 animate-fadeIn">
                <div className="flex items-center gap-2 flex-1 mr-2">
                  <span className="material-symbols-outlined text-amber-600 text-[18px]">
                    crop_square
                  </span>
                  <div className="flex-1">
                    <span className="font-semibold">Đã đánh dấu 1 vùng trên ảnh.</span>
                    <input
                      type="text"
                      value={boxComment}
                      onChange={(e) => setBoxComment(e.target.value)}
                      placeholder="Nhập ghi chú cho vùng này (vd: viền lợi răng 21 bị sưng)..."
                      className="mt-1 w-full px-2 py-1 text-xs bg-white border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentBox(null);
                    setBoxComment('');
                  }}
                  className="text-gray-400 hover:text-red-500 p-1 rounded"
                  title="Xoá vùng chọn"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
              <div className="relative">
                <textarea
                  rows={2}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    currentUser?.role === 'doctor'
                      ? 'Nhập giải đáp, hướng dẫn chuyên môn cho sinh viên... (Ctrl+Enter để gửi)'
                      : 'Đặt câu hỏi cho giảng viên về ca bệnh này... (Ctrl+Enter để gửi)'
                  }
                  className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none shadow-sm"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Nút bật công cụ đánh dấu trên ảnh */}
                  {session.image_url && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowImagePanel(true);
                        setIsDrawing((v) => !v);
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        isDrawing
                          ? 'bg-amber-100 border-amber-300 text-amber-900 font-semibold'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">crop_free</span>
                      {isDrawing ? 'Đang bật vẽ vùng' : 'Đánh dấu vùng hỏi'}
                    </button>
                  )}
                  <span className="text-[11px] text-gray-400 hidden sm:inline">
                    Nhấn Ctrl + Enter để gửi nhanh
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={sending || (!content.trim() && !currentBox)}
                  className="px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  {sending ? (
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">send</span>
                  )}
                  {currentUser?.role === 'doctor' ? 'Gửi phản hồi' : 'Gửi câu hỏi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Modal chia sẻ phiên */}
      {showShareModal && (
        <QAShareModal
          sessionId={session.id}
          sessionTitle={session.title}
          currentShares={session.shares}
          onClose={() => setShowShareModal(false)}
          onUpdateShares={(newShares) => onSessionUpdated({ ...session, shares: newShares })}
        />
      )}
    </div>
  );
}
