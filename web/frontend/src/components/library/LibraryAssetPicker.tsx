'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { DATA_TYPE_ICON, fetchAsset, fetchAssets, fetchAssetThumbnailBlob, type DataAsset, type DiagnosisTarget } from '@/lib/library';
import { apiErrorMessage } from '@/lib/users';

export type InputSource = 'computer' | 'library';
const PAGE_SIZE = 8;

export function useLibraryInput(target: DiagnosisTarget, onPatientChange: (asset: DataAsset | null) => void) {
  const [inputSource, setInputSource] = useState<InputSource>('computer');
  const [selectedAssets, setSelectedAssets] = useState<DataAsset[]>([]);
  const [initialError, setInitialError] = useState<string | null>(null);
  const firstAssetId = useRef<number | null>(null);
  const changeAssets = useCallback((next: DataAsset[]) => {
    setInitialError(null);
    setSelectedAssets(next);
    const nextId = next[0]?.id ?? null;
    if (firstAssetId.current !== nextId) {
      firstAssetId.current = nextId;
      onPatientChange(next[0] ?? null);
    }
  }, [onPatientChange]);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('library_asset');
    if (!raw) return;
    const id = Number(raw);
    setInputSource('library');
    if (!Number.isInteger(id) || id <= 0) {
      setInitialError('Mã tư liệu không hợp lệ.');
      return;
    }
    let active = true;
    fetchAsset(id).then(asset => {
      if (!active) return;
      if (asset.diagnosis_target !== target) {
        setInitialError('Tư liệu chưa sẵn sàng hoặc không phù hợp với chức năng này.');
      } else {
        changeAssets([asset]);
      }
    }).catch(err => {
      if (active) setInitialError(apiErrorMessage(err, 'Không mở được tư liệu từ kho.'));
    });
    return () => { active = false; };
  }, [target, changeAssets]);

  return { inputSource, setInputSource, selectedAssets, changeAssets, initialError };
}

export function InputSourceTabs({ value, onChange, disabled }: {
  value: InputSource; onChange: (source: InputSource) => void; disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
      {([['computer', 'upload_file', 'Từ máy tính'], ['library', 'inventory_2', 'Từ Kho dữ liệu']] as const).map(([source, icon, label]) => (
        <button key={source} type="button" disabled={disabled} aria-pressed={value === source}
          onClick={() => onChange(source)}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${value === source ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <span className="material-symbols-outlined text-[18px]">{icon}</span>{label}
        </button>
      ))}
    </div>
  );
}

export default function LibraryAssetPicker({ target, selected, onChange, disabled, initialError }: {
  target: DiagnosisTarget; selected: DataAsset[]; onChange: (assets: DataAsset[]) => void;
  disabled: boolean; initialError?: string | null;
}) {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<DataAsset[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const maxSelection = target === 'canine3d' ? 1 : 20;

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchAssets({ diagnosis: target, q: query, mine: scope === 'mine', shared: scope === 'shared',
      others: scope === 'others', page, pageSize: PAGE_SIZE }).then(data => {
      if (active) { setRows(data.results); setCount(data.count); }
    }).catch(err => {
      if (active) { setRows([]); setCount(0); setError(apiErrorMessage(err, 'Không tải được Kho dữ liệu.')); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [target, query, page, scope]);

  function toggle(asset: DataAsset) {
    if (disabled) return;
    setError(null);
    if (selected.some(item => item.id === asset.id)) {
      onChange(selected.filter(item => item.id !== asset.id));
    } else if (maxSelection === 1) {
      onChange([asset]);
    } else if (selected.length >= maxSelection) {
      setError(`Mỗi ca tối đa ${maxSelection} ảnh từ kho.`);
    } else if (selected.some(item => item.patient && asset.patient && item.patient.id !== asset.patient.id)) {
      setError('Mỗi ca chỉ được chọn ảnh của cùng một bệnh nhân.');
    } else {
      onChange([...selected, asset]);
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-700">
        {target === 'gingivitis'
          ? 'Ảnh trong miệng · phân loại Viêm lợi · đã sẵn sàng. Nên dùng ảnh gốc chưa vẽ box/nhãn; chọn nhiều ảnh cùng bệnh nhân.'
          : 'Chuỗi DICOM (ZIP) · phân loại Răng nanh ngầm · đã sẵn sàng và khử thông tin định danh. Chọn một phim.'}
        {' '}Hệ thống tạo bản sao độc lập; không thay đổi tư liệu hoặc kết quả cũ.
      </p>
      {(initialError || error) && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error || initialError}</p>}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={event => setSearch(event.target.value)} disabled={disabled}
          aria-label="Tìm trong Kho dữ liệu" placeholder="Tìm tiêu đề, tên file hoặc bệnh nhân…"
          className="min-w-48 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <select value={scope} disabled={disabled} aria-label="Phạm vi Kho dữ liệu"
          onChange={event => { setScope(event.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="all">{isAdmin ? 'Tất cả hệ thống' : 'Tất cả được truy cập'}</option>
          <option value="mine">Của tôi</option><option value="shared">Được chia sẻ</option>
          {isAdmin && <option value="others">Của người khác</option>}
        </select>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Tư liệu đã chọn">
          {selected.map((asset, index) => <button key={asset.id} type="button" disabled={disabled} onClick={() => toggle(asset)}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
            <span className="truncate">{index + 1}. {asset.title}</span><span className="material-symbols-outlined text-[14px]">close</span>
          </button>)}
        </div>
      )}
      {loading ? <p className="py-12 text-center text-sm text-gray-400">Đang tải Kho dữ liệu…</p>
        : rows.length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">Không có tư liệu phù hợp với bộ lọc.</p>
        : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map(asset => {
            const picked = selected.some(item => item.id === asset.id);
            return <button key={asset.id} type="button" disabled={disabled} aria-pressed={picked}
              onClick={() => toggle(asset)} className={`flex items-center gap-3 rounded-xl border p-2.5 text-left ${picked ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'}`}>
              <AssetThumbnail asset={asset} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-800">{asset.title}</span>
                <span className="block truncate text-[11px] text-gray-500">{asset.patient?.name || asset.original_filename}</span>
                <span className="block truncate text-[10px] text-gray-400">{asset.uploaded_by?.full_name || asset.uploaded_by?.username}</span></span>
              <span className={`material-symbols-outlined text-[20px] ${picked ? 'text-primary' : 'text-gray-300'}`}>{picked ? 'check_circle' : 'radio_button_unchecked'}</span>
            </button>;
          })}
        </div>}
      {totalPages > 1 && <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Trang {page}/{totalPages} · {count} tư liệu</span><div className="flex gap-2">
          <button type="button" disabled={disabled || loading || page === 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Trước</button>
          <button type="button" disabled={disabled || loading || page === totalPages} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Sau</button>
        </div></div>}
    </div>
  );
}

function AssetThumbnail({ asset }: { asset: DataAsset }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let active = true;
    setSrc(null);
    fetchAssetThumbnailBlob(asset.id).then(blob => {
      if (active) { url = URL.createObjectURL(blob); setSrc(url); }
    }).catch(() => { if (active) setSrc(null); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [asset.id]);
  return <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-full w-full object-cover" />
    )
      : <span className="material-symbols-outlined text-2xl text-gray-300">{DATA_TYPE_ICON[asset.data_type]}</span>}
  </span>;
}
