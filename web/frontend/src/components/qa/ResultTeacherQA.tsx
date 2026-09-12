'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { qaApi, type QASessionDetail, type QATeacher } from '@/lib/qa';
import { apiErrorMessage } from '@/lib/users';
import QAChatPanel from './QAChatPanel';

interface Props {
  caseId: number;
  imageId: number;
  imageIndex: number;
  imageUrl: string;
}

const STUDENT_DEMO_STORAGE_KEY = 'dentai_student_demo';

const DEMO_TEACHERS: QATeacher[] = [
  { id: 901, username: 'dr.thuylinh', email: 'linh.nguyen@dentai.demo', full_name: 'TS. Nguyễn Thùy Linh', role: 'doctor' },
  { id: 902, username: 'dr.quanghuy', email: 'huy.tran@dentai.demo', full_name: 'BS. Trần Quang Huy', role: 'doctor' },
  { id: 903, username: 'dr.phuonganh', email: 'anh.le@dentai.demo', full_name: 'ThS. Lê Phương Anh', role: 'doctor' },
];

function demoSession(user: ReturnType<typeof useAuth>['user'], caseId: number, imageId: number, imageUrl: string): QASessionDetail {
  const student = {
    id: user?.id || 9000,
    username: user?.username || 'sinhvien.demo',
    email: user?.email || 'student@dentai.demo',
    full_name: user?.full_name || 'Nguyễn Hoàng Minh',
    role: 'student' as const,
  };
  const now = new Date().toISOString();
  return {
    id: 99001,
    title: 'Hỏi về vùng viêm lợi răng 21 · Bản minh hoạ',
    created_by: student,
    case: caseId,
    image: imageId,
    image_url: imageUrl,
    status: 'open',
    created_at: now,
    updated_at: now,
    shares: DEMO_TEACHERS.slice(0, 2).map((teacher, index) => ({ id: 9800 + index, session: 99001, shared_with: teacher, shared_by: student, can_reply: true, created_at: now })),
    is_owner: true,
    messages: [
      { id: 9701, session: 99001, sender: student, content: 'Thưa cô/chú, AI đánh dấu vùng này có cần đánh giá thêm trên lâm sàng không ạ?', bounding_box: { x: 0.31, y: 0.28, width: 0.18, height: 0.16, label: 'Vùng nghi ngờ' }, box_comment: 'Viền lợi mặt ngoài răng 21 có dấu hiệu đỏ và sưng.', created_at: now },
      { id: 9702, session: 99001, sender: DEMO_TEACHERS[0], content: 'Em quan sát đúng hướng. AI là gợi ý ban đầu; hãy đối chiếu màu sắc, chảy máu khi thăm khám và chỉ số lợi trước khi kết luận.', bounding_box: null, box_comment: '', created_at: now },
    ],
  };
}

/**
 * Luồng hỏi giảng viên nằm ngay dưới kết quả AI.
 *
 * Mỗi ảnh dùng lại phiên gần nhất đã có. Nếu chưa có, sinh viên phải chọn một
 * hoặc nhiều giảng viên và nhập câu hỏi đầu tiên trước khi tạo phiên.
 */
