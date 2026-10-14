/**
 * cloud-sync.js - Hibrit Bulut Senkronizasyon Motoru (Firebase Firestore)
 * 
 * Mimari:
 * 1. Yerel Öncelikli (Local-First): Tarayıcı hafızasıyla (localStorage) anında ve kesintisiz çalışır.
 * 2. Arka Plan Senkronizasyonu: İnternet aktif olduğunda Firebase Firestore ile çift yönlü eşitlenir.
 * 3. Çoklu Kurum İzolasyonu: Kurumlar kendi verilerini işler, süper yönetici tüm verileri merkezden görebilir.
 * 4. Çevrimdışı Dayanıklılık: İnternet kesilse dahi okuma/kayıt aksamaz, bağlantı gelince aktarılır.
 */

window.CloudSync = {
  db: null,
  app: null,
  isInitialized: false,
  status: 'idle', // 'idle', 'connecting', 'connected', 'offline', 'not_configured', 'error'
  lastSyncTime: null,
  listeners: [],

  // Durum Bildirimi
  getStatus() {
    if (!this.hasConfig()) return { code: 'not_configured', label: 'Yerel Mod (Bulut Tanımlanmadı)', color: 'amber' };
    if (!navigator.onLine) return { code: 'offline', label: 'Çevrimdışı (Yerelde Kaydediliyor)', color: 'slate' };
    if (this.status === 'connected') return { code: 'connected', label: 'Bulut Eşitlendi (Canlı)', color: 'emerald' };
    if (this.status === 'connecting') return { code: 'connecting', label: 'Buluta Bağlanıyor...', color: 'cyan' };
    if (this.status === 'syncing') return { code: 'syncing', label: 'Veriler Eşitleniyor...', color: 'cyan' };
    return { code: 'error', label: 'Bulut Bağlantı Hatası', color: 'rose' };
  },

  // Konfigürasyon kontrolü
  getConfig() {
    if (localStorage.getItem('optik_portal_cloud_disabled') === 'true') {
      return null;
    }
    try {
      const stored = localStorage.getItem('optik_portal_firebase_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.apiKey && parsed.projectId) return parsed;
      }
    } catch (e) {
      console.warn('Firebase yerel yapılandırma okuma hatası:', e);
    }

    if (window.DEFAULT_FIREBASE_CONFIG && window.DEFAULT_FIREBASE_CONFIG.apiKey && window.DEFAULT_FIREBASE_CONFIG.projectId) {
      return window.DEFAULT_FIREBASE_CONFIG;
    }

    return null;
  },

  hasConfig() {
    const cfg = this.getConfig();
    return !!(cfg && cfg.apiKey && cfg.projectId);
  },

  // Başlatıcı
  async init() {
    if (this.isInitialized) return true;

    // İnternet olaylarını dinle
    window.addEventListener('online', () => {
      this.updateStatusBadge();
      this.syncPendingData();
    });
    window.addEventListener('offline', () => {
      this.updateStatusBadge();
    });

    const config = this.getConfig();
    if (!config) {
      this.status = 'not_configured';
      this.updateStatusBadge();
      return false;
    }

    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK henüz yüklenmedi veya internet yok.');
      this.status = 'offline';
      this.updateStatusBadge();
      return false;
    }

    try {
      this.status = 'connecting';
      this.updateStatusBadge();

      // Zaten başlatılmış uygulama var mı?
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(config);
      } else {
        this.app = firebase.app();
      }

      this.db = firebase.firestore();

      // Çevrimdışı önbellekleme desteği
      try {
        await this.db.enablePersistence({ synchronizeTabs: true });
      } catch (err) {
        if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
          console.log('Firestore yerel önbellek bildirimi:', err.message);
        }
      }

      this.isInitialized = true;
      this.status = 'connected';
      this.lastSyncTime = new Date();
      this.updateStatusBadge();

      console.log('✓ Firebase Bulut Senkronizasyonu başarıyla bağlandı.');

      // Başlangıçta buluttaki güncel verileri yerelle birleştir
      this.pullAllFromCloud();

      return true;
    } catch (error) {
      console.error('Firebase başlatma hatası:', error);
      this.status = 'error';
      this.updateStatusBadge();
      return false;
    }
  },

  // Arayüzdeki Rozeti Güncelleme
  updateStatusBadge() {
    const badgeEl = document.getElementById('cloud-sync-badge');
    if (!badgeEl) return;
    const info = this.getStatus();

    const colorClasses = {
      emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25',
      amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25',
      cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/25',
      slate: 'bg-slate-700/30 text-slate-400 border-slate-600/30 hover:bg-slate-700/50',
      rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25'
    };

    badgeEl.className = `px-2.5 py-1 rounded-xl text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer shadow-sm ${colorClasses[info.color] || colorClasses.slate}`;
    badgeEl.innerHTML = `
      <span class="w-2 h-2 rounded-full ${info.color === 'emerald' ? 'bg-emerald-400 animate-pulse' : (info.color === 'cyan' ? 'bg-cyan-400 animate-spin' : (info.color === 'amber' ? 'bg-amber-400' : 'bg-slate-400'))}"></span>
      <span class="hidden sm:inline">${info.label}</span>
      <span class="sm:hidden">${info.code === 'connected' ? 'Bulut Canlı' : 'Yerel'}</span>
    `;
  },

  // --- ÇİFT YÖNLÜ BULUT AKTARIMLARI ---

  // 1. Kurum Eşitleme
  async syncInstitution(inst) {
    if (!this.isInitialized || !inst || !inst.id) return;
    try {
      await this.db.collection('institutions').doc(inst.id).set({
        ...inst,
        cloudUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Kurum buluta aktarılamadı (yerelde korundu):', e.message);
    }
  },

  async deleteInstitution(instId) {
    if (!this.isInitialized || !instId) return;
    try {
      await this.db.collection('institutions').doc(instId).delete();
    } catch (e) {
      console.warn('Kurum buluttan silinemedi:', e.message);
    }
  },

  // 2. Talebe Eşitleme
  async syncStudent(instId, student) {
    if (!this.isInitialized || !instId || !student || !student.id) return;
    try {
      const docId = `${instId}__${student.id}`;
      await this.db.collection('students').doc(docId).set({
        ...student,
        institutionId: instId,
        cloudUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Talebe buluta aktarılamadı (yerelde korundu):', e.message);
    }
  },

  async syncStudentsBulk(instId, students) {
    if (!this.isInitialized || !instId || !Array.isArray(students)) return;
    try {
      const batch = this.db.batch();
      students.forEach(st => {
        const docId = `${instId}__${st.id}`;
        const ref = this.db.collection('students').doc(docId);
        batch.set(ref, {
          ...st,
          institutionId: instId,
          cloudUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
    } catch (e) {
      console.warn('Toplu talebe buluta aktarılamadı:', e.message);
    }
  },

  async deleteStudent(instId, studentId) {
    if (!this.isInitialized || !instId || !studentId) return;
    try {
      const docId = `${instId}__${studentId}`;
      await this.db.collection('students').doc(docId).delete();
    } catch (e) {
      console.warn('Talebe buluttan silinemedi:', e.message);
    }
  },

  // 3. Sınav Eşitleme
  async syncExam(instId, exam) {
    if (!this.isInitialized || !instId || !exam || !exam.id) return;
    try {
      const docId = `${instId}__${exam.id}`;
      await this.db.collection('exams').doc(docId).set({
        ...exam,
        institutionId: instId,
        cloudUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Sınav buluta aktarılamadı:', e.message);
    }
  },

  async deleteExam(instId, examId) {
    if (!this.isInitialized || !instId || !examId) return;
    try {
      const docId = `${instId}__${examId}`;
      await this.db.collection('exams').doc(docId).delete();
    } catch (e) {
      console.warn('Sınav buluttan silinemedi:', e.message);
    }
  },

  // 4. Optik Sınav Neticesi Eşitleme
  async syncResult(instId, result) {
    if (!this.isInitialized || !instId || !result) return;
    try {
      const targetKey = result.id || `${result.examId}_${result.studentNo || result.studentId}`;
      const docId = `${instId}__${targetKey}`;
      await this.db.collection('results').doc(docId).set({
        ...result,
        institutionId: instId,
        cloudUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Sınav neticesi buluta aktarılamadı:', e.message);
    }
  },

  // 5. BULUTTAN TÜM VERİLERİ ÇEKİP YERELLE BİRLEŞTİRME (PULL)
  async pullAllFromCloud(showFeedback = false) {
    if (!this.isInitialized) return false;

    try {
      this.status = 'syncing';
      this.updateStatusBadge();

      // a) Kurumları çek
      const instSnap = await this.db.collection('institutions').get();
      if (!instSnap.empty) {
        const cloudInsts = [];
        instSnap.forEach(doc => cloudInsts.push(doc.data()));
        
        // Yereldeki kurumlarla birleştir
        const localInsts = window.PortalStore.getInstitutions();
        const instMap = new Map();
        localInsts.forEach(i => instMap.set(i.id, i));
        cloudInsts.forEach(i => instMap.set(i.id, { ...(instMap.get(i.id) || {}), ...i }));
        
        const mergedList = Array.from(instMap.values());
        window.PortalStore.saveInstitutions(mergedList);
      }

      // b) Talebeleri çek
      const stSnap = await this.db.collection('students').get();
      if (!stSnap.empty) {
        const stGroup = {};
        stSnap.forEach(doc => {
          const data = doc.data();
          const instId = data.institutionId;
          if (instId) {
            if (!stGroup[instId]) stGroup[instId] = [];
            stGroup[instId].push(data);
          }
        });

        Object.keys(stGroup).forEach(instId => {
          const localList = window.PortalStore.getStudents(instId);
          const stMap = new Map();
          localList.forEach(s => stMap.set(s.id, s));
          stGroup[instId].forEach(s => stMap.set(s.id, { ...(stMap.get(s.id) || {}), ...s }));
          window.PortalStore.saveStudents(instId, Array.from(stMap.values()));
        });
      }

      // c) Sınavları çek
      const examSnap = await this.db.collection('exams').get();
      if (!examSnap.empty) {
        const exGroup = {};
        examSnap.forEach(doc => {
          const data = doc.data();
          const instId = data.institutionId;
          if (instId) {
            if (!exGroup[instId]) exGroup[instId] = [];
            exGroup[instId].push(data);
          }
        });

        Object.keys(exGroup).forEach(instId => {
          const localList = window.PortalStore.getExams(instId);
          const exMap = new Map();
          localList.forEach(e => exMap.set(e.id, e));
          exGroup[instId].forEach(e => exMap.set(e.id, { ...(exMap.get(e.id) || {}), ...e }));
          window.PortalStore.saveExams(instId, Array.from(exMap.values()));
        });
      }

      // d) Neticeleri çek
      const resSnap = await this.db.collection('results').get();
      if (!resSnap.empty) {
        const resGroup = {};
        resSnap.forEach(doc => {
          const data = doc.data();
          const instId = data.institutionId;
          if (instId) {
            if (!resGroup[instId]) resGroup[instId] = [];
            resGroup[instId].push(data);
          }
        });

        Object.keys(resGroup).forEach(instId => {
          const localList = window.PortalStore.getAllResults(instId);
          const rMap = new Map();
          localList.forEach(r => rMap.set(r.id || `${r.examId}_${r.studentNo}`, r));
          resGroup[instId].forEach(r => rMap.set(r.id || `${r.examId}_${r.studentNo}`, { ...(rMap.get(r.id) || {}), ...r }));
          window.PortalStore.saveAllResults(instId, Array.from(rMap.values()));
        });
      }

      this.status = 'connected';
      this.lastSyncTime = new Date();
      this.updateStatusBadge();

      if (window.App && typeof window.App.render === 'function') {
        window.App.render();
      }

      if (showFeedback && window.App && window.App.showToast) {
        window.App.showToast('Buluttaki tüm talebeler ve sınavlar başarıyla eşitlendi!', 'success');
      }

      return true;
    } catch (e) {
      console.error('Buluttan veri çekme hatası:', e);
      this.status = 'connected';
      this.updateStatusBadge();
      return false;
    }
  },

  // 6. YERELDEKİ TÜM VERİLERİ BULUTA YÜKLEME (PUSH / YEDEKLEME)
  async pushAllToCloud(showFeedback = false) {
    if (!this.isInitialized) {
      if (showFeedback && window.App && window.App.showToast) {
        window.App.showToast('Bulut bağlantısı henüz yapılandırılmadı.', 'warning');
      }
      return false;
    }

    try {
      this.status = 'syncing';
      this.updateStatusBadge();

      const institutions = window.PortalStore.getInstitutions();
      let totalStudents = 0;
      let totalExams = 0;
      let totalResults = 0;

      // Kurumları yükle
      for (const inst of institutions) {
        await this.syncInstitution(inst);

        // Talebeleri yükle
        const students = window.PortalStore.getStudents(inst.id);
        totalStudents += students.length;
        if (students.length > 0) {
          await this.syncStudentsBulk(inst.id, students);
        }

        // Sınavları yükle
        const exams = window.PortalStore.getExams(inst.id);
        totalExams += exams.length;
        for (const exam of exams) {
          await this.syncExam(inst.id, exam);
        }

        // Neticeleri yükle
        const results = window.PortalStore.getAllResults(inst.id);
        totalResults += results.length;
        for (const res of results) {
          await this.syncResult(inst.id, res);
        }
      }

      this.status = 'connected';
      this.lastSyncTime = new Date();
      this.updateStatusBadge();

      if (showFeedback && window.App && window.App.showToast) {
        window.App.showToast(`Yedekleme Tamamlandı: ${institutions.length} Kurum, ${totalStudents} Talebe, ${totalExams} Sınav ve ${totalResults} Okuma aktarıldı.`, 'success');
      }

      return true;
    } catch (e) {
      console.error('Buluta veri yükleme hatası:', e);
      this.status = 'error';
      this.updateStatusBadge();
      return false;
    }
  },

  // Bekleyen verileri eşitle
  syncPendingData() {
    if (this.isInitialized && navigator.onLine) {
      this.pullAllFromCloud();
    }
  },

  // Yapılandırma Kaydetme (Arayüzden girilen metni ayrıştırıp saklar)
  saveConfigFromInput(inputStr) {
    if (!inputStr || typeof inputStr !== 'string') return false;

    let clean = inputStr.trim();
    let configObj = null;

    // JSON formatında mı?
    if (clean.startsWith('{') && clean.endsWith('}')) {
      try {
        configObj = JSON.parse(clean);
      } catch (e) {
        // Devam et, regex ile dene
      }
    }

    // JS formatında mı? (const firebaseConfig = { apiKey: "..." };)
    if (!configObj) {
      try {
        const apiKeyMatch = clean.match(/apiKey\s*:\s*["']([^"']+)["']/);
        const authDomainMatch = clean.match(/authDomain\s*:\s*["']([^"']+)["']/);
        const projectIdMatch = clean.match(/projectId\s*:\s*["']([^"']+)["']/);
        const storageBucketMatch = clean.match(/storageBucket\s*:\s*["']([^"']+)["']/);
        const messagingSenderIdMatch = clean.match(/messagingSenderId\s*:\s*["']([^"']+)["']/);
        const appIdMatch = clean.match(/appId\s*:\s*["']([^"']+)["']/);

        if (apiKeyMatch && projectIdMatch) {
          configObj = {
            apiKey: apiKeyMatch[1],
            authDomain: authDomainMatch ? authDomainMatch[1] : '',
            projectId: projectIdMatch[1],
            storageBucket: storageBucketMatch ? storageBucketMatch[1] : '',
            messagingSenderId: messagingSenderIdMatch ? messagingSenderIdMatch[1] : '',
            appId: appIdMatch ? appIdMatch[1] : ''
          };
        }
      } catch (e) {
        console.error('Yapılandırma metin çözümleme hatası:', e);
      }
    }

    if (configObj && configObj.apiKey && configObj.projectId) {
      localStorage.removeItem('optik_portal_cloud_disabled');
      localStorage.setItem('optik_portal_firebase_config', JSON.stringify(configObj));
      this.isInitialized = false;
      this.init();
      return true;
    }

    return false;
  },

  // Yapılandırmayı Sıfırlama
  clearConfig() {
    localStorage.setItem('optik_portal_cloud_disabled', 'true');
    localStorage.removeItem('optik_portal_firebase_config');
    this.isInitialized = false;
    this.status = 'not_configured';
    this.updateStatusBadge();
  }
};
