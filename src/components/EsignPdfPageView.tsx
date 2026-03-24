import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Use worker from node_modules so it works offline and avoids CDN fetch failures (pdfjs v5 uses .mjs)
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${(pdfjsLib as any).version}/build/pdf.worker.min.mjs`;
  }
}

/** Coordinates stored in PDF points (72pt per inch) for backend compatibility. */
export interface FieldCoords {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EsignPdfPageViewProps {
  pdfUrl: string;
  pageNumber: number;
  scale?: number;
  className?: string;
  children?: React.ReactNode;
  onPdfInfo?: (info: { numPages: number }) => void;
  /** Page size in PDF points (same space as field x/y). Used to persist normalized coords. */
  onPageDimensions?: (info: { pageNumber: number; widthPt: number; heightPt: number }) => void;
  onDrop?: (coords: FieldCoords & { fieldType: string; pageWidthPt: number; pageHeightPt: number }) => void;
}

/**
 * Renders a single PDF page with proper structure for field overlays.
 * Structure: Page container (position: relative) > Canvas + Field Layer (position: absolute).
 * Each page has its own field layer so fields stay fixed to the page when scrolling.
 */
const DEFAULT_FIELD_WIDTH_PT = 120;
const DEFAULT_FIELD_HEIGHT_PT = 40;

const EsignPdfPageView: React.FC<EsignPdfPageViewProps> = ({
  pdfUrl,
  pageNumber,
  scale = 1.5,
  className = '',
  children,
  onPdfInfo,
  onPageDimensions,
  onDrop,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!pdfUrl || pageNumber < 1) return;

    let cancelled = false;

    const loadPage = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(pdfUrl, { mode: 'cors', credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to load PDF: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        onPdfInfo?.({ numPages: pdf.numPages });

        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const context = canvas.getContext('2d');
        if (!context) {
          setError('Canvas context not available');
          return;
        }

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        setDimensions({ width: viewport.width, height: viewport.height });
        onPageDimensions?.({
          pageNumber,
          widthPt: viewport.width / scale,
          heightPt: viewport.height / scale,
        });

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        if (!cancelled) setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load PDF page');
          setLoading(false);
        }
      }
    };

    loadPage();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, pageNumber, scale]);

  if (error) {
    return (
      <div className={`flex items-center justify-center min-h-[400px] bg-slate-100 rounded-lg ${className}`}>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{
        width: dimensions?.width ?? '100%',
        height: dimensions?.height ?? 600,
        minHeight: 400,
      }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
          <div className="animate-spin h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="block max-w-none"
        style={{ display: loading ? 'none' : 'block', maxWidth: 'none' }}
      />
      {/* Field layer: same size as canvas. Fields use position:absolute relative to this page. z-index so drop target is above canvas. */}
      <div
        className="absolute inset-0"
        style={{
          left: 0,
          top: 0,
          width: dimensions?.width ?? '100%',
          height: dimensions?.height ?? '100%',
          pointerEvents: loading ? 'none' : 'auto',
          zIndex: 10,
        }}
        onDragOver={onDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } : undefined}
        onDrop={onDrop ? (e) => {
          e.preventDefault();
          const fieldType = (e.dataTransfer.getData('text/plain') || 'signature') as string;
          if (!['signature', 'name', 'title', 'date'].includes(fieldType)) return;
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect || !dimensions) return;
          const pxX = e.clientX - rect.left;
          const pxY = e.clientY - rect.top;
          const x = Math.max(0, Math.min(dimensions.width / scale - DEFAULT_FIELD_WIDTH_PT, pxX / scale - DEFAULT_FIELD_WIDTH_PT / 2));
          const y = Math.max(0, Math.min(dimensions.height / scale - DEFAULT_FIELD_HEIGHT_PT, pxY / scale - DEFAULT_FIELD_HEIGHT_PT / 2));
          const pageWidthPt = dimensions.width / scale;
          const pageHeightPt = dimensions.height / scale;
          onDrop({
            page: pageNumber,
            x,
            y,
            width: DEFAULT_FIELD_WIDTH_PT,
            height: DEFAULT_FIELD_HEIGHT_PT,
            fieldType,
            pageWidthPt,
            pageHeightPt,
          });
        } : undefined}
      >
        {children}
      </div>
    </div>
  );
};

export default EsignPdfPageView;
