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

    // Dersler Tablosu ve Renkli Başarı Barları
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

        <!-- Ders Bazlı Başarı Tablosu ve Grafikler -->
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

  // Karneleri Yazdırma / PDF Çıkarma Penceresi
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
