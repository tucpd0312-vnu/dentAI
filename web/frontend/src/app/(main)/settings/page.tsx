'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function SettingsPage() {
  const [threshold, setThreshold]   = useState<number>(0.5);
  const [draft, setDraft]           = useState<number>(0.5);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    api.get<{ confidence_threshold: number }>('/settings/')
      .then(r => {
        setThreshold(r.data.confidence_threshold);
        setDraft(r.data.confidence_threshold);
        setLoading(false);
      })
      .catch(() => {
        setError('Không thể tải cài đặt.');
        setLoading(false);
      });
  }, []);

  const dirty = draft !== threshold;

  function handleSave() {
    setSaving(true);
    setError(null);
    api.patch<{ confidence_threshold: number }>('/settings/', {
      confidence_threshold: draft,
    })
      .then(r => {
        setThreshold(r.data.confidence_threshold);
        setDraft(r.data.confidence_threshold);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      })
      .catch(() => setError('Lưu thất bại. Vui lòng thử lại.'))
      .finally(() => setSaving(false));
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-serif font-bold text-xl text-gray-900">Cài đặt</h1>
        <p className="text-sm text-gray-500 mt-0.5">Điều chỉnh tham số hệ thống chẩn đoán.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm text-gray-800">Ngưỡng độ tin cậy</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Matching score tối thiểu để chấp nhận kết quả ghép cặp răng–vùng viêm. Kết quả dưới
            ngưỡng này sẽ bị coi là độ tin cậy thấp và không đưa vào chẩn đoán.
          </p>
        </div>

        <div className="px-5 py-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
              <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
              Đang tải...
            </div>
          ) : (
            <>
              {/* Value display */}
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold tabular-nums text-gray-900">
                  {draft.toFixed(2)}
                </span>
                <span className="text-xs text-gray-400 pb-1">Khoảng: 0.00 – 1.00</span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={draft}
                onChange={e => setDraft(parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
              />

              {/* Preset quick buttons */}
              <div className="flex gap-2 flex-wrap">
                {[0.3, 0.4, 0.5, 0.6, 0.7].map(v => (
                  <button
                    key={v}
                    onClick={() => setDraft(v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                      ${draft === v
                        ? 'bg-primary text-white border-primary'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {v.toFixed(1)}
                  </button>
                ))}
                <span className="text-xs text-gray-400 self-center ml-1">(mặc định: 0.5)</span>
              </div>

              {/* Guidance */}
              <div className="flex gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
                <span className="material-symbols-outlined text-[16px] shrink-0 text-blue-400 mt-0.5">
                  info
                </span>
                <div className="space-y-0.5">
                  <p><span className="font-semibold">Ngưỡng thấp (0.3–0.4):</span> chấp nhận nhiều kết quả hơn, có thể có false positive.</p>
                  <p><span className="font-semibold">Ngưỡng cao (0.6–0.7):</span> chỉ giữ kết quả chắc chắn, có thể bỏ sót ca nhẹ.</p>
                  <p><span className="font-semibold">0.5</span> là giá trị tối ưu trên validation set.</p>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  {error}
                </div>
              )}

              {/* Save button */}
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setDraft(threshold)}
                  disabled={!dirty || saving}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-0 transition-all"
                >
                  Đặt lại
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm
                    ${dirty && !saving
                      ? 'bg-primary text-white hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  {saving ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span>
                      Đang lưu...
                    </>
                  ) : saved ? (
                    <>
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Đã lưu
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      Lưu thay đổi
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* FALC info block */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm text-gray-800">FALC Continual Learning</h2>
        </div>
        <div className="px-5 py-4 space-y-2 text-xs text-gray-600">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[14px] text-green-500 mt-0.5 shrink-0">
              check_circle
            </span>
            <span>Mỗi lần bác sĩ Save chỉnh sửa, feedback được tự động ghi vào FALC database.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[14px] text-green-500 mt-0.5 shrink-0">
              check_circle
            </span>
            <span>
              Chỉnh sửa bounding box / MGI → T1 feedback (YOLOv9 retraining queue).
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[14px] text-green-500 mt-0.5 shrink-0">
              check_circle
            </span>
            <span>Chỉnh sửa mô tả lâm sàng → T2 feedback (T5 LoRA retraining queue).</span>
          </div>
          <div className="flex items-start gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="material-symbols-outlined text-[14px] text-gray-400 mt-0.5 shrink-0">
              terminal
            </span>
            <code className="text-[11px] bg-gray-50 rounded px-2 py-1 font-mono text-gray-700">
              python -m falc.orchestrator --status
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
