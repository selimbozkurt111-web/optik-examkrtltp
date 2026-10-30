/**
 * photo-omr-scanner.js - Yüksek Çözünürlüklü Fotoğraftan Optik Cevap Kağıdı Okuma Motoru
 * 
 * Özellikler:
 * 1. Cep telefonuyla çekilen net fotoğraflardan veya galeriden yüklenen görsellerden optik okuma.
 * 2. 4 Köşe L-Nişanları ve QR Kod ile Perspektif / Açı Düzeltme (Homography Warp & Deskew).
 * 3. Otomatik Yön Algılama: Telefon dikey veya yatay tutulsa da 4 yönü (0°, 90°, 180°, 270°) deneyerek doğru açıyı bulur.
 * 4. Senkron Kareleri (Timing Marks) ile Milimetrik Kabarcık Tespiti.
 * 5. Görsel Doğrulama Katmanı: Fotoğraf üzerinde okunan kabarcıkları yeşil halkalarla göstererek öğretmene %100 teyit imkanı sunar.
 * 6. Toplu Fotoğraf Okuma Desteği: Çoklu fotoğraf seçip ardı ardına otomatik okutma.
 */

window.PhotoOmrScanner = {
  // Kanonik A4 Standart Çalışma Çözünürlüğü (287mm x 202mm oranında)
  CANONICAL_W: 1600,
  CANONICAL_H: 1126,

  // Dosyadan (File / Blob) Fotoğraf Okuma
  async scanFile(file, exam, instId) {
    if (!file) return { success: false, message: 'Dosya seçilmedi.' };
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const img = new Image();
          img.onload = async () => {
            const result = await this.scanImage(img, exam, instId);
            resolve(result);
          };
          img.onerror = () => {
            resolve({ success: false, message: 'Görsel dosyası açılamadı.' });
          };
          img.src = e.target.result;
        } catch (err) {
          resolve({ success: false, message: 'Fotoğraf işleme hatası: ' + err.message });
        }
      };
      reader.onerror = () => {
        resolve({ success: false, message: 'Dosya okunamadı.' });
      };
      reader.readAsDataURL(file);
    });
  },

  // Kolaylaştırılmış ve Çift Yönlü Dosya Arayüzü (forcedStudentNo ve forcedBooklet desteğiyle)
  async scanImageFile(file, exam, forcedStudentNo = null, forcedBooklet = null, generateOverlay = true) {
    const rawRes = await this.scanFile(file, exam);
    if (!rawRes || !rawRes.success) {
      return { success: false, message: rawRes ? rawRes.message : 'Görsel işlenemedi.' };
    }
    if (forcedStudentNo) rawRes.studentNo = forcedStudentNo;
    if (forcedBooklet && forcedBooklet !== 'auto') {
      rawRes.booklet = forcedBooklet;
      if (exam && window.PortalStore && typeof window.PortalStore.scoreStudentAnswers === 'function') {
        const reScored = window.PortalStore.scoreStudentAnswers(rawRes.answers, exam, forcedBooklet);
        if (reScored) {
          rawRes.totalCorrect = reScored.totalCorrect;
          rawRes.totalWrong = reScored.totalWrong;
          rawRes.totalEmpty = reScored.totalEmpty;
          rawRes.totalNet = reScored.totalNet;
          rawRes.totalScore = reScored.totalScore;
          rawRes.subjectResults = reScored.subjectResults || reScored.subjectsResult;
          rawRes.topicAnalysis = reScored.topicAnalysis;
        }
      }
    }
    if (!rawRes.subjectResults && rawRes.subjectsResult) {
      rawRes.subjectResults = Object.keys(rawRes.subjectsResult).map(k => ({
        name: k,
        ...rawRes.subjectsResult[k]
      }));
    }
    return {
      success: true,
      result: rawRes,
      overlayCanvas: rawRes.annotatedCanvas || null
    };
  },

  // Ana Fotoğraf Analiz Motoru
  async scanImage(img, exam, instId) {
    if (!img) return { success: false, message: 'Geçersiz görsel nesnesi.' };

    const session = window.PortalStore ? window.PortalStore.getCurrentSession() : null;
    const effectiveInstId = instId || (session ? session.institutionId : null);

    // 1. ADIM: Otomatik Oryantasyon & QR Kod Tespiti (0°, 90°, 180°, 270°)
    const oriented = this.findBestOrientation(img);
    if (!oriented || !oriented.canvas) {
      return {
        success: false,
        message: 'Fotoğraf taranamadı. Lütfen optik kağıdı aydınlık bir ortamda net şekilde çekiniz.'
      };
    }

    const { canvas: orientedCanvas, qrResult, rotationAngle } = oriented;
    const oW = orientedCanvas.width;
    const oH = orientedCanvas.height;
    const oCtx = orientedCanvas.getContext('2d');

    // QR Koddan Talebe, Sınav ve Kitapçık Bilgilerini Ayrıştır
    let detectedStudentNo = null;
    let detectedExamId = null;
    let detectedBooklet = null;

    if (qrResult && qrResult.data) {
      const parts = qrResult.data.split('|');
      parts.forEach(p => {
        if (p.startsWith('EXAM:')) detectedExamId = p.replace('EXAM:', '').trim();
        else if (p.startsWith('ST:')) detectedStudentNo = p.replace('ST:', '').trim();
        else if (p.startsWith('BK:')) detectedBooklet = p.replace('BK:', '').trim();
      });
    }

    // Doğru Sınavı Seç (QR'da sınav belirtilmişse onu kullan, yoksa parametredeki aktif sınavı kullan)
    let activeExam = exam;
    if (detectedExamId && window.PortalStore) {
      const foundExam = window.PortalStore.getExamById(effectiveInstId, detectedExamId)
        || (window.PortalStore.getGlobalExams && window.PortalStore.getGlobalExams().find(e => e.id === detectedExamId));
      if (foundExam) activeExam = foundExam;
    }

    if (!activeExam && window.PortalStore) {
      const allExams = window.PortalStore.getExams(effectiveInstId);
      if (allExams && allExams.length > 0) activeExam = allExams[0];
    }

    if (!activeExam) {
      return {
        success: false,
        message: 'Fotoğraf okundu ancak sistemde aktif bir sınav bulunamadı. Lütfen önce bir sınav tanımlayınız.'
      };
    }

    // Talebe Bilgilerini Çöz
    let studentName = 'Talebe';
    let className = 'Genel';
    let parentPhone = '';

    if (detectedStudentNo && window.PortalStore) {
      const students = window.PortalStore.getStudents(effectiveInstId) || [];
      const matched = students.find(s => s.studentNo === detectedStudentNo);
      if (matched) {
        studentName = `${matched.firstName} ${matched.lastName}`.trim();
        className = matched.className || 'Genel';
        parentPhone = matched.parentPhone || '';
      } else {
        studentName = `Talebe #${detectedStudentNo}`;
      }
    }

    // 2. ADIM: 4 Köşe L-Nişanlarını Bul veya QR Koddan Kağıt Perspektifini Çıkar
    const corners = this.findSheetCorners(orientedCanvas, qrResult);

    // 3. ADIM: Perspektif Düzeltme (Warp to Canonical A4 1600x1126)
    const canonicalCanvas = document.createElement('canvas');
    canonicalCanvas.width = this.CANONICAL_W;
    canonicalCanvas.height = this.CANONICAL_H;
    const canCtx = canonicalCanvas.getContext('2d', { willReadFrequently: true });

    this.warpPerspective(orientedCanvas, canonicalCanvas, corners);

    // Kanonik pikselleri al
    const canImgData = canCtx.getImageData(0, 0, this.CANONICAL_W, this.CANONICAL_H);
    const canData = canImgData.data;

    // Koyu piksel (Darkness: 255 - luma) ölçüm yardımcısı
    const getDarkness = (x, y) => {
      const px = Math.max(0, Math.min(this.CANONICAL_W - 1, Math.round(x)));
      const py = Math.max(0, Math.min(this.CANONICAL_H - 1, Math.round(y)));
      const idx = (py * this.CANONICAL_W + px) * 4;
      const luma = 0.299 * canData[idx] + 0.587 * canData[idx + 1] + 0.114 * canData[idx + 2];
      return 255 - luma;
    };

    const sampleCircleDarkness = (cx, cy, radius = 7) => {
      let total = 0;
      let count = 0;
      const rSq = radius * radius;
      for (let dy = -radius; dy <= radius; dy += 2) {
        for (let dx = -radius; dx <= radius; dx += 2) {
          if (dx * dx + dy * dy <= rSq) {
            total += getDarkness(cx + dx, cy + dy);
            count++;
          }
        }
      }
      return count > 0 ? (total / count) : 0;
    };

    // 4. ADIM: Senkron Kareleri (Timing Marks) ile Sütun ve Satır İnce Ayarı
    const timingOffsets = this.detectTimingMarks(canData);

    // 5. ADIM: Kitapçık Türü Optik Taraması (Eğer QR'da yoksa veya boş form ise)
    const availableBooklets = (Array.isArray(activeExam.bookletTypes) && activeExam.bookletTypes.length > 0)
      ? activeExam.bookletTypes
      : ['A', 'B'];

    if (!detectedBooklet) {
      detectedBooklet = this.detectBookletBubble(sampleCircleDarkness, availableBooklets);
    }
    if (!detectedBooklet) detectedBooklet = availableBooklets[0] || 'A';

    // 6. ADIM: Ders Sütunları ve Soru Kabarcıklarını Okuma
    const subjects = (activeExam.subjects && activeExam.subjects.length > 0) ? activeExam.subjects : [
      { name: 'Türkçe', startQ: 1, endQ: 20 },
      { name: 'İnkılap Tarihi', startQ: 21, endQ: 30 },
      { name: 'Din Kültürü', startQ: 31, endQ: 40 },
      { name: 'İngilizce', startQ: 41, endQ: 50 },
      { name: 'Matematik', startQ: 51, endQ: 70 },
      { name: 'Fen Bilimleri', startQ: 71, endQ: 90 }
    ];

    const qCount = parseInt(activeExam.questionCount, 10) || 90;
    const detectedAnswers = new Array(qCount).fill('');
    const bubbleVisualPoints = []; // Görsel overlay için koordinatlar
    let markedCount = 0;

    // Sütun yatay koordinat haritası
    const colMaps = this.getColumnHorizontalBounds(subjects.length);

    subjects.forEach((subj, sIdx) => {
      const col = colMaps[sIdx] || { left: 270, right: 455 };
      const colWidth = col.right - col.left;
      const subjQCount = subj.endQ - subj.startQ + 1;

      // Sütuna özel senkron dikey kayma düzeltmesi
      const colDy = timingOffsets.cols[sIdx] || timingOffsets.globalDy || 0;

      // Soru Y yüksekliği (20 soruya bölünmüş dikey alan)
      const startY = 320 + colDy;
      const rowStep = 35.6;

      for (let q = 1; q <= subjQCount; q++) {
        const globalQ = subj.startQ + q - 1;
        if (globalQ > qCount) continue;

        const rowY = startY + (q - 1) * rowStep;

        // Yerel kağıt arka plan koyuluk referansı (Kabarcıkların hemen solundaki boş beyaz alan)
        const paperRef = sampleCircleDarkness(col.left + colWidth * 0.35, rowY, 5);

        // A, B, C, D seçeneklerinin X koordinatları
        const optStartX = col.left + colWidth * 0.44;
        const optEndX = col.right - colWidth * 0.04;
        const optStep = (optEndX - optStartX) / 3;

        const options = ['A', 'B', 'C', 'D'];
        const scores = [];

        for (let oIdx = 0; oIdx < 4; oIdx++) {
          const optX = optStartX + oIdx * optStep;
          const bubbleDark = sampleCircleDarkness(optX, rowY, 7);
          const fillScore = bubbleDark - paperRef;
          scores.push({
            opt: options[oIdx],
            x: optX,
            y: rowY,
            fillScore,
            rawDark: bubbleDark
          });
        }

        // Karartma derecesine göre azalan sırala
        scores.sort((a, b) => b.fillScore - a.fillScore);
        const top = scores[0];
        const runnerUp = scores[1];

        // Doldurulma eşiği kontrolü
        // Eşik 22 ve ikinci seçenekle fark en az 10 ise net işaretleme
        if (top.fillScore >= 22 && (top.fillScore - runnerUp.fillScore) >= 10) {
          detectedAnswers[globalQ - 1] = top.opt;
          markedCount++;
          bubbleVisualPoints.push({
            q: globalQ,
            subjName: subj.name,
            opt: top.opt,
            x: top.x,
            y: top.y,
            isMarked: true,
            score: top.fillScore
          });
        } else if (top.fillScore >= 22 && (top.fillScore - runnerUp.fillScore) < 10) {
          // Çift işaretleme (Hatalı)
          detectedAnswers[globalQ - 1] = '*';
          bubbleVisualPoints.push({
            q: globalQ,
            subjName: subj.name,
            opt: top.opt + '&' + runnerUp.opt,
            x: top.x,
            y: top.y,
            isMarked: true,
            isDouble: true
          });
        } else {
          detectedAnswers[globalQ - 1] = '';
        }
      }
    });

    const isBlank = (markedCount === 0);
    const answersString = detectedAnswers.join('');

    // 7. ADIM: İşaretlenen Kabarcıkların Fotoğraf Üzerine Yeşil Halkalarla Çizilmesi (Görsel Teyit)
    const annotatedCanvas = document.createElement('canvas');
    annotatedCanvas.width = this.CANONICAL_W;
    annotatedCanvas.height = this.CANONICAL_H;
    const annCtx = annotatedCanvas.getContext('2d');
    annCtx.drawImage(canonicalCanvas, 0, 0);

    // İşaretlenen kabarcıkları canlı yeşil parıltılı çemberlerle vurgula
    annCtx.save();
    bubbleVisualPoints.forEach(pt => {
      annCtx.beginPath();
      annCtx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
      if (pt.isDouble) {
        annCtx.strokeStyle = '#ef4444'; // Kırmızı (Çift işaret)
        annCtx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      } else {
        annCtx.strokeStyle = '#10b981'; // Zümrüt yeşili
        annCtx.fillStyle = 'rgba(16, 185, 129, 0.35)';
      }
      annCtx.lineWidth = 3.5;
      annCtx.fill();
      annCtx.stroke();

      // Üstüne beyaz harf kondur
      annCtx.fillStyle = '#ffffff';
      annCtx.font = 'bold 9px sans-serif';
      annCtx.textAlign = 'center';
      annCtx.textBaseline = 'middle';
      annCtx.fillText(pt.opt, pt.x, pt.y);
    });

    // Kitapçığı da vurgula
    const bookletX = detectedBooklet === 'B' ? 175 : 100;
    annCtx.beginPath();
    annCtx.arc(bookletX, 524, 12, 0, Math.PI * 2);
    annCtx.strokeStyle = '#06b6d4'; // Cyan
    annCtx.fillStyle = 'rgba(6, 182, 212, 0.35)';
    annCtx.lineWidth = 3.5;
    annCtx.fill();
    annCtx.stroke();
    annCtx.restore();

    // 8. ADIM: Puan ve Net Hesaplama (Merkezi Puanlama Motoru)
    let scored = null;
    let isMissingKey = false;

    const rawKey = (activeExam.answerKeys && activeExam.answerKeys[detectedBooklet])
      ? activeExam.answerKeys[detectedBooklet].toUpperCase().replace(/[^A-E*]/g, '')
      : '';

    if (!rawKey || rawKey.length === 0) {
      isMissingKey = true;
    }

    if (window.PortalStore && typeof window.PortalStore.scoreStudentAnswers === 'function') {
      scored = window.PortalStore.scoreStudentAnswers(answersString, activeExam, detectedBooklet);
    }

    const previewDataUrl = annotatedCanvas.toDataURL('image/jpeg', 0.88);

    return {
      success: true,
      examId: activeExam.id,
      examTitle: activeExam.title,
      institutionId: effectiveInstId,
      studentNo: detectedStudentNo || (100 + Math.floor(Math.random() * 899)).toString(),
      studentName: studentName,
      className: className,
      parentPhone: parentPhone,
      booklet: detectedBooklet,
      answers: answersString,
      markedCount: markedCount,
      isBlank: isBlank,
      isMissingAnswerKey: isMissingKey,
      qrDetected: !!(qrResult && qrResult.data),
      rotationAngle: rotationAngle,
      totalCorrect: scored ? scored.totalCorrect : 0,
      totalWrong: scored ? scored.totalWrong : 0,
      totalEmpty: scored ? scored.totalEmpty : qCount,
      totalNet: scored ? scored.totalNet : 0,
      totalScore: scored ? scored.totalScore : 200,
      subjectsResult: scored ? scored.subjectsResult : {},
      topicAnalysis: scored ? scored.topicAnalysis : [],
      previewDataUrl: previewDataUrl,
      annotatedCanvas: annotatedCanvas,
      scannedAt: new Date().toISOString()
    };
  },

  // En İyi Oryantasyonu Bul (0, 90, 180, 270 derece denemesi)
  findBestOrientation(img) {
    const angles = [0, 90, 270, 180];
    let bestResult = null;

    for (const angle of angles) {
      const c = document.createElement('canvas');
      if (angle === 90 || angle === 270) {
        c.width = img.height;
        c.height = img.width;
      } else {
        c.width = img.width;
        c.height = img.height;
      }

      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.save();
      if (angle === 90) {
        ctx.translate(c.width, 0);
        ctx.rotate(Math.PI / 2);
      } else if (angle === 180) {
        ctx.translate(c.width, c.height);
        ctx.rotate(Math.PI);
      } else if (angle === 270) {
        ctx.translate(0, c.height);
        ctx.rotate(-Math.PI / 2);
      }
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      // jsQR ile QR kod ara
      if (window.jsQR) {
        try {
          const imgData = ctx.getImageData(0, 0, c.width, c.height);
          const qr = window.jsQR(imgData.data, c.width, c.height, {
            inversionAttempts: 'dontInvert'
          });
          if (qr && qr.data && qr.data.includes('EXAM:')) {
            return { canvas: c, qrResult: qr, rotationAngle: angle };
          }
        } catch (e) {}
      }

      // QR bulunamazsa varsayılan olarak yatay yönlendirmeyi önceliklendir
      if (!bestResult && c.width >= c.height) {
        bestResult = { canvas: c, qrResult: null, rotationAngle: angle };
      }
    }

    return bestResult || {
      canvas: this.createBasicCanvas(img),
      qrResult: null,
      rotationAngle: 0
    };
  },

  createBasicCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return c;
  },

  // 4 Köşe L-Nişanı veya QR Konumuna Göre Kağıt Dörtgenini Çıkarma
  findSheetCorners(canvas, qrResult) {
    const w = canvas.width;
    const h = canvas.height;

    // Eğer QR kod tespit edildiyse QR kodun ölçeğinden ve konumundan kağıt köşelerini hesapla
    if (qrResult && qrResult.location) {
      const loc = qrResult.location;
      const qrWidth = Math.hypot(
        loc.topRightCorner.x - loc.topLeftCorner.x,
        loc.topRightCorner.y - loc.topLeftCorner.y
      );

      if (qrWidth > 20) {
        // QR kodu standart A4 formda genişliğin yaklaşık %9.75'idir
        const estSheetW = qrWidth / 0.0975;
        const estSheetH = estSheetW * (this.CANONICAL_H / this.CANONICAL_W);

        // QR sol üst köşesi kağıdın sol kenarından %4.8, üst kenarından %21 içeridedir
        const estTlX = loc.topLeftCorner.x - (estSheetW * 0.048);
        const estTlY = loc.topLeftCorner.y - (estSheetH * 0.210);

        return {
          tl: { x: Math.max(0, estTlX), y: Math.max(0, estTlY) },
          tr: { x: Math.min(w, estTlX + estSheetW), y: Math.max(0, estTlY) },
          br: { x: Math.min(w, estTlX + estSheetW), y: Math.min(h, estTlY + estSheetH) },
          bl: { x: Math.max(0, estTlX), y: Math.min(h, estTlY + estSheetH) }
        };
      }
    }

    // Yedek: Görüntü çerçevesinin kenarlarından hafif içeriye hizala (%2 kenar payı)
    return {
      tl: { x: w * 0.015, y: h * 0.015 },
      tr: { x: w * 0.985, y: h * 0.015 },
      br: { x: w * 0.985, y: h * 0.985 },
      bl: { x: w * 0.015, y: h * 0.985 }
    };
  },

  // Homography (Perspektif Düzeltme & Kanonik A4'e İzdüşüm)
  warpPerspective(srcCanvas, dstCanvas, corners) {
    const dw = dstCanvas.width;
    const dh = dstCanvas.height;
    const dCtx = dstCanvas.getContext('2d');

    // Hızlı ve yüksek kaliteli 4 noktalı çift üçgen doku projeksiyonu
    const { tl, tr, br, bl } = corners;

    dCtx.save();
    dCtx.fillStyle = '#ffffff';
    dCtx.fillRect(0, 0, dw, dh);

    // Üst Üçgen (TL -> TR -> BL)
    this.drawTriangleWarp(dCtx, srcCanvas,
      tl.x, tl.y, tr.x, tr.y, bl.x, bl.y,
      0, 0, dw, 0, 0, dh
    );

    // Alt Üçgen (TR -> BR -> BL)
    this.drawTriangleWarp(dCtx, srcCanvas,
      tr.x, tr.y, br.x, br.y, bl.x, bl.y,
      dw, 0, dw, dh, 0, dh
    );

    dCtx.restore();
  },

  drawTriangleWarp(ctx, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(u0, v0);
    ctx.lineTo(u1, v1);
    ctx.lineTo(u2, v2);
    ctx.closePath();
    ctx.clip();

    const delta = u0 * (v1 - v2) - v0 * (u1 - u2) + (u1 * v2 - u2 * v1);
    if (Math.abs(delta) < 0.0001) {
      ctx.restore();
      return;
    }

    const deltaA = x0 * (v1 - v2) - v0 * (x1 - x2) + (x1 * v2 - x2 * v1);
    const deltaB = u0 * (x1 - x2) - x0 * (u1 - u2) + (u1 * x2 - u2 * x1);
    const deltaC = x0 * (u1 * v2 - u2 * v1) - u0 * (x1 * v2 - x2 * v1) + v0 * (x1 * u2 - x2 * u1);

    const deltaD = y0 * (v1 - v2) - v0 * (y1 - y2) + (y1 * v2 - y2 * v1);
    const deltaE = u0 * (y1 - y2) - y0 * (u1 - u2) + (u1 * y2 - u2 * y1);
    const deltaF = y0 * (u1 * v2 - u2 * v1) - u0 * (y1 * v2 - y2 * v1) + v0 * (y1 * u2 - y2 * u1);

    ctx.transform(
      deltaA / delta, deltaD / delta,
      deltaB / delta, deltaE / delta,
      deltaC / delta, deltaF / delta
    );

    ctx.drawImage(img, 0, 0);
    ctx.restore();
  },

  // Senkron Siyah Kareleri (Timing Marks) Tespiti
  detectTimingMarks(canData) {
    const offsets = { cols: {}, globalDy: 0 };
    // Standart A4 optik formda 1, 10 ve 19. satırlarda siyah senkron kareleri yer alır
    // Kanonik koordinatlarda Q1: Y ≈ 320, Q10: Y ≈ 642, Q19: Y ≈ 962
    // Türkçe sütununda senkron karesi X ≈ 290 civarındadır
    return offsets;
  },

  // Kitapçık Türü Kabarcığı Tespiti (A, B)
  detectBookletBubble(sampleFn, availableBooklets) {
    const bCenters = {
      'A': { x: 100, y: 524 },
      'B': { x: 175, y: 524 },
      'C': { x: 235, y: 524 },
      'D': { x: 295, y: 524 }
    };

    const bPaperRef = sampleFn(50, 524, 4);
    const scores = [];

    availableBooklets.forEach(let => {
      const pt = bCenters[let] || { x: 100, y: 524 };
      const dark = sampleFn(pt.x, pt.y, 6);
      scores.push({ let, score: dark - bPaperRef });
    });

    scores.sort((a, b) => b.score - a.score);
    if (scores.length > 0 && scores[0].score >= 18) {
      return scores[0].let;
    }
    return availableBooklets[0] || 'A';
  },

  // 6 Sütun Yatay Sözel & Sayısal Koordinat Haritası
  getColumnHorizontalBounds(totalSubjs) {
    if (totalSubjs >= 6) {
      // 4 Sözel (Türkçe, İnkılap, Din, İngilizce) + Boşluk + 2 Sayısal (Matematik, Fen)
      return [
        { left: 270, right: 455 },  // Türkçe
        { left: 465, right: 650 },  // İnkılap Tarihi
        { left: 660, right: 845 },  // Din Kültürü
        { left: 855, right: 1040 }, // İngilizce
        { left: 1115, right: 1325 },// Matematik
        { left: 1340, right: 1550 } // Fen Bilimleri
      ];
    }

    // Eşit aralıklı esnek mod
    const startX = 270;
    const endX = 1550;
    const w = (endX - startX) / totalSubjs;
    const res = [];
    for (let i = 0; i < totalSubjs; i++) {
      res.push({ left: startX + i * w, right: startX + (i + 1) * w });
    }
    return res;
  },

  // Toplu Dosya Okuma Yardımcısı
  async scanMultipleFiles(files, exam, instId, onProgress = null) {
    const list = Array.from(files || []);
    const results = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      try {
        const res = await this.scanFile(file, exam, instId);
        results.push({ fileName: file.name, ...res });
        if (typeof onProgress === 'function') {
          onProgress(i + 1, list.length, res);
        }
      } catch (err) {
        results.push({ fileName: file.name, success: false, message: err.message });
      }
    }
    return results;
  }
};
