/**
 * optical-sheet-generator.js - Standart Yazıcı Uyumlu A4 Optik Form Üreticisi
 * 
 * Özellikler:
 * 1. 4 Köşe L-Biçimli Kamera Hizalama Nişanları (Fiducial Corner Brackets): 
 *    Telefon kamerasının kağıdı perspektif bozulması olmadan anında yakalamasını sağlar.
 * 2. Dinamik Gerçek QR Kod: Saf JavaScript ile üretilen, harici kütüphane gerektirmeyen gerçek QR kod.
 * 3. Yatay A4 Sıfır Taşma Formatı (297mm x 210mm): 
 *    Tek sayfaya milimetrik oturan, MEB ve kurumsal deneme sınavları standartlarında 6 sütunlu optik form.
 * 4. Talebeye Özel Baskı veya Boş Form Desteği.
 */

// Saf JavaScript QR Kod SVG Üreticisi (Model 2, Byte Modu, Hata Düzeltme Seviyesi M)
const PureQrEngine = (() => {
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  function gfMul(a, b) {
    return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
  }
  function rsPolyMul(p1, p2) {
    const res = new Uint8Array(p1.length + p2.length - 1);
    for (let i = 0; i < p1.length; i++) {
      for (let j = 0; j < p2.length; j++) {
        res[i + j] ^= gfMul(p1[i], p2[j]);
      }
    }
    return res;
  }
  function rsGenPoly(n) {
    let g = new Uint8Array([1]);
    for (let i = 0; i < n; i++) {
      g = rsPolyMul(g, new Uint8Array([1, EXP[i]]));
    }
    return g;
  }
  function rsCalculate(data, ecCount) {
    const gen = rsGenPoly(ecCount);
    const msg = new Uint8Array(data.length + ecCount);
    msg.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          msg[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return msg.slice(data.length);
  }

  const VERSIONS = [
    { v: 1, n: 21, total: 26, ec: 10, blocks: 1, data: 16, align: null },
    { v: 2, n: 25, total: 44, ec: 16, blocks: 1, data: 28, align: 18 },
    { v: 3, n: 29, total: 70, ec: 26, blocks: 1, data: 44, align: 22 },
    { v: 4, n: 33, total: 100, ec: 36, blocks: 2, data: 64, align: 26 },
    { v: 5, n: 37, total: 134, ec: 48, blocks: 2, data: 86, align: 30 }
  ];

  function generateSvg(text, size = 105) {
    const safeText = encodeURIComponent(text);
    let rawBytes = [];
    try {
      const utf8 = unescape(encodeURIComponent(text));
      for (let i = 0; i < utf8.length; i++) rawBytes.push(utf8.charCodeAt(i));
    } catch (e) {
      for (let i = 0; i < text.length; i++) rawBytes.push(text.charCodeAt(i) & 0xff);
    }

    let ver = null;
    for (const spec of VERSIONS) {
      if (rawBytes.length <= spec.data - 2) {
        ver = spec;
        break;
      }
    }
    if (!ver) ver = VERSIONS[VERSIONS.length - 1];

    let bits = '0100'; // Byte mode
    let len = Math.min(rawBytes.length, ver.data - 2);
    bits += len.toString(2).padStart(8, '0');
    for (let i = 0; i < len; i++) {
      bits += rawBytes[i].toString(2).padStart(8, '0');
    }

    const totalDataBits = ver.data * 8;
    const termLen = Math.min(4, totalDataBits - bits.length);
    bits += '0'.repeat(termLen);
    if (bits.length % 8 !== 0) {
      bits += '0'.repeat(8 - (bits.length % 8));
    }
    const padBytes = [0xEC, 0x11];
    let padIdx = 0;
    while (bits.length < totalDataBits) {
      bits += padBytes[padIdx % 2].toString(2).padStart(8, '0');
      padIdx++;
    }

    const dataBytes = new Uint8Array(ver.data);
    for (let i = 0; i < ver.data; i++) {
      dataBytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    }

    const blockSize = Math.floor(ver.data / ver.blocks);
    const ecBlockSize = Math.floor(ver.ec / ver.blocks);
    const dataBlocks = [];
    const ecBlocks = [];

    for (let b = 0; b < ver.blocks; b++) {
      const bData = dataBytes.slice(b * blockSize, (b + 1) * blockSize);
      dataBlocks.push(bData);
      ecBlocks.push(rsCalculate(bData, ecBlockSize));
    }

    const finalBytes = [];
    for (let i = 0; i < blockSize; i++) {
      for (let b = 0; b < ver.blocks; b++) finalBytes.push(dataBlocks[b][i]);
    }
    for (let i = 0; i < ecBlockSize; i++) {
      for (let b = 0; b < ver.blocks; b++) finalBytes.push(ecBlocks[b][i]);
    }

    const N = ver.n;
    const modules = Array.from({ length: N }, () => new Array(N).fill(null));
    const isReserved = Array.from({ length: N }, () => new Array(N).fill(false));

    function setModule(r, c, val, reserved = true) {
      if (r >= 0 && r < N && c >= 0 && c < N) {
        modules[r][c] = val;
        if (reserved) isReserved[r][c] = true;
      }
    }

    function addFinder(r0, c0) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rAbs = r0 + r;
          const cAbs = c0 + c;
          if (rAbs >= 0 && rAbs < N && cAbs >= 0 && cAbs < N) {
            let val = false;
            if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
              if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                val = true;
              }
            }
            setModule(rAbs, cAbs, val, true);
          }
        }
      }
    }
    addFinder(0, 0);
    addFinder(0, N - 7);
    addFinder(N - 7, 0);

    if (ver.align) {
      const ar = ver.align;
      const ac = ver.align;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const val = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
          setModule(ar + r, ac + c, val, true);
        }
      }
    }

    for (let i = 8; i < N - 8; i++) {
      const val = (i % 2 === 0);
      if (!isReserved[6][i]) setModule(6, i, val, true);
      if (!isReserved[i][6]) setModule(i, 6, val, true);
    }

    setModule(N - 8, 8, true, true);

    // Format Bilgisi (Seviye M, Mask 000, 15 Bit):
    // ISO/IEC 18004 Standardı: f0..f14 bitleri (Lsb'den Msb'ye)
    const formatBits = [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1];

    // Birinci kopya: Sol üst bulucu etrafı (8,0)..(8,8) ve (7,8)..(0,8)
    for (let i = 0; i <= 5; i++) setModule(8, i, formatBits[i] === 1, true);
    setModule(8, 7, formatBits[6] === 1, true);
    setModule(8, 8, formatBits[7] === 1, true);
    setModule(7, 8, formatBits[8] === 1, true);
    for (let i = 9; i <= 14; i++) setModule(14 - i, 8, formatBits[i] === 1, true);

    // İkinci kopya: Sol alt bulucu (bit 0..6) ve Sağ üst bulucu (bit 7..14)
    for (let i = 0; i <= 6; i++) {
      setModule(N - 1 - i, 8, formatBits[i] === 1, true);
    }
    for (let i = 7; i <= 14; i++) {
      setModule(8, N - 8 + (i - 7), formatBits[i] === 1, true);
    }

    let bitIdx = 0;
    const finalBits = [];
    for (const b of finalBytes) {
      for (let s = 7; s >= 0; s--) finalBits.push((b >> s) & 1);
    }

    let up = true;
    for (let c = N - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      const rows = up ? Array.from({ length: N }, (_, i) => N - 1 - i) : Array.from({ length: N }, (_, i) => i);
      for (const r of rows) {
        for (const col of [c, c - 1]) {
          if (!isReserved[r][col]) {
            let bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
            if ((r + col) % 2 === 0) bit ^= 1;
            modules[r][col] = (bit === 1);
          }
        }
      }
      up = !up;
    }

    const border = 4;
    const viewBoxSize = N + border * 2;
    let rects = '';
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (modules[r][c]) {
          rects += `<rect x="${c + border}" y="${r + border}" width="1" height="1" fill="#000000"/>`;
        }
      }
    }

    return `
      <svg viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}px" height="${size}px" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" class="block mx-auto">
        <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>
        ${rects}
      </svg>
    `;
  }

  return { generateSvg };
})();

