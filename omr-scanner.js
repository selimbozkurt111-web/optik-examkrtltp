/**
 * omr-scanner.js - Telefondan Canlı Kamera ile Optik Cevap Kağıdı Okuma Motoru
 * 
 * Gelişmiş Özellikler:
 * 1. Seri Otomatik Okuma Modu (Hands-free Continuous Scan): Butona basmadan ardı ardına kağıt okuma.
 * 2. Akıllı Kağıt Geçiş Dedektörü: Aynı kağıdın mükerrer okunmasını engelleyen bekleme süresi (debounce).
 * 3. Cevap Anahtarı Okuma: İşaretlenmiş optik formu kameraya tutarak cevap anahtarını otomatik çıkarma.
 * 4. Çift Tonlu Web Audio Bip Sesi ve Işık / Flaş desteği.
 */

window.OmrScanner = {
  videoStream: null,
  activeExam: null,
  activeInstitutionId: null,
  isScanning: false,
  audioCtx: null,

  // Seri Okuma Durumu
  isContinuousActive: false,
  continuousTimer: null,
  lastScannedKey: null,
  lastScannedTime: 0,
  sessionScanCount: 0,

  // Başarı ses efekti (Bip sesi)
  playBeep(success = true) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (success) {
        osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5
        osc.frequency.setValueAtTime(1320, this.audioCtx.currentTime + 0.08); // E6
        gain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.25);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.25);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.3);
      }
    } catch (e) {}
  },

  // Kamerayı Başlat (Gelişmiş Mobil & iOS Safari Uyumlu)
  async startCamera(videoElementId, exam, instId) {
    this.activeExam = exam;
    this.activeInstitutionId = instId;
    const video = document.getElementById(videoElementId);
    if (!video) return { success: false, message: 'Video elementi bulunamadı.' };

    // iOS Safari ve modern mobil tarayıcılar için zorunlu video özellikleri
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');

    // Eski akış varsa kapat
    if (this.videoStream) {
      try {
        this.videoStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      this.videoStream = null;
    }

    // MediaDevices kontrolü
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
      if (!legacyGetUserMedia) {
        return {
          success: false,
          message: 'Tarayıcınız kamera API desteği vermiyor veya sayfa güvenli HTTPS bağlantısında açılmadı.'
        };
      }
    }

    // Mobil arka kamera ve genel kamera denemeleri (OverconstrainedError önleyici)
    const constraintAttempts = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false }
    ];

    let stream = null;
    let lastError = null;

    for (const constraints of constraintAttempts) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } else {
          stream = await new Promise((resolve, reject) => {
            const legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
            legacyGetUserMedia.call(navigator, constraints, resolve, reject);
          });
        }
        if (stream) break;
      } catch (err) {
        lastError = err;
        console.warn('Kamera kısıtlaması deneniyor:', constraints, err);
      }
    }

    if (!stream) {
      const errName = lastError ? lastError.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        return {
          success: false,
          message: 'Kamera izni verilmedi. Lütfen tarayıcınızın kilit / ayarlar simgesine dokunup kamera iznini "İzin Ver" olarak değiştiriniz.'
        };
      }
      return {
        success: false,
        message: 'Kamera açılamadı. Lütfen kamera iznini onaylayınız veya sayfayı Chrome / Safari ile açınız.'
      };
    }

    this.videoStream = stream;
    video.srcObject = stream;

    // Mobil video oynatımı hazır olana dek bekle
    try {
      await new Promise((resolve) => {
        if (video.readyState >= 2) {
          resolve();
        } else {
          video.onloadedmetadata = () => resolve();
          setTimeout(resolve, 800);
        }
      });
      await video.play();
    } catch (playErr) {
      console.warn('Otomatik video oynatma uyarısı:', playErr);
    }

    this.isScanning = true;
    return { success: true };
  },

  // Kamerayı Durdur
  stopCamera() {
    this.stopContinuousScanning();
    this.isScanning = false;
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
  },

  // --- 1. GERÇEK GÖRÜNTÜ OMR ANALİZ MOTORU ---
  scanCurrentFrame(videoElement, canvasElement, studentNoOverride = null, booklet = 'A') {
    if (!this.activeExam || !videoElement) return null;
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) return null;

    const exam = this.activeExam;
    const qCount = exam.questionCount || 20;

    const w = videoElement.videoWidth;
    const h = videoElement.videoHeight;
    canvasElement.width = w;
    canvasElement.height = h;

    const ctx = canvasElement.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoElement, 0, 0, w, h);

    // QR Kod Okuma (jsQR kütüphanesi yüklüyse kağıt üzerindeki bilgileri çöz)
    let detectedStudentNo = studentNoOverride;
    let detectedBooklet = booklet || 'A';

    if (typeof jsQR !== 'undefined') {
      try {
        const fullImg = ctx.getImageData(0, 0, w, h);
        const qrCode = jsQR(fullImg.data, w, h, { inversionAttempts: 'dontInvert' });
        if (qrCode && qrCode.data) {
          const parts = qrCode.data.split('|');
          parts.forEach(p => {
            if (p.startsWith('ST:')) detectedStudentNo = p.substring(3).trim();
            if (p.startsWith('BK:')) detectedBooklet = p.substring(3).trim();
            if (p === 'BLANK' && !studentNoOverride) detectedStudentNo = null;
          });
        }
      } catch (e) {
        console.warn('QR okuma uyarısı:', e);
      }
    }

    // Görüntü piksellerini al
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 1. Çerçeve içi ortam ışığı ve beyaz kağıt varlık kontrolü
    const guideX1 = Math.round(w * 0.12);
    const guideX2 = Math.round(w * 0.88);
    const guideY1 = Math.round(h * 0.12);
    const guideY2 = Math.round(h * 0.88);
    const sheetW = guideX2 - guideX1;
    const sheetH = guideY2 - guideY1;

    let lumaSum = 0;
    let lumaSamples = 0;
    const stepX = Math.max(1, Math.floor(sheetW / 25));
    const stepY = Math.max(1, Math.floor(sheetH / 25));

    for (let py = guideY1; py < guideY2; py += stepY) {
      for (let px = guideX1; px < guideX2; px += stepX) {
        const idx = (py * w + px) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        lumaSum += luma;
        lumaSamples++;
      }
    }

    const avgLuma = lumaSamples > 0 ? (lumaSum / lumaSamples) : 0;
    if (avgLuma < 65) {
      // Ortam karanlık veya optik form çerçevede değil
      return null;
    }

    // Belirli bir koordinattaki ortalama karartmayı (Darkness: 255 - luma) ölçen fonksiyon
    const sampleDarkness = (cx, cy, r = 4) => {
      let darkTotal = 0;
      let count = 0;
      const rSq = r * r;
      for (let dy = -r; dy <= r; dy += 2) {
        for (let dx = -r; dx <= r; dx += 2) {
          if (dx * dx + dy * dy <= rSq) {
            const px = Math.round(cx + dx);
            const py = Math.round(cy + dy);
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const i = (py * w + px) * 4;
              const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              darkTotal += (255 - luma);
              count++;
            }
          }
        }
      }
      return count > 0 ? (darkTotal / count) : 0;
    };

    // 2. Optik Form Sütun ve Kabarcık Geometrisi
    const subjects = (exam.subjects && exam.subjects.length > 0) ? exam.subjects : [
      { name: 'Genel', startQ: 1, endQ: qCount }
    ];

    const colsCount = Math.max(1, subjects.length);
    const colWidth = (sheetW * 0.74) / colsCount;
    const startXOffset = guideX1 + (sheetW * 0.22);
    const startYOffset = guideY1 + (sheetH * 0.27);
    const availableH = sheetH * 0.65;

    const detectedAnswers = new Array(qCount).fill('');
    let markedCount = 0;

    // Gerçek işaretleme eşiği:
    // Kalemle doldurulmuş bir kabarcık, etrafındaki boş beyaz kağıttan en az 30 birim daha koyu olmalıdır
    const MARK_THRESHOLD = 30;

    subjects.forEach((subj, sIdx) => {
      const colX = startXOffset + (sIdx * colWidth);
      const subjQCount = (subj.endQ - subj.startQ + 1);
      const maxRows = Math.max(20, subjQCount);
      const rowHeight = availableH / maxRows;

      for (let qNum = subj.startQ; qNum <= subj.endQ; qNum++) {
        if (qNum > qCount) continue;
        const qIdx = qNum - 1;
        const rowIdx = (qNum - subj.startQ);
        const rowY = startYOffset + (rowIdx * rowHeight) + (rowHeight * 0.5);

        // Satır yanındaki boş beyaz kağıt referans koyuluğu
        const paperRef = sampleDarkness(colX + (colWidth * 0.08), rowY, 3);

        // A, B, C, D seçeneklerinin yatay pozisyonları
        const optStartX = colX + (colWidth * 0.40);
        const optEndX = colX + (colWidth * 0.96);
        const optStep = (optEndX - optStartX) / 4;

        const scores = [];
        const options = ['A', 'B', 'C', 'D'];

        for (let oIdx = 0; oIdx < 4; oIdx++) {
          const optX = optStartX + (oIdx * optStep) + (optStep * 0.5);
          const bubbleDarkness = sampleDarkness(optX, rowY, 4);
          const fillScore = bubbleDarkness - paperRef;
          scores.push({ opt: options[oIdx], fillScore });
        }

        // Karartma derecesine göre azalan sırala
        scores.sort((a, b) => b.fillScore - a.fillScore);
        const top = scores[0];
        const runnerUp = scores[1];

        // Eşik kontrolü: Eğer boş kağıtsa fillScore eşiği aşamaz
        if (top.fillScore >= MARK_THRESHOLD && (top.fillScore - runnerUp.fillScore) >= 12) {
          detectedAnswers[qIdx] = top.opt;
          markedCount++;
        } else {
          detectedAnswers[qIdx] = ''; // Boş bırakılmış soru
        }
      }
    });

    const isBlank = (markedCount === 0);
    const answersString = detectedAnswers.join('');
    this.playBeep(!isBlank);

    const finalStudentNo = detectedStudentNo || (studentNoOverride ? studentNoOverride : (isBlank ? 'Boş' : '101'));

    // EĞER KAĞIT BOŞ İSE: Kesinlikle 0 Doğru, 0 Yanlış, qCount Boş ve 0 Net dön
    if (isBlank) {
      return {
        examId: exam.id,
        examTitle: exam.title,
        studentNo: finalStudentNo,
        booklet: detectedBooklet,
        answers: answersString,
        subjectsResult: {},
        totalCorrect: 0,
        totalWrong: 0,
        totalEmpty: qCount,
        totalNet: 0,
        totalScore: 0,
        markedCount: 0,
        isBlank: true,
        scannedAt: new Date().toISOString()
      };
    }

    // İşaretleme varsa puan ve net hesapla
    if (window.PortalStore && typeof window.PortalStore.scoreStudentAnswers === 'function') {
      const scored = window.PortalStore.scoreStudentAnswers(answersString, exam, detectedBooklet);
      return {
        examId: exam.id,
        examTitle: exam.title,
        studentNo: finalStudentNo,
        booklet: detectedBooklet,
        answers: scored.answers,
        subjectsResult: scored.subjectsResult,
        totalCorrect: scored.totalCorrect,
        totalWrong: scored.totalWrong,
        totalEmpty: scored.totalEmpty,
        totalNet: scored.totalNet,
        totalScore: scored.totalScore,
        markedCount: markedCount,
        isBlank: false,
        scannedAt: new Date().toISOString()
      };
    }

    // Yedek hesaplama
    const rawKey = (exam.answerKeys && exam.answerKeys[detectedBooklet]) 
      ? exam.answerKeys[detectedBooklet].toUpperCase().replace(/[^A-E]/g, '')
      : '';
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalEmpty = 0;
    for (let i = 0; i < detectedAnswers.length; i++) {
      const a = detectedAnswers[i];
      const k = rawKey[i] || 'A';
      if (!a) totalEmpty++;
      else if (a === k) totalCorrect++;
      else totalWrong++;
    }
    const totalNet = Math.max(0, parseFloat((totalCorrect - (totalWrong * 0.333)).toFixed(2)));
    const totalScore = parseFloat((totalNet * 5).toFixed(1));

    return {
      examId: exam.id,
      examTitle: exam.title,
      studentNo: finalStudentNo,
      booklet: detectedBooklet,
      answers: answersString,
      subjectsResult: {},
      totalCorrect,
      totalWrong,
      totalEmpty,
      totalNet,
      totalScore,
      markedCount: markedCount,
      isBlank: false,
      scannedAt: new Date().toISOString()
    };
  },

  // --- 2. SERİ OTOMATİK OKUMA MODU (Hands-Free Continuous Scanning) ---
  startContinuousScanning(videoElement, canvasElement, onResultCallback, onStatusUpdate) {
    if (this.isContinuousActive) return;
    this.isContinuousActive = true;
    this.sessionScanCount = 0;
    this.lastScannedKey = null;
    this.lastScannedTime = 0;

    if (onStatusUpdate) onStatusUpdate('⚡ Seri okuma devrede. Kağıtları sırayla kameraya tutunuz...');

    this.continuousTimer = setInterval(() => {
      if (!this.isContinuousActive || !this.isScanning) return;

      const now = Date.now();
      // Önceki okumadan sonra en az 1.8 saniye bekle
      if (now - this.lastScannedTime < 1800) {
        return;
      }

      // Kameradan kareyi tara
      const result = this.scanCurrentFrame(videoElement, canvasElement);
      if (result) {
        // Aynı kağıt ardı ardına 4 saniye içinde tekrar okunmasın
        if (this.lastScannedKey === result.studentNo && (now - this.lastScannedTime < 4000)) {
          if (onStatusUpdate) onStatusUpdate('⏳ Sıradaki kağıt bekleniyor...');
          return;
        }

        this.lastScannedKey = result.studentNo;
        this.lastScannedTime = now;
        this.sessionScanCount++;

        if (onStatusUpdate) {
          if (result.isBlank) {
            onStatusUpdate(`⚠️ Boş form okundu (İşaretleme yok) - Sıradaki kağıdı koyunuz...`);
          } else {
            onStatusUpdate(`✓ #${result.studentNo} başarıyla okundu! (${this.sessionScanCount}. Kağıt) - Sıradakini koyunuz...`);
          }
        }

        if (typeof onResultCallback === 'function') {
          onResultCallback(result);
        }
      }
    }, 1400);
  },

  stopContinuousScanning() {
    this.isContinuousActive = false;
    if (this.continuousTimer) {
      clearInterval(this.continuousTimer);
      this.continuousTimer = null;
    }
  },

  // --- 3. CEVAP ANAHTARINI KAMERAYLA OKUMA MOTORU ---
  scanAnswerKeyFromFrame(videoElement, canvasElement, questionCount = 20, booklet = 'A') {
    if (!videoElement || videoElement.videoWidth === 0) {
      return { success: false, message: 'Kamera görüntüsü alınamadı.' };
    }

    const res = this.scanCurrentFrame(videoElement, canvasElement, null, booklet);
    if (!res || res.isBlank || !res.answers || res.answers.replace(/\s/g, '').length === 0) {
      this.playBeep(false);
      return {
        success: false,
        message: 'Cevap anahtarı formunda işaretli soru tespit edilemedi. Lütfen optik formdaki doğru şıkları kurşun kalemle karalayıp tekrar deneyiniz.'
      };
    }

    this.playBeep(true);
    return {
      success: true,
      key: res.answers,
      questionCount,
      booklet,
      scannedAt: new Date().toISOString()
    };
  }
};
