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

    let exam = this.activeExam;
    const qCount = exam.questionCount || 20;

    const w = videoElement.videoWidth;
    const h = videoElement.videoHeight;
    canvasElement.width = w;
    canvasElement.height = h;

    const ctx = canvasElement.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoElement, 0, 0, w, h);

    // QR Kod Okuma (jsQR kütüphanesi yüklüyse çok aşamalı arama)
    let detectedStudentNo = studentNoOverride || null;
    let detectedBooklet = (booklet && booklet !== 'auto') ? booklet : null;
    let detectedExamId = null;
    let qrCorners = null;

    if (typeof jsQR !== 'undefined') {
      try {
        let qrCode = null;

        // 1. Aşama: Sol üst çeyrek bölgesi (Karekodun optik formdaki gerçek konumu)
        const cropW = Math.round(w * 0.48);
        const cropH = Math.round(h * 0.60);
        const cropImg = ctx.getImageData(0, 0, cropW, cropH);
        qrCode = jsQR(cropImg.data, cropW, cropH, { inversionAttempts: 'attemptBoth' });

        // 2. Aşama: Sol üstte bulunamadıysa tüm kareyi tara
        if (!qrCode || !qrCode.data) {
          const fullImg = ctx.getImageData(0, 0, w, h);
          qrCode = jsQR(fullImg.data, w, h, { inversionAttempts: 'attemptBoth' });
        }

        // 3. Aşama: Kontrast artırarak sol üst bölgeyi yeniden dene
        if (!qrCode || !qrCode.data) {
          const cData = new Uint8ClampedArray(cropImg.data);
          for (let i = 0; i < cData.length; i += 4) {
            const gray = 0.299 * cData[i] + 0.587 * cData[i + 1] + 0.114 * cData[i + 2];
            const val = gray < 125 ? 0 : 255;
            cData[i] = val;
            cData[i + 1] = val;
            cData[i + 2] = val;
          }
          qrCode = jsQR(cData, cropW, cropH, { inversionAttempts: 'attemptBoth' });
        }

        if (qrCode && qrCode.data) {
          qrCorners = qrCode.location;
          const parts = qrCode.data.split('|');
          parts.forEach(p => {
            if (p.startsWith('EXAM:')) {
              detectedExamId = p.substring(5).trim();
            }
            if (p.startsWith('ST:')) {
              detectedStudentNo = p.substring(3).trim();
            }
            if (p.startsWith('BK:') && !detectedBooklet) {
              const bVal = p.substring(3).trim().toUpperCase();
              if (bVal && bVal !== 'AUTO') detectedBooklet = bVal;
            }
            if (p === 'BLANK' && !studentNoOverride) {
              detectedStudentNo = null;
            }
          });
        }
      } catch (e) {
        console.warn('QR okuma uyarısı:', e);
      }
    }

    // 1. ÖNCELİKLİ ŞART: SİSTEM ÖNCE QR KODU TESPİT ETMELİDİR!
    const finalStudentNo = detectedStudentNo || (studentNoOverride ? studentNoOverride : null);
    const qrDetected = !!detectedStudentNo;

    if (!finalStudentNo) {
      return {
        success: false,
        stage: 'qr_search',
        qrDetected: false,
        studentNo: null,
        message: 'Karekod taranıyor... Lütfen kağıdın sol üstündeki karekodu kameraya net tutunuz.',
        scannedAt: new Date().toISOString()
      };
    }

    // 2. DOĞRU SINAV TESPİTİ (Eğer QR'daki sınav farklıysa doğru sınava otomatik geç)
    if (detectedExamId && exam.id !== detectedExamId && window.PortalStore) {
      const allExams = window.PortalStore.getExams(this.activeInstitutionId) || [];
      const matchedExam = allExams.find(e => e.id === detectedExamId);
      if (matchedExam) {
        this.activeExam = matchedExam;
        exam = matchedExam;
        const examSelect = document.getElementById('scanner-exam-select');
        if (examSelect) examSelect.value = matchedExam.id;
      }
    }

    // 3. DOĞRU TALEBE TESPİTİ
    let studentName = null;
    let className = 'Genel';
    let parentPhone = '';
    if (finalStudentNo && window.PortalStore) {
      let matched = null;
      if (this.activeInstitutionId) {
        const students = window.PortalStore.getStudents(this.activeInstitutionId) || [];
        matched = students.find(s => s.studentNo === finalStudentNo);
      }
      if (!matched && typeof window.PortalStore.getInstitutions === 'function') {
        const allInsts = window.PortalStore.getInstitutions() || [];
        for (const inst of allInsts) {
          const instStudents = window.PortalStore.getStudents(inst.id) || [];
          const found = instStudents.find(s => s.studentNo === finalStudentNo);
          if (found) {
            matched = found;
            break;
          }
        }
      }
      if (matched) {
        studentName = `${matched.firstName} ${matched.lastName}`;
        className = matched.className || 'Genel';
        parentPhone = matched.parentPhone || '';
      } else {
        studentName = `Talebe #${finalStudentNo}`;
      }
    }

    // Görüntü piksellerini al
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 1. Çerçeve içi ortam ışığı ve beyaz kağıt varlık kontrolü
    let guideX1 = Math.round(w * 0.10);
    let guideX2 = Math.round(w * 0.90);
    let guideY1 = Math.round(h * 0.10);
    let guideY2 = Math.round(h * 0.90);

    // Eğer QR kod koordinatları tespit edildiyse kağıt konumunu ve ölçeğini hassaslaştır
    if (qrCorners && qrCorners.topLeftCorner && qrCorners.topRightCorner) {
      const qrW = Math.hypot(
        qrCorners.topRightCorner.x - qrCorners.topLeftCorner.x,
        qrCorners.topRightCorner.y - qrCorners.topLeftCorner.y
      );
      // Standart A4 optik formda QR genişliği sayfanın yaklaşık %9.4'üdür
      if (qrW > 18) {
        const estSheetW = qrW / 0.094;
        const estSheetH = estSheetW * (202 / 287);
        // QR sol üst noktası kağıdın sol kenarından yaklaşık %4.5, üst kenarından %16 içeridedir
        const estX1 = qrCorners.topLeftCorner.x - (estSheetW * 0.045);
        const estY1 = qrCorners.topLeftCorner.y - (estSheetH * 0.160);
        const estX2 = estX1 + estSheetW;
        const estY2 = estY1 + estSheetH;

        if (estSheetW > w * 0.35 && estSheetW < w * 1.6) {
          guideX1 = Math.max(0, Math.round(estX1));
          guideX2 = Math.min(w, Math.round(estX2));
          guideY1 = Math.max(0, Math.round(estY1));
          guideY2 = Math.min(h, Math.round(estY2));
        }
      }
    }

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
    if (avgLuma < 60) {
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

    // Kitapçık Türü Optik Kabarcık Taraması (Eğer öğrenci kağıtta A, B, C, D işaretlemişse)
    const availableBooklets = (Array.isArray(exam.bookletTypes) && exam.bookletTypes.length > 0)
      ? exam.bookletTypes
      : ['A', 'B', 'C', 'D'];

    if (!detectedBooklet && availableBooklets.length > 1) {
      const bBoxX1 = guideX1 + (sheetW * 0.020);
      const bBoxX2 = guideX1 + (sheetW * 0.145);
      const bBoxY = guideY1 + (sheetH * 0.455);
      const bStep = (bBoxX2 - bBoxX1) / availableBooklets.length;

      const bScores = [];
      availableBooklets.forEach((bLet, bIdx) => {
        const bX = bBoxX1 + (bIdx * bStep) + (bStep * 0.5);
        let bDark = 0;
        for (let dy = -4; dy <= 4; dy += 2) {
          const d = sampleDarkness(bX, bBoxY + dy, 3);
          if (d > bDark) bDark = d;
        }
        bScores.push({ bLet, bDark });
      });

      const minDark = Math.min(...bScores.map(s => s.bDark));
      bScores.sort((a, b) => b.bDark - a.bDark);
      const topB = bScores[0];
      const secondB = bScores[1] || { bDark: minDark };

      if (topB && (topB.bDark - minDark) >= 18 && (topB.bDark - secondB.bDark) >= 8) {
        detectedBooklet = topB.bLet;
      }
    }

    if (!detectedBooklet) {
      detectedBooklet = availableBooklets[0] || 'A';
    }

    // Ders sütunlarının yatay konumlarını hesaplayan fonksiyon (Sözel + Boşluk + Sayısal ayrımı)
    const getColumnBounds = (sIdx, totalSubjs) => {
      if (totalSubjs >= 6) {
        if (sIdx < 4) {
          const groupStart = guideX1 + (sheetW * 0.172);
          const groupEnd = guideX1 + (sheetW * 0.655);
          const colW = (groupEnd - groupStart) / 4;
          return {
            left: groupStart + sIdx * colW,
            right: groupStart + (sIdx + 1) * colW
          };
        } else {
          const groupStart = guideX1 + (sheetW * 0.705);
          const groupEnd = guideX1 + (sheetW * 0.965);
          const colW = (groupEnd - groupStart) / 2;
          const s2Idx = sIdx - 4;
          return {
            left: groupStart + s2Idx * colW,
            right: groupStart + (s2Idx + 1) * colW
          };
        }
      } else {
        const areaStart = guideX1 + (sheetW * 0.175);
        const areaEnd = guideX1 + (sheetW * 0.965);
        const colW = (areaEnd - areaStart) / totalSubjs;
        return {
          left: areaStart + sIdx * colW,
          right: areaStart + (sIdx + 1) * colW
        };
      }
    };

    const startYOffset = guideY1 + (sheetH * 0.285);
    const availableH = sheetH * 0.640;
    const rowHeight = availableH / 20;

    const detectedAnswers = new Array(qCount).fill('');
    let markedCount = 0;

    // Gerçek işaretleme eşiği:
    const MARK_THRESHOLD = 24;

    subjects.forEach((subj, sIdx) => {
      const colBounds = getColumnBounds(sIdx, subjects.length);
      const colWidth = colBounds.right - colBounds.left;
      const colLeft = colBounds.left;

      for (let qNum = subj.startQ; qNum <= subj.endQ; qNum++) {
        if (qNum > qCount) continue;
        const qIdx = qNum - 1;
        const rowIdx = (qNum - subj.startQ);
        const rowY = startYOffset + (rowIdx * rowHeight) + (rowHeight * 0.5);

        // Satır yanındaki boş beyaz kağıt referans koyuluğu
        const paperRef = sampleDarkness(colLeft + (colWidth * 0.26), rowY, 3);

        // A, B, C, D seçeneklerinin yatay pozisyonları
        const optStartX = colLeft + (colWidth * 0.42);
        const optEndX = colBounds.right - (colWidth * 0.03);
        const optStep = (optEndX - optStartX) / 4;

        const scores = [];
        const options = ['A', 'B', 'C', 'D'];

        for (let oIdx = 0; oIdx < 4; oIdx++) {
          const optX = optStartX + (oIdx * optStep) + (optStep * 0.5);
          let bubbleDarkness = 0;
          for (let dy = -2; dy <= 2; dy += 2) {
            const d = sampleDarkness(optX, rowY + dy, 3);
            if (d > bubbleDarkness) bubbleDarkness = d;
          }
          const fillScore = bubbleDarkness - paperRef;
          scores.push({ opt: options[oIdx], fillScore });
        }

        // Karartma derecesine göre azalan sırala
        scores.sort((a, b) => b.fillScore - a.fillScore);
        const top = scores[0];
        const runnerUp = scores[1];

        // Eşik kontrolü: Net doldurulmuş kabarcık kontrolü
        if (top.fillScore >= MARK_THRESHOLD && (top.fillScore - runnerUp.fillScore) >= 10) {
          detectedAnswers[qIdx] = top.opt;
          markedCount++;
        } else {
          detectedAnswers[qIdx] = ''; // Boş bırakılmış soru
        }
      }
    });

    const isBlank = (markedCount === 0);
    const answersString = detectedAnswers.join('');

    // 4. CEVAP ANAHTARI KONTROLÜ (Kodlanmamışsa Derhal Uyarı Ver)
    const rawKey = (exam.answerKeys && exam.answerKeys[detectedBooklet]) 
      ? exam.answerKeys[detectedBooklet].toUpperCase().replace(/[^A-E*]/g, '')
      : '';

    if (!rawKey || rawKey.length === 0) {
      this.playBeep(false);
      return {
        success: false,
        isMissingAnswerKey: true,
        stage: 'no_answer_key',
        qrDetected: qrDetected,
        examId: exam.id,
        examTitle: exam.title,
        studentNo: finalStudentNo,
        studentName: studentName,
        className: className,
        parentPhone: parentPhone,
        booklet: detectedBooklet,
        answers: answersString,
        markedCount: markedCount,
        message: `⚠️ "${exam.title}" sınavının (${detectedBooklet} Kitapçığı) cevap anahtarı henüz kodlanmamış! Lütfen Sınavlar sekmesinden cevap anahtarını kaydediniz.`,
        scannedAt: new Date().toISOString()
      };
    }

    this.playBeep(!isBlank);

    // EĞER KAĞIT BOŞ İSE: Kesinlikle 0 Doğru, 0 Yanlış, qCount Boş ve 0 Net dön
    if (isBlank) {
      return {
        examId: exam.id,
        examTitle: exam.title,
        studentNo: finalStudentNo,
        studentName: studentName,
        className: className,
        parentPhone: parentPhone,
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
        qrDetected: qrDetected,
        scannedAt: new Date().toISOString()
      };
    }

    // İşaretleme varsa puan ve net hesapla
    if (window.PortalStore && typeof window.PortalStore.scoreStudentAnswers === 'function') {
      const scored = window.PortalStore.scoreStudentAnswers(answersString, exam, detectedBooklet);
      if (scored.isMissingAnswerKey) {
        this.playBeep(false);
        return {
          success: false,
          isMissingAnswerKey: true,
          stage: 'no_answer_key',
          qrDetected: qrDetected,
          examId: exam.id,
          examTitle: exam.title,
          studentNo: finalStudentNo,
          studentName: studentName,
          className: className,
          parentPhone: parentPhone,
          booklet: detectedBooklet,
          answers: answersString,
          markedCount: markedCount,
          message: scored.message,
          scannedAt: new Date().toISOString()
        };
      }
      return {
        examId: exam.id,
        examTitle: exam.title,
        studentNo: finalStudentNo,
        studentName: studentName,
        className: className,
        parentPhone: parentPhone,
        booklet: detectedBooklet,
        answers: scored.answers,
        subjectsResult: scored.subjectsResult,
        totalCorrect: scored.totalCorrect,
        totalWrong: scored.totalWrong,
        totalEmpty: scored.totalEmpty,
        totalNet: scored.totalNet,
        totalScore: scored.totalScore,
        topicAnalysis: scored.topicAnalysis,
        markedCount: markedCount,
        isBlank: false,
        qrDetected: qrDetected,
        scannedAt: new Date().toISOString()
      };
    }

    // Yedek hesaplama
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalEmpty = 0;
    for (let i = 0; i < detectedAnswers.length; i++) {
      const a = detectedAnswers[i];
      const k = rawKey[i] || '';
      if (!a) totalEmpty++;
      else if (a === k || k === '*') totalCorrect++;
      else totalWrong++;
    }
    const totalNet = Math.max(0, parseFloat((totalCorrect - (totalWrong * 0.333)).toFixed(2)));
    const totalScore = parseFloat((totalNet * 5).toFixed(1));

    return {
      examId: exam.id,
      examTitle: exam.title,
      studentNo: finalStudentNo,
      studentName: studentName,
      className: className,
      parentPhone: parentPhone,
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
      qrDetected: qrDetected,
      scannedAt: new Date().toISOString()
    };
  },

  // --- 2. SERİ OTOMATİK OKUMA MODU (Hands-Free Continuous Scanning) ---
  startContinuousScanning(videoElement, canvasElement, onResultCallback, onStatusUpdate, getBookletOverride, getStudentOverride) {
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
      const overrideBooklet = (typeof getBookletOverride === 'function') ? getBookletOverride() : null;
      const overrideStudent = (typeof getStudentOverride === 'function') ? getStudentOverride() : null;
      const result = this.scanCurrentFrame(videoElement, canvasElement, overrideStudent, overrideBooklet);
      if (result) {
        // Eğer karekod okunamadıysa seri okuma kullanıcıya bildirip beklemeye devam etsin
        if (!result.studentNo || result.stage === 'qr_search') {
          if (onStatusUpdate) onStatusUpdate('⏳ Karekod taranıyor... Lütfen kağıdın sol üstündeki karekodu kameraya net tutunuz.');
          return;
        }

        // Eğer cevap anahtarı kodlanmamışsa uyar ve duraklat
        if (result.isMissingAnswerKey || result.stage === 'no_answer_key') {
          if (onStatusUpdate) onStatusUpdate(`⚠️ "${result.examTitle}" (${result.booklet} Kitapçığı) Cevap anahtarı kodlanmamış! Lütfen önce cevap anahtarını giriniz.`);
          if (typeof onResultCallback === 'function') {
            onResultCallback(result);
          }
          return;
        }

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
            onStatusUpdate(`✓ #${result.studentNo} (${result.studentName || 'Talebe'}) başarıyla okundu! (${this.sessionScanCount}. Kağıt) - Sıradakini koyunuz...`);
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