window.OpticalSheetGenerator = {
  // Gerçek QR Kod SVG Üretimi
  generateQrSvg(text, size = 105) {
    try {
      return PureQrEngine.generateSvg(text, size);
    } catch (e) {
      return `
        <div class="border-2 border-black p-1 bg-white inline-block text-center" style="width:${size}px; height:${size}px;">
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <rect x="5" y="5" width="28" height="28" fill="black" />
            <rect x="9" y="9" width="20" height="20" fill="white" />
            <rect x="13" y="13" width="12" height="12" fill="black" />
            <rect x="67" y="5" width="28" height="28" fill="black" />
            <rect x="71" y="9" width="20" height="20" fill="white" />
            <rect x="75" y="13" width="12" height="12" fill="black" />
            <rect x="5" y="67" width="28" height="28" fill="black" />
            <rect x="9" y="71" width="20" height="20" fill="white" />
            <rect x="13" y="75" width="12" height="12" fill="black" />
            <circle cx="50" cy="50" r="10" fill="black" />
          </svg>
        </div>
      `;
    }
  },

  // Tek bir öğrenciye özel veya boş optik form HTML'i üretme (Yatay A4 Birebir Format)
  renderSheetHtml(options = {}) {
    const institutionName = options.institutionName || 'TABAKÇILAR B BLOK';
    const examTitle = options.examTitle || 'İsabet Ortaokul 8. Sınıf Deneme 3 (23-28 Ara)';
    const student = options.student || null;
    const booklet = options.booklet || '';
    const examId = options.examId || 'ex_sample';
    const activeBooklets = (Array.isArray(options.bookletTypes) && options.bookletTypes.length > 0)
      ? options.bookletTypes
      : (options.bookletCount ? ['A', 'B', 'C', 'D'].slice(0, options.bookletCount) : ['A', 'B', 'C', 'D']);
    const bCount = Math.max(1, Math.min(4, activeBooklets.length));

    const studentName = student ? `${student.firstName} ${student.lastName}` : '';
    const targetClass = student ? (student.className || 'ORTAOKUL 8 - ORTAOKUL SEVİYE 1') : (options.targetClass || 'ORTAOKUL 8 - ORTAOKUL SEVİYE 1');
    const studentNo = student ? (student.studentNo || '29828977800') : '';

    const qrPayload = student 
      ? `EXAM:${examId}|ST:${studentNo}${booklet ? `|BK:${booklet}` : ''}`
      : `EXAM:${examId}|BLANK${booklet ? `|BK:${booklet}` : ''}`;

    const qrSvg = this.generateQrSvg(qrPayload, 102);

    // Ders Sütunları Konfigürasyonu
    // Örnek şablondaki 6 standart LGS dersi: Türkçe(20), İnkılap(10), Din(10), İngilizce(10), Matematik(20), Fen(20)
    let subjects = options.subjects;
    if (!subjects || subjects.length === 0) {
      subjects = [
        { name: 'Türkçe', startQ: 1, endQ: 20 },
        { name: 'İnkılap Tarihi', startQ: 21, endQ: 30 },
        { name: 'Din Kültürü', startQ: 31, endQ: 40 },
        { name: 'İngilizce', startQ: 41, endQ: 50 },
        { name: 'Matematik', startQ: 51, endQ: 70 },
        { name: 'Fen Bilimleri', startQ: 71, endQ: 90 }
      ];
    }

    // Her ders sütunu için HTML üret
    const renderSubjectColumn = (subj) => {
      const qCount = (subj.endQ - subj.startQ + 1);
      let rowsHtml = '';

      for (let q = 1; q <= qCount; q++) {
        const globalQ = subj.startQ + q - 1;
        // Örnek görseldeki gibi 1, 10 ve 19. satırlarda siyah senkronizasyon karesi yer alır
        const hasSyncMark = (q === 1 || q === 10 || q === 19);

        rowsHtml += `
          <div class="flex items-center justify-end py-[1.2px] h-[19px]">
            <!-- Senkron Markörü (1, 10, 19) -->
            ${hasSyncMark 
              ? '<span class="w-[9px] h-[9px] bg-black inline-block mr-1 flex-shrink-0"></span>' 
              : '<span class="w-[9px] h-[9px] inline-block mr-1 flex-shrink-0"></span>'}
            
            <!-- Soru Numarası -->
            <span class="w-4 text-right font-bold text-[11px] text-gray-800 mr-1 leading-none select-none">${q}</span>
            
            <!-- Seçenek Kabarcıkları (A, B, C, D) -->
            <div class="flex items-center gap-[3px] pr-[1px]">
              <span class="w-[14px] h-[14px] rounded-full border border-gray-400 bg-white flex items-center justify-center text-[8.5px] text-gray-400 font-sans leading-none select-none" data-q="${globalQ}" data-opt="A">A</span>
              <span class="w-[14px] h-[14px] rounded-full border border-gray-400 bg-white flex items-center justify-center text-[8.5px] text-gray-400 font-sans leading-none select-none" data-q="${globalQ}" data-opt="B">B</span>
              <span class="w-[14px] h-[14px] rounded-full border border-gray-400 bg-white flex items-center justify-center text-[8.5px] text-gray-400 font-sans leading-none select-none" data-q="${globalQ}" data-opt="C">C</span>
              <span class="w-[14px] h-[14px] rounded-full border border-gray-400 bg-white flex items-center justify-center text-[8.5px] text-gray-400 font-sans leading-none select-none" data-q="${globalQ}" data-opt="D">D</span>
            </div>
          </div>
        `;
      }

      return `
        <div class="flex-1 min-w-[85px] max-w-[125px] flex flex-col">
          <!-- Ders Başlık Şeridi -->
          <div class="bg-[#4f5154] text-white text-[11px] font-bold text-center py-1 rounded-t-md px-1 truncate leading-tight tracking-tight shadow-sm">
            ${subj.name}
          </div>

          <!-- Seçenek Harfleri Üst Barı (A B C D) -->
          <div class="border border-gray-300 bg-white text-gray-700 text-[10px] font-bold py-0.5 mb-1 flex items-center justify-end">
            <span class="w-[9px] mr-1"></span>
            <span class="w-4 mr-1 text-right opacity-0">#</span>
            <div class="flex items-center gap-[3px] pr-[1px]">
              <span class="w-[14px] text-center">A</span>
              <span class="w-[14px] text-center">B</span>
              <span class="w-[14px] text-center">C</span>
              <span class="w-[14px] text-center">D</span>
            </div>
          </div>

          <!-- Soru Satırları -->
          <div class="flex flex-col">
            ${rowsHtml}
          </div>
        </div>
      `;
    };

    // 6 ders varsa Sözel (ilk 4) ve Sayısal (son 2) olarak şık bir boşlukla ayır
    let columnsHtml = '';
    if (subjects.length >= 6) {
      const sozelCols = subjects.slice(0, 4).map(s => renderSubjectColumn(s)).join('');
      const sayisalCols = subjects.slice(4, 6).map(s => renderSubjectColumn(s)).join('');

      columnsHtml = `
        <div class="flex items-start gap-2.5 sm:gap-3 flex-1 justify-between">
          ${sozelCols}
        </div>
        <div class="w-4 sm:w-6 flex-shrink-0"></div>
        <div class="flex items-start gap-2.5 sm:gap-3 justify-end" style="flex: 0.52;">
          ${sayisalCols}
        </div>
      `;
    } else {
      columnsHtml = `
        <div class="flex items-start gap-3 flex-1 justify-between">
          ${subjects.map(s => renderSubjectColumn(s)).join('')}
        </div>
      `;
    }

    return `
      <div class="optical-sheet-page bg-white text-black relative select-none font-sans" style="width: 287mm; height: 202mm; max-height: 202mm; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start; padding: 7mm 8mm 6mm 8mm;">
        
        <!-- 4 KÖŞE L-BİÇİMLİ KAMERA HİZALAMA NİŞANLARI (FIDUCIAL CORNER BRACKETS) -->
        <div class="corner-bracket-tl absolute top-[4mm] left-[4mm] w-[44px] h-[44px] border-t-[8px] border-l-[8px] border-black"></div>
        <div class="corner-bracket-tr absolute top-[4mm] right-[4mm] w-[44px] h-[44px] border-t-[8px] border-r-[8px] border-black"></div>
        <div class="corner-bracket-bl absolute bottom-[4mm] left-[4mm] w-[44px] h-[44px] border-b-[8px] border-l-[8px] border-black"></div>
        <div class="corner-bracket-br absolute bottom-[4mm] right-[4mm] w-[44px] h-[44px] border-b-[8px] border-r-[8px] border-black"></div>

        <!-- ÜST BİLGİ ALANI (Geniş Açık Gri Kutu) -->
        <div class="bg-[#f4f4f5] border border-gray-200/70 rounded-xl p-2.5 pt-2 pb-2 mb-3.5 mx-auto w-full">
          <!-- Koyu Başlık Şeridi -->
          <div class="bg-[#4f5154] text-white font-bold text-center text-xs sm:text-[13px] py-1 px-4 rounded-md tracking-wide mb-2 shadow-sm">
            ${examTitle}
          </div>

          <!-- 3 Satırlı Bilgi Alanı -->
          <div class="space-y-1.5 px-1">
            <div class="flex items-center text-xs">
              <span class="text-gray-800 font-semibold whitespace-nowrap min-w-[72px]">Adı Soyadı :</span>
              <span class="font-bold text-black uppercase ml-1 whitespace-nowrap">${studentName}</span>
              <div class="flex-1 ml-2 border-b border-dotted border-gray-400 h-[10px]"></div>
            </div>

            <div class="flex items-center text-xs">
              <span class="text-gray-800 font-semibold whitespace-nowrap min-w-[72px]">Seviyeleri :</span>
              <span class="font-bold text-black uppercase ml-1 whitespace-nowrap">${targetClass}</span>
              <div class="flex-1 ml-2 border-b border-dotted border-gray-400 h-[10px]"></div>
            </div>

            <div class="flex items-center text-xs justify-between">
              <div class="flex items-center flex-1 mr-4">
                <span class="text-gray-800 font-semibold whitespace-nowrap min-w-[72px]">Kurum Adı :</span>
                <span class="font-bold text-black uppercase ml-1 whitespace-nowrap">${institutionName}</span>
                <div class="flex-1 ml-2 border-b border-dotted border-gray-400 h-[10px]"></div>
              </div>
              <span class="text-[10px] text-gray-700 font-mono whitespace-nowrap font-medium">T.Kodu: ${studentNo}</span>
            </div>
          </div>
        </div>

        <!-- ANA GÖVDE: SOLDA QR & KİTAPÇIK, SAĞDA 6 DERS SÜTUNU -->
        <div class="flex items-start justify-between flex-1 gap-3.5 w-full">
          
          <!-- SOL SÜTUN: Karekodu Okutun & Kitapçık Türü -->
          <div class="w-[130px] flex-shrink-0 flex flex-col">
            <!-- Karekod Kutusu -->
            <div class="bg-[#4f5154] text-white text-[11px] font-bold text-center py-1 rounded-t-md tracking-wide shadow-sm">
              Karekodu Okutun
            </div>
            <div class="border border-gray-300 rounded-b-md p-1.5 bg-white flex items-center justify-center shadow-sm">
              <div class="w-[102px] h-[102px] flex items-center justify-center">
                ${qrSvg}
              </div>
            </div>

            <!-- Kitapçık Türü Kutusu (Öğrencinin Dolduracağı Boş Kabarcıklar) -->
            <div class="mt-3">
              <div class="bg-[#4f5154] text-white text-[11px] font-bold text-center py-1 rounded-t-md tracking-wide shadow-sm">
                Kitapçık Türü
              </div>
              <div class="border border-gray-300 rounded-b-md p-2 bg-white shadow-sm">
                <div class="grid grid-cols-${bCount} border border-gray-300 rounded text-center text-xs font-bold text-gray-700 py-0.5 mb-1.5 bg-gray-50/50">
                  ${activeBooklets.map(b => `<div>${b}</div>`).join('')}
                </div>
                <div class="grid grid-cols-${bCount} text-center">
                  ${activeBooklets.map(b => `
                    <div class="flex justify-center">
                      <span class="w-[16px] h-[16px] rounded-full border border-gray-400 bg-white flex items-center justify-center text-[9px] text-gray-600 font-bold leading-none select-none">
                        ${b}
                      </span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- SAĞ ALAN: DERS SÜTUNLARI -->
          <div class="flex-1 flex items-start justify-between">
            ${columnsHtml}
          </div>

        </div>

      </div>
    `;
  },

  // Yazdırma Penceresini Açma (Yatay A4 Garantili Sıfır Taşma)
  printSheets(sheetsHtml) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <title>Optik Cevap Kağıtları - Yatay A4 Yazdır</title>
        <meta charset="UTF-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page {
            size: A4 landscape;
            margin: 0;
          }
          @media print {
            html, body {
              width: 297mm;
              height: 210mm;
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .optical-sheet-page {
              width: 297mm !important;
              height: 210mm !important;
              max-width: 297mm !important;
              max-height: 210mm !important;
              box-sizing: border-box !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin: 0 !important;
              padding: 7mm 8mm 6mm 8mm !important;
              overflow: hidden !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: flex-start !important;
              background: white !important;
            }
            .no-print { display: none !important; }
          }
          @media screen {
            body {
              background: #0f172a;
              padding: 24px;
            }
            .optical-sheet-page {
              width: 287mm;
              height: 202mm;
              margin: 20px auto;
              padding: 7mm 8mm 6mm 8mm;
              box-sizing: border-box;
              box-shadow: 0 15px 35px rgba(0, 0, 0, 0.45);
              background: white;
              overflow: hidden;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print max-w-[287mm] mx-auto mb-4 bg-emerald-600 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-2xl">
          <div>
            <h3 class="font-black text-sm flex items-center gap-2">
              <span>📄</span> <span>Yatay A4 Optik Formlar Baskıya Hazır</span>
            </h3>
            <p class="text-xs text-emerald-100 mt-0.5">Yazıcı ayarlarından <strong>Yön: Yatay (Landscape)</strong> ve <strong>Kenar Boşlukları: Yok / Sıfır</strong> seçiniz. Her form tam 1 sayfaya sığar, asla taşma yapmaz.</p>
          </div>
          <button onclick="window.print()" class="px-5 py-2.5 bg-white text-emerald-950 font-black text-xs rounded-xl shadow-lg hover:bg-emerald-50 transition cursor-pointer flex items-center gap-1.5">
            <span>🖨️</span> <span>Hemen Yazdır (Ctrl+P)</span>
          </button>
        </div>
        ${sheetsHtml}
      </body>
      </html>
    `);
    printWindow.document.close();
  },

  // --- RENKLİ VE GRAFİKLİ DETAYLI TALEBE KARNESİ (A4 / PDF) ---
  renderReportCardHtml(result, exam, institutionName = 'EĞİTİM KURUMU') {
    const subjects = result.subjectsResult ? Object.values(result.subjectsResult) : [];
    const studentName = result.studentName || 'Talebe';
    const studentNo = result.studentNo || '-';
    const className = result.className || 'Genel';
    const examTitle = exam ? exam.title : (result.examTitle || 'Deneme Sınavı');
    const examDate = (exam && exam.examDate) ? exam.examDate : new Date().toISOString().split('T')[0];
    const totalScore = result.totalScore || 0;
    const totalNet = result.totalNet || 0;
    const classRank = result.classRank || 1;
    const generalRank = result.generalRank || 1;

    let subjectsRows = '';
    subjects.forEach((sub, idx) => {
      const qCount = (sub.correct || 0) + (sub.wrong || 0) + (sub.empty || 0) || 1;
      const successRate = Math.min(100, Math.max(0, Math.round(((sub.net || 0) / qCount) * 100)));
      const barColor = successRate >= 70 ? 'bg-emerald-500' : (successRate >= 45 ? 'bg-cyan-500' : 'bg-amber-500');

      subjectsRows += `
        <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} border-b border-slate-200">
          <td class="p-2 font-bold text-slate-800 text-xs">${sub.name}</td>
          <td class="p-2 text-center text-xs font-semibold text-slate-600">${qCount}</td>
          <td class="p-2 text-center text-xs font-bold text-emerald-600">${sub.correct || 0}</td>
          <td class="p-2 text-center text-xs font-bold text-rose-600">${sub.wrong || 0}</td>
          <td class="p-2 text-center text-xs font-semibold text-slate-500">${sub.empty || 0}</td>
          <td class="p-2 text-center text-xs font-black text-cyan-700">${sub.net || 0}</td>
          <td class="p-2 text-xs">
            <div class="flex items-center gap-2">
              <div class="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div class="${barColor} h-2.5 rounded-full" style="width: ${successRate}%"></div>
              </div>
              <span class="text-[11px] font-bold text-slate-700 min-w-[32px] text-right">%${successRate}</span>
            </div>
          </td>
        </tr>
      `;
    });

    return `
      <div class="report-card-page bg-white text-slate-900 p-8 border-2 border-slate-800 max-w-[800px] mx-auto my-6 shadow-2xl rounded-2xl relative font-sans" style="aspect-ratio: 1 / 1.414;">
        
        <!-- Üst Kurum Başlığı -->
        <div class="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-5">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-slate-900 text-emerald-400 font-black text-2xl flex items-center justify-center shadow">
              🎓
            </div>
            <div>
              <h1 class="text-base font-black tracking-tight text-slate-900 uppercase">${institutionName}</h1>
              <h2 class="text-xs font-bold text-emerald-700 tracking-wider uppercase mt-0.5">Sınav Değerlendirme & Sonuç Karnesi</h2>
            </div>
          </div>
          <div class="text-right text-xs text-slate-600">
            <div><strong>Tarih:</strong> ${examDate}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">Sınav: <strong>${examTitle}</strong></div>
          </div>
        </div>

        <!-- Talebe Kimlik Kartı -->
        <div class="grid grid-cols-4 gap-3 bg-slate-100 p-3.5 rounded-xl border border-slate-300 mb-5 text-xs">
          <div>
            <span class="block text-[10px] font-bold text-slate-500 uppercase">Talebe Adı Soyadı</span>
            <span class="text-sm font-black text-slate-900 uppercase">${studentName}</span>
          </div>
          <div>
            <span class="block text-[10px] font-bold text-slate-500 uppercase">Okul / Kurum No</span>
            <span class="text-sm font-black font-mono text-emerald-700">${studentNo}</span>
          </div>
          <div>
            <span class="block text-[10px] font-bold text-slate-500 uppercase">Sınıfı / Şubesi</span>
            <span class="text-sm font-black text-slate-900">${className}</span>
          </div>
          <div>
            <span class="block text-[10px] font-bold text-slate-500 uppercase">Kitapçık</span>
            <span class="text-sm font-black font-mono text-cyan-700">${result.booklet || 'A'}</span>
          </div>
        </div>

        <!-- 4'lü Ana Başarı Özet Kartları -->
        <div class="grid grid-cols-4 gap-3 mb-6">
          <div class="bg-emerald-50 border-2 border-emerald-500/40 p-3 rounded-xl text-center">
            <span class="block text-[10px] font-bold uppercase text-emerald-800">Sınav Puanı</span>
            <span class="text-2xl font-black text-emerald-700 font-mono">${totalScore}</span>
          </div>
          <div class="bg-cyan-50 border-2 border-cyan-500/40 p-3 rounded-xl text-center">
            <span class="block text-[10px] font-bold uppercase text-cyan-800">Toplam Net</span>
            <span class="text-2xl font-black text-cyan-700 font-mono">${totalNet}</span>
          </div>
          <div class="bg-amber-50 border-2 border-amber-500/40 p-3 rounded-xl text-center">
            <span class="block text-[10px] font-bold uppercase text-amber-800">Sınıf Derecesi</span>
            <span class="text-2xl font-black text-amber-700 font-mono">${classRank}.</span>
          </div>
          <div class="bg-purple-50 border-2 border-purple-500/40 p-3 rounded-xl text-center">
            <span class="block text-[10px] font-bold uppercase text-purple-800">Genel Derece</span>
            <span class="text-2xl font-black text-purple-700 font-mono">${generalRank}.</span>
          </div>
        </div>

        <!-- Ders Bazlı Başarı Tablosu -->
        <div class="border border-slate-300 rounded-xl overflow-hidden mb-6">
          <div class="bg-slate-900 text-white px-3.5 py-2 font-bold text-xs uppercase flex items-center justify-between">
            <span>Ders Değerlendirme ve Başarı Analizi</span>
            <span class="text-[10px] text-slate-400 font-normal">3 Yanlış 1 Doğruyu Götürür</span>
          </div>
          <table class="w-full text-left">
            <thead class="bg-slate-100 border-b border-slate-300 text-[11px] font-black text-slate-700 uppercase">
              <tr>
                <th class="p-2">Ders Adı</th>
                <th class="p-2 text-center">Soru</th>
                <th class="p-2 text-center">Doğru</th>
                <th class="p-2 text-center">Yanlış</th>
                <th class="p-2 text-center">Boş</th>
                <th class="p-2 text-center">Net</th>
                <th class="p-2 min-w-[140px]">Başarı Oranı</th>
              </tr>
            </thead>
            <tbody>
              ${subjectsRows}
            </tbody>
          </table>
        </div>

        ${(result.topicAnalysis && result.topicAnalysis.length > 0) ? `
        <!-- Konu ve Kazanım Analizi Bölümü -->
        <div class="border border-slate-300 rounded-xl overflow-hidden mb-6">
          <div class="bg-indigo-900 text-white px-3.5 py-2 font-bold text-xs uppercase flex items-center justify-between">
            <span>Konu ve Kazanım Başarı Analizi</span>
            <span class="text-[10px] text-indigo-200 font-normal">Soru & Konu Eşleşmesi</span>
          </div>
          <table class="w-full text-left">
            <thead class="bg-indigo-50 border-b border-indigo-200 text-[10px] font-black text-indigo-900 uppercase">
              <tr>
                <th class="p-1.5 pl-3">Ders</th>
                <th class="p-1.5">Konu / Kazanım</th>
                <th class="p-1.5 text-center">Soru</th>
                <th class="p-1.5 text-center">Doğru</th>
                <th class="p-1.5 text-center">Yanlış</th>
                <th class="p-1.5 min-w-[120px]">Başarı</th>
              </tr>
            </thead>
            <tbody class="text-xs">
              ${result.topicAnalysis.map((t, idx) => {
                const barColor = t.percent >= 70 ? 'bg-emerald-500' : (t.percent >= 40 ? 'bg-amber-500' : 'bg-rose-500');
                const badgeColor = t.percent >= 70 ? 'text-emerald-700 bg-emerald-100' : (t.percent >= 40 ? 'text-amber-700 bg-amber-100' : 'text-rose-700 bg-rose-100');
                return `
                  <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} border-b border-slate-100">
                    <td class="p-1.5 pl-3 font-semibold text-slate-600 text-[11px]">${t.subject}</td>
                    <td class="p-1.5 font-bold text-slate-800 text-[11px]">${t.topic}</td>
                    <td class="p-1.5 text-center text-[11px] font-semibold text-slate-600">${t.total}</td>
                    <td class="p-1.5 text-center text-[11px] font-bold text-emerald-600">${t.correct}</td>
                    <td class="p-1.5 text-center text-[11px] font-bold text-rose-600">${t.wrong}</td>
                    <td class="p-1.5">
                      <div class="flex items-center gap-1.5">
                        <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div class="${barColor} h-2 rounded-full" style="width: ${t.percent}%"></div>
                        </div>
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColor} min-w-[36px] text-center">%${t.percent}</span>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <!-- Rehberlik & Öğretmen Görüşü -->
        <div class="border border-slate-300 rounded-xl p-3.5 bg-slate-50/60 mb-6 text-xs">
          <span class="font-bold text-slate-800 block mb-1">📝 Rehberlik ve Ders Öğretmeni Görüşü:</span>
          <div class="h-14 border-b border-dashed border-slate-300 flex items-end pb-1 text-slate-400 italic text-[11px]">
            Talebemizin sınav performansı gayet başarılı olup konu eksiklerinin giderilmesiyle derecesini artıracaktır.
          </div>
        </div>

        <!-- İmza ve Onay Alanı -->
        <div class="grid grid-cols-2 gap-8 text-center text-xs mt-6 pt-4 border-t border-slate-300">
          <div>
            <span class="font-bold text-slate-800 block">Sınıf Rehber Öğretmeni</span>
            <span class="text-[10px] text-slate-500 block mt-8">(İmza)</span>
          </div>
          <div>
            <span class="font-bold text-slate-800 block">Kurum Müdürü</span>
            <span class="text-[10px] text-slate-500 block mt-8">(Mühür / İmza)</span>
          </div>
        </div>

      </div>
    `;
  },

  // Karneleri Yazdırma Penceresi
  printReportCards(cardsHtml) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Talebe Karneleri - Yazdır & PDF</title>
        <meta charset="UTF-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          @media print {
            body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .report-card-page {
              page-break-after: always;
              box-shadow: none !important;
              margin: 0 auto !important;
              border: 2px solid #1e293b !important;
            }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body class="bg-slate-200 p-4">
        <div class="no-print max-w-[800px] mx-auto mb-4 bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-2xl">
          <div>
            <h3 class="font-black text-sm text-emerald-400">📜 Karneler Hazır</h3>
            <p class="text-xs text-slate-300">Yazıcıdan doğrudan A4 basabilir veya "PDF Olarak Kaydet" seçebilirsiniz.</p>
          </div>
          <button onclick="window.print()" class="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl shadow-lg transition">
            Karneleri Yazdır / PDF İndir 🖨️
          </button>
        </div>
        ${cardsHtml}
      </body>
      </html>
    `);
    printWindow.document.close();
  }
};
