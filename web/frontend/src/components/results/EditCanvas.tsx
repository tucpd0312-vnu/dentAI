'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Line, Transformer } from 'react-konva';
import type { Mask } from '@/lib/api';

export interface LocalDetection {
  localId: string;
  id?: number;
  source: 'ai' | 'doctor';
  tooth_fdi: string;
  mgi_level: number;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
  _state: 'unchanged' | 'modified' | 'deleted' | 'new';
}

const MGI_COLORS: Record<number, string> = {
  0: '#9ca3af', 1: '#22c55e', 2: '#eab308', 3: '#f97316', 4: '#ef4444',
};

interface Props {
  imageUrl: string;
  imgW: number;
  imgH: number;
  detections: LocalDetection[];
  masks: Mask[];
  showMasks: boolean;
  mode: 'select' | 'draw';
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDetectionUpdate: (localId: string, xc: number, yc: number, w: number, h: number) => void;
  onNewDetection: (xc: number, yc: number, w: number, h: number) => void;
}

export default function EditCanvas({
  imageUrl, imgW, imgH, detections, masks, showMasks,
  mode, selectedId, onSelect, onDetectionUpdate, onNewDetection,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [konvaImg, setKonvaImg] = useState<HTMLImageElement | null>(null);

  // refs avoid stale closure in mouse handlers
  const drawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const transformerRef = useRef<any>(null);
  const boxRefsMap = useRef<Map<string, any>>(new Map());

  /* Measure container */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) =>
      setContainerWidth(Math.floor(entry.contentRect.width))
    );
    obs.observe(el);
    setContainerWidth(Math.floor(el.offsetWidth));
    return () => obs.disconnect();
  }, []);

  /* Load image */
  useEffect(() => {
    setKonvaImg(null);
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setKonvaImg(img);
    return () => { img.onload = null; };
  }, [imageUrl]);

  /* Sync Transformer to selected rect */
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (mode === 'select' && selectedId && boxRefsMap.current.has(selectedId)) {
      tr.nodes([boxRefsMap.current.get(selectedId)]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, mode, detections]);

  const scale = containerWidth > 0 && imgW > 0 ? containerWidth / imgW : 1;
  const stageW = containerWidth;
  const stageH = Math.round(imgH * scale);

  const getPosInImage = useCallback((stage: any) => {
    const p = stage.getPointerPosition();
    if (!p) return null;
    return { x: p.x / scale, y: p.y / scale };
  }, [scale]);

  const handleMouseDown = useCallback((e: any) => {
    if (mode !== 'draw') {
      if (e.target === e.target.getStage()) onSelect(null);
      return;
    }
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getPosInImage(stage);
    if (!pos) return;
    drawingRef.current = true;
    drawStartRef.current = pos;
    const r = { x: pos.x, y: pos.y, w: 0, h: 0 };
    drawRectRef.current = r;
    setDrawRect(r);
    onSelect(null);
  }, [mode, getPosInImage, onSelect]);

  const handleMouseMove = useCallback((e: any) => {
    if (!drawingRef.current || !drawStartRef.current) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getPosInImage(stage);
    if (!pos) return;
    const sx = drawStartRef.current.x;
    const sy = drawStartRef.current.y;
    const r = {
      x: Math.min(sx, pos.x), y: Math.min(sy, pos.y),
      w: Math.abs(pos.x - sx), h: Math.abs(pos.y - sy),
    };
    drawRectRef.current = r;
    setDrawRect(r);
  }, [getPosInImage]);

  const handleMouseUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const r = drawRectRef.current;
    if (r && r.w > 10 && r.h > 10) {
      const xc = (r.x + r.w / 2) / imgW;
      const yc = (r.y + r.h / 2) / imgH;
      onNewDetection(xc, yc, r.w / imgW, r.h / imgH);
    }
    drawRectRef.current = null;
    drawStartRef.current = null;
    setDrawRect(null);
  }, [imgW, imgH, onNewDetection]);

  if (stageW === 0) {
    return (
      <div ref={containerRef} className="w-full bg-gray-950 rounded-xl" style={{ minHeight: 320 }}>
        <div className="flex items-center justify-center h-80">
          <span className="material-symbols-outlined text-4xl text-gray-700 animate-spin">autorenew</span>
        </div>
      </div>
    );
  }

  const activeDets = detections.filter(d => d._state !== 'deleted');

  return (
    <div
      ref={containerRef}
      className="w-full bg-gray-950 rounded-xl overflow-hidden select-none"
      style={{ cursor: mode === 'draw' ? 'crosshair' : 'default' }}
    >
      <Stage
        width={stageW} height={stageH}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Background */}
        <Layer>
          {konvaImg
            ? <KonvaImage image={konvaImg} width={stageW} height={stageH} />
            : <Rect width={stageW} height={stageH} fill="#0a0a0a" />
          }
        </Layer>

        {/* Masks */}
        {showMasks && (
          <Layer opacity={0.38}>
            {masks.map(m => (
              <Line
                key={m.id}
                points={m.polygon.flatMap(pt => [pt[0] * imgW * scale, pt[1] * imgH * scale])}
                closed fill="#60a5fa" stroke="#3b82f6" strokeWidth={1.5}
                listening={false}
              />
            ))}
          </Layer>
        )}

        {/* Boxes + Transformer */}
        <Layer>
          {activeDets.map(det => {
            const color = MGI_COLORS[det.mgi_level] ?? MGI_COLORS[0];
            const bx = (det.x_center - det.width / 2) * imgW * scale;
            const by = (det.y_center - det.height / 2) * imgH * scale;
            const bw = det.width * imgW * scale;
            const bh = det.height * imgH * scale;
            const isSelected = selectedId === det.localId;

            return (
              <Rect
                key={det.localId}
                ref={(node) => {
                  if (node) boxRefsMap.current.set(det.localId, node);
                  else boxRefsMap.current.delete(det.localId);
                }}
                x={bx} y={by} width={bw} height={bh}
                stroke={isSelected ? '#ffffff' : color}
                strokeWidth={isSelected ? 2.5 : 2}
                fill={isSelected ? `${color}33` : `${color}11`}
                dash={det.source === 'doctor' || det._state === 'new' ? [6, 3] : []}
                draggable={mode === 'select'}
                onClick={(e: any) => {
                  if (mode !== 'select') return;
                  e.cancelBubble = true;
                  onSelect(det.localId);
                }}
                onDragEnd={(e: any) => {
                  const node = e.target;
                  const pw = node.width();
                  const ph = node.height();
                  onDetectionUpdate(
                    det.localId,
                    (node.x() + pw / 2) / (imgW * scale),
                    (node.y() + ph / 2) / (imgH * scale),
                    pw / (imgW * scale),
                    ph / (imgH * scale),
                  );
                }}
                onTransformEnd={(e: any) => {
                  const node = e.target;
                  const pw = node.width() * node.scaleX();
                  const ph = node.height() * node.scaleY();
                  node.width(pw); node.height(ph);
                  node.scaleX(1); node.scaleY(1);
                  onDetectionUpdate(
                    det.localId,
                    (node.x() + pw / 2) / (imgW * scale),
                    (node.y() + ph / 2) / (imgH * scale),
                    pw / (imgW * scale),
                    ph / (imgH * scale),
                  );
                }}
              />
            );
          })}

          {/* Draw preview */}
          {drawRect && (
            <Rect
              x={drawRect.x * scale} y={drawRect.y * scale}
              width={drawRect.w * scale} height={drawRect.h * scale}
              stroke="#ffffff" strokeWidth={1.5} dash={[4, 3]}
              fill="rgba(255,255,255,0.1)" listening={false}
            />
          )}

          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            keepRatio={false}
            boundBoxFunc={(_: any, newBox: any) => {
              if (newBox.width < 10 || newBox.height < 10) return _;
              return newBox;
            }}
          />
        </Layer>
      </Stage>
    </div>
  );
}
