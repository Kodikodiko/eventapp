/**
 * PDF der Teilnahmebestätigungen: A4 quer, eine Seite je Person. Das Hintergrundbild füllt die ganze Seite
 * (zugeschnitten, mittig); Überschrift und Text stehen zentriert; Zeilen nur mit dem Namen bzw. dem Eventnamen sind fett hervorgehoben.
 */
import PDFDocument from 'pdfkit';

/** `name`/`event`: Zeilen, die nur daraus bestehen, werden hervorgehoben. */
export type CertificatePage = { heading: string; body: string; name: string; event?: string };

const HEADING_SIZE = 34;
const BODY_SIZE = 16;
const NAME_SIZE = 24;
const EVENT_SIZE = 19;

export function renderCertificatesPdf(pages: CertificatePage[], options: { image: Buffer | null; textColor: string; title: string; author: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      autoFirstPage: false,
      info: { Title: options.title, Author: options.author, Creator: 'EventFlow' },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    try {
      for (const page of pages) {
        pdf.addPage();
        drawPage(pdf, page, options);
      }
      pdf.end();
    } catch (error) {
      reject(error);
    }
  });
}

function drawPage(pdf: PDFKit.PDFDocument, page: CertificatePage, options: { image: Buffer | null; textColor: string }) {
  const w = pdf.page.width;
  const h = pdf.page.height;
  if (options.image) pdf.image(options.image, 0, 0, { cover: [w, h], align: 'center', valign: 'center' });

  const width = w * 0.7;
  const left = (w - width) / 2;
  const lines = page.body.split(/\r?\n/);
  const kind = (line: string) => (page.name && line.trim() === page.name ? 'name' : page.event && line.trim() === page.event ? 'event' : 'text');
  const SIZE = { name: NAME_SIZE, event: EVENT_SIZE, text: BODY_SIZE } as const;
  const lineHeight = (line: string) => SIZE[kind(line)] * (kind(line) === 'text' ? 1.6 : 1.5);

  pdf.font('Helvetica-Bold').fontSize(HEADING_SIZE);
  const headingHeight = page.heading ? pdf.heightOfString(page.heading, { width, align: 'center' }) + 28 : 0;
  pdf.font('Helvetica').fontSize(BODY_SIZE);
  const bodyHeight = lines.reduce((sum, l) => sum + Math.max(lineHeight(l), pdf.heightOfString(l || ' ', { width, align: 'center' })), 0);

  let y = Math.max(h * 0.12, (h - headingHeight - bodyHeight) / 2);
  pdf.fillColor(options.textColor);
  if (page.heading) {
    pdf.font('Helvetica-Bold').fontSize(HEADING_SIZE).text(page.heading, left, y, { width, align: 'center' });
    y = pdf.y + 28;
  }
  for (const line of lines) {
    const k = kind(line);
    pdf.font(k === 'text' ? 'Helvetica' : 'Helvetica-Bold').fontSize(SIZE[k]);
    pdf.text(line || ' ', left, y, { width, align: 'center' });
    y = Math.max(pdf.y, y + lineHeight(line) * 0.6) + (k === 'text' ? 4 : 10);
  }
}
