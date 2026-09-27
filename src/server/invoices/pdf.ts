/**
 * PDF-Ausgabe eines Belegs (A4, Schrift Helvetica). Inhalt und Texte kommen aus ./document.ts.
 * Die Standardschriften von PDFKit decken Umlaute, ß und € ab (WinAnsi).
 */
import PDFDocument from 'pdfkit';
import type { InvoiceDocument } from './document';

const MM = 72 / 25.4;
const MARGIN = 20 * MM;
const MUTED = '#555555';

export function renderInvoicePdf(doc: InvoiceDocument, info: { author: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: 25 * MM, right: MARGIN },
      info: { Title: `${doc.title} ${doc.meta[0]?.[1] ?? ''}`.trim(), Author: info.author, Creator: 'EventFlow' },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const left = pdf.page.margins.left;
    const right = pdf.page.width - pdf.page.margins.right;
    const width = right - left;

    // Absender (rechts oben)
    pdf.font('Helvetica-Bold').fontSize(11).text(doc.seller[0] ?? '', left + width / 2, MARGIN, { width: width / 2, align: 'right' });
    pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(doc.seller.slice(1).join('\n'), { width: width / 2, align: 'right' });

    // Anschriftfeld (links, Fensterkuvert-Position ~45 mm von oben)
    const addressTop = 45 * MM;
    pdf.fillColor(MUTED).fontSize(7).text(doc.senderLine, left, addressTop, { width: 85 * MM, lineBreak: false, ellipsis: true });
    pdf.fillColor('black').fontSize(10).text(doc.recipient.join('\n'), left, addressTop + 12, { width: 85 * MM });

    // Titel und Kopfdaten
    let y = Math.max(pdf.y, 95 * MM);
    pdf.font('Helvetica-Bold').fontSize(16).text(doc.title, left, y);
    y = pdf.y + 8;
    const labelW = 45 * MM;
    for (const [label, value] of doc.meta) {
      pdf.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(label, left, y, { width: labelW });
      pdf.fillColor('black').text(value, left + labelW, y, { width: width - labelW });
      y = pdf.y + 2;
    }

    // Positionen
    y += 14;
    const col = { pos: left, desc: left + 12 * MM, qty: right - 70 * MM, vat: right - 52 * MM, amount: right - 32 * MM };
    const header = () => {
      pdf.font('Helvetica-Bold').fontSize(9).fillColor('black');
      pdf.text(doc.columns.pos, col.pos, y, { width: 12 * MM });
      pdf.text(doc.columns.description, col.desc, y, { width: col.qty - col.desc - 4 });
      pdf.text(doc.columns.quantity, col.qty, y, { width: 16 * MM, align: 'right' });
      pdf.text(doc.columns.vat, col.vat, y, { width: 18 * MM, align: 'right' });
      pdf.text(doc.columns.amount, col.amount, y, { width: 32 * MM, align: 'right' });
      y = pdf.y + 4;
      pdf.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor('#999999').stroke();
      y += 6;
    };
    header();
    pdf.font('Helvetica').fontSize(9.5);
    for (const row of doc.rows) {
      const descWidth = col.qty - col.desc - 4;
      const h = Math.max(pdf.heightOfString(row.description, { width: descWidth }), 12);
      if (y + h > pdf.page.height - MARGIN - 60) {
        pdf.addPage();
        y = MARGIN;
        header();
        pdf.font('Helvetica').fontSize(9.5);
      }
      pdf.text(row.pos, col.pos, y, { width: 12 * MM });
      pdf.text(row.description, col.desc, y, { width: descWidth });
      pdf.text(row.quantity, col.qty, y, { width: 16 * MM, align: 'right' });
      pdf.text(row.vat, col.vat, y, { width: 18 * MM, align: 'right' });
      pdf.text(row.amount, col.amount, y, { width: 32 * MM, align: 'right' });
      y += h + 6;
    }
    pdf.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor('#999999').stroke();
    y += 8;

    // Summen
    doc.totals.forEach(([label, value], i) => {
      const last = i === doc.totals.length - 1;
      pdf.font(last ? 'Helvetica-Bold' : 'Helvetica').fontSize(last ? 11 : 9.5);
      pdf.text(label, right - 100 * MM, y, { width: 66 * MM, align: 'right' });
      pdf.text(value, col.amount, y, { width: 32 * MM, align: 'right' });
      y = pdf.y + 3;
    });

    // Hinweise
    y += 16;
    pdf.font('Helvetica').fontSize(9.5).fillColor('black');
    for (const note of doc.notes) {
      pdf.text(note, left, y, { width });
      y = pdf.y + 5;
    }

    // Fußzeile auf jeder Seite
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      const bottom = pdf.page.height - MARGIN + 4;
      pdf.page.margins.bottom = 0;
      pdf.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(doc.footer, left, bottom, { width, align: 'center' });
      if (range.count > 1) pdf.text(`${i + 1}/${range.count}`, left, bottom + 10, { width, align: 'right' });
    }
    pdf.end();
  });
}
