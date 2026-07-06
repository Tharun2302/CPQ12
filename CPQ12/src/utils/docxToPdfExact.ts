import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

function ensureDocxPreviewStyles() {
  const existing = document.getElementById('docx-preview-css');
  if (existing) return;
  const link = document.createElement('link');
  link.id = 'docx-preview-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/docx-preview@0.4.1/dist/docx-preview.css';
  document.head.appendChild(link);
}

export async function convertDocxToPdfExact(docxBlob: Blob): Promise<Blob> {
  ensureDocxPreviewStyles();

  // Render DOCX → high-fidelity HTML using docx-preview
  // Lazy import to keep main bundle smaller
  const { renderAsync } = await import('docx-preview');
  const arrayBuffer = await docxBlob.arrayBuffer();

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-10000px';
  container.style.top = '0';
  // A4 width at 96dpi ≈ 794px; using 800 for safe layout
  container.style.width = '800px';
  container.style.background = '#ffffff';
  container.style.padding = '0';
  document.body.appendChild(container);

  try {
    await renderAsync(arrayBuffer, container as HTMLElement, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      className: 'docx',
      debug: false
    } as any);

    // Give the browser a tick to layout fonts/images
    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png', 1.0);
    const imgWidth = 210; // A4 width (mm)
    const pageHeight = 295; // A4 height (mm)
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const blob = pdf.output('blob');
    return blob;
  } finally {
    document.body.removeChild(container);
  }
}


