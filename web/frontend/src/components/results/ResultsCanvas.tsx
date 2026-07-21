'use client';

import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text, Line, Group } from 'react-konva';
import type { Detection, Mask } from '@/lib/api';

const MGI_COLORS: Record<number, string> = {
  0: '#9ca3af',
  1: '#22c55e',
  2: '#eab308',
  3: '#f97316',
  4: '#ef4444',
};

interface Props {
  imageUrl: string;
  imgW: number;
  imgH: number;
  detections: Detection[];
  masks: Mask[];
  showBoxes: boolean;
  showMasks: boolean;
  isLowConfidence: boolean;
}

export default function ResultsCanvas({
  imageUrl, imgW, imgH, detections, masks, showBoxes, showMasks, isLowConfidence,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [konvaImg, setKonvaImg] = useState<HTMLImageElement | null>(null);

  /* Measure container */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
    });
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

  const scale = containerWidth > 0 && imgW > 0 ? containerWidth / imgW : 1;
  const stageW = containerWidth;
  const stageH = Math.round(imgH * scale);

  if (stageW === 0) {
    return (
      <div ref={containerRef} className="w-full bg-gray-950 rounded-xl" style={{ minHeight: 320 }}>
        <div className="flex items-center justify-center h-80">
          <span className="material-symbols-outlined text-4xl text-gray-700 animate-spin">
            autorenew
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full bg-gray-950 rounded-xl overflow-hidden">
      <Stage width={stageW} height={stageH}>
        {/* Base image */}
        <Layer>
          {konvaImg ? (
            <KonvaImage image={konvaImg} width={stageW} height={stageH} />
          ) : (
            <Rect width={stageW} height={stageH} fill="#0a0a0a" />
          )}
        </Layer>

        {/* Tooth segmentation masks */}
        {showMasks && !isLowConfidence && (
          <Layer opacity={0.38}>
            {masks.map(mask => (
              <Line
                key={mask.id}
                points={mask.polygon.flatMap(pt => [
                  pt[0] * imgW * scale,
                  pt[1] * imgH * scale,
                ])}
                closed
                fill="#60a5fa"
                stroke="#3b82f6"
                strokeWidth={1.5}
              />
            ))}
          </Layer>
        )}

        {/* Disease detection boxes */}
        {showBoxes && !isLowConfidence && (
          <Layer>
            {detections.map(det => {
              const color = MGI_COLORS[det.mgi_level] ?? MGI_COLORS[0];
              const bx = (det.x_center - det.width / 2) * imgW * scale;
              const by = (det.y_center - det.height / 2) * imgH * scale;
              const bw = det.width * imgW * scale;
              const bh = det.height * imgH * scale;
              const labelW = Math.max(bw, 62);
              const labelY = by > 22 ? by - 19 : by + bh + 2;

              return (
                <Group key={det.id}>
                  <Rect
                    x={bx} y={by} width={bw} height={bh}
                    stroke={color} strokeWidth={2}
                    fill="transparent"
                    dash={det.source === 'doctor' ? [5, 3] : []}
                  />
                  <Rect
                    x={bx} y={labelY}
                    width={labelW} height={17}
                    fill={color} cornerRadius={2} opacity={0.92}
                  />
                  <Text
                    x={bx + 4} y={labelY + 3}
                    text={`${det.tooth_fdi} · MGI ${det.mgi_level}`}
                    fontSize={10} fill="#fff"
                  />
                </Group>
              );
            })}
          </Layer>
        )}
      </Stage>

      {/* Image loading spinner overlay */}
      {!konvaImg && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ top: 0 }}
        >
          <span className="material-symbols-outlined text-3xl text-gray-600 animate-spin">
            autorenew
          </span>
        </div>
      )}
    </div>
  );
}
