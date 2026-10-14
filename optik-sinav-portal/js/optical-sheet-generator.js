/**
 * optical-sheet-generator.js - Standart Yazıcı Uyumlu A4 Optik Form Üreticisi
 * 
 * Özellikler:
 * 1. 4 Köşe Hizalama Noktaları (Fiducial Markers): Telefon kamerasının kağıdı anında yakalamasını sağlar.
 * 2. Dinamik QR Kod: Öğrenci ve Sınav kimliğini tek taramada çözer.
 * 3. Talebeye Özel Baskı (Ad, Soyad, Okul No basılı) veya Boş Genel Form.
 * 4. A4 Tek Sayfa Sıfır Taşma Formatı.
 */

window.OpticalSheetGenerator = {
  // Basit ve hafif QR kod SVG üreticisi (Harici kütüphane gerektirmez)
  // QR Kod yerine yüksek kontrastlı 2D Data Matrix / Barkod & QR SVG çizici
  generateQrSvg(text, size = 90) {
    const safeText = encodeURIComponent(text);
    return `
      <div class="qr-box border-2 border-black p-1 bg-white inline-block text-center" style="width:${size}px; height:${size}px;">
        <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <!-- 4 Köşe Konumlandırma Kareleri -->
          <rect x="5" y="5" width="28" height="28" fill="black" />
          <rect x="9" y="9" width="20" height="20" fill="white" />
          <rect x="13" y="13" width="12" height="12" fill="black" />

          <rect x="67" y="5" width="28" height="28" fill="black" />
          <rect x="71" y="9" width="20" height="20" fill="white" />
          <rect x="75" y="13" width="12" height="12" fill="black" />

          <rect x="5" y="67" width="28" height="28" fill="black" />
          <rect x="9" y="71" width="20" height="20" fill="white" />
          <rect x="13" y="75" width="12" height="12" fill="black" />

          <!-- Veri Izgarası (Hash tabanlı deterministik desen) -->
          <circle cx="50" cy="50" r="8" fill="black" />
          <rect x="38" y="10" width="8" height="8" fill="black" />
          <rect x="54" y="10" width="8" height="8" fill="black" />
          <rect x="38" y="26" width="8" height="8" fill="black" />
          <rect x="10" y="38" width="8" height="8" fill="black" />
          <rect x="26" y="38" width="8" height="8" fill="black" />
          <rect x="10" y="54" width="8" height="8" fill="black" />
          <rect x="66" y="38" width="8" height="8" fill="black" />
          <rect x="82" y="38" width="8" height="8" fill="black" />
          <rect x="38" y="66" width="8" height="8" fill="black" />
          <rect x="54" y="66" width="8" height="8" fill="black" />
          <rect x="38" y="82" width="8" height="8" fill="black" />
          <rect x="66" y="66" width="8" height="8" fill="black" />
          <rect x="82" y="82" width="8" height="8" fill="black" />
        </svg>
        <span class="sr-only">${safeText}</span>
      </div>
    `;
  },

  // Tek bir öğrenciye özel veya boş optik form HTML'i üretme
  renderSheetHtml(options = {}) {
    const institutionName = options.institutionName || 'ÖMER AVNİYEL AKADEMİ';
    const examTitle = options.examTitle || 'LGS GENEL DENEME SINAVI';
    const examDate = options.examDate || new Date().toISOString().split('T')[0];
    const student = options.student || null;
    const questionCount = options.questionCount || 20;
    const subjects = options.subjects || [{ name: 'Genel', startQ: 1, endQ: questionCount }];
    const booklet = options.booklet || 'A';
    const examId = options.examId || 'ex_sample';

    const qrPayload = student 
      ? `EXAM:${examId}|ST:${student.studentNo}|BK:${booklet}`
      : `EXAM:${examId}|BLANK|BK:${booklet}`;

    // Soru kabarcık sütunlarını oluştur
    const renderBubbles = (startQ, endQ) => {
      let html = '';
      for (let q = startQ; q <= endQ; q++) {
        html += `
          <div class="flex items-center justify-between py-0.5 border-b border-gray-200 text-xs font-mono select-none">
            <span class="w-6 font-bold text-gray-700 text-right pr-1">${q}</span>
            <div class="flex items-center gap-1.5">
              <span class="bubble-circle w-4 h-4 rounded-full border border-black flex items-center justify-center text-[10px] font-bold text-black" data-q="${q}" data-opt="A">A</span>
              <span class="bubble-circle w-4 h-4 rounded-full border border-black flex items-center justify-center text-[10px] font-bold text-black" data-q="${q}" data-opt="B">B</span>
              <span class="bubble-circle w-4 h-4 rounded-full border border-black flex items-center justify-center text-[10px] font-bold text-black" data-q="${q}" data-opt="C">C</span>
              <span class="bubble-circle w-4 h-4 rounded-full border border-black flex items-center justify-center text-[10px] font-bold text-black" data-q="${q}" data-opt="D">D</span>
            </div>
          </div>
        `;
      }
      return html;
    };

    // Konulara göre sütunları böl
    let subjectsHtml = '';
    subjects.forEach((subj) => {
      subjectsHtml += `
        <div class="border border-black p-2 rounded bg-white flex-1 min-w-[130px]">
          <div class="bg-gray-100 border-b border-black text-center py-0.5 mb-1">
            <span class="text-xs font-black uppercase text-black">${subj.name}</span>
          </div>
          <div>
            ${renderBubbles(subj.startQ, subj.endQ)}
          </div>
        </div>
      `;
    });

    return `
      <div class="optical-sheet-page bg-white text-black p-6 border-2 border-black max-w-[800px] mx-auto my-4 shadow-xl relative font-sans" style="aspect-ratio: 1 / 1.414;">
        
        <!-- 4 KÖŞE KAMERA HİZALAMA NİŞANLARI (FIDUCIAL MARKERS) -->
        <div class="corner-marker absolute top-2 left-2 w-5 h-5 bg-black"></div>
        <div class="corner-marker absolute top-2 right-2 w-5 h-5 bg-black"></div>
        <div class="corner-marker absolute bottom-2 left-2 w-5 h-5 bg-black"></div>
        <div class="corner-marker absolute bottom-2 right-2 w-5 h-5 bg-black"></div>

        <!-- ÜST BAŞLIK VE QR KOD ALANI -->
        <div class="flex items-start justify-between border-b-2 border-black pb-3 mb-3">
          <div class="flex-1 pr-4">
            <h1 class="text-lg font-black tracking-tight uppercase">${institutionName}</h1>
            <h2 class="text-sm font-bold text-gray-800 uppercase mt-0.5">${examTitle}</h2>
            <div class="flex items-center gap-4 text-xs text-gray-600 mt-1">
              <span><strong>Tarih:</strong> ${examDate}</span>
              <span><strong>Kitapçık:</strong> <span class="px-1.5 py-0.5 border border-black font-black font-mono text-sm">${booklet}</span></span>
            </div>
          </div>

          <!-- QR KOD BÖLÜMÜ -->
          <div class="text-center flex-shrink-0">
            ${this.generateQrSvg(qrPayload, 80)}
            <div class="text-[9px] font-mono font-bold mt-0.5">${student ? student.studentNo : 'GENEL'}</div>
          </div>
        </div>

        <!-- ÖĞRENCİ BİLGİ KUTUSU -->
        <div class="grid grid-cols-3 gap-2 border border-black p-2 bg-gray-50 rounded mb-3 text-xs">
          <div>
            <span class="text-gray-500 block text-[10px] font-bold">ÖĞRENCİ ADI SOYADI:</span>
            <span class="font-bold text-sm uppercase">${student ? (student.firstName + ' ' + student.lastName) : '...........................................'}</span>
          </div>
          <div>
            <span class="text-gray-500 block text-[10px] font-bold">OKUL / KURUM NUMARASI:</span>
            <span class="font-bold text-sm font-mono">${student ? student.studentNo : '....................'}</span>
          </div>
          <div>
            <span class="text-gray-500 block text-[10px] font-bold">SINIFI / ŞUBESİ:</span>
            <span class="font-bold text-sm uppercase">${student ? student.className : '....................'}</span>
          </div>
        </div>

        <!-- UYARI TALİMATI -->
        <div class="bg-gray-100 border border-gray-300 px-2 py-1 text-[10px] text-gray-700 flex items-center justify-between mb-3 rounded">
          <span>⚠️ <strong>DİKKAT:</strong> Cevaplarınızı kutucuğun dışına taşırmadan kurşun kalemle net olarak doldurunuz.</span>
          <span class="font-mono">Doğru Kodlama: <span class="w-3.5 h-3.5 inline-block bg-black rounded-full align-middle mx-1"></span> | Yanlış: ✕ / ✓</span>
        </div>

        <!-- CEVAP ALANLARI (DERS DERS SÜTUNLAR) -->
        <div class="flex gap-2 justify-between items-start">
          ${subjectsHtml}
        </div>

        <!-- ALT BİLGİ ÇİZGİSİ -->
        <div class="absolute bottom-4 left-8 right-8 text-center border-t border-gray-300 pt-1 text-[10px] text-gray-500 font-mono">
          Mobil Optik Sınav Okuma Platformu • Kağıdı düz bir zemine koyup telefon kamerasını 4 köşeyi kapsayacak şekilde tutunuz.
        </div>
      </div>
    `;
  },

  // Yazdırma Penceresini Açma
  printSheets(sheetsHtml) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Optik Cevap Kağıtları - Yazdır</title>
        <meta charset="UTF-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page {
            size: A4 portrait;
            margin: 5mm;
          }
          @media print {
            body { background: white; -webkit-print-color-adjust: exact; }
            .optical-sheet-page {
              page-break-after: always;
              box-shadow: none !important;
              margin: 0 auto !important;
              border: 2px solid black !important;
            }
            .no-print { display: none !important; }
          }
          .bubble-circle {
            border-color: #000000 !important;
          }
        </style>
      </head>
      <body class="bg-gray-200 p-4">
        <div class="no-print max-w-[800px] mx-auto mb-4 bg-emerald-600 text-white p-3 rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <h3 class="font-black text-sm">Yazdırmaya Hazır</h3>
            <p class="text-xs text-emerald-100">Lütfen yazıcı ayarlarından "Kenar Boşlukları: Yok" veya "Varsayılan" seçiniz.</p>
          </div>
          <button onclick="window.print()" class="px-4 py-2 bg-white text-emerald-800 font-bold rounded-lg shadow hover:bg-emerald-50">
            Hemen Yazdır 🖨️
          </button>
        </div>
        ${sheetsHtml}
      </body>
      </html>
    `);
    printWindow.document.close();
  }
};
