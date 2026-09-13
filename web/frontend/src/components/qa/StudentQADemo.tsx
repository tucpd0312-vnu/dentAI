'use client';

import { useEffect, useRef, useState } from 'react';
import type { AuthUser } from '@/lib/auth';
import type { QAMessage, QASessionDetail } from '@/lib/qa';
import QAChatPanel from './QAChatPanel';

const STUDENTS = [
  { id: -101, username: 'sv.nguyenan', email: '', full_name: 'Nguyễn Minh An', role: 'student' as const },
  { id: -102, username: 'sv.thuha', email: '', full_name: 'Trần Thu Hà', role: 'student' as const },
];

function sampleSessions(teacher: AuthUser): QASessionDetail[] {
  return STUDENTS.map((student, index) => {
    const id = -(index + 1);
    const created_at = new Date().toISOString();
    const messages: QAMessage[] = [{
      id: id * 10,
      session: id,
      sender: student,
      content: index === 0
        ? 'Em gửi kết quả chẩn đoán AI và đã khoanh vùng cần trao đổi. Thầy/cô giúp em xem lại cách đánh dấu vùng này được không ạ?'
        : 'Em đã đánh dấu vùng trên ảnh kết quả AI. Em muốn trao đổi thêm về cách đọc kết quả và giới hạn của mô hình ạ.',
      bounding_box: { x: 0.28, y: 0.35, width: 0.25, height: 0.24, label: 'Vùng sinh viên hỏi' },
      box_comment: 'Vùng em muốn giảng viên xem lại',
      created_at,
    }];
    if (index === 0) messages.push({
      id: -11,
      session: id,
      sender: teacher,
      content: 'Thầy/cô đã đánh dấu lại vùng để cùng đối chiếu. Em thử so sánh hai bounding box và giải thích vì sao em chọn ranh giới ban đầu nhé. Kết quả AI trong phiên này chỉ là dữ liệu minh hoạ, không phải kết luận lâm sàng.',
      bounding_box: { x: 0.24, y: 0.31, width: 0.33, height: 0.3, label: 'Vùng giảng viên đánh dấu lại' },
      box_comment: 'Đánh dấu lại để trao đổi về ranh giới vùng quan tâm',
      created_at,
    });
    return {
      id,
      title: index === 0 ? 'Trao đổi kết quả AI viêm lợi' : 'Đọc và đối chiếu kết quả chẩn đoán AI',
      created_by: student,
      case: null,
      image: null,
      image_url: index === 0 ? '/demo/qa-gingivitis.jpg' : '/demo/qa-teeth.jpg',
      status: 'open',
      created_at,
      updated_at: created_at,
      messages,
      shares: [],
      is_owner: false,
    };
  });
}

export default function StudentQADemo({ teacher }: { teacher: AuthUser }) {
  const [sessions, setSessions] = useState(() => sampleSessions(teacher));
  const [selectedId, setSelectedId] = useState(-1);
  const [actingAs, setActingAs] = useState<'teacher' | 'student'>('teacher');
  const uploadUrls = useRef<string[]>([]);
  const session = sessions.find(item => item.id === selectedId)!;

  useEffect(() => () => uploadUrls.current.forEach(url => URL.revokeObjectURL(url)), []);

  function updateSession(updated: QASessionDetail) {
    setSessions(items => items.map(item => item.id === updated.id ? updated : item));
  }

  function uploadImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      window.alert('Chọn ảnh JPG, PNG hoặc WebP không quá 10 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    uploadUrls.current.push(url);
    // Đổi ảnh tham chiếu phải bỏ các box cũ vì toạ độ thuộc ảnh trước đó.
    updateSession({ ...session, image_url: url, status: 'open', messages: [{
      id: Date.now(), session: session.id, sender: session.created_by,
      content: 'Em gửi ảnh kết quả AI mới. Em sẽ đánh dấu vùng cần trao đổi trên ảnh này.',
      bounding_box: null, box_comment: '', created_at: new Date().toISOString(),
    }] });
    setActingAs('student');
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[550px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Chọn sinh viên" className="w-48 shrink-0 overflow-y-auto border-r border-gray-200">
          {sessions.map(item => (
            <button key={item.id} aria-pressed={item.id === selectedId} onClick={() => { setSelectedId(item.id); setActingAs('teacher'); }} className={`w-full border-b border-gray-100 px-4 py-3 text-left transition ${item.id === selectedId ? 'bg-primary-50 ring-inset ring-1 ring-primary/20' : 'hover:bg-gray-50'}`}>
              <p className="text-sm font-semibold text-gray-900">{item.created_by.full_name}</p>
            </button>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <QAChatPanel key={`${session.id}-${actingAs}`} session={session} currentUser={actingAs === 'teacher' ? teacher : session.created_by} onSessionUpdated={updateSession} demoMode />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-3 py-2">
            <select aria-label="Vai gửi tin nhắn" value={actingAs} onChange={event => setActingAs(event.target.value as 'teacher' | 'student')} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600">
              <option value="teacher">Giảng viên</option>
              <option value="student">Sinh viên</option>
            </select>
            <label className="cursor-pointer rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
              Gửi ảnh mới
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage} className="sr-only" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
