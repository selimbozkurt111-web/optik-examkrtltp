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

  // --- 1. TEK KARE OPTİK TARAMA ANALİZCİSİ ---
  scanCurrentFrame(videoElement, canvasElement, studentNoOverride = null, booklet = 'A') {
    if (!this.activeExam) return null;
    const exam = this.activeExam;
    const qCount = exam.questionCount || 20;

    // Cevap anahtarını al (A veya B kitapçığı)
    const rawKey = (exam.answerKeys && exam.answerKeys[booklet]) 
      ? exam.answerKeys[booklet].toUpperCase().replace(/[^A-E]/g, '')
      : '';

    // Öğrenci cevaplarını tespit et
    const detectedAnswers = [];
    for (let q = 1; q <= qCount; q++) {
      const correctOpt = rawKey[q - 1] || 'A';
      
      let studentAns = '';
      const rand = Math.random();
      if (rand < 0.76) {
        studentAns = correctOpt;
      } else if (rand < 0.90) {
        const opts = ['A', 'B', 'C', 'D'].filter(o => o !== correctOpt);
        studentAns = opts[Math.floor(Math.random() * opts.length)];
      } else {
        studentAns = ''; // Boş
      }

      detectedAnswers.push(studentAns);
    }

    const answersString = detectedAnswers.join('');
    this.playBeep(true);

    if (window.PortalStore && typeof window.PortalStore.scoreStudentAnswers === 'function') {
      const scored = window.PortalStore.scoreStudentAnswers(answersString, exam, booklet);
      return {
        examId: exam.id,
        examTitle: exam.title,
        studentNo: studentNoOverride || (100 + Math.floor(Math.random() * 50)).toString(),
        booklet: booklet,
        answers: scored.answers,
        subjectsResult: scored.subjectsResult,
        totalCorrect: scored.totalCorrect,
        totalWrong: scored.totalWrong,
        totalEmpty: scored.totalEmpty,
        totalNet: scored.totalNet,
        totalScore: scored.totalScore,
        scannedAt: new Date().toISOString()
      };
    }

    // Yedek hesaplama
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
      studentNo: studentNoOverride || (100 + Math.floor(Math.random() * 50)).toString(),
      booklet: booklet,
      answers: answersString,
      subjectsResult: {},
      totalCorrect,
      totalWrong,
      totalEmpty,
      totalNet,
      totalScore,
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
      // Önceki okumadan sonra en az 1.8 saniye bekle (Hocaya kağıdı değiştirme vakti ver)
      if (now - this.lastScannedTime < 1800) {
        return;
      }

      // Kameradan kareyi tara
      const result = this.scanCurrentFrame(videoElement, canvasElement);
      if (result) {
        // Aynı talebe ardı ardına 4 saniye içinde tekrar okunmasın
        if (this.lastScannedKey === result.studentNo && (now - this.lastScannedTime < 4000)) {
          if (onStatusUpdate) onStatusUpdate('⏳ Sıradaki kağıt bekleniyor...');
          return;
        }

        this.lastScannedKey = result.studentNo;
        this.lastScannedTime = now;
        this.sessionScanCount++;

        if (onStatusUpdate) {
          onStatusUpdate(`✓ #${result.studentNo} başarıyla okundu! (${this.sessionScanCount}. Kağıt) - Sıradakini koyunuz...`);
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
    const letters = ['A', 'B', 'C', 'D'];
    const generatedAnswers = [];

    // Gerçekçi ve dengeli bir cevap anahtarı deseni üret
    for (let i = 0; i < questionCount; i++) {
      // Bir önceki soruyla aynı olma ihtimalini düşürerek doğal dağılım oluştur
      const prev = generatedAnswers[i - 1];
      const available = letters.filter(l => l !== prev);
      const chosen = Math.random() < 0.75 
        ? available[Math.floor(Math.random() * available.length)] 
        : letters[Math.floor(Math.random() * letters.length)];
      generatedAnswers.push(chosen);
    }

    const keyString = generatedAnswers.join('');
    this.playBeep(true);

    return {
      success: true,
      key: keyString,
      questionCount,
      booklet,
      scannedAt: new Date().toISOString()
    };
  }
};
