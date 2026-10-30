/**
 * cloud-sync.js - Hibrit Bulut Senkronizasyon Motoru (Firebase Firestore)
 * 
 * Mimari:
 * 1. Yerel Öncelikli (Local-First): Tarayıcı hafızasıyla (localStorage) anında ve kesintisiz çalışır.
 * 2. Gerçek Zamanlı Dinleyici (onSnapshot): Herhangi bir cihazda yapılan sınav, netice ve talebe güncellemeleri anında diğer ekranlara canlı yansır.
 * 3. Çoklu Kurum İzolasyonu: Kurumlar kendi verilerini işler, süper yönetici tüm verileri merkezden görebilir.
 * 4. Çevrimdışı Dayanıklılık: İnternet kesilse dahi okuma/kayıt aksamaz, bağlantı gelince aktarılır.
 */

window.CloudSync = {
  db: null,
  app: null,
  isInitialized: false,
  status: 'idle', // 'idle', 'connecting', 'connected', 'offline', 'not_configured', 'error'
  lastSyncTime: null,
  lastError: null,
  unsubscribeListeners: [],

  // Durum Bildirimi
  getStatus() {
    if (!this.hasConfig()) return { code: 'not_configured', label: 'Yerel Mod (Bulut Tanımlanmadı)', color: 'amber' };
    if (!navigator.onLine) return { code: 'offline', label: 'Çevrimdışı (Yerelde Kaydediliyor)', color: 'slate' };
    if (this.status === 'connected') return { code: 'connected', label: 'Bulut Eşitlendi (Canlı)', color: 'emerald' };
    if (this.status === 'connecting') return { code: 'connecting', label: 'Buluta Bağlanıyor...', color: 'cyan' };
    if (this.status === 'syncing') return { code: 'syncing', label: 'Veriler Eşitleniyor...', color: 'cyan' };
    const errLabel = (this.lastError && this.lastError.includes('permission'))
      ? 'Bulut İzin Hatası (Firestore Rules)'
      : (this.lastError || 'Bulut Bağlantı Hatası');
    return { code: 'error', label: errLabel, color: 'rose' };
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
      this.lastError = null;
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
      console.log('✓ Firebase Bulut Senkronizasyonu başlatıldı.');

      // İlk veri çekme
      await this.pullAllFromCloud();

      // Gerçek zamanlı canlı dinleyicileri bağla
      this.attachRealtimeListeners();

      return true;
    } catch (error) {
      console.error('Firebase başlatma hatası:', error);
      this.status = 'error';
      this.lastError = error.message;
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
      <span class="w-2 h-2 rounded-full ${info.color === 'emerald' ? 'bg-emerald-400 animate-pulse' : (info.color === 'cyan' ? 'bg-cyan-400 animate-spin' : (info.color === 'amber' ? 'bg-amber-400' : (info.color === 'rose' ? 'bg-rose-400' : 'bg-slate-400')))}"></span>
      <span class="hidden sm:inline">${info.label}</span>
      <span class="sm:hidden">${info.code === 'connected' ? 'Bulut Canlı' : (info.code === 'error' ? 'Hata' : 'Yerel')}</span>
    `;
  },

  // --- GERÇEK ZAMANLI CANLI DİNLEYİCİLER (onSnapshot) ---
  attachRealtimeListeners() {
    if (!this.isInitialized || !this.db) return;

    // Önceki dinleyicileri temizle
    if (Array.isArray(this.unsubscribeListeners)) {
      this.unsubscribeListeners.forEach(unsub => {
        try { if (typeof unsub === 'function') unsub(); } catch(e){}
      });
    }
    this.unsubscribeListeners = [];

    // 1. Sınavları Gerçek Zamanlı Dinle
    try {
      const unsubExams = this.db.collection('exams').onSnapshot(snapshot => {
        if (!snapshot || snapshot.empty) return;
        const cloudExams = [];
        snapshot.forEach(doc => cloudExams.push(doc.data()));
        const hasChange = this.mergeExamsFromCloud(cloudExams);
        if (hasChange) {
          console.log('🔄 Buluttaki sınav değişiklikleri canlı olarak yerelle eşitlendi.');
          if (window.App && typeof window.App.render === 'function') {
            window.App.render();
          }
        }
      }, err => {
        console.warn('Sınav dinleyici bildirimi:', err.message);
        if (err.code === 'permission-denied') {
          this.status = 'error';
          this.lastError = 'Firestore Erişim İzni Yok: Kuralları kontrol ediniz.';
          this.updateStatusBadge();
        }
      });
      this.unsubscribeListeners.push(unsubExams);
    } catch(e) {
      console.warn('Sınav dinleyicisi başlatılamadı:', e);
    }

    // 2. Optik Sonuçları Gerçek Zamanlı Dinle
    try {
      const unsubResults = this.db.collection('results').onSnapshot(snapshot => {
        if (!snapshot) return;

        // Bulutta silinen dokümanları yerel depodan da anında sil
        if (typeof snapshot.docChanges === 'function') {
          snapshot.docChanges().forEach(change => {
            if (change.type === 'removed') {
              const d = change.doc.data();
              if (d && d.institutionId && d.examId && (d.studentNo || d.id)) {
                if (window.PortalStore && typeof window.PortalStore.deleteExamResultLocally === 'function') {
                  window.PortalStore.deleteExamResultLocally(d.institutionId, d.examId, d.id || d.studentNo);
                }
              }
            }
          });
        }

        const cloudResults = [];
        snapshot.forEach(doc => cloudResults.push(doc.data()));
        const hasChange = this.mergeResultsFromCloud(cloudResults);
        if (hasChange && window.App && typeof window.App.render === 'function') {
          window.App.render();
        }
      }, err => {
        console.warn('Sonuç dinleyici bildirimi:', err.message);
      });
      this.unsubscribeListeners.push(unsubResults);
    } catch(e) {
      console.warn('Sonuç dinleyicisi başlatılamadı:', e);
    }
  },

  // --- BİRLEŞTİRME VE EŞİTLEME YARDIMCILARI ---
  mergeExamsFromCloud(examsList) {
    if (!Array.isArray(examsList) || examsList.length === 0) return false;

    const exGroup = {};
    examsList.forEach(data => {
      const instId = data.institutionId || (data.isGlobal ? 'global' : null);
      if (instId) {
        if (!exGroup[instId]) exGroup[instId] = [];
        exGroup[instId].push(data);
      }
    });

    let hasChange = false;

    // 1. Global Merkezi Sınavları Birleştir
    if (exGroup['global'] && exGroup['global'].length > 0) {
      const localGlobals = window.PortalStore.getGlobalExams();
      const gMap = new Map();
      localGlobals.forEach(g => gMap.set(g.id, g));
      exGroup['global'].forEach(g => {
        const cur = gMap.get(g.id);
        const gClone = { ...g };
        delete gClone.cloudUpdatedAt;
        const curClone = cur ? { ...cur } : null;
        if (curClone) delete curClone.cloudUpdatedAt;
        if (!cur || JSON.stringify(curClone) !== JSON.stringify(gClone)) {
          gMap.set(g.id, { ...(cur || {}), ...g });
          hasChange = true;
        }
      });
      window.PortalStore.saveGlobalExams(Array.from(gMap.values()));
    }

    // 2. Kurum Sınavlarını Birleştir
    Object.keys(exGroup).forEach(instId => {
      if (instId === 'global') return;
      const localList = (window.PortalStore.getExams(instId) || []).filter(e => !e.isGlobal);
      const exMap = new Map();
      localList.forEach(e => exMap.set(e.id, e));
      exGroup[instId].forEach(e => {
        if (e.isGlobal) return;
        const cur = exMap.get(e.id);
        const eClone = { ...e };
        delete eClone.cloudUpdatedAt;
        const curClone = cur ? { ...cur } : null;
        if (curClone) delete curClone.cloudUpdatedAt;
        if (!cur || JSON.stringify(curClone) !== JSON.stringify(eClone)) {
          exMap.set(e.id, { ...(cur || {}), ...e });
          hasChange = true;
        }
      });
      window.PortalStore.saveExams(instId, Array.from(exMap.values()));
    });

    return hasChange;
  },

  mergeResultsFromCloud(resultsList) {
    if (!Array.isArray(resultsList) || resultsList.length === 0) return false;

    const resGroup = {};
    resultsList.forEach(data => {
      const instId = data.institutionId;
      if (instId) {
        // Eğer bu sonuç yerel olarak silinmişse (tombstone), buluttan kesinlikle geri alma!
        const isDeleted = window.PortalStore && typeof window.PortalStore.isResultDeleted === 'function'
          && (window.PortalStore.isResultDeleted(instId, data.examId, data.studentNo) || window.PortalStore.isResultDeleted(instId, data.examId, data.id));

        if (isDeleted) {
          // Bulutta hâlâ kalmışsa arka planda sessizce sil
          if (typeof this.deleteResult === 'function') {
            this.deleteResult(instId, data.examId, data.studentNo || data.id).catch(() => {});
          }
          return;
        }

        if (!resGroup[instId]) resGroup[instId] = [];
        resGroup[instId].push(data);
      }
    });

    let hasChange = false;
    Object.keys(resGroup).forEach(instId => {
      const localList = window.PortalStore.getAllResults(instId);
      const rMap = new Map();
      localList.forEach(r => rMap.set(r.id || `${r.examId}_${r.studentNo}`, r));
      resGroup[instId].forEach(r => {
        const key = r.id || `${r.examId}_${r.studentNo}`;
        const cur = rMap.get(key);
        if (!cur || JSON.stringify(cur) !== JSON.stringify(r)) {
          rMap.set(key, { ...(cur || {}), ...r });
          hasChange = true;
        }
      });
      window.PortalStore.saveAllResults(instId, Array.from(rMap.values()));
    });

    return hasChange;
  },

  mergeStudentsFromCloud(studentsList) {
    if (!Array.isArray(studentsList) || studentsList.length === 0) return false;

    const stGroup = {};
    studentsList.forEach(data => {
      const instId = data.institutionId;
      if (instId) {
        if (!stGroup[instId]) stGroup[instId] = [];
        stGroup[instId].push(data);
      }
    });

    let hasChange = false;
    Object.keys(stGroup).forEach(instId => {
      const localList = window.PortalStore.getStudents(instId);
      const stMap = new Map();
      localList.forEach(s => stMap.set(s.id, s));
      stGroup[instId].forEach(s => {
        const cur = stMap.get(s.id);
        if (!cur || JSON.stringify(cur) !== JSON.stringify(s)) {
          stMap.set(s.id, { ...(cur || {}), ...s });
          hasChange = true;
        }
      });
      window.PortalStore.saveStudents(instId, Array.from(stMap.values()));
    });

    return hasChange;
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
      this.status = 'connected';
      this.updateStatusBadge();
    } catch (e) {
      console.warn('Kurum buluta aktarılamadı:', e.message);
      this.handleFirestoreError(e);
    }
  },

  async deleteInstitution(instId) {
    if (!this.isInitialized || !instId) return;
    try {
      await this.db.collection('institutions').doc(instId).delete();
    } catch (e) {
      console.warn('Kurum buluttan silinemedi:', e.message);
      this.handleFirestoreError(e);
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
      this.status = 'connected';
      this.updateStatusBadge();
    } catch (e) {
      console.warn('Talebe buluta aktarılamadı:', e.message);
      this.handleFirestoreError(e);
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
      this.status = 'connected';
      this.updateStatusBadge();
    } catch (e) {
      console.warn('Toplu talebe buluta aktarılamadı:', e.message);
      this.handleFirestoreError(e);
    }
  },

  async deleteStudent(instId, studentId) {
    if (!this.isInitialized || !instId || !studentId) return;
    try {
      const docId = `${instId}__${studentId}`;
      await this.db.collection('students').doc(docId).delete();
    } catch (e) {
      console.warn('Talebe buluttan silinemedi:', e.message);
      this.handleFirestoreError(e);
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
      this.status = 'connected';
      this.lastError = null;
      this.updateStatusBadge();
    } catch (e) {
      console.warn('Sınav buluta aktarılamadı:', e.message);
      this.handleFirestoreError(e, 'Sınav buluta aktarılamadı');
    }
  },

  async deleteExam(instId, examId) {
    if (!this.isInitialized || !instId || !examId) return;
    try {
      const docId = `${instId}__${examId}`;
      await this.db.collection('exams').doc(docId).delete();
    } catch (e) {
      console.warn('Sınav buluttan silinemedi:', e.message);
      this.handleFirestoreError(e);
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
      this.status = 'connected';
      this.updateStatusBadge();
    } catch (e) {
      console.warn('Sınav neticesi buluta aktarılamadı:', e.message);
      this.handleFirestoreError(e);
    }
  },

  // 4.B. Optik Sınav Neticesini Buluttan Kalıcı Silme (Geri Dirilmeyi Önler)
  async deleteResult(instId, examId, resultIdOrStudentNo) {
    if (!this.isInitialized || !instId || !resultIdOrStudentNo) return;
    try {
      const cleanKey = resultIdOrStudentNo.toString().trim();

      // 1. Olası standart Firestore doküman ID'lerini doğrudan sil
      const possibleDocIds = [
        `${instId}__${cleanKey}`,
        `${instId}__${examId}_${cleanKey}`,
        `${instId}__${examId}__${cleanKey}`,
        cleanKey
      ];

      await Promise.all(possibleDocIds.map(docId =>
        this.db.collection('results').doc(docId).delete().catch(() => {})
      ));

      // 2. Firestore sorgusu ile examId ve studentNo / id eşleşen tüm kopyaları bulup temizle
      if (examId) {
        const snap = await this.db.collection('results')
          .where('institutionId', '==', instId)
          .where('examId', '==', examId)
          .get();

        const batch = this.db.batch();
        let count = 0;
        snap.forEach(doc => {
          const d = doc.data();
          if (
            d.studentNo === cleanKey ||
            (d.studentNo && d.studentNo.toString().trim() === cleanKey) ||
            d.id === cleanKey ||
            doc.id.includes(cleanKey)
          ) {
            batch.delete(doc.ref);
            count++;
          }
        });

        if (count > 0) {
          await batch.commit();
        }
      }
      console.log(`✓ Sınav neticesi Firestore bulutundan kalıcı olarak silindi: #${cleanKey}`);
    } catch (e) {
      console.warn('Sınav neticesi buluttan silinemedi:', e.message);
      this.handleFirestoreError(e);
    }
  },

  // Ortak Hata Yakalayıcı
  handleFirestoreError(e, prefix = 'Bulut Hatası') {
    this.status = 'error';
    if (e.code === 'permission-denied') {
      this.lastError = 'Firestore Erişim Yetkisi Reddedildi (Rules ayarı gereklidir)';
    } else {
      this.lastError = e.message || 'Bulut bağlantı hatası oluştu';
    }
    this.updateStatusBadge();

    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(`⚠️ ${prefix}: ${this.lastError}`, 'warning');
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
        const localInsts = window.PortalStore.getInstitutions();
        const instMap = new Map();
        localInsts.forEach(i => instMap.set(i.id, i));
        cloudInsts.forEach(i => instMap.set(i.id, { ...(instMap.get(i.id) || {}), ...i }));
        window.PortalStore.saveInstitutions(Array.from(instMap.values()));
      }

      // b) Talebeleri çek
      const stSnap = await this.db.collection('students').get();
      if (!stSnap.empty) {
        const cloudStudents = [];
        stSnap.forEach(doc => cloudStudents.push(doc.data()));
        this.mergeStudentsFromCloud(cloudStudents);
      }

      // c) Sınavları çek
      const examSnap = await this.db.collection('exams').get();
      if (!examSnap.empty) {
        const cloudExams = [];
        examSnap.forEach(doc => cloudExams.push(doc.data()));
        this.mergeExamsFromCloud(cloudExams);
      }

      // d) Neticeleri çek
      const resSnap = await this.db.collection('results').get();
      if (!resSnap.empty) {
        const cloudResults = [];
        resSnap.forEach(doc => cloudResults.push(doc.data()));
        this.mergeResultsFromCloud(cloudResults);
      }

      this.status = 'connected';
      this.lastError = null;
      this.lastSyncTime = new Date();
      this.updateStatusBadge();

      if (window.App && typeof window.App.render === 'function') {
        window.App.render();
      }

      if (showFeedback && window.App && window.App.showToast) {
        window.App.showToast('✓ Buluttaki tüm talebeler ve sınavlar başarıyla eşitlendi!', 'success');
      }

      return true;
    } catch (e) {
      console.error('Buluttan veri çekme hatası:', e);
      this.handleFirestoreError(e, 'Buluttan veri çekilemedi');
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

      // Global sınavları yükle
      const globalExams = window.PortalStore.getGlobalExams();
      for (const gEx of globalExams) {
        await this.syncExam('global', gEx);
        totalExams++;
      }

      // Kurumları ve içeriklerini yükle
      for (const inst of institutions) {
        await this.syncInstitution(inst);

        const students = window.PortalStore.getStudents(inst.id);
        totalStudents += students.length;
        if (students.length > 0) {
          await this.syncStudentsBulk(inst.id, students);
        }

        const exams = (window.PortalStore.getExams(inst.id) || []).filter(e => !e.isGlobal);
        totalExams += exams.length;
        for (const exam of exams) {
          await this.syncExam(inst.id, exam);
        }

        const results = window.PortalStore.getAllResults(inst.id);
        totalResults += results.length;
        for (const res of results) {
          await this.syncResult(inst.id, res);
        }
      }

      this.status = 'connected';
      this.lastError = null;
      this.lastSyncTime = new Date();
      this.updateStatusBadge();

      if (showFeedback && window.App && window.App.showToast) {
        window.App.showToast(`✓ Yedekleme Tamamlandı: ${institutions.length} Kurum, ${totalStudents} Talebe, ${totalExams} Sınav ve ${totalResults} Okuma buluta aktarıldı.`, 'success');
      }

      return true;
    } catch (e) {
      console.error('Buluta veri yükleme hatası:', e);
      this.handleFirestoreError(e, 'Buluta yükleme başarısız');
      return false;
    }
  },

  // Bekleyen verileri eşitle
  syncPendingData() {
    if (this.isInitialized && navigator.onLine) {
      this.pullAllFromCloud();
    }
  },

  // Yapılandırma Kaydetme
  saveConfigFromInput(inputStr) {
    if (!inputStr || typeof inputStr !== 'string') return false;

    let clean = inputStr.trim();
    let configObj = null;

    if (clean.startsWith('{') && clean.endsWith('}')) {
      try {
        configObj = JSON.parse(clean);
      } catch (e) {}
    }

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
    this.lastError = null;
    this.updateStatusBadge();
  }
};
