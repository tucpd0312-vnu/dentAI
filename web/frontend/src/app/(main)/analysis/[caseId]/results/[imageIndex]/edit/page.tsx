'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import api, { ImageResult } from '@/lib/api';
import type { LocalDetection } from '@/components/results/EditCanvas';

const EditCanvas = dynamic(() => import('@/components/results/EditCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full bg-gray-950 rounded-xl flex items-center justify-center" style={{ minHeight: 360 }}>
      <span className="material-symbols-outlined text-4xl text-gray-700 animate-spin">autorenew</span>
    </div>
  ),
});

const FDI_OPTIONS = ['11','12','13','21','22','23','31','32','33','41','42','43'];

const MGI_COLORS: Record<number, string> = {
  0: '#9ca3af', 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444',
};

const MGI_LABELS: Record<number, string> = {
  0: 'Bình thường', 1: 'Viêm nhẹ', 2: 'Viêm vừa', 3: 'Viêm nặng', 4: 'Viêm rất nặng',
};

function toMediaUrl(fsPath: string): string {
  const m = fsPath.match(/[/\\]media[/\\](.+)/);
  return m ? `/media/${m[1].replace(/\\/g, '/')}` : fsPath;
}

let _newIdCounter = 0;

export default function EditPage() {
  const params = useParams();
  const caseId = params.caseId as string;
  const imageIndex = params.imageIndex as string;
  const idx = parseInt(imageIndex, 10) || 0;
  const router = useRouter();

  const [imgData, setImgData] = useState<ImageResult | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [localDets, setLocalDets] = useState<LocalDetection[]>([]);
  const [captionText, setCaptionText] = useState('');
  const [originalCaption, setOriginalCaption] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'select' | 'draw'>('select');
  const [showMasks, setShowMasks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  /* Load image */
  useEffect(() => {
    setLoadError(false);
    api.get<ImageResult>(`/cases/${caseId}/images/${idx}/`)
      .then(res => {
        const d = res.data;
        setImgData(d);
        setLocalDets(
          d.detections
            .filter(det => !det.is_deleted)
            .map(det => ({
              localId: String(det.id),
              id: det.id,
              source: det.source,
              tooth_fdi: det.tooth_fdi,
              mgi_level: det.mgi_level,
              x_center: det.x_center,
              y_center: det.y_center,
              width: det.width,
              height: det.height,
              _state: 'unchanged' as const,
            }))
        );
        const cv = d.caption
          ? (d.caption.is_edited ? d.caption.edited_text ?? d.caption.ai_text : d.caption.ai_text)
          : '';
        setCaptionText(cv);
        setOriginalCaption(cv);
      })
      .catch(() => setLoadError(true));
  }, [caseId, idx]);

  const handleSetMode = useCallback((m: 'select' | 'draw') => {
    setMode(m);
    if (m === 'draw') setSelectedId(null);
  }, []);

  const handleDetectionUpdate = useCallback((localId: string, xc: number, yc: number, w: number, h: number) => {
    setLocalDets(prev => prev.map(d =>
      d.localId === localId
        ? { ...d, x_center: xc, y_center: yc, width: w, height: h, _state: d._state === 'new' ? 'new' : 'modified' }
        : d
    ));
  }, []);

  const handleNewDetection = useCallback((xc: number, yc: number, w: number, h: number) => {
    const localId = `_new_${++_newIdCounter}`;
    setLocalDets(prev => [...prev, {
      localId, source: 'doctor', tooth_fdi: '11', mgi_level: 1,
      x_center: xc, y_center: yc, width: w, height: h, _state: 'new',
    }]);
    setSelectedId(localId);
    setMode('select');
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    setLocalDets(prev => prev.flatMap(d => {
      if (d.localId !== selectedId) return [d];
      return d._state === 'new' ? [] : [{ ...d, _state: 'deleted' as const }];
    }));
    setSelectedId(null);
  }, [selectedId]);

  const handleDetPropChange = useCallback((localId: string, prop: 'tooth_fdi' | 'mgi_level', value: string | number) => {
    setLocalDets(prev => prev.map(d =>
      d.localId === localId
        ? { ...d, [prop]: value, _state: d._state === 'new' ? 'new' : 'modified' }
        : d
    ));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError('');
    try {
      if (captionText !== originalCaption) {
        await api.patch(`/cases/${caseId}/images/${idx}/`, { caption_text: captionText });
      }
      await Promise.all(localDets.map(async d => {
        if (d._state === 'deleted' && d.id) {
          await api.delete(`/detections/${d.id}/`);
        } else if (d._state === 'modified' && d.id) {
          await api.patch(`/detections/${d.id}/`, {
            tooth_fdi: d.tooth_fdi, mgi_level: d.mgi_level,
            x_center: d.x_center, y_center: d.y_center,
            width: d.width, height: d.height,
          });
        } else if (d._state === 'new') {
          await api.post(`/cases/${caseId}/images/${idx}/detections/`, {
            tooth_fdi: d.tooth_fdi, mgi_level: d.mgi_level,
            x_center: d.x_center, y_center: d.y_center,
            width: d.width, height: d.height,
          });
        }
      }));
      router.push(`/analysis/${caseId}/results/${idx}`);
    } catch {
      setSaveError('Lưu thất bại. Vui lòng thử lại.');
      setSaving(false);
    }
  }, [caseId, idx, localDets, captionText, originalCaption, router]);

  /* Keyboard shortcuts */
  const deleteRef = useRef(handleDeleteSelected);
  useEffect(() => { deleteRef.current = handleDeleteSelected; }, [handleDeleteSelected]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'INPUT') return;
      if (e.key === 'Escape') setSelectedId(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey)
        deleteRef.current();
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) setMode('select');
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey) handleSetMode('draw');
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [handleSetMode]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <span className="material-symbols-outlined text-5xl text-red-300">broken_image</span>
        <p className="text-sm text-gray-600">Không thể tải dữ liệu ảnh.</p>
        <Link href={`/analysis/${caseId}/results/${idx}`} className="text-sm text-primary underline underline-offset-2">
          Quay lại xem kết quả
        </Link>
      </div>
    );
  }

  if (!imgData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
        <span className="material-symbols-outlined text-5xl animate-spin">autorenew</span>
        <p className="text-sm">Đang tải...</p>
      </div>
    );
  }

  const imageUrl = toMediaUrl(imgData.original_path || imgData.annotated_path);
  const selectedDet = localDets.find(d => d.localId === selectedId && d._state !== 'deleted') ?? null;
  const activeCount = localDets.filter(d => d._state !== 'deleted').length;
  const isDirty = captionText !== originalCaption || localDets.some(d => d._state !== 'unchanged');

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap">
        <Link
          href={`/analysis/${caseId}/results/${idx}`}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Quay lại
        </Link>

        <div className="h-5 w-px bg-gray-200 mx-0.5 shrink-0" />

        {/* Mode buttons */}
        <div className="flex items-center gap-1">
          <ModeBtn active={mode === 'select'} onClick={() => setMode('select')} icon="arrow_selector_tool" label="Chọn (S)" />
          <ModeBtn active={mode === 'draw'} onClick={() => handleSetMode('draw')} icon="add_box" label="Vẽ hộp (D)" />
        </div>

        <div className="h-5 w-px bg-gray-200 mx-0.5 shrink-0" />

        <button
          onClick={() => setShowMasks(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors
            ${showMasks ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        >
          <span className="material-symbols-outlined text-[14px]">draw</span>
          Vùng răng
        </button>

        <button
          onClick={handleDeleteSelected}
          disabled={!selectedId}
          title="Xóa hộp đã chọn (Delete)"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">delete</span>
          Xóa
        </button>

        <div className="flex-1" />

        {saveError && <p className="text-xs text-red-500">{saveError}</p>}

        <button
          onClick={() => router.push(`/analysis/${caseId}/results/${idx}`)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Hủy
        </button>

        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {saving
            ? <span className="material-symbols-outlined text-[14px] animate-spin">autorenew</span>
            : <span className="material-symbols-outlined text-[14px]">save</span>
          }
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>

      {/* ── Main ── */}
      <div className="flex gap-5 items-start">
        {/* Canvas */}
        <div className="flex-1 min-w-0 space-y-2">
          <EditCanvas
            imageUrl={imageUrl}
            imgW={imgData.width || 1024}
            imgH={imgData.height || 768}
            detections={localDets}
            masks={imgData.masks}
            showMasks={showMasks}
            mode={mode}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDetectionUpdate={handleDetectionUpdate}
            onNewDetection={handleNewDetection}
          />
          <p className="text-[11px] text-gray-400 text-center">
            {mode === 'draw'
              ? 'Kéo để vẽ hộp viêm mới · nhấn S hoặc Esc để quay về chế độ chọn'
              : 'Click hộp để chọn · kéo để di chuyển · kéo góc để resize · Delete để xóa'}
          </p>
        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 space-y-4">
          {/* Detection editor */}
          {selectedDet ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-serif font-semibold text-[13px] text-gray-900">Chỉnh sửa phát hiện</h3>
                <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
              <div className="p-4 space-y-4">
                {/* Tooth FDI */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Răng (FDI)
                  </label>
                  <select
                    value={selectedDet.tooth_fdi}
                    onChange={e => handleDetPropChange(selectedDet.localId, 'tooth_fdi', e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {FDI_OPTIONS.map(fdi => (
                      <option key={fdi} value={fdi}>Răng {fdi}</option>
                    ))}
                  </select>
                </div>

                {/* MGI level */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Mức MGI
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {([0,1,2,3,4] as const).map(lvl => (
                      <button
                        key={lvl}
                        onClick={() => handleDetPropChange(selectedDet.localId, 'mgi_level', lvl)}
                        title={MGI_LABELS[lvl]}
                        className={`py-2 rounded-lg text-sm font-bold border-2 transition-all
                          ${selectedDet.mgi_level === lvl ? 'border-current shadow-sm' : 'border-transparent opacity-50 hover:opacity-80'}`}
                        style={{ color: MGI_COLORS[lvl], backgroundColor: `${MGI_COLORS[lvl]}18` }}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">{MGI_LABELS[selectedDet.mgi_level]}</p>
                </div>

                {selectedDet._state === 'new' && (
                  <p className="text-[11px] text-blue-600 bg-blue-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">add_circle</span>
                    Hộp mới · nguồn: bác sĩ
                  </p>
                )}

                <button
                  onClick={handleDeleteSelected}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                  Xóa hộp này
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
              <span className="material-symbols-outlined text-3xl text-gray-300">
                {mode === 'draw' ? 'add_box' : 'touch_app'}
              </span>
              <p className="text-xs text-gray-400 mt-1.5">
                {mode === 'draw'
                  ? 'Kéo trên ảnh để thêm hộp mới'
                  : `${activeCount} hộp · click để chọn và chỉnh sửa`}
              </p>
            </div>
          )}

          {/* Caption editor */}
          {imgData.caption && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-serif font-semibold text-[13px] text-gray-900">Mô tả lâm sàng</h3>
                {captionText !== imgData.caption.ai_text && (
                  <button
                    onClick={() => setCaptionText(imgData!.caption!.ai_text)}
                    className="text-[11px] text-primary hover:underline shrink-0"
                  >
                    Khôi phục AI
                  </button>
                )}
              </div>
              <div className="p-4">
                <textarea
                  value={captionText}
                  onChange={e => setCaptionText(e.target.value)}
                  rows={6}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 leading-relaxed"
                  placeholder="Nhập mô tả lâm sàng..."
                />
              </div>
            </div>
          )}

          {/* Keyboard help */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Phím tắt</p>
            {[['S','Chế độ chọn'],['D','Chế độ vẽ hộp'],['Delete','Xóa hộp đang chọn'],['Esc','Bỏ chọn']] .map(([k,l]) => (
              <div key={k} className="flex items-center gap-2">
                <kbd className="text-[10px] bg-white border border-gray-300 text-gray-600 px-1.5 py-0.5 rounded font-mono shadow-sm min-w-[32px] text-center">
                  {k}
                </kbd>
                <span className="text-[11px] text-gray-500">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: string; label: string;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors
        ${active ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  );
}
