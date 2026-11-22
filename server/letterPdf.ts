// Pembuat PDF surat pengantar. Kop surat diatur lewat .env:
//   KOP_KELURAHAN, KOP_KECAMATAN, KOP_KOTA
import PDFDocument from 'pdfkit';

interface LetterInput {
  resident: any;
  type: string;      // jenis surat, mis. "Surat Pengantar KTP"
  purpose: string;   // keperluan / isi
  number?: string | number;
}

export function generateLetterPdf({ resident, type, purpose, number }: LetterInput): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];
    doc.on('data', (b) => buffers.push(b));
    doc.on('end', () => resolve(Buffer.concat(buffers).toString('base64')));
    doc.on('error', reject);

    const kelurahan = process.env.KOP_KELURAHAN || '[NAMA KELURAHAN]';
    const kecamatan = process.env.KOP_KECAMATAN || '[NAMA KECAMATAN]';
    const kota = process.env.KOP_KOTA || '[KOTA]';
    const rt = String(resident.rt ?? '').replace(/^RT/i, '') || '-';
    const rw = String(resident.rw ?? '-');
    const year = new Date().getFullYear();

    // Kop
    doc.font('Helvetica-Bold').fontSize(14).text(`RUKUN TETANGGA ${rt} / RUKUN WARGA ${rw}`, { align: 'center' });
    doc.text(`KELURAHAN ${kelurahan.toUpperCase()}`, { align: 'center' });
    doc.text(`KECAMATAN ${kecamatan.toUpperCase()}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(2).stroke();
    doc.moveDown(1);

    // Judul
    doc.font('Helvetica-Bold').fontSize(16).text(type.toUpperCase(), { align: 'center', underline: true });
    doc.font('Helvetica').fontSize(12).text(`Nomor: ${number ?? '...'}/RT${rt}/${year}`, { align: 'center' });
    doc.moveDown(2);

    // Isi
    doc.text(`Yang bertanda tangan di bawah ini Ketua RT ${rt} RW ${rw}, menerangkan bahwa:`, { align: 'justify' });
    doc.moveDown(1);

    const field = (label: string, value: unknown) => {
      const y = doc.y;
      doc.text(label, 70, y);
      doc.text(':', 180, y);
      doc.text(String(value || '-'), 190, y, { width: 355 });
      doc.moveDown(0.4);
    };
    field('Nama Lengkap', resident.name);
    field('NIK', resident.nik);
    field('No. KK', resident.familyCardNumber);
    field('Jenis Kelamin', resident.gender);
    field('Status Perkawinan', resident.maritalStatus);
    field('Alamat', resident.address);

    doc.moveDown(1);
    doc.text(`Orang tersebut di atas adalah benar warga kami yang berdomisili di lingkungan RT ${rt} RW ${rw}.`, 50, doc.y, { align: 'justify' });
    doc.moveDown(0.5);
    doc.text('Surat ini diberikan untuk keperluan:', { align: 'justify' });
    doc.font('Helvetica-Bold').text(purpose || type, { indent: 20 });
    doc.font('Helvetica').moveDown(1);
    doc.text('Demikian surat ini dibuat untuk dapat dipergunakan sebagaimana mestinya.', { align: 'justify' });

    // Tanda tangan
    doc.moveDown(3);
    const date = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`${kota}, ${date}`, 350, doc.y);
    doc.text(`Ketua RT ${rt}`, 350);
    doc.moveDown(4);
    doc.text('( .................................... )', 350);

    doc.end();
  });
}