export default function ResultTeacherQA({ caseId, imageId, imageIndex, imageUrl }: Props) {
  const { user } = useAuth();
  const [demoMode] = useState(() =>
    typeof window !== 'undefined' && window.localStorage.getItem(STUDENT_DEMO_STORAGE_KEY) === 'on'
  );
  const [teachers, setTeachers] = useState<QATeacher[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<number[]>([]);
  const [session, setSession] = useState<QASessionDetail | null>(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (demoMode) {
      setTeachers(DEMO_TEACHERS);
      // Demo bắt đầu từ bước chọn giảng viên để người xem thấy rõ toàn bộ luồng.
      setSession(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [availableTeachers, sessions] = await Promise.all([
        qaApi.getTeachers(),
        qaApi.getSessions({ scope: 'mine' }),
      ]);
      setTeachers(availableTeachers);

      const existing = sessions.find(item =>
        item.case === caseId && (item.image === imageId || item.image_url === imageUrl)
      );
      if (existing) setSession(await qaApi.getSession(existing.id));
    } catch (err) {
      setError(apiErrorMessage(err, 'Không tải được mục hỏi đáp giảng viên.'));
    } finally {
      setLoading(false);
    }
  }, [caseId, demoMode, imageId, imageUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const sessionId = session?.id;
  useEffect(() => {
    if (demoMode) return;
    if (!sessionId) return;
    const timer = window.setInterval(() => {
      qaApi.getSession(sessionId).then(setSession).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [demoMode, sessionId]);

  function toggleTeacher(id: number) {
    setSelectedTeacherIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    );
  }

  async function createQuestion(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (selectedTeacherIds.length === 0) {
      setError('Vui lòng chọn ít nhất một giảng viên trước khi đặt câu hỏi.');
      return;
    }
    if (!question.trim()) {
      setError('Vui lòng nhập nội dung câu hỏi.');
      return;
    }

    setSubmitting(true);
    try {
      if (demoMode) {
        const student = demoSession(user, caseId, imageId, imageUrl).created_by;
        const now = new Date().toISOString();
        setSession({
          id: Date.now(),
          title: `Hỏi về kết quả chẩn đoán · Ca minh hoạ · Ảnh ${imageIndex + 1}`,
          created_by: student,
          case: caseId,
          image: imageId,
          image_url: imageUrl,
          status: 'open',
          created_at: now,
          updated_at: now,
          is_owner: true,
          shares: DEMO_TEACHERS.filter(teacher => selectedTeacherIds.includes(teacher.id)).map((teacher, index) => ({ id: Date.now() + index, session: Date.now(), shared_with: teacher, shared_by: student, can_reply: true, created_at: now })),
          messages: [{ id: Date.now(), session: Date.now(), sender: student, content: question.trim(), bounding_box: null, box_comment: '', created_at: now }],
        });
        setQuestion('');
        return;
      }
      const created = await qaApi.createSession({
        title: `Hỏi về kết quả chẩn đoán · Ca #${caseId} · Ảnh ${imageIndex + 1}`,
        case: caseId,
        image: imageId,
        image_url: imageUrl,
        initial_content: question.trim(),
        share_with_user_ids: selectedTeacherIds,
      });
      // API create trả detail; đọc lại để tương thích cả với backend cũ đang chạy.
      const detail = created.messages && created.shares
        ? created
        : await qaApi.getSession(created.id);
      setSession(detail);
      setQuestion('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể gửi câu hỏi tới giảng viên.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-400">
        <span className="material-symbols-outlined animate-spin text-[20px]">autorenew</span>
        Đang tải mục hỏi đáp giảng viên…
      </div>
    );
  }

  if (session) {
    const selectedTeachers = session.shares.filter(share => share.shared_with.role === 'doctor');
    return (
      <section className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/70 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-950">
              <span className="material-symbols-outlined text-[19px]">school</span>
              Hỏi đáp giảng viên về kết quả này
            </h2>
            <p className="mt-0.5 text-xs text-amber-800/70">
              Giảng viên đã chọn:{' '}
              {selectedTeachers.map(item => item.shared_with.full_name || item.shared_with.username).join(', ') || '—'}
            </p>
            {demoMode && <p className="mt-1 text-xs font-medium text-amber-800">Dữ liệu minh hoạ — tin nhắn được lưu tạm trên trình duyệt.</p>}
          </div>
          <div className="flex items-center gap-3">
            {demoMode && <button type="button" onClick={() => setSession(null)} className="text-xs font-semibold text-amber-900 hover:underline">Tạo câu hỏi minh hoạ</button>}
            {!demoMode && <Link href={`/chat?session=${session.id}`} className="text-xs font-medium text-amber-900 hover:underline">Mở trong trang Hỏi đáp giảng viên</Link>}
          </div>
        </div>
        <div className="h-[620px] min-h-0">
          <QAChatPanel
            session={session}
            currentUser={user}
            onSessionUpdated={setSession}
            embedded
            demoMode={demoMode}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="flex items-center gap-2 font-serif text-base font-semibold text-gray-900">
          <span className="material-symbols-outlined text-amber-600">school</span>
          Hỏi giảng viên về kết quả chẩn đoán
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Chọn một hoặc nhiều giảng viên. Câu hỏi và phản hồi sẽ được lưu ngay trên kết quả này.
        </p>
        {demoMode && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-amber-900">
            <span className="rounded-full bg-amber-100 px-3 py-1.5">1. Chọn giảng viên</span>
            <span className="material-symbols-outlined text-[16px] text-amber-500">arrow_forward</span>
            <span className="rounded-full border border-amber-200 bg-white px-3 py-1.5">2. Đặt câu hỏi</span>
            <span className="material-symbols-outlined text-[16px] text-amber-500">arrow_forward</span>
            <span className="rounded-full border border-amber-200 bg-white px-3 py-1.5">3. Vào phòng hỏi đáp</span>
          </div>
        )}
      </div>

      <form onSubmit={createQuestion} className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(360px,1.2fr)]">
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
            Chọn giảng viên <span className="text-red-500">*</span>
          </legend>
          {teachers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
              Chưa có tài khoản giảng viên đang hoạt động.
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {teachers.map(teacher => {
                const checked = selectedTeacherIds.includes(teacher.id);
                return (
                  <label
                    key={teacher.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                      checked ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTeacher(teacher.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                      {(teacher.full_name || teacher.username).trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {teacher.full_name || teacher.username}
                      </span>
                      <span className="block truncate text-xs text-gray-400">
                        {demoMode ? 'Giảng viên Răng Hàm Mặt · Sẵn sàng hỗ trợ' : `@${teacher.username}`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor="teacher-question" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-600">
            Câu hỏi của bạn <span className="text-red-500">*</span>
          </label>
          <textarea
            id="teacher-question"
            rows={6}
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder="Nhập thắc mắc của bạn về kết quả AI này…"
            className="w-full resize-none rounded-xl border border-gray-300 px-3.5 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {error && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
              <span className="material-symbols-outlined mt-0.5 text-[16px]">error</span>
              {error}
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={submitting || teachers.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[18px] ${submitting ? 'animate-spin' : ''}`}>
                {submitting ? 'autorenew' : 'send'}
              </span>
              {submitting ? 'Đang gửi…' : `Gửi tới ${selectedTeacherIds.length || 0} giảng viên`}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
