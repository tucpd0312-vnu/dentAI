'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { qaApi, type QASessionListItem, type QASessionDetail } from '@/lib/qa';
import QASidebar from '@/components/qa/QASidebar';
import QAChatPanel from '@/components/qa/QAChatPanel';
import NewSessionModal from '@/components/qa/NewSessionModal';

export default function ChatPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [sessions, setSessions] = useState<QASessionListItem[]>([]);
  const [activeSession, setActiveSession] = useState<QASessionDetail | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [scope, setScope] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

  // Tham số từ URL nếu được chuyển từ trang kết quả chẩn đoán
  const paramSessionId = searchParams.get('session');
  const paramCaseId = searchParams.get('caseId');
  const paramImageUrl = searchParams.get('imageUrl');
  const paramImageIndex = searchParams.get('imageIndex');

  // Lấy danh sách phiên hỏi đáp
  const fetchSessions = useCallback(async (currentScope = scope, currentQ = searchQuery) => {
    try {
      const data = await qaApi.getSessions({
        scope: currentScope,
        q: currentQ.trim() || undefined,
      });
      setSessions(data);
      return data;
    } catch (err) {
      console.error('Lỗi khi tải danh sách phiên hỏi đáp:', err);
      return [];
    } finally {
      setLoadingList(false);
    }
  }, [scope, searchQuery]);

  // Lấy chi tiết phiên đang chọn
  const fetchSessionDetail = useCallback(async (id: number) => {
    setLoadingSession(true);
    try {
      const detail = await qaApi.getSession(id);
      setActiveSession(detail);
      setActiveSessionId(id);
    } catch (err) {
      console.error('Lỗi khi tải chi tiết phiên:', err);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  // Khởi tạo ban đầu
  useEffect(() => {
    let mounted = true;
    fetchSessions().then((data) => {
      if (!mounted) return;
      if (paramSessionId) {
        const id = parseInt(paramSessionId, 10);
        if (!isNaN(id)) {
          fetchSessionDetail(id);
          return;
        }
      }
      // Nếu có query param tạo phiên mới từ ca bệnh
      if (paramCaseId && paramImageUrl) {
        setShowNewModal(true);
        return;
      }
      // Mặc định chọn phiên đầu tiên nếu có
      if (data.length > 0 && !activeSessionId) {
        fetchSessionDetail(data[0].id);
      }
    });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Định kỳ cập nhật tin nhắn mới cho phiên đang mở (mỗi 5s)
  useEffect(() => {
    if (!activeSessionId) return;

    const interval = setInterval(() => {
      qaApi.getSession(activeSessionId).then((updated) => {
        setActiveSession((prev) => {
          if (!prev) return updated;
          // Chỉ cập nhật nếu có tin nhắn mới hoặc thay đổi trạng thái
          if (
            prev.messages.length !== updated.messages.length ||
            prev.status !== updated.status ||
            prev.title !== updated.title ||
            prev.shares.length !== updated.shares.length
          ) {
            return updated;
          }
          return prev;
        });
      }).catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [activeSessionId]);

  // Khi tìm kiếm hoặc đổi scope
  const handleScopeChange = (newScope: string) => {
    setScope(newScope);
    fetchSessions(newScope, searchQuery);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    fetchSessions(scope, q);
  };

  const handleSelectSession = (id: number) => {
    fetchSessionDetail(id);
    router.replace(`/chat?session=${id}`);
  };

  const handleCreatedNewSession = (session: QASessionDetail) => {
    setShowNewModal(false);
    fetchSessions();
    setActiveSession(session);
    setActiveSessionId(session.id);
    router.replace(`/chat?session=${session.id}`);
  };

  const handleSessionUpdated = (updated: QASessionDetail) => {
    setActiveSession(updated);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === updated.id
          ? {
              ...s,
              title: updated.title,
              status: updated.status,
              messages_count: updated.messages.length,
              updated_at: updated.updated_at,
              shared_with_count: updated.shares.length,
            }
          : s
      )
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-white overflow-hidden">
      {/* Cột danh sách phiên hỏi đáp */}
      <QASidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={() => setShowNewModal(true)}
        userRole={user?.role}
        scope={scope}
        onScopeChange={handleScopeChange}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />

      {/* Cột khung chat và ảnh chẩn đoán */}
      <div className="flex-1 h-full flex flex-col min-w-0">
        {loadingSession ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-3xl text-primary animate-spin">
                progress_activity
              </span>
              <p className="text-xs text-gray-500 font-medium">Đang tải phiên hỏi đáp...</p>
            </div>
          </div>
        ) : activeSession ? (
          <QAChatPanel
            session={activeSession}
            currentUser={user}
            onSessionUpdated={handleSessionUpdated}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl">forum</span>
            </div>
            <h3 className="text-base font-bold text-gray-800">
              Trao đổi & Hỏi đáp Giảng viên
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md">
              Chọn một phiên hỏi đáp bên trái hoặc tạo phiên mới từ ảnh kết quả AI để trao đổi trực tiếp với giảng viên và các sinh viên khác.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              className="mt-4 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Tạo phiên hỏi đáp mới
            </button>
          </div>
        )}
      </div>

      {/* Modal tạo phiên mới */}
      {showNewModal && (
        <NewSessionModal
          initialCaseId={paramCaseId ? parseInt(paramCaseId, 10) : undefined}
          initialImageIndex={paramImageIndex ? parseInt(paramImageIndex, 10) : undefined}
          initialImageUrl={paramImageUrl || ''}
          onClose={() => setShowNewModal(false)}
          onCreated={handleCreatedNewSession}
        />
      )}
    </div>
  );
}
