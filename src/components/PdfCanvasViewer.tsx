import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${(pdfjsLib as any).version}/build/pdf.worker.min.mjs`;
  }
}

interface PdfCanvasViewerProps {
  src: string;
  className?: string;
  scale?: number;
}

/**
 * Renders every page of a PDF on <canvas> elements via pdf.js.
 * Works on Android Chrome / iOS Safari where <iframe> PDF viewing fails.
 */
const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({ src, className = '', scale = 1.5 }) => {
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let arrayBuffer: ArrayBuffer;
        if (src.startsWith('data:')) {
          const base64 = src.split(',')[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          arrayBuffer = bytes.buffer;
        } else {
          const res = await fetch(src, { mode: 'cors', credentials: 'include' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          arrayBuffer = await res.arrayBuffer();
        }
        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);
        setPdfData(arrayBuffer);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load PDF');
          setLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [src]);

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
        <div className="animate-spin h-8 w-8 border-2 border-teal-600 border-t-transparent rounded-full mb-3" />
        <p className="text-sm text-gray-600">Loading document…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <p className="text-sm text-red-600">Unable to load document: {error}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: numPages }, (_, i) => (
        <PdfPage key={i} pageNumber={i + 1} pdfData={pdfData!} scale={scale} />
      ))}
    </div>
  );
};

const PdfPage: React.FC<{ pageNumber: number; pdfData: ArrayBuffer; scale: number }> = ({
  pageNumber,
  pdfData,
  scale,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [mobileScale, setMobileScale] = useState(1);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const render = useCallback(async () => {
    try {
      const pdf = await pdfjsLib.getDocument({ data: pdfData.slice(0) }).promise;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setDims({ w: viewport.width, h: viewport.height });
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch {
      // silently skip render errors for individual pages
    }
  }, [pdfData, pageNumber, scale]);

  useEffect(() => { render(); }, [render]);

  useEffect(() => {
    if (!dims || !wrapperRef.current) return;
    const update = () => {
      const parent = wrapperRef.current?.parentElement;
      if (!parent) return;
      const avail = parent.clientWidth;
      setMobileScale(avail > 0 && dims.w > avail ? avail / dims.w : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current.parentElement) ro.observe(wrapperRef.current.parentElement);
    return () => ro.disconnect();
  }, [dims]);

  const scaledH = dims ? dims.h * mobileScale : 400;

  return (
    <div
      ref={wrapperRef}
      className="bg-white rounded shadow-sm overflow-hidden mx-auto"
      style={{ width: '100%', maxWidth: dims?.w ?? '100%', height: scaledH, minHeight: 100 }}
    >
      <canvas
        ref={canvasRef}
        className="block origin-top-left"
        style={{
          maxWidth: 'none',
          transform: mobileScale < 1 ? `scale(${mobileScale})` : undefined,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
};

export default PdfCanvasViewer;
