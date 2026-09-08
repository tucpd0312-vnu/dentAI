'use client';

import { useState, useRef, useEffect, MouseEvent } from 'react';
import type { BoundingBox } from '@/lib/qa';

interface Props {
  imageUrl: string;
  isDrawing: boolean;
  currentBox: BoundingBox | null;
  onBoxChange: (box: BoundingBox | null) => void;
  activeHighlightBox?: BoundingBox | null;
  existingBoxes?: { id: number | string; box: BoundingBox; comment?: string; senderName?: string; isTeacher?: boolean }[];
  onSelectBox?: (id: number | string) => void;
}

export default function InteractiveImageAnnotator({
  imageUrl,
  isDrawing,
  currentBox,
  onBoxChange,
  activeHighlightBox,
  existingBoxes = [],
  onSelectBox,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragBox, setDragBox] = useState<BoundingBox | null>(null);
  const [hoveredBoxId, setHoveredBoxId] = useState<number | string | null>(null);

  // Chuẩn hoá URL media nếu cần
  const formattedUrl = imageUrl.startsWith('/media') || imageUrl.startsWith('http')
    ? imageUrl
    : imageUrl.startsWith('/')
    ? imageUrl
    : `/media/${imageUrl}`;

  const getRelativeCoords = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const coords = getRelativeCoords(e);
    setStartPos(coords);
    setDragBox({
      x: coords.x,
      y: coords.y,
      width: 0,
      height: 0,
    });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPos) return;
    const current = getRelativeCoords(e);
    const x = Math.min(startPos.x, current.x);
    const y = Math.min(startPos.y, current.y);
    const width = Math.abs(current.x - startPos.x);
    const height = Math.abs(current.y - startPos.y);

    setDragBox({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPos || !dragBox) {
      setStartPos(null);
      return;
    }

    // Chỉ lưu nếu hộp đủ kích thước (tránh click nhầm)
    if (dragBox.width > 0.02 && dragBox.height > 0.02) {
      onBoxChange(dragBox);
    }
    setStartPos(null);
    setDragBox(null);
  };

  return (
    <div className="relative flex flex-col items-center justify-center bg-gray-900 rounded-2xl overflow-hidden p-2 select-none border border-gray-800 shadow-inner">
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`relative inline-block max-w-full max-h-[520px] ${
          isDrawing ? 'cursor-crosshair' : 'cursor-default'
        }`}
      >
        {/* Ảnh chẩn đoán */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={formattedUrl}
          alt="Ảnh chẩn đoán ca bệnh"
          className="max-h-[500px] w-auto object-contain rounded-xl block pointer-events-none"
        />

        {/* Lớp SVG hiển thị các hộp đánh dấu */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Các hộp từ lịch sử tin nhắn */}
          {existingBoxes.map((item) => {
            const b = item.box;
            const isHovered = hoveredBoxId === item.id;
            const isSelected =
              activeHighlightBox &&
              Math.abs(activeHighlightBox.x - b.x) < 0.01 &&
              Math.abs(activeHighlightBox.y - b.y) < 0.01;

            const strokeColor = isSelected
              ? '#ef4444' // Đỏ rực khi click chọn
              : item.isTeacher
              ? '#10b981' // Xanh lá nếu của giảng viên
              : '#3b82f6'; // Xanh dương nếu của sinh viên

            return (
              <g key={item.id} className="pointer-events-auto">
                <rect
                  x={`${b.x * 100}%`}
                  y={`${b.y * 100}%`}
                  width={`${b.width * 100}%`}
                  height={`${b.height * 100}%`}
                  fill={isSelected ? 'rgba(239, 68, 68, 0.25)' : isHovered ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0,0,0,0.05)'}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? '2.5' : isHovered ? '2' : '1.5'}
                  strokeDasharray={isSelected ? 'none' : '3 1'}
                  className="transition-all cursor-pointer"
                  onMouseEnter={() => setHoveredBoxId(item.id)}
                  onMouseLeave={() => setHoveredBoxId(null)}
                  onClick={() => onSelectBox && onSelectBox(item.id)}
                />
              </g>
            );
          })}

          {/* Hộp đang vẽ dở */}
          {dragBox && (
            <rect
              x={`${dragBox.x * 100}%`}
              y={`${dragBox.y * 100}%`}
              width={`${dragBox.width * 100}%`}
              height={`${dragBox.height * 100}%`}
              fill="rgba(59, 130, 246, 0.25)"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
          )}

          {/* Hộp hiện tại đang chuẩn bị gửi */}
          {currentBox && !dragBox && (
            <rect
              x={`${currentBox.x * 100}%`}
              y={`${currentBox.y * 100}%`}
              width={`${currentBox.width * 100}%`}
              height={`${currentBox.height * 100}%`}
              fill="rgba(245, 158, 11, 0.25)"
              stroke="#f59e0b"
              strokeWidth="2.5"
            />
          )}
        </svg>

        {/* Nhãn tooltip cho các hộp đã vẽ khi hover */}
        {existingBoxes.map((item) => {
          const b = item.box;
          const isHovered = hoveredBoxId === item.id;
          const isSelected =
            activeHighlightBox &&
            Math.abs(activeHighlightBox.x - b.x) < 0.01 &&
            Math.abs(activeHighlightBox.y - b.y) < 0.01;

          if (!isHovered && !isSelected) return null;

          return (
            <div
              key={`label-${item.id}`}
              style={{
                left: `${b.x * 100}%`,
                top: `${Math.max(0, b.y * 100 - 6)}%`,
              }}
              className="absolute z-20 -translate-y-full transform pointer-events-none"
            >
              <div className="bg-gray-900/95 text-white text-xs px-2 py-1 rounded shadow-lg backdrop-blur-sm border border-gray-700 whitespace-nowrap flex items-center gap-1.5 animate-fadeIn">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="font-semibold">{item.senderName || 'Vùng đánh dấu'}:</span>
                <span className="text-gray-200">{item.comment || b.label || 'Không có ghi chú'}</span>
              </div>
            </div>
          );
        })}

        {/* Tooltip hướng dẫn khi bật chế độ vẽ */}
        {isDrawing && !dragBox && !currentBox && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white text-xs px-3 py-1.5 rounded-full shadow-lg backdrop-blur pointer-events-none flex items-center gap-1.5 animate-pulse">
            <span className="material-symbols-outlined text-[15px]">draw</span>
            Kéo thả chuột trên ảnh để đánh dấu vùng cần hỏi
          </div>
        )}
      </div>

      {/* Thanh công cụ phụ dưới ảnh */}
      <div className="w-full mt-2 flex items-center justify-between text-xs text-gray-400 px-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block"></span> Sinh viên
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span> Giảng viên
          </span>
          {currentBox && (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span> Vùng đang chọn
            </span>
          )}
        </div>
        {currentBox && (
          <button
            type="button"
            onClick={() => onBoxChange(null)}
            className="text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
            Xoá vùng đang chọn
          </button>
        )}
      </div>
    </div>
  );
}
