/**
 * app.js - Çoklu Kurum Optik Sınav Platformu Ana Kontrolörü
 */

window.App = {
  currentTab: 'login',
  activeExamId: null,
  activeScanResult: null,
  activePhotoResult: null,
  activePhotoBatchResults: [],
  isProcessingPhoto: false,
  _pasteListenerAttached: false,
  currentTheme: 'dark',

  init() {
    try {
      this.initTheme();
    } catch (e) {
      console.warn('initTheme hatası:', e);
    }

    try {
      this.initPasteListener();
    } catch (e) {
      console.warn('initPasteListener hatası:', e);
    }

    try {
      if (window.PortalStore && typeof window.PortalStore.recalculateAllStoredResults === 'function') {
        window.PortalStore.recalculateAllStoredResults();
      }
    } catch (e) {
      console.warn('Geçmiş sınav sonuçları otomatik puanlama güncellemesi:', e);
    }

    try {
      const session = window.PortalStore ? window.PortalStore.getCurrentSession() : null;
      if (session) {
        if (session.role === 'superadmin') {
          this.currentTab = 'kurumlar';
        } else {
          this.currentTab = 'sinavlar';
        }
      } else {
        this.currentTab = 'login';
      }
    } catch (e) {
      console.warn('Oturum okuma hatası:', e);
      this.currentTab = 'login';
    }

    if (window.CloudSync && typeof window.CloudSync.init === 'function') {
      try {
        window.CloudSync.init();
      } catch (e) {
        console.warn('Bulut başlatma hatası:', e);
      }
    }

    this.render();
  },

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      info: 'bg-slate-800 text-white',
      warning: 'bg-amber-600 text-white'
    };
    toast.className = `fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-bold transition-all transform duration-300 translate-y-0 opacity-100 ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')}</span><span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  handleLogin(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!window.PortalStore) {
      this.showToast('Veri ambarı (store.js) hazırlanıyor, lütfen sayfayı yenileyiniz (Ctrl + F5).', 'warning');
      return;
    }
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const res = window.PortalStore.login(u, p);
    if (res.success) {
      this.showToast('Giriş başarılı! Hoş geldiniz.', 'success');
      if (res.session.role === 'superadmin') {
        this.currentTab = 'kurumlar';
      } else {
        this.currentTab = 'sinavlar';
      }
      this.render();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  quickLogin(username, password) {
    const uInput = document.getElementById('login-username');
    const pInput = document.getElementById('login-password');
    if (uInput) uInput.value = username;
    if (pInput) pInput.value = password;
    this.handleLogin({ preventDefault: () => {} });
  },

  togglePasswordVisibility(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (btn) btn.textContent = '🙈';
    } else {
      input.type = 'password';
      if (btn) btn.textContent = '👁️';
    }
  },

  handleLogout() {
    window.PortalStore.logout();
    this.currentTab = 'login';
    this.showToast('Çıkış yapıldı.', 'info');
    this.render();
  },

  switchTab(tabName) {
    if (this.currentTab === 'kamera_tara' && tabName !== 'kamera_tara') {
      if (window.OmrScanner && typeof window.OmrScanner.stopContinuousScanning === 'function') {
        window.OmrScanner.stopContinuousScanning();
      }
      window.OmrScanner.stopCamera();
    }
    this.currentTab = tabName;
    this.render();
  },

  // Süper Yöneticinin bir kuruma tek tıkla geçiş yapması
  impersonateInstitution(instId) {
    const inst = window.PortalStore.getInstitutions().find(i => i.id === instId);
    if (!inst) return;
    const session = {
      role: 'institution',
      userId: inst.id,
      name: inst.adminName || inst.name,
      institutionId: inst.id,
      institutionName: inst.name,
      isImpersonating: true
    };
    window.PortalStore.setSession(session, false);
    this.currentTab = 'sinavlar';
    this.showToast(`${inst.name} paneline geçiş yapıldı.`, 'success');
    this.render();
  },

  // Kurumdan Süper Yönetici Paneline Geri Dönüş
  returnToSuperAdmin() {
    const session = {
      role: 'superadmin',
      userId: 'super_admin',
      name: 'Sistem Ana Yöneticisi',
      institutionId: null,
      institutionName: 'Tüm Kurumlar (Merkez)'
    };
    window.PortalStore.setSession(session, true);
    this.currentTab = 'kurumlar';
    this.showToast('Ana Yönetici paneline dönüldü.', 'info');
    this.render();
  },

  render() {
    try {
      const session = window.PortalStore ? window.PortalStore.getCurrentSession() : null;
      const appContainer = document.getElementById('app-root');
      if (!appContainer) return;

      if (!session || this.currentTab === 'login') {
        appContainer.innerHTML = this.renderLoginView();
        if (window.CloudSync && typeof window.CloudSync.updateStatusBadge === 'function') {
          window.CloudSync.updateStatusBadge();
        }
        return;
      }

      appContainer.innerHTML = `
        <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans w-full max-w-full overflow-x-hidden">
          ${this.renderHeader(session)}
          <main class="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-6 min-w-0 overflow-x-hidden">
            ${this.renderTabContent(session)}
          </main>
          ${this.renderFooter()}
        </div>
      `;

      // Sekmeye özel başlatıcılar
      if (this.currentTab === 'kamera_tara') {
        this.initCameraScanner();
      }

      if (window.CloudSync && typeof window.CloudSync.updateStatusBadge === 'function') {
        window.CloudSync.updateStatusBadge();
      }
    } catch (err) {
      console.error('App render hatası:', err);
      const appContainer = document.getElementById('app-root');
      if (appContainer) {
        this.currentTab = 'login';
        try {
          appContainer.innerHTML = this.renderLoginView();
        } catch (e) {}
      }
    }
  },

  renderHeader(session) {
    const isSuper = session.role === 'superadmin';
    return `
      <header class="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl w-full max-w-full">
        <div class="max-w-7xl mx-auto px-2.5 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 min-w-0">
          <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-base sm:text-xl shadow-lg shadow-emerald-500/20 flex-shrink-0">
              📸
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 sm:gap-2">
                <h1 class="text-xs sm:text-base font-black tracking-tight text-white truncate">Optik Sınav Portalı</h1>
                <span class="px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase whitespace-nowrap flex-shrink-0 ${isSuper ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}">
                  ${isSuper ? 'Ana Yönetici' : 'Kurs'}
                </span>
              </div>
              <p class="text-[10px] sm:text-xs text-slate-400 font-medium truncate">${session.institutionName}</p>
            </div>
          </div>

          <div class="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <!-- Tema Değiştir Butonu -->
            <button onclick="App.showThemeModal()" title="Görünüm ve Tema Seçimi" class="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1 bg-slate-800 text-slate-300 border-slate-700 hover:text-white cursor-pointer">
              <span>🎨</span>
              <span class="hidden md:inline">Tema</span>
            </button>

            <!-- Şifre Değiştir Butonu -->
            <button onclick="App.showChangePasswordModal()" title="Şifre Değiştir" class="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1 bg-slate-800 text-amber-300 border-slate-700 hover:text-amber-200 cursor-pointer">
              <span>🔑</span>
              <span class="hidden md:inline">Şifre</span>
            </button>

            <!-- Bulut Senkronizasyon Rozeti -->
            <button id="cloud-sync-badge" onclick="App.showCloudSyncModal()" title="Bulut Senkronizasyon Ayarları" class="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1 bg-slate-800 text-slate-300 border-slate-700">
              <span class="w-2 h-2 rounded-full bg-slate-400"></span>
              <span class="hidden md:inline">Bulut</span>
            </button>

            ${session.isImpersonating ? `
              <button onclick="App.returnToSuperAdmin()" class="px-2 sm:px-3 py-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1">
                <span>👑</span> <span class="hidden sm:inline">Merkez</span>
              </button>
            ` : ''}
            <button onclick="App.handleLogout()" class="px-2 sm:px-3 py-1.5 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 text-slate-300 border border-slate-700 hover:border-rose-800 rounded-xl text-xs font-bold transition flex items-center gap-1" title="Çıkış Yap">
              <span class="hidden sm:inline">Çıkış</span> <span>🚪</span>
            </button>
          </div>
        </div>

        <!-- Sekme Menüsü: Mobilde Taşma Yapmayan Akıcı Kaydırma -->
        <div class="w-full border-t border-slate-800/80 overflow-hidden">
          <nav class="max-w-7xl mx-auto px-2 sm:px-4 flex gap-1 sm:gap-2 overflow-x-auto pt-1 pb-1 whitespace-nowrap" style="-webkit-overflow-scrolling: touch;">
            ${isSuper ? `
              <button onclick="App.switchTab('kurumlar')" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 ${this.currentTab === 'kurumlar' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
                🏢 Kurs & Okul Yönetimi
              </button>
              <button onclick="App.switchTab('ortak_sinavlar')" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 ${this.currentTab === 'ortak_sinavlar' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
                🌐 Merkezi Ortak Sınavlar
              </button>
              <button onclick="App.switchTab('istatistikler')" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 ${this.currentTab === 'istatistikler' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
                📊 Sistem İstatistikleri
              </button>
              <button onclick="App.impersonateInstitution('inst_oay'); setTimeout(() => App.switchTab('kamera_tara'), 50);" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 cursor-pointer" title="Doğrudan Mobil Canlı Kamera Okumasını Başlat">
                <span>📱</span> <span>Kamera ile Oku</span>
              </button>
              <button onclick="App.impersonateInstitution('inst_oay'); setTimeout(() => App.switchTab('foto_tara'), 50);" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1.5 text-teal-400 hover:text-teal-300 border border-teal-500/30 bg-teal-500/10 cursor-pointer" title="Fotoğraf Çek veya Yükle ile Oku">
                <span>📷</span> <span>Fotoğraf ile Oku</span>
              </button>
            ` : `
              <button onclick="App.switchTab('sinavlar')" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1.5 ${this.currentTab === 'sinavlar' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
                <span>📝</span> <span>Sınavlar</span>
              </button>
              <button onclick="App.switchTab('ogrenciler')" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1.5 ${this.currentTab === 'ogrenciler' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
                <span>👥</span> <span>Talebeler</span>
              </button>
              <button onclick="App.switchTab('optik_yazdir')" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1.5 ${this.currentTab === 'optik_yazdir' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
                <span>🖨️</span> <span>Optik Form Yazdır</span>
              </button>
              <button onclick="App.switchTab('kamera_tara')" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1.5 ${this.currentTab === 'kamera_tara' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
                <span>📱</span> <span>Kamera ile Oku</span>
              </button>
              <button onclick="App.switchTab('foto_tara')" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1.5 ${this.currentTab === 'foto_tara' ? 'bg-teal-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
                <span>📷</span> <span>Fotoğraf ile Oku</span>
              </button>
              <button onclick="App.switchTab('neticeler')" class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1.5 ${this.currentTab === 'neticeler' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
                <span>🏆</span> <span>Neticeler & Sıralama</span>
              </button>
            `}
          </nav>
        </div>
      </header>
    `;
  },

  renderTabContent(session) {
    if (session.role === 'superadmin') {
      if (this.currentTab === 'kurumlar') return this.renderSuperInstitutions();
      if (this.currentTab === 'ortak_sinavlar') return this.renderSuperGlobalExams();
      if (this.currentTab === 'istatistikler') return this.renderSuperStats();
      if (this.currentTab === 'foto_tara') return this.renderPhotoScannerView(session.institutionId || 'inst_oay');
      if (this.currentTab === 'kamera_tara') return this.renderCameraScannerView(session.institutionId || 'inst_oay');
    } else {
      if (this.currentTab === 'sinavlar') return this.renderExamsView(session.institutionId);
      if (this.currentTab === 'ogrenciler') return this.renderStudentsView(session.institutionId);
      if (this.currentTab === 'optik_yazdir') return this.renderOpticalPrintView(session.institutionId);
      if (this.currentTab === 'kamera_tara') return this.renderCameraScannerView(session.institutionId);
      if (this.currentTab === 'foto_tara') return this.renderPhotoScannerView(session.institutionId);
      if (this.currentTab === 'neticeler') return this.renderResultsView(session.institutionId);
    }
    return '';
  },

  // 1. GİRİŞ EKRANI (Login)
  renderLoginView() {
    return `
      <div class="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-7 sm:p-9 max-w-md w-full shadow-2xl relative overflow-hidden">
          <div class="absolute top-4 right-4 flex items-center gap-1.5">
            <button onclick="App.showThemeModal()" title="Görünüm ve Tema Seçimi" class="px-2 py-1 rounded-xl text-[11px] font-bold border transition flex items-center gap-1 bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white cursor-pointer">
              <span>🎨</span>
            </button>
            <button id="cloud-sync-badge" onclick="App.showCloudSyncModal()" title="Bulut Senkronizasyon Ayarları" class="px-2.5 py-1 rounded-xl text-[11px] font-bold border transition flex items-center gap-1.5 bg-slate-800/80 text-slate-300 border-slate-700">
              <span class="w-2 h-2 rounded-full bg-slate-400"></span>
              <span>Bulut</span>
            </button>
          </div>
          <div class="text-center mb-6">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg shadow-emerald-500/20">
              📸
            </div>
            <h2 class="text-2xl font-black tracking-tight text-white">Optik Sınav Portalı</h2>
            <p class="text-xs text-slate-400 mt-1 font-medium">Çoklu Kurum Deneme Sınavı & Kamera ile Hızlı Okuma</p>
          </div>

          <form onsubmit="App.handleLogin(event)" class="space-y-4">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Kullanıcı Adı</label>
              <input type="text" id="login-username" required placeholder="Kullanıcı adınızı giriniz"
                autocapitalize="none" autocorrect="off" autocomplete="username" spellcheck="false"
                class="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:border-emerald-500 focus:outline-none transition">
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-400">Şifre</label>
                <button type="button" id="toggle-pass-btn" onclick="App.togglePasswordVisibility('login-password', 'toggle-pass-btn')" class="text-xs text-slate-400 hover:text-white transition">
                  👁️ Göster
                </button>
              </div>
              <input type="password" id="login-password" required placeholder="••••••••"
                autocapitalize="none" autocorrect="off" autocomplete="current-password"
                class="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:border-emerald-500 focus:outline-none transition">
            </div>

            <button type="submit"
              class="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer">
              <span>Giriş Yap</span>
              <span>→</span>
            </button>
          </form>
        </div>
      </div>
    `;
  },

  // 2. SÜPER YÖNETİCİ: KURUM YÖNETİMİ
  renderSuperInstitutions() {
    const list = window.PortalStore.getInstitutions();
    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-lg w-full max-w-full">
          <div>
            <h2 class="text-xl font-black text-white tracking-tight">Kayıtlı Kurs & Okullar</h2>
            <p class="text-xs text-slate-400 mt-0.5">Sistemi kullanan tüm kurumları buradan açabilir, yönetebilir ve panellerine doğrudan geçebilirsiniz.</p>
          </div>
          <button onclick="App.showAddInstitutionModal()" class="w-full sm:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer">
            <span>+</span> <span>Yeni Kurs / Okul Ekle</span>
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${list.map(inst => {
            const studentCount = window.PortalStore.getStudents(inst.id).length;
            const examCount = window.PortalStore.getExams(inst.id).length;
            return `
              <div class="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition">
                <div>
                  <div class="flex items-start justify-between mb-3">
                    <div class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-lg">
                      🏢
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${inst.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}">
                      ${inst.status === 'active' ? 'Aktif' : 'Donduruldu'}
                    </span>
                  </div>

                  <h3 class="text-base font-black text-white leading-snug">${inst.name}</h3>
                  <p class="text-xs text-slate-400 mt-1">📍 ${inst.city || '-'}</p>
                  <p class="text-xs text-slate-400">👤 Yetkili: ${inst.adminName || '-'}</p>

                  <div class="grid grid-cols-2 gap-2 my-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-center">
                    <div>
                      <span class="block text-[10px] text-slate-500 font-bold uppercase">Talebeler</span>
                      <span class="text-sm font-black text-white">${studentCount}</span>
                    </div>
                    <div>
                      <span class="block text-[10px] text-slate-500 font-bold uppercase">Sınavlar</span>
                      <span class="text-sm font-black text-white">${examCount}</span>
                    </div>
                  </div>

                  <div class="text-[11px] font-mono text-slate-400 space-y-0.5">
                    <div>Kullanıcı: <strong class="text-slate-200">${inst.username}</strong></div>
                    <div>Şifre: <strong class="text-slate-200">${inst.password}</strong></div>
                  </div>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                  <button onclick="App.impersonateInstitution('${inst.id}')" class="flex-1 py-2 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 font-bold text-xs rounded-xl border border-emerald-500/40 transition">
                    Panele Gir →
                  </button>
                  <button onclick="App.showResetInstPasswordModal('${inst.id}')" class="p-2 text-amber-300 hover:bg-amber-950/40 rounded-xl transition cursor-pointer" title="Kurum Şifresini Değiştir">
                    🔑
                  </button>
                  <button onclick="App.deleteInstitutionPrompt('${inst.id}', '${inst.name}')" class="p-2 text-rose-400 hover:bg-rose-950/40 rounded-xl transition" title="Sil">
                    🗑️
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  showAddInstitutionModal() {
    const name = prompt('Kurs / Okul Adı:');
    if (!name) return;
    const city = prompt('İl / İlçe:', 'İstanbul / Fatih');
    const adminName = prompt('Kurum Sorumlusu Adı:', 'Müdür');
    const username = prompt('Kullanıcı Adı (Giriş için):', name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const password = prompt('Giriş Şifresi:', '123');

    window.PortalStore.addInstitution({ name, city, adminName, username, password });
    this.showToast('Yeni kurum başarıyla eklendi!', 'success');
    this.render();
  },

  deleteInstitutionPrompt(id, name) {
    if (confirm(`"${name}" kurumunu ve tüm sınav/öğrenci verilerini silmek istediğinize emin misiniz?`)) {
      window.PortalStore.deleteInstitution(id);
      this.showToast('Kurum silindi.', 'info');
      this.render();
    }
  },

  // 3. SÜPER YÖNETİCİ: İSTATİSTİKLER
  renderSuperStats() {
    const institutions = window.PortalStore.getInstitutions();
    let totalStudents = 0;
    let totalExams = 0;
    let totalResults = 0;

    institutions.forEach(i => {
      totalStudents += window.PortalStore.getStudents(i.id).length;
      totalExams += window.PortalStore.getExams(i.id).length;
      totalResults += window.PortalStore.getAllResults(i.id).length;
    });

    return `
      <div class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg text-center">
            <span class="text-2xl mb-1 block">🏢</span>
            <span class="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">${institutions.length}</span>
            <span class="block text-xs font-bold text-slate-400 uppercase mt-1">Aktif Kurum</span>
          </div>
          <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg text-center">
            <span class="text-2xl mb-1 block">👥</span>
            <span class="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">${totalStudents}</span>
            <span class="block text-xs font-bold text-slate-400 uppercase mt-1">Kayıtlı Talebe</span>
          </div>
          <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg text-center">
            <span class="text-2xl mb-1 block">📝</span>
            <span class="text-2xl sm:text-3xl font-black text-amber-400 font-mono">${totalExams}</span>
            <span class="block text-xs font-bold text-slate-400 uppercase mt-1">Açılan Sınav</span>
          </div>
          <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg text-center">
            <span class="text-2xl mb-1 block">📸</span>
            <span class="text-2xl sm:text-3xl font-black text-purple-400 font-mono">${totalResults}</span>
            <span class="block text-xs font-bold text-slate-400 uppercase mt-1">Okunan Optik Kağıt</span>
          </div>
        </div>
      </div>
    `;
  },

  // 4. KURS PANELİ: SINAVLAR
  renderExamsView(instId) {
    const exams = window.PortalStore.getExams(instId);
    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-lg w-full max-w-full">
          <div>
            <h2 class="text-xl font-black text-white tracking-tight">Deneme Sınavları</h2>
            <p class="text-xs text-slate-400 mt-0.5">Sınav tanımlayabilir, optik form basabilir veya kamerayla okumaya geçebilirsiniz.</p>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <button onclick="App.showImportTxtResultsModal('${instId}')" class="flex-1 sm:flex-initial px-3.5 py-2.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-xs rounded-xl border border-indigo-500/40 shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer" title="FMT Format Şablonu ve Optik TXT / DAT Yükle">
              <span>📄</span> <span>FMT / TXT Yükle</span>
            </button>
            <button onclick="App.showCreateExamModal('${instId}')" class="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer">
              <span>+</span> <span>Yeni Deneme Sınavı Oluştur</span>
            </button>
          </div>
        </div>

        ${exams.length === 0 ? `
          <div class="bg-slate-900 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
            <span class="text-4xl block mb-2">📝</span>
            <h3 class="text-base font-bold text-white">Henüz Sınav Tanımlanmadı</h3>
            <p class="text-xs text-slate-400 mt-1 mb-4">Yukarıdaki butona tıklayarak ilk deneme sınavınızı hemen oluşturabilirsiniz.</p>
            <button onclick="App.showCreateExamModal('${instId}')" class="px-4 py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl">
              Hemen Sınav Ekle
            </button>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${exams.map(exam => {
              const resCount = window.PortalStore.getResultsByExam(instId, exam.id).length;
              const isGlob = !!exam.isGlobal;
              return `
                <div class="${isGlob ? 'bg-gradient-to-b from-slate-900 to-cyan-950/30 border-2 border-cyan-500/50 shadow-cyan-500/10' : 'bg-slate-900 border border-slate-800'} rounded-2xl p-5 shadow-lg flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between text-xs text-slate-400 mb-2">
                      ${isGlob ? `
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">🌐 Merkezi Ortak Sınav</span>
                      ` : `
                        <span>📅 ${exam.examDate}</span>
                      `}
                      <span class="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-bold">${exam.questionCount} Soru</span>
                    </div>
                    <h3 class="text-base font-black text-white mb-1">${exam.title}</h3>
                    <p class="text-xs text-slate-400">Hedef: <strong class="text-slate-200">${exam.targetClass}</strong></p>
                    <div class="mt-3 p-2 bg-slate-950 rounded-xl border border-slate-800 text-xs flex justify-between">
                      <span class="text-slate-400">Okunan Form:</span>
                      <span class="font-bold text-emerald-400">${resCount} Talebe</span>
                    </div>
                  </div>

                  <div class="mt-4 pt-3 border-t border-slate-800/80 flex flex-col gap-2">
                    <div class="flex gap-2">
                      <button onclick="App.startScanForExam('${instId}', '${exam.id}')" class="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1" title="Canlı Kamerayla Oku">
                        <span>📱</span> <span>Kamerayla</span>
                      </button>
                      <button onclick="App.startPhotoScanForExam('${instId}', '${exam.id}')" class="flex-1 py-2 bg-teal-500 hover:bg-teal-600 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1" title="Fotoğraf Çek veya Yükle ile Oku">
                        <span>📷</span> <span>Fotoğrafla</span>
                      </button>
                      <button onclick="App.showImportTxtResultsModal('${instId}', '${exam.id}')" class="px-2.5 py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-xs rounded-xl border border-indigo-500/40 transition" title="Optik Okuyucu TXT / DAT Dosyası Yükle">
                        📄
                      </button>
                      <button onclick="App.showManualResultModal('${instId}', '${exam.id}')" class="px-2.5 py-2 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white font-bold text-xs rounded-xl border border-cyan-500/40 transition" title="Elle Not / Cevap Gir">
                        ✍️
                      </button>
                      <button onclick="App.printExamSheets('${instId}', '${exam.id}')" class="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition" title="Optik Form Yazdır">
                        🖨️
                      </button>
                    </div>
                    <div class="flex gap-2">
                      <button onclick="App.viewExamResults('${instId}', '${exam.id}')" class="flex-1 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-bold text-xs rounded-xl transition text-center">
                        🏆 Neticeler
                      </button>
                      <button onclick="App.showItemAnalysisModal('${instId}', '${exam.id}', ${isGlob})" class="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl transition" title="Soru & Madde Analizi">
                        📊
                      </button>
                      <button onclick="App.showEditExamModal('${instId}', '${exam.id}', ${isGlob})" class="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-emerald-300 font-bold text-xs rounded-xl transition" title="Sınavı Düzenle & Soru İptali">
                        ✏️
                      </button>
                      ${!isGlob ? `
                        <button onclick="App.deleteExamPrompt('${instId}', '${exam.id}', '${exam.title}')" class="px-2 py-1.5 text-rose-400 hover:bg-rose-950/40 rounded-xl transition" title="Sınavı Sil">
                          🗑️
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  },

  showCreateExamModal(instId, isGlobal = false) {
    const existing = document.getElementById('create-exam-modal');
    if (existing) existing.remove();

    const templates = window.PortalStore.getTemplates();
    const students = instId ? window.PortalStore.getStudents(instId) : [];
    const existingClasses = Array.from(new Set(students.map(s => (s.className || '').trim()).filter(Boolean))).sort();

    const modal = document.createElement('div');
    modal.id = 'create-exam-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-2xl w-full shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">${isGlobal ? '🌐' : '📝'}</span>
            <div>
              <h3 class="text-base font-black text-white">${isGlobal ? 'Merkezi Ortak Deneme Sınavı Oluştur' : 'Yeni Deneme Sınavı Oluştur'}</h3>
              <p class="text-xs text-slate-400 font-medium">${isGlobal ? 'Tüm kursların katılabileceği genel ortak sınav' : 'Kurumunuza özel deneme sınavı'}</p>
            </div>
          </div>
          <button onclick="document.getElementById('create-exam-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <form onsubmit="App.handleSaveExamForm(event, '${instId || ''}', ${isGlobal})" class="space-y-4">
          <!-- Hazır Şablon Seçimi -->
          <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <label class="block text-[11px] font-bold uppercase text-emerald-400 mb-1">⚡ Hazır Sınav Formatı / Şablonu Seçiniz</label>
            <select id="exam-template-select" onchange="App.handleTemplateChange(this.value)" class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
              ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
              <option value="custom">Özel Ders Dağılımı (Serbest Tanımlama)</option>
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="sm:col-span-2">
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Sınav Adı / Başlığı</label>
              <input type="text" id="exam-form-title" required placeholder="Örn: 8. Sınıf LGS 1. Prova Denemesi" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Sınav Tarihi</label>
              <input type="date" id="exam-form-date" value="${new Date().toISOString().split('T')[0]}" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Toplam Soru Sayısı</label>
              <input type="number" id="exam-form-qcount" min="1" max="300" value="90" readonly class="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-emerald-400 font-black text-xs focus:outline-none cursor-default" title="Ders soru sayılarına göre otomatik hesaplanır">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">📖 Kitapçık Sayısı</label>
              <select id="exam-form-booklet-count" onchange="App.handleBookletCountChange('create', this.value)" class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
                <option value="1">1 Kitapçık (Yalnızca A)</option>
                <option value="2">2 Kitapçık (A, B)</option>
                <option value="3">3 Kitapçık (A, B, C)</option>
                <option value="4" selected>4 Kitapçık (A, B, C, D)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">🎯 Hedef Sınıf / Şube</label>
              <select id="exam-form-target" onchange="App.handleTargetClassSelectChange(this, 'exam-form-target-custom')" class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
                ${existingClasses.length > 0 ? `
                  <optgroup label="🏫 Kurumdaki Talebe Şubeleri">
                    ${existingClasses.map(c => `<option value="${c}">${c} Şubesi</option>`).join('')}
                  </optgroup>
                ` : ''}
                <optgroup label="📚 Standart Sınıflar">
                  <option value="8. Sınıf" selected>8. Sınıf (LGS)</option>
                  <option value="7. Sınıf">7. Sınıf</option>
                  <option value="6. Sınıf">6. Sınıf</option>
                  <option value="5. Sınıf">5. Sınıf</option>
                  <option value="Tüm Şubeler">Tüm Şubeler</option>
                </optgroup>
                <option value="custom">✍️ Diğer / Yeni Şube Yaz...</option>
              </select>
              <input type="text" id="exam-form-target-custom" placeholder="Örn: 8-C veya Seviye 1" class="hidden mt-1.5 w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
          </div>

          <!-- Dersler ve Katsayılar Tablosu -->
          <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
              <div>
                <label class="text-xs font-bold uppercase text-slate-300">📚 Ders Bölümleri & Soru Sayıları</label>
                <p class="text-[10px] text-slate-400">Derslerin soru sayılarını ve katsayılarını düzenleyin. <strong>Taban 200 • Tavan 500</strong> puan standardına göre net katsayılarını otomatik veya elle belirleyebilirsiniz.</p>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" onclick="App.autoDistributeCoefficients('subject-rows-container')" class="px-2.5 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 text-[11px] font-bold rounded-lg border border-amber-500/40 transition cursor-pointer flex items-center gap-1 shadow-sm" title="Tüm derslerin katsayılarını Taban 200 - Tavan 500 standardına göre otomatik hesaplar ve kutulara yazar">
                  <span>⚡</span> <span>Otomatik Katsayı Ver</span>
                </button>
                <button type="button" onclick="App.addSubjectRow('subject-rows-container')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-bold rounded-lg border border-slate-700 transition cursor-pointer">
                  + Ders Ekle
                </button>
              </div>
            </div>

            <div class="overflow-x-auto w-full max-w-full" style="-webkit-overflow-scrolling: touch;">
              <table class="w-full text-left text-[11px] min-w-[500px]">
                <thead class="text-slate-500 uppercase border-b border-slate-800 font-bold">
                  <tr>
                    <th class="p-1.5">Ders Adı</th>
                    <th class="p-1.5 text-center">Soru Sayısı</th>
                    <th class="p-1.5 text-center">Aralık</th>
                    <th class="p-1.5 text-center">Ceza (Yanlış Götürme)</th>
                    <th class="p-1.5 text-center" title="1 Net başına düşen puan katsayısı. Elle değiştirebilir veya Otomatik Katsayı Ver butonuna basabilirsiniz.">Net Katsayısı (Elle Düzenlenebilir)</th>
                    <th class="p-1.5 text-right">Sil</th>
                  </tr>
                </thead>
                <tbody id="subject-rows-container" class="divide-y divide-slate-800/60">
                  <!-- Dinamik Ders Satırları Buraya Eklenir -->
                </tbody>
              </table>
            </div>

            <!-- Canlı Katsayı ve Toplam Puan Önizleme Rozeti -->
            <div id="subject-rows-container-preview" class="p-2.5 bg-slate-900/90 border border-slate-800/80 rounded-xl"></div>
          </div>

          <!-- 4 Kitapçık (A, B, C, D) Ders Ders Cevap Anahtarları -->
          <div class="space-y-3 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div>
                <label class="text-xs font-black text-white uppercase flex items-center gap-1.5">
                  <span>🔑</span> <span>Ders Ders Cevap Anahtarları</span>
                </label>
                <p class="text-[10px] text-slate-400">Her dersin doğru cevaplarını ilgili ders kutusuna sırasıyla yazınız.</p>
              </div>
              <div class="flex items-center gap-1" id="booklet-tab-buttons">
                <button type="button" onclick="App.switchBookletTab('A')" id="btn-tab-A" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 transition">Kitapçık A</button>
                <button type="button" onclick="App.switchBookletTab('B')" id="btn-tab-B" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık B</button>
                <button type="button" onclick="App.switchBookletTab('C')" id="btn-tab-C" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık C</button>
                <button type="button" onclick="App.switchBookletTab('D')" id="btn-tab-D" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık D</button>
              </div>
            </div>

            <div id="create-booklet-pane-A" class="create-booklet-pane space-y-2"></div>
            <div id="create-booklet-pane-B" class="create-booklet-pane space-y-2 hidden"></div>
            <div id="create-booklet-pane-C" class="create-booklet-pane space-y-2 hidden"></div>
            <div id="create-booklet-pane-D" class="create-booklet-pane space-y-2 hidden"></div>
          </div>

          <!-- Soru Konu ve Kazanımları (Seçmeli Havuz) -->
          <div class="space-y-3 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div>
                <label class="text-xs font-black text-white uppercase flex items-center gap-1.5">
                  <span>🎯</span> <span>Soru Konu & Kazanımları (Seçmeli)</span>
                </label>
                <p class="text-[10px] text-slate-400">Her soru için açılır listeden konu seçiniz. Karnelerde konu başarı grafiği üretilir.</p>
              </div>
              <button type="button" onclick="App.toggleQuestionTopicsPanel('create')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition cursor-pointer flex items-center gap-1">
                <span id="btn-toggle-topics-create">Konuları Düzenle ▼</span>
              </button>
            </div>

            <div id="create-topics-container" class="space-y-3">
              <!-- JS ile render edilecek -->
            </div>
          </div>

          <div class="pt-2">
            <button type="submit" class="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer">
              <span>✓</span> <span>Sınavı Kaydet & Başlat</span>
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    this.handleTemplateChange('tpl_lgs_90');
  },

  handleTargetClassSelectChange(selectElem, customInputId) {
    const customInput = document.getElementById(customInputId);
    if (!customInput) return;
    if (selectElem.value === 'custom') {
      customInput.classList.remove('hidden');
      customInput.focus();
    } else {
      customInput.classList.add('hidden');
    }
  },

  // Sınav Şablonu Seçildiğinde Alanları Otomatik Doldur
  handleTemplateChange(tplId) {
    const templates = window.PortalStore.getTemplates();
    const tpl = templates.find(t => t.id === tplId);
    const titleInput = document.getElementById('exam-form-title');
    const qCountInput = document.getElementById('exam-form-qcount');
    const targetSelect = document.getElementById('exam-form-target');
    const targetCustom = document.getElementById('exam-form-target-custom');

    if (tpl) {
      if (titleInput && (!titleInput.value || titleInput.value.includes('Deneme') || titleInput.value.includes('Prova') || titleInput.value.includes('Sınav'))) {
        titleInput.value = tpl.name;
      }
      if (qCountInput) {
        qCountInput.value = tpl.questionCount;
      }
      if (targetSelect) {
        if (targetCustom) targetCustom.classList.add('hidden');
        if (tpl.id.includes('lgs') || tpl.id.includes('ortaokul')) {
          if (targetSelect.querySelector('option[value="8. Sınıf"]')) {
            targetSelect.value = '8. Sınıf';
          }
        } else if (tpl.id.includes('tyt')) {
          if (targetCustom) {
            targetSelect.value = 'custom';
            targetCustom.classList.remove('hidden');
            targetCustom.value = '12. Sınıf / Mezun';
          }
        }
      }
      const bCountSelect = document.getElementById('exam-form-booklet-count');
      if (bCountSelect && tpl.bookletTypes) {
        bCountSelect.value = tpl.bookletTypes.length.toString();
        this.handleBookletCountChange('create', tpl.bookletTypes.length);
      }
      this.renderSubjectRows(tpl.subjects || [], 'subject-rows-container');
      this.handleExamQCountChange(tpl.questionCount.toString());
      this.renderQuestionTopics('create', tpl.subjects || [], {});
    } else {
      // Özel şablon
      const currentQ = qCountInput ? parseInt(qCountInput.value, 10) || 20 : 20;
      const defaultSubs = [
        { name: 'Bölüm 1', startQ: 1, endQ: currentQ, wrongPenalty: 0.333, coeff: 1 }
      ];
      this.renderSubjectRows(defaultSubs, 'subject-rows-container');
      this.renderQuestionTopics('create', defaultSubs, {});
    }
  },

  // Ders Satırlarını Tabloya Basma (İlk Soru - Son Soru yerine sadece Soru Sayısı)
  renderSubjectRows(subjects, containerId = 'subject-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    let currentStart = 1;
    container.innerHTML = subjects.map((sub, idx) => {
      const qCount = (sub.endQ && sub.startQ) ? (sub.endQ - sub.startQ + 1) : (sub.questionCount || 20);
      const startQ = currentStart;
      const endQ = currentStart + qCount - 1;
      currentStart = endQ + 1;

      return `
        <tr class="subject-row" data-start="${startQ}" data-end="${endQ}">
          <td class="p-1.5">
            <input type="text" class="sub-name w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded font-bold text-white text-xs" value="${sub.name || 'Ders ' + (idx + 1)}">
          </td>
          <td class="p-1.5 text-center">
            <input type="number" min="1" max="150" class="sub-qcount w-16 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-emerald-400 font-black" value="${qCount}" oninput="App.recalcSubjectRanges('${containerId}')" onchange="App.recalcSubjectRanges('${containerId}')">
          </td>
          <td class="p-1.5 text-center">
            <span class="sub-range-badge text-[11px] font-mono text-slate-300 font-bold bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700/60">${startQ} - ${endQ}</span>
          </td>
          <td class="p-1.5 text-center">
            <select class="sub-penalty px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 font-medium">
              <option value="0.333" ${sub.wrongPenalty === 0.333 ? 'selected' : ''}>3 Yanlış 1 Doğru (0.33)</option>
              <option value="0.25" ${sub.wrongPenalty === 0.25 ? 'selected' : ''}>4 Yanlış 1 Doğru (0.25)</option>
              <option value="0" ${sub.wrongPenalty === 0 ? 'selected' : ''}>Ceza Yok (0.00)</option>
            </select>
          </td>
          <td class="p-1.5 text-center">
            <input type="number" step="0.0001" class="sub-coeff w-24 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-emerald-400 font-mono font-bold focus:border-amber-500 focus:outline-none" value="${sub.coeff !== undefined ? sub.coeff : 1}" oninput="App.updateLiveCoeffPreview('${containerId}')" title="1 Net puan katsayısı (Elle değiştirebilirsiniz)">
          </td>
          <td class="p-1.5 text-right">
            <button type="button" onclick="App.removeSubjectRow(this, '${containerId}')" class="p-1 text-rose-400 hover:text-rose-300 text-xs cursor-pointer">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

    this.recalcSubjectRanges(containerId);
    this.updateLiveCoeffPreview(containerId);
  },

  recalcSubjectRanges(containerId = 'subject-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const rows = container.querySelectorAll('.subject-row');
    let currentStart = 1;
    let totalCount = 0;

    rows.forEach(r => {
      const qInput = r.querySelector('.sub-qcount');
      const count = parseInt(qInput ? qInput.value : 0, 10) || 1;
      const endQ = currentStart + count - 1;

      r.dataset.start = currentStart;
      r.dataset.end = endQ;

      const badge = r.querySelector('.sub-range-badge');
      if (badge) {
        badge.textContent = `${currentStart} - ${endQ}`;
      }

      currentStart = endQ + 1;
      totalCount += count;
    });

    const isEdit = containerId.includes('edit');
    const totalInput = document.getElementById(isEdit ? 'edit-form-qcount' : 'exam-form-qcount');
    if (totalInput && totalCount > 0) {
      totalInput.value = totalCount;
    }

    this.updateLiveCoeffPreview(containerId);

    // Dersler değiştikçe veya soru sayıları güncellendikçe ders ders cevap anahtarı kutularını yenile
    const prefix = isEdit ? 'edit' : 'create';
    const subjects = this.collectSubjectsFromForm(containerId);
    if (subjects.length > 0) {
      const currentKeys = this.collectBookletKeysFromInputs(prefix, subjects, totalCount);
      this.renderBookletSubjectKeys(prefix, subjects, currentKeys);
      const currentTopics = this.collectQuestionTopicsFromInputs(prefix, subjects);
      this.renderQuestionTopics(prefix, subjects, currentTopics);
    }
  },

  addSubjectRow(containerId = 'subject-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tr = document.createElement('tr');
    tr.className = 'subject-row';
    tr.innerHTML = `
      <td class="p-1.5">
        <input type="text" class="sub-name w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded font-bold text-white text-xs" value="Yeni Ders">
      </td>
      <td class="p-1.5 text-center">
        <input type="number" min="1" max="150" class="sub-qcount w-16 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-emerald-400 font-black" value="10" oninput="App.recalcSubjectRanges('${containerId}')" onchange="App.recalcSubjectRanges('${containerId}')">
      </td>
      <td class="p-1.5 text-center">
        <span class="sub-range-badge text-[11px] font-mono text-slate-300 font-bold bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700/60">-</span>
      </td>
      <td class="p-1.5 text-center">
        <select class="sub-penalty px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 font-medium">
          <option value="0.333">3 Yanlış 1 Doğru (0.33)</option>
          <option value="0.25">4 Yanlış 1 Doğru (0.25)</option>
          <option value="0">Ceza Yok (0.00)</option>
        </select>
      </td>
      <td class="p-1.5 text-center">
        <input type="number" step="0.0001" class="sub-coeff w-24 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-emerald-400 font-mono font-bold focus:border-amber-500 focus:outline-none" value="1" oninput="App.updateLiveCoeffPreview('${containerId}')" title="1 Net puan katsayısı (Elle değiştirebilirsiniz)">
      </td>
      <td class="p-1.5 text-right">
        <button type="button" onclick="App.removeSubjectRow(this, '${containerId}')" class="p-1 text-rose-400 hover:text-rose-300 text-xs cursor-pointer">🗑️</button>
      </td>
    `;
    container.appendChild(tr);
    this.recalcSubjectRanges(containerId);
    this.updateLiveCoeffPreview(containerId);
  },

  removeSubjectRow(btn, containerId = 'subject-rows-container') {
    const row = btn.closest('.subject-row');
    if (row) {
      row.remove();
      this.recalcSubjectRanges(containerId);
      this.updateLiveCoeffPreview(containerId);
    }
  },

  // Otomatik Katsayı Dağıtım Motoru (Taban 200 - Tavan 500 Puan Standardı)
  autoDistributeCoefficients(containerId = 'subject-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const rows = container.querySelectorAll('.subject-row');
    if (rows.length === 0) return;

    let totalWeightedCapacity = 0;
    const rowData = [];

    rows.forEach(r => {
      const qInput = r.querySelector('.sub-qcount');
      const coeffInput = r.querySelector('.sub-coeff');
      const count = parseInt(qInput ? qInput.value : 0, 10) || 1;
      let rawW = parseFloat(coeffInput ? coeffInput.value : 1);
      if (isNaN(rawW) || rawW <= 0) rawW = 1;

      rowData.push({ row: r, count, coeffInput, rawW });
      totalWeightedCapacity += (count * rawW);
    });

    if (totalWeightedCapacity <= 0) return;

    const TARGET_SPAN = 300; // Taban 200 + Net 300 = 500 Tavan
    
    // Ders isimlerine göre standart LGS/Ortaokul ders ağırlığı tespiti
    // Türkçe, Matematik, Fen = 4 ağırlık birimi; İnkılap/Sosyal, Din, İngilizce = 1 ağırlık birimi
    let hasKnownLessonWeights = false;
    let standardUnits = 0;
    const standardWeights = [];

    rowData.forEach(item => {
      const nameInput = item.row.querySelector('.sub-name');
      const name = nameInput ? nameInput.value.toLowerCase() : '';
      let stdW = 1;
      if (name.includes('türk') || name.includes('mat') || name.includes('fen')) {
        stdW = 4;
        hasKnownLessonWeights = true;
      } else if (name.includes('sosyal') || name.includes('ink') || name.includes('tarih') || name.includes('din') || name.includes('ing') || name.includes('english')) {
        stdW = 1;
        hasKnownLessonWeights = true;
      } else {
        stdW = item.rawW;
      }
      standardWeights.push(stdW);
      standardUnits += (item.count * stdW);
    });

    const useStandardWeights = (hasKnownLessonWeights && standardUnits > 0);
    const scaleFactor = useStandardWeights ? (TARGET_SPAN / standardUnits) : (TARGET_SPAN / totalWeightedCapacity);

    rowData.forEach((item, idx) => {
      const baseW = useStandardWeights ? standardWeights[idx] : item.rawW;
      const exactCoeff = parseFloat((baseW * scaleFactor).toFixed(4));
      if (item.coeffInput) {
        item.coeffInput.value = exactCoeff;
      }
    });

    this.updateLiveCoeffPreview(containerId);
    this.showToast('Katsayılar Taban 200 • Tavan 500 standardına göre otomatik dağıtıldı!', 'success');
  },

  // Canlı Katsayı ve Toplam Puan Önizleme Rozeti
  updateLiveCoeffPreview(containerId = 'subject-rows-container') {
    const container = document.getElementById(containerId);
    const previewContainer = document.getElementById(`${containerId}-preview`);
    if (!container || !previewContainer) return;

    const rows = container.querySelectorAll('.subject-row');
    let totalQuestions = 0;
    let totalNetPoints = 0;

    rows.forEach(r => {
      const qInput = r.querySelector('.sub-qcount');
      const coeffInput = r.querySelector('.sub-coeff');
      const count = parseInt(qInput ? qInput.value : 0, 10) || 0;
      const coeff = parseFloat(coeffInput ? coeffInput.value : 0) || 0;
      totalQuestions += count;
      totalNetPoints += (count * coeff);
    });

    const baseScore = 200;
    const totalMaxScore = baseScore + totalNetPoints;
    const isExact500 = Math.abs(totalMaxScore - 500) < 0.5;

    previewContainer.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap text-slate-300">
        <span class="text-slate-400 font-bold">Özet:</span>
        <span class="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[11px] font-bold">Toplam Soru: <strong class="text-white">${totalQuestions}</strong></span>
        <span class="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[11px] font-bold">Taban: <strong class="text-amber-400">200.00</strong></span>
        <span class="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[11px] font-bold">Net Puan Kapasitesi: <strong class="text-cyan-400">${totalNetPoints.toFixed(2)}</strong></span>
        <span class="px-2.5 py-0.5 rounded text-[11px] font-black ${isExact500 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}">
          Tavan Puan: <strong>${totalMaxScore.toFixed(2)}</strong> / 500.00 ${isExact500 ? '✓' : ''}
        </span>
      </div>
      <div class="text-[10px] text-slate-400 mt-1 sm:mt-0 font-medium">
        ${isExact500 
          ? '<span class="text-emerald-400 font-bold">✓ Taban 200 • Tavan 500 standardı tam sağlandı.</span>' 
          : '<span class="text-amber-300 font-medium">💡 İpucu: Katsayıları elle düzenleyebilir veya <strong>⚡ Otomatik Katsayı Ver</strong> butonuna basabilirsiniz.</span>'}
      </div>
    `;
  },

  collectSubjectsFromForm(containerId = 'subject-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const rows = container.querySelectorAll('.subject-row');
    const subjects = [];
    let currentStart = 1;

    rows.forEach((r, idx) => {
      const name = (r.querySelector('.sub-name').value || ('Ders ' + (idx + 1))).trim();
      const qInput = r.querySelector('.sub-qcount');
      const count = parseInt(qInput ? qInput.value : 0, 10) || 1;
      const startQ = currentStart;
      const endQ = currentStart + count - 1;
      const wrongPenalty = parseFloat(r.querySelector('.sub-penalty').value) || 0;
      const coeff = parseFloat(r.querySelector('.sub-coeff').value) || 1;

      subjects.push({ name, startQ, endQ, wrongPenalty, coeff, questionCount: count });
      currentStart = endQ + 1;
    });

    return subjects;
  },

  // --- DERS DERS CEVAP ANAHTARI GİRİŞ MOTORU ---
  renderBookletSubjectKeys(prefix, subjects, existingAnswerKeys = {}) {
    if (!Array.isArray(subjects) || subjects.length === 0) return;

    ['A', 'B', 'C', 'D'].forEach(letter => {
      const container = document.getElementById(`${prefix}-booklet-pane-${letter}`);
      if (!container) return;

      const rawFullKey = (existingAnswerKeys && existingAnswerKeys[letter]) ? existingAnswerKeys[letter].toString().trim() : '';

      let totalExamQ = 0;
      let totalEnteredQ = 0;

      const subjectCardsHtml = subjects.map((sub, idx) => {
        const qCount = (sub.endQ && sub.startQ) ? (sub.endQ - sub.startQ + 1) : (sub.questionCount || 20);
        const startQ = sub.startQ || (totalExamQ + 1);
        const endQ = sub.endQ || (startQ + qCount - 1);
        totalExamQ += qCount;

        // Mevcut tam anahtardan bu dersin dilimini al
        let subKey = '';
        if (rawFullKey) {
          subKey = rawFullKey.substring(startQ - 1, endQ).toUpperCase();
        }

        totalEnteredQ += subKey.length;
        const isComplete = subKey.length === qCount;
        const badgeClass = isComplete 
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
          : (subKey.length > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700');

        return `
          <div class="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 p-2.5 rounded-xl transition">
            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${isComplete ? 'bg-emerald-400' : 'bg-amber-400'}"></span>
                <span class="text-xs font-bold text-white">${sub.name || ('Ders ' + (idx + 1))}</span>
                <span class="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                  ${startQ} - ${endQ} (${qCount} Soru)
                </span>
              </div>
              <div class="flex items-center gap-1.5">
                <span id="badge-key-${prefix}-${letter}-${idx}" class="text-[10px] font-mono font-bold px-2 py-0.5 rounded ${badgeClass}">
                  ${subKey.length} / ${qCount}${isComplete ? ' ✓' : ''}
                </span>
                <button type="button" onclick="App.openScanAnswerKeyModal('key-${prefix}-${letter}-${idx}', ${qCount})" title="Sadece bu dersin cevaplarını kameradan oku" class="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded-lg border border-cyan-800/50 cursor-pointer">
                  <span>📷</span> <span>Tara</span>
                </button>
              </div>
            </div>
            <input type="text" 
              id="key-${prefix}-${letter}-${idx}" 
              data-prefix="${prefix}" 
              data-letter="${letter}" 
              data-idx="${idx}" 
              data-qcount="${qCount}"
              value="${subKey}" 
              maxlength="${qCount}"
              placeholder="Örn: ${qCount} harf (A, B, C, D...)" 
              oninput="App.handleSubjectKeyInput('${prefix}', '${letter}', ${idx}, ${qCount})" 
              class="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300 focus:border-emerald-500 focus:outline-none uppercase tracking-widest font-bold">
          </div>
        `;
      }).join('');

      const totalBadgeClass = totalEnteredQ === totalExamQ && totalExamQ > 0
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'bg-slate-800 text-slate-300 border border-slate-700';

      container.innerHTML = `
        <div class="space-y-2">
          <!-- Üst Bilgi ve Araç Çubuğu -->
          <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
            <div class="flex items-center gap-2">
              <span class="text-xs font-black text-white">${letter} Kitapçığı</span>
              <span id="total-badge-${prefix}-${letter}" class="text-[11px] font-mono font-bold px-2 py-0.5 rounded ${totalBadgeClass}">
                Toplam: ${totalEnteredQ} / ${totalExamQ} Soru ${totalEnteredQ === totalExamQ && totalExamQ > 0 ? '✓' : ''}
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              ${letter !== 'A' ? `
                <button type="button" onclick="App.copyBookletKeysFromA('${prefix}', '${letter}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold rounded-lg border border-amber-500/30 transition flex items-center gap-1 cursor-pointer" title="A Kitapçığında girdiğiniz cevapları buraya kopyalar">
                  <span>📋</span> <span>A'dan Kopyala</span>
                </button>
              ` : ''}
              <button type="button" onclick="App.togglePasteBox('${prefix}', '${letter}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold rounded-lg border border-cyan-500/30 transition flex items-center gap-1 cursor-pointer" title="Uzun metin yapıştır">
                <span>📝</span> <span>Toplu Metin Yapıştır</span>
              </button>
            </div>
          </div>

          <!-- Toplu Yapıştırma Kutusu (Açılır Kapanır) -->
          <div id="paste-box-${prefix}-${letter}" class="hidden p-2.5 bg-slate-950 border border-cyan-800/60 rounded-xl space-y-1.5 animate-fade-in">
            <label class="block text-[11px] font-bold text-cyan-300">Tüm Kitapçık Metnini Yapıştırın (Derslere Otomatik Dağıtılır):</label>
            <div class="flex gap-2">
              <input type="text" id="paste-input-${prefix}-${letter}" placeholder="Örn: ABCDABCD... (${totalExamQ} Harf)" class="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-cyan-200 uppercase tracking-wider focus:outline-none focus:border-cyan-500">
              <button type="button" onclick="App.applyPastedKeyToSubjects('${prefix}', '${letter}')" class="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-black text-xs rounded-lg transition cursor-pointer">
                Dağıt
              </button>
            </div>
          </div>

          <!-- Ders Ders Kutular -->
          <div class="space-y-2">
            ${subjectCardsHtml}
          </div>
        </div>
      `;
    });
  },

  handleSubjectKeyInput(prefix, letter, idx, qCount) {
    const input = document.getElementById(`key-${prefix}-${letter}-${idx}`);
    const badge = document.getElementById(`badge-key-${prefix}-${letter}-${idx}`);
    if (!input || !badge) return;

    let val = (input.value || '').toUpperCase().replace(/[^A-E]/g, '');
    if (val.length > qCount) {
      val = val.substring(0, qCount);
    }
    input.value = val;

    const isComplete = val.length === qCount;
    badge.textContent = `${val.length} / ${qCount}${isComplete ? ' ✓' : ''}`;
    badge.className = isComplete 
      ? 'text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
      : (val.length > 0 ? 'text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700');

    this.updateTotalBookletBadge(prefix, letter);
  },

  updateTotalBookletBadge(prefix, letter) {
    const container = document.getElementById(`${prefix}-booklet-pane-${letter}`);
    if (!container) return;
    const inputs = container.querySelectorAll(`input[id^="key-${prefix}-${letter}-"]`);
    let totalEntered = 0;
    let totalExpected = 0;

    inputs.forEach(inp => {
      totalEntered += (inp.value || '').length;
      totalExpected += parseInt(inp.dataset.qcount || 0, 10);
    });

    const totalBadge = document.getElementById(`total-badge-${prefix}-${letter}`);
    if (totalBadge) {
      const isComplete = totalEntered === totalExpected && totalExpected > 0;
      totalBadge.textContent = `Toplam: ${totalEntered} / ${totalExpected} Soru ${isComplete ? '✓' : ''}`;
      totalBadge.className = isComplete 
        ? 'text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
        : 'text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700';
    }
  },

  copyBookletKeysFromA(prefix, targetLetter) {
    const paneA = document.getElementById(`${prefix}-booklet-pane-A`);
    const targetPane = document.getElementById(`${prefix}-booklet-pane-${targetLetter}`);
    if (!paneA || !targetPane) return;

    const inputsA = paneA.querySelectorAll(`input[id^="key-${prefix}-A-"]`);
    inputsA.forEach((inpA, idx) => {
      const targetInput = document.getElementById(`key-${prefix}-${targetLetter}-${idx}`);
      if (targetInput) {
        targetInput.value = inpA.value;
        const qCount = parseInt(targetInput.dataset.qcount || 0, 10);
        this.handleSubjectKeyInput(prefix, targetLetter, idx, qCount);
      }
    });

    this.showToast(`A Kitapçığı cevapları ${targetLetter} Kitapçığına kopyalandı!`, 'success');
  },

  togglePasteBox(prefix, letter) {
    const box = document.getElementById(`paste-box-${prefix}-${letter}`);
    if (box) {
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) {
        const inp = document.getElementById(`paste-input-${prefix}-${letter}`);
        if (inp) inp.focus();
      }
    }
  },

  applyPastedKeyToSubjects(prefix, letter) {
    const pasteInput = document.getElementById(`paste-input-${prefix}-${letter}`);
    if (!pasteInput) return;
    const raw = (pasteInput.value || '').toUpperCase().replace(/[^A-E]/g, '');
    if (!raw) {
      this.showToast('Lütfen yapıştırılacak metin giriniz.', 'warning');
      return;
    }

    const container = document.getElementById(`${prefix}-booklet-pane-${letter}`);
    if (!container) return;
    const inputs = container.querySelectorAll(`input[id^="key-${prefix}-${letter}-"]`);

    let offset = 0;
    inputs.forEach((inp, idx) => {
      const qCount = parseInt(inp.dataset.qcount || 0, 10);
      const slice = raw.substring(offset, offset + qCount);
      inp.value = slice;
      offset += qCount;
      this.handleSubjectKeyInput(prefix, letter, idx, qCount);
    });

    this.showToast('✓ Metin tüm derslere başarıyla paylaştırıldı!', 'success');
    this.togglePasteBox(prefix, letter);
  },

  collectBookletKeysFromInputs(prefix, subjects, totalQCount) {
    const countElem = document.getElementById(prefix === 'edit' ? 'edit-form-booklet-count' : 'exam-form-booklet-count');
    const bCount = countElem ? (parseInt(countElem.value, 10) || 4) : 4;
    const activeLetters = ['A', 'B', 'C', 'D'].slice(0, bCount);

    const keys = {};

    activeLetters.forEach(letter => {
      const container = document.getElementById(`${prefix}-booklet-pane-${letter}`);
      if (container) {
        const inputs = container.querySelectorAll(`input[id^="key-${prefix}-${letter}-"]`);
        let fullKey = '';
        inputs.forEach(inp => {
          fullKey += (inp.value || '').toUpperCase().replace(/[^A-E]/g, '');
        });
        keys[letter] = fullKey;
      }
    });

    // Eğer A boşsa varsayılan A... doldur
    if (!keys['A']) {
      keys['A'] = 'A'.repeat(totalQCount);
    }
    // Aktif kitapçıklardan boş olanlar A'yı devralır
    activeLetters.forEach(l => {
      if (!keys[l]) keys[l] = keys['A'];
    });

    return keys;
  },

  // --- Soru Bazlı Konu & Kazanım Seçim Motoru (Seçmeli Havuz) ---
  toggleQuestionTopicsPanel(prefix) {
    const container = document.getElementById(`${prefix}-topics-container`);
    const btn = document.getElementById(`btn-toggle-topics-${prefix}`);
    if (!container) return;
    container.classList.toggle('hidden');
    if (btn) {
      btn.textContent = container.classList.contains('hidden') ? 'Konuları Düzenle ▼' : 'Kapat ▲';
    }
  },

  renderQuestionTopics(prefix, subjects, existingTopics = {}) {
    const container = document.getElementById(`${prefix}-topics-container`);
    if (!container) return;
    if (!Array.isArray(subjects) || subjects.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-500 italic p-2">Önce dersleri tanımlayınız.</p>`;
      return;
    }

    let html = '';
    let currentStart = 1;

    subjects.forEach((sub, subIdx) => {
      const qCount = (sub.endQ && sub.startQ) ? (sub.endQ - sub.startQ + 1) : (sub.questionCount || 10);
      const startQ = sub.startQ || currentStart;
      const endQ = sub.endQ || (startQ + qCount - 1);
      currentStart = endQ + 1;

      const subName = sub.name || `Ders ${subIdx + 1}`;
      const topicPool = (window.PortalStore && typeof window.PortalStore.getSubjectTopics === 'function')
        ? window.PortalStore.getSubjectTopics(subName)
        : [];

      // Soru soru dropdown seçimleri
      let questionsHtml = '';
      for (let q = startQ; q <= endQ; q++) {
        const curTopic = (existingTopics && (existingTopics[q] || existingTopics[q.toString()])) ? existingTopics[q].toString().trim() : '';
        const isKnown = curTopic && topicPool.includes(curTopic);
        const isCustom = curTopic && !isKnown;

        questionsHtml += `
          <div class="flex flex-col sm:flex-row sm:items-center gap-1.5 p-2 bg-slate-900/90 border border-slate-800 rounded-xl">
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span class="w-8 h-6 rounded bg-slate-800 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center">
                S.${q}
              </span>
            </div>
            <div class="flex-1 min-w-0 flex items-center gap-1">
              <select id="topic-select-${prefix}-${q}" onchange="App.handleTopicSelectChange(this, '${prefix}', ${q})" class="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-2 py-1.5 focus:border-emerald-500 focus:outline-none ${isCustom ? 'hidden' : ''}">
                <option value="">-- Konu Seçiniz --</option>
                ${topicPool.map(t => `<option value="${t}" ${t === curTopic ? 'selected' : ''}>${t}</option>`).join('')}
                <option value="custom" ${isCustom ? 'selected' : ''}>✍️ Diğer / Yeni Konu Yaz...</option>
              </select>
              <div id="topic-custom-wrapper-${prefix}-${q}" class="flex-1 flex items-center gap-1 ${isCustom ? '' : 'hidden'}">
                <input type="text" id="topic-custom-${prefix}-${q}" value="${isCustom ? curTopic : ''}" placeholder="Konu adını yazınız..." class="w-full bg-slate-950 border border-emerald-500 rounded-lg text-emerald-300 text-xs px-2 py-1.5 focus:outline-none">
                <button type="button" onclick="App.revertToTopicSelect('${prefix}', ${q})" class="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[11px] font-bold" title="Listeye Geri Dön">↩</button>
              </div>
            </div>
          </div>
        `;
      }

      html += `
        <div class="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-3 space-y-2.5">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-bold text-xs">${subName}</span>
              <span class="text-[11px] text-slate-400 font-mono">(${startQ} - ${endQ}. Sorular • ${qCount} Soru)</span>
            </div>
            
            <!-- Hızlı Toplu Konu Seçici -->
            <div class="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-xl border border-slate-800">
              <span class="text-[10px] text-slate-400 font-medium whitespace-nowrap">⚡ Toplu konu ata:</span>
              <select id="bulk-topic-${prefix}-${subIdx}" class="bg-slate-950 border border-slate-700 rounded-lg text-[11px] text-slate-200 px-2 py-1 focus:outline-none max-w-[180px]">
                <option value="">-- Konu Seçiniz --</option>
                ${topicPool.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
              <button type="button" onclick="App.applyBulkTopicToSubject('${prefix}', ${subIdx}, ${startQ}, ${endQ})" class="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-[10px] rounded-lg transition cursor-pointer">
                Tümüne Uygula
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
            ${questionsHtml}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  handleTopicSelectChange(selectElem, prefix, qNum) {
    const customWrapper = document.getElementById(`topic-custom-wrapper-${prefix}-${qNum}`);
    const customInp = document.getElementById(`topic-custom-${prefix}-${qNum}`);
    if (!customWrapper) return;
    if (selectElem.value === 'custom') {
      selectElem.classList.add('hidden');
      customWrapper.classList.remove('hidden');
      if (customInp) customInp.focus();
    } else {
      customWrapper.classList.add('hidden');
      selectElem.classList.remove('hidden');
    }
  },

  revertToTopicSelect(prefix, qNum) {
    const select = document.getElementById(`topic-select-${prefix}-${qNum}`);
    const customWrapper = document.getElementById(`topic-custom-wrapper-${prefix}-${qNum}`);
    const customInp = document.getElementById(`topic-custom-${prefix}-${qNum}`);
    if (customWrapper) customWrapper.classList.add('hidden');
    if (customInp) customInp.value = '';
    if (select) {
      select.classList.remove('hidden');
      select.value = '';
      select.focus();
    }
  },

  applyBulkTopicToSubject(prefix, subIdx, startQ, endQ) {
    const bulkSelect = document.getElementById(`bulk-topic-${prefix}-${subIdx}`);
    if (!bulkSelect || !bulkSelect.value) {
      this.showToast('Lütfen önce bir konu seçiniz.', 'warning');
      return;
    }
    const val = bulkSelect.value;
    for (let q = startQ; q <= endQ; q++) {
      const select = document.getElementById(`topic-select-${prefix}-${q}`);
      const customWrapper = document.getElementById(`topic-custom-wrapper-${prefix}-${q}`);
      const customInp = document.getElementById(`topic-custom-${prefix}-${q}`);
      if (select) {
        select.value = val;
        select.classList.remove('hidden');
      }
      if (customWrapper) customWrapper.classList.add('hidden');
      if (customInp) customInp.value = '';
    }
    this.showToast(`✓ "${val}" konusu ${startQ}-${endQ}. sorulara topluca uygulandı!`, 'success');
  },

  collectQuestionTopicsFromInputs(prefix, subjects) {
    const questionTopics = {};
    if (!Array.isArray(subjects)) return questionTopics;

    subjects.forEach(sub => {
      const startQ = sub.startQ || 1;
      const endQ = sub.endQ || startQ;
      for (let q = startQ; q <= endQ; q++) {
        const select = document.getElementById(`topic-select-${prefix}-${q}`);
        const customInp = document.getElementById(`topic-custom-${prefix}-${q}`);
        if (select) {
          if (select.value === 'custom') {
            const customVal = customInp ? customInp.value.trim() : '';
            if (customVal) questionTopics[q] = customVal;
          } else if (select.value) {
            questionTopics[q] = select.value.trim();
          }
        }
      }
    });

    return questionTopics;
  },

  // Kitapçık Sayısı Değiştirici
  handleBookletCountChange(prefix, countVal) {
    const count = Math.max(1, Math.min(4, parseInt(countVal, 10) || 4));
    const allLetters = ['A', 'B', 'C', 'D'];
    const activeLetters = allLetters.slice(0, count);

    allLetters.forEach(l => {
      const btn = document.getElementById(prefix === 'edit' ? `btn-edit-tab-${l}` : `btn-tab-${l}`);
      const pane = document.getElementById(prefix === 'edit' ? `edit-booklet-pane-${l}` : `create-booklet-pane-${l}`);
      if (btn) {
        if (activeLetters.includes(l)) {
          btn.classList.remove('hidden');
        } else {
          btn.classList.add('hidden');
        }
      }
      if (pane && !activeLetters.includes(l)) {
        pane.classList.add('hidden');
      }
    });

    if (prefix === 'edit') {
      this.switchEditBookletTab('A');
    } else {
      this.switchBookletTab('A');
    }
  },

  // Kitapçık Sekmesi Değiştirici
  switchBookletTab(letter) {
    ['A', 'B', 'C', 'D'].forEach(l => {
      const pane = document.getElementById('create-booklet-pane-' + l);
      const btn = document.getElementById('btn-tab-' + l);
      if (pane) {
        if (l === letter) pane.classList.remove('hidden');
        else pane.classList.add('hidden');
      }
      if (btn) {
        if (l === letter) {
          btn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 transition';
        } else {
          btn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition';
        }
      }
    });
  },

  handleSaveExamForm(e, instId, isGlobal) {
    e.preventDefault();
    const title = document.getElementById('exam-form-title').value.trim();
    const examDate = document.getElementById('exam-form-date') ? document.getElementById('exam-form-date').value : new Date().toISOString().split('T')[0];
    const qCount = parseInt(document.getElementById('exam-form-qcount').value, 10) || 20;

    const bCountElem = document.getElementById('exam-form-booklet-count');
    const bookletCount = bCountElem ? (parseInt(bCountElem.value, 10) || 4) : 4;
    const bookletTypes = ['A', 'B', 'C', 'D'].slice(0, bookletCount);

    const targetSelect = document.getElementById('exam-form-target');
    const targetCustom = document.getElementById('exam-form-target-custom');
    let target = '8. Sınıf';
    if (targetSelect && targetSelect.value === 'custom') {
      target = (targetCustom && targetCustom.value.trim()) || 'Özel';
    } else if (targetSelect) {
      target = targetSelect.value.trim();
    }

    const subjects = this.collectSubjectsFromForm('subject-rows-container');
    const answerKeys = this.collectBookletKeysFromInputs('create', subjects, qCount);
    const questionTopics = this.collectQuestionTopicsFromInputs('create', subjects);

    const examData = {
      title,
      examDate,
      questionCount: qCount,
      targetClass: target,
      bookletTypes: bookletTypes,
      questionTopics: questionTopics,
      subjects: subjects.length > 0 ? subjects : [{ name: 'Genel', startQ: 1, endQ: qCount, wrongPenalty: 0.333, coeff: 1 }],
      answerKeys: answerKeys,
      canceledQuestions: []
    };

    if (isGlobal) {
      window.PortalStore.createGlobalExam(examData);
      this.showToast('Merkezi Ortak Sınav başarıyla açıldı!', 'success');
    } else {
      window.PortalStore.createExam(instId, examData);
      this.showToast('Deneme sınavı başarıyla oluşturuldu!', 'success');
    }

    const modal = document.getElementById('create-exam-modal');
    if (modal) modal.remove();
    this.render();
  },

  // --- SINAV DÜZENLEME & CEVAP ANAHTARI GÜNCELLEME & SORU İPTALİ ---
  showEditExamModal(instId, examId, isGlobal = false) {
    const existing = document.getElementById('edit-exam-modal');
    if (existing) existing.remove();

    const exam = isGlobal 
      ? window.PortalStore.getGlobalExams().find(e => e.id === examId)
      : window.PortalStore.getExamById(instId, examId);

    if (!exam) {
      this.showToast('Sınav bulunamadı.', 'error');
      return;
    }

    const canceledList = Array.isArray(exam.canceledQuestions) ? exam.canceledQuestions : [];
    const students = instId ? window.PortalStore.getStudents(instId) : [];
    const existingClasses = Array.from(new Set(students.map(s => (s.className || '').trim()).filter(Boolean))).sort();
    const currentTarget = exam.targetClass || '';
    const isKnownClass = existingClasses.includes(currentTarget) || ['8. Sınıf', '7. Sınıf', '6. Sınıf', '5. Sınıf', 'Tüm Şubeler', 'TÜM SINIFLAR'].includes(currentTarget);

    const activeBooklets = (Array.isArray(exam.bookletTypes) && exam.bookletTypes.length > 0)
      ? exam.bookletTypes
      : (exam.answerKeys ? Object.keys(exam.answerKeys).filter(k => ['A', 'B', 'C', 'D'].includes(k) && exam.answerKeys[k]) : ['A', 'B', 'C', 'D']);
    const currentBookletCount = Math.max(1, Math.min(4, activeBooklets.length || 4));

    const modal = document.createElement('div');
    modal.id = 'edit-exam-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-2xl w-full shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">✏️</span>
            <div>
              <h3 class="text-base font-black text-white">Sınavı Düzenle & Soru İptali</h3>
              <p class="text-xs text-slate-400 font-medium">${exam.title}</p>
            </div>
          </div>
          <button onclick="document.getElementById('edit-exam-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <form onsubmit="App.handleSaveEditExamForm(event, '${instId || ''}', '${exam.id}', ${isGlobal})" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="sm:col-span-2">
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Sınav Adı / Başlığı</label>
              <input type="text" id="edit-form-title" required value="${exam.title}" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Sınav Tarihi</label>
              <input type="date" id="edit-form-date" value="${exam.examDate || ''}" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Toplam Soru Sayısı</label>
              <input type="number" id="edit-form-qcount" value="${exam.questionCount}" readonly class="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-emerald-400 font-black text-xs focus:outline-none cursor-default" title="Ders soru sayılarına göre otomatik hesaplanır">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">📖 Kitapçık Sayısı</label>
              <select id="edit-form-booklet-count" onchange="App.handleBookletCountChange('edit', this.value)" class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
                <option value="1" ${currentBookletCount === 1 ? 'selected' : ''}>1 Kitapçık (Yalnızca A)</option>
                <option value="2" ${currentBookletCount === 2 ? 'selected' : ''}>2 Kitapçık (A, B)</option>
                <option value="3" ${currentBookletCount === 3 ? 'selected' : ''}>3 Kitapçık (A, B, C)</option>
                <option value="4" ${currentBookletCount === 4 ? 'selected' : ''}>4 Kitapçık (A, B, C, D)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">🎯 Hedef Sınıf / Şube</label>
              <select id="edit-form-target" onchange="App.handleTargetClassSelectChange(this, 'edit-form-target-custom')" class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
                ${existingClasses.length > 0 ? `
                  <optgroup label="🏫 Kurumdaki Talebe Şubeleri">
                    ${existingClasses.map(c => `<option value="${c}" ${c === currentTarget ? 'selected' : ''}>${c} Şubesi</option>`).join('')}
                  </optgroup>
                ` : ''}
                <optgroup label="📚 Standart Sınıflar">
                  <option value="8. Sınıf" ${currentTarget === '8. Sınıf' ? 'selected' : ''}>8. Sınıf (LGS)</option>
                  <option value="7. Sınıf" ${currentTarget === '7. Sınıf' ? 'selected' : ''}>7. Sınıf</option>
                  <option value="6. Sınıf" ${currentTarget === '6. Sınıf' ? 'selected' : ''}>6. Sınıf</option>
                  <option value="5. Sınıf" ${currentTarget === '5. Sınıf' ? 'selected' : ''}>5. Sınıf</option>
                  <option value="Tüm Şubeler" ${(currentTarget === 'Tüm Şubeler' || currentTarget === 'TÜM SINIFLAR') ? 'selected' : ''}>Tüm Şubeler</option>
                </optgroup>
                <option value="custom" ${!isKnownClass && currentTarget ? 'selected' : ''}>✍️ Diğer / Yeni Şube Yaz...</option>
              </select>
              <input type="text" id="edit-form-target-custom" value="${!isKnownClass ? currentTarget : ''}" placeholder="Şube adını yazınız (Örn: 8-C)" class="${!isKnownClass && currentTarget ? '' : 'hidden'} mt-1.5 w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
          </div>

          <!-- Soru İptali Alanı -->
          <div class="p-3.5 bg-purple-950/30 border border-purple-500/40 rounded-2xl space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-lg">⚖️</span>
              <label class="text-xs font-black text-purple-300 uppercase">Hatalı Soru İptali</label>
            </div>
            <p class="text-[11px] text-purple-200/80 leading-relaxed">
              İptal etmek istediğiniz soru numaralarını virgülle ayırarak giriniz (Örn: <code>14, 25</code>). İptal edilen sorular tüm öğrencilere <strong>tam doğru sayılır</strong> ve tüm sıralama puanları derhal yeniden hesaplanır.
            </p>
            <input type="text" id="edit-form-canceled" placeholder="Örn: 14, 25" value="${canceledList.join(', ')}" class="w-full px-3.5 py-2 bg-slate-950 border border-purple-800/80 rounded-xl text-purple-200 font-mono text-xs focus:border-purple-400 focus:outline-none">
          </div>

          <!-- Dersler Tablosu -->
          <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
              <div>
                <label class="text-xs font-bold uppercase text-slate-300">📚 Ders Bölümleri & Soru Sayıları</label>
                <p class="text-[10px] text-slate-400">Derslerin soru sayılarını ve katsayılarını düzenleyin. <strong>Taban 200 • Tavan 500</strong> puan standardına göre net katsayılarını otomatik veya elle belirleyebilirsiniz.</p>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" onclick="App.autoDistributeCoefficients('edit-subject-rows-container')" class="px-2.5 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 text-[11px] font-bold rounded-lg border border-amber-500/40 transition cursor-pointer flex items-center gap-1 shadow-sm" title="Tüm derslerin katsayılarını Taban 200 - Tavan 500 standardına göre otomatik hesaplar ve kutulara yazar">
                  <span>⚡</span> <span>Otomatik Katsayı Ver</span>
                </button>
                <button type="button" onclick="App.addSubjectRow('edit-subject-rows-container')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-bold rounded-lg border border-slate-700 transition cursor-pointer">
                  + Ders Ekle
                </button>
              </div>
            </div>

            <div class="overflow-x-auto w-full max-w-full" style="-webkit-overflow-scrolling: touch;">
              <table class="w-full text-left text-[11px] min-w-[500px]">
                <thead class="text-slate-500 uppercase border-b border-slate-800 font-bold">
                  <tr>
                    <th class="p-1.5">Ders Adı</th>
                    <th class="p-1.5 text-center">Soru Sayısı</th>
                    <th class="p-1.5 text-center">Aralık</th>
                    <th class="p-1.5 text-center">Ceza</th>
                    <th class="p-1.5 text-center" title="1 Net başına düşen puan katsayısı. Elle değiştirebilir veya Otomatik Katsayı Ver butonuna basabilirsiniz.">Net Katsayısı (Elle Düzenlenebilir)</th>
                    <th class="p-1.5 text-right">Sil</th>
                  </tr>
                </thead>
                <tbody id="edit-subject-rows-container" class="divide-y divide-slate-800/60">
                  <!-- JS ile doldurulacak -->
                </tbody>
              </table>
            </div>

            <!-- Canlı Katsayı ve Toplam Puan Önizleme Rozeti -->
            <div id="edit-subject-rows-container-preview" class="p-2.5 bg-slate-900/90 border border-slate-800/80 rounded-xl"></div>
          </div>

          <!-- 4 Kitapçık Ders Ders Cevap Anahtarları -->
          <div class="space-y-3 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div>
                <label class="text-xs font-black text-white uppercase flex items-center gap-1.5">
                  <span>🔑</span> <span>Ders Ders Cevap Anahtarları</span>
                </label>
                <p class="text-[10px] text-slate-400">Her dersin doğru cevaplarını ilgili ders kutusuna sırasıyla giriniz.</p>
              </div>
              <div class="flex items-center gap-1">
                <button type="button" onclick="App.switchEditBookletTab('A')" id="btn-edit-tab-A" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 transition">Kitapçık A</button>
                <button type="button" onclick="App.switchEditBookletTab('B')" id="btn-edit-tab-B" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık B</button>
                <button type="button" onclick="App.switchEditBookletTab('C')" id="btn-edit-tab-C" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık C</button>
                <button type="button" onclick="App.switchEditBookletTab('D')" id="btn-edit-tab-D" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık D</button>
              </div>
            </div>

            <div id="edit-booklet-pane-A" class="edit-booklet-pane space-y-2"></div>
            <div id="edit-booklet-pane-B" class="edit-booklet-pane space-y-2 hidden"></div>
            <div id="edit-booklet-pane-C" class="edit-booklet-pane space-y-2 hidden"></div>
            <div id="edit-booklet-pane-D" class="edit-booklet-pane space-y-2 hidden"></div>
          </div>

          <!-- Soru Konu ve Kazanımları (Seçmeli Havuz) -->
          <div class="space-y-3 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div>
                <label class="text-xs font-black text-white uppercase flex items-center gap-1.5">
                  <span>🎯</span> <span>Soru Konu & Kazanımları (Seçmeli)</span>
                </label>
                <p class="text-[10px] text-slate-400">Her soru için açılır listeden konu seçiniz. Karnelerde konu başarı grafiği üretilir.</p>
              </div>
              <button type="button" onclick="App.toggleQuestionTopicsPanel('edit')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition cursor-pointer flex items-center gap-1">
                <span id="btn-toggle-topics-edit">Konuları Düzenle ▼</span>
              </button>
            </div>

            <div id="edit-topics-container" class="space-y-3">
              <!-- JS ile render edilecek -->
            </div>
          </div>

          <div class="pt-2">
            <button type="submit" class="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer">
              <span>💾</span> <span>Değişiklikleri Kaydet & Tüm Sonuçları Yeniden Hesapla</span>
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    this.renderSubjectRows(exam.subjects || [], 'edit-subject-rows-container');
    this.renderBookletSubjectKeys('edit', exam.subjects || [], exam.answerKeys || {});
    this.handleBookletCountChange('edit', currentBookletCount);
    this.renderQuestionTopics('edit', exam.subjects || [], exam.questionTopics || {});
  },

  switchEditBookletTab(letter) {
    ['A', 'B', 'C', 'D'].forEach(l => {
      const pane = document.getElementById('edit-booklet-pane-' + l);
      const btn = document.getElementById('btn-edit-tab-' + l);
      if (pane) {
        if (l === letter) pane.classList.remove('hidden');
        else pane.classList.add('hidden');
      }
      if (btn) {
        if (l === letter) {
          btn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 transition';
        } else {
          btn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition';
        }
      }
    });
  },

  handleSaveEditExamForm(e, instId, examId, isGlobal) {
    e.preventDefault();
    const title = document.getElementById('edit-form-title').value.trim();
    const examDate = document.getElementById('edit-form-date').value;
    const qCount = parseInt(document.getElementById('edit-form-qcount').value, 10) || 20;

    const targetSelect = document.getElementById('edit-form-target');
    const targetCustom = document.getElementById('edit-form-target-custom');
    let target = '8. Sınıf';
    if (targetSelect && targetSelect.value === 'custom') {
      target = (targetCustom && targetCustom.value.trim()) || 'Özel';
    } else if (targetSelect) {
      target = targetSelect.value.trim();
    }

    const subjects = this.collectSubjectsFromForm('edit-subject-rows-container');
    const answerKeys = this.collectBookletKeysFromInputs('edit', subjects, qCount);
    const questionTopics = this.collectQuestionTopicsFromInputs('edit', subjects);

    const bCountElem = document.getElementById('edit-form-booklet-count');
    const bookletCount = bCountElem ? (parseInt(bCountElem.value, 10) || 4) : 4;
    const bookletTypes = ['A', 'B', 'C', 'D'].slice(0, bookletCount);

    const canceledRaw = document.getElementById('edit-form-canceled').value;
    const canceled = canceledRaw
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0 && n <= qCount);

    const updatedData = {
      title,
      examDate,
      questionCount: qCount,
      targetClass: target,
      bookletTypes,
      questionTopics,
      subjects: subjects.length > 0 ? subjects : [{ name: 'Genel', startQ: 1, endQ: qCount, wrongPenalty: 0.333, coeff: 1 }],
      answerKeys,
      canceledQuestions: canceled
    };

    if (isGlobal) {
      window.PortalStore.updateGlobalExam(examId, updatedData);
      this.showToast('✓ Merkezi ortak sınav ve tüm neticeler başarıyla güncellendi!', 'success');
    } else {
      window.PortalStore.updateExam(instId, examId, updatedData);
      this.showToast('✓ Sınav güncellendi ve tüm öğrenci puanları yeniden hesaplandı!', 'success');
    }

    const modal = document.getElementById('edit-exam-modal');
    if (modal) modal.remove();
    this.render();
  },

  handleExamQCountChange(countStr) {
    const qCount = parseInt(countStr, 10) || 20;
    const keyA = document.getElementById('exam-form-key-a');
    const keyB = document.getElementById('exam-form-key-b');
    const keyC = document.getElementById('exam-form-key-c');
    const keyD = document.getElementById('exam-form-key-d');

    const letters = ['A', 'B', 'C', 'D'];
    if (keyA && (!keyA.value || keyA.value.length !== qCount)) {
      let sample = '';
      for (let i = 0; i < qCount; i++) sample += letters[i % 4];
      keyA.value = sample;
    }
    if (keyB && (!keyB.value || keyB.value.length !== qCount)) {
      let sample = '';
      for (let i = 0; i < qCount; i++) sample += letters[(i + 1) % 4];
      keyB.value = sample;
    }
    if (keyC && (!keyC.value || keyC.value.length !== qCount)) {
      let sample = '';
      for (let i = 0; i < qCount; i++) sample += letters[(i + 2) % 4];
      keyC.value = sample;
    }
    if (keyD && (!keyD.value || keyD.value.length !== qCount)) {
      let sample = '';
      for (let i = 0; i < qCount; i++) sample += letters[(i + 3) % 4];
      keyD.value = sample;
    }
  },

  openScanAnswerKeyModal(targetInputId, customQCount = null) {
    const existing = document.getElementById('scan-answer-key-modal');
    if (existing) existing.remove();

    const qCountSelect = document.getElementById('exam-form-qcount') || document.getElementById('edit-form-qcount');
    const questionCount = customQCount || (qCountSelect ? parseInt(qCountSelect.value, 10) || 20 : 20);

    const modal = document.createElement('div');
    modal.id = 'scan-answer-key-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-md w-full shadow-2xl relative">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">📷</span>
            <h4 class="text-sm font-black text-white">Cevap Anahtarını Kameradan Tara (${questionCount} Soru)</h4>
          </div>
          <button onclick="App.closeScanAnswerKeyModal()" class="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-bold cursor-pointer">✕</button>
        </div>

        <p class="text-xs text-slate-400 mb-3">Doğru cevapları işaretlediğiniz optik formu çerçeveye gösterip butona basınız.</p>

        <div class="relative bg-black rounded-2xl overflow-hidden border border-slate-800 mb-3" style="aspect-ratio: 4/3;">
          <video id="key-scanner-video" playsinline autoplay muted class="w-full h-full object-cover"></video>
          <canvas id="key-scanner-canvas" class="hidden"></canvas>
          <div class="absolute inset-6 border-2 border-dashed border-cyan-400/70 rounded-xl pointer-events-none flex items-center justify-center">
            <span class="text-[10px] font-mono font-bold text-cyan-300 bg-black/70 px-2.5 py-1 rounded-xl">Cevap Anahtarı Formunu Hizalayınız</span>
          </div>
        </div>

        <button onclick="App.captureAnswerKey('${targetInputId}', ${questionCount})" class="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer">
          <span>🎯</span> <span>Cevapları Otomatik Çıkar (${questionCount} Soru)</span>
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    setTimeout(() => {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        .then(stream => {
          this.keyScanStream = stream;
          const vid = document.getElementById('key-scanner-video');
          if (vid) {
            vid.srcObject = stream;
            vid.play();
          }
        })
        .catch(err => {
          this.showToast('Kamera açılamadı: ' + err.message, 'error');
        });
    }, 150);
  },

  closeScanAnswerKeyModal() {
    if (this.keyScanStream) {
      this.keyScanStream.getTracks().forEach(t => t.stop());
      this.keyScanStream = null;
    }
    const modal = document.getElementById('scan-answer-key-modal');
    if (modal) modal.remove();
  },

  captureAnswerKey(targetInputId, questionCount) {
    const vid = document.getElementById('key-scanner-video');
    const canvas = document.getElementById('key-scanner-canvas');
    const result = window.OmrScanner.scanAnswerKeyFromFrame(vid, canvas, questionCount);
    
    if (result && result.key) {
      const targetInput = document.getElementById(targetInputId);
      if (targetInput) {
        targetInput.value = result.key;
        if (targetInput.dataset && targetInput.dataset.prefix && targetInput.dataset.letter) {
          this.handleSubjectKeyInput(
            targetInput.dataset.prefix,
            targetInput.dataset.letter,
            parseInt(targetInput.dataset.idx, 10),
            parseInt(targetInput.dataset.qcount, 10)
          );
        }
      }
      this.showToast(`✓ ${result.questionCount} soruluk cevap anahtarı başarıyla çıkarıldı!`, 'success');
      this.closeScanAnswerKeyModal();
    }
  },

  deleteExamPrompt(instId, examId, title) {
    if (confirm(`"${title}" sınavını ve neticelerini silmek istediğinize emin misiniz?`)) {
      window.PortalStore.deleteExam(instId, examId);
      this.showToast('Sınav silindi.', 'info');
      this.render();
    }
  },

  // 5. KURS PANELİ: TALEBE YÖNETİMİ
  renderStudentsView(instId) {
    const students = window.PortalStore.getStudents(instId);
    const uniqueClasses = Array.from(new Set(students.map(s => (s.className || '').trim()).filter(Boolean))).sort();
    const query = (this.studentSearchQuery || '').trim();
    const classFilter = this.studentClassFilter || 'all';

    return `
      <div class="space-y-6">
        <!-- Üst Başlık ve Aksiyonlar -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div>
            <h2 class="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Kayıtlı Talebeler</span>
              <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-xs border border-emerald-500/30">${students.length}</span>
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">Talebe bilgilerini ve veli telefonlarını düzenleyebilir, QR kodlu optik form basabilirsiniz.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button onclick="App.showBulkStudentModal('${instId}')" class="px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer">
              <span>📥</span> <span>Excel'den Toplu Yükle</span>
            </button>
            <button onclick="App.downloadExcelTemplate()" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer" title="Excel Örnek Şablonu İndir">
              <span>📄</span> <span>Excel Şablonu İndir</span>
            </button>
            <button onclick="App.showStudentModal('${instId}')" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer">
              <span>➕</span> <span>Yeni Talebe Ekle</span>
            </button>
          </div>
        </div>

        <!-- Arama ve Şube Filtreleme Çubuğu -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div class="relative w-full sm:w-80">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 text-sm">🔍</span>
            <input type="text" id="student-search-input" value="${query}" oninput="App.handleStudentSearch(this.value)" placeholder="Talebe adı, soyadı veya no ile ara..." class="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none">
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <span class="text-xs font-bold text-slate-400">Şube:</span>
            <select id="student-class-filter" onchange="App.handleStudentClassFilter(this.value)" class="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-bold focus:border-emerald-500 focus:outline-none">
              <option value="all" ${classFilter === 'all' ? 'selected' : ''}>Tüm Şubeler (${students.length})</option>
              ${uniqueClasses.map(c => `<option value="${c}" ${c === classFilter ? 'selected' : ''}>${c} Şubesi (${students.filter(s => (s.className || 'Genel') === c).length})</option>`).join('')}
            </select>
            <span class="text-[11px] text-slate-400 font-mono ml-2">Gösterilen: <strong id="student-filtered-count-badge" class="text-emerald-400 font-bold">${students.length}</strong></span>
          </div>
        </div>

        <!-- Talebe Listesi Tablosu -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg w-full max-w-full">
          <div class="w-full max-w-full overflow-x-auto" style="-webkit-overflow-scrolling: touch;">
            <table class="w-full text-left text-xs min-w-[560px]">
              <thead class="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th class="p-3 w-16">No</th>
                  <th class="p-3">Adı Soyadı</th>
                  <th class="p-3">Sınıfı / Şubesi</th>
                  <th class="p-3">Veli Telefonu (WhatsApp)</th>
                  <th class="p-3">Notlar</th>
                  <th class="p-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody id="student-table-tbody" class="divide-y divide-slate-800/80">
                <tr id="student-table-empty-row" style="display: ${students.length === 0 ? '' : 'none'};">
                  <td colspan="6" class="p-8 text-center text-slate-500">
                    Henüz talebe bulunmuyor veya arama kriterine uygun kayıt yok.
                  </td>
                </tr>
                ${students.map(st => {
                  const searchStr = window.PortalStore.normalizeTr(`${st.studentNo} ${st.firstName} ${st.lastName} ${st.className} ${st.parentPhone || ''} ${st.notes || ''}`);
                  return `
                    <tr class="student-table-row hover:bg-slate-800/40 transition" data-search="${searchStr}" data-class="${st.className || ''}">
                      <td class="p-3 font-mono font-bold text-emerald-400">${st.studentNo}</td>
                      <td class="p-3 font-bold text-white">
                        <button type="button" onclick="App.showStudentModal('${instId}', '${st.id}')" class="text-left hover:text-emerald-300 hover:underline cursor-pointer flex items-center gap-1.5" title="Bilgileri Düzenlemek İçin Tıklayın">
                          <span>${st.firstName} ${st.lastName}</span>
                        </button>
                      </td>
                      <td class="p-3">
                        <span class="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-bold text-[11px] border border-slate-700/60">${st.className || 'Genel'}</span>
                      </td>
                      <td class="p-3 font-mono text-slate-300">
                        ${st.parentPhone ? `📱 ${st.parentPhone}` : '<span class="text-slate-600">-</span>'}
                      </td>
                      <td class="p-3 text-slate-400 text-[11px] max-w-[160px] truncate" title="${st.notes || ''}">
                        ${st.notes || '-'}
                      </td>
                      <td class="p-3 text-right">
                        <div class="flex items-center justify-end gap-1.5">
                          <button onclick="App.showStudentModal('${instId}', '${st.id}')" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer" title="Talebe Bilgilerini Düzenle">
                            <span>✍️</span> <span>Düzenle</span>
                          </button>
                          <button onclick="App.deleteStudentPrompt('${instId}', '${st.id}', '${st.firstName} ${st.lastName}')" class="p-1.5 bg-slate-800 hover:bg-rose-950/60 text-rose-400 hover:text-rose-300 border border-slate-700 rounded-lg text-xs font-bold transition cursor-pointer" title="Talebeyi Sil">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // Talebe Ekleme / Düzenleme Modalı
  showStudentModal(instId, studentId = null) {
    const existing = document.getElementById('student-form-modal');
    if (existing) existing.remove();

    const isEdit = Boolean(studentId);
    let student = null;
    if (isEdit) {
      student = window.PortalStore.getStudentById(instId, studentId);
      if (!student) {
        this.showToast('Talebe bilgisi bulunamadı.', 'error');
        return;
      }
    }

    const defaultClass = student ? (student.className || '8-A') : '8-A';
    const quickClasses = ['5-A', '6-A', '7-A', '8-A', '9-A', '10-A', '11-A', '12-A', 'Mezun'];

    const modal = document.createElement('div');
    modal.id = 'student-form-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl relative max-h-[92vh] flex flex-col">
        <!-- Üst Başlık -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">${isEdit ? '✍️' : '➕'}</span>
            <div>
              <h3 class="text-base sm:text-lg font-black text-white">${isEdit ? 'Talebe Bilgilerini Düzenle' : 'Yeni Talebe Kaydı'}</h3>
              <p class="text-xs text-slate-400 font-medium">${isEdit ? `${student.firstName} ${student.lastName} (No: ${student.studentNo})` : 'Optik form basımı ve sınav dereceleri için bilgileri giriniz.'}</p>
            </div>
          </div>
          <button onclick="document.getElementById('student-form-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <form id="student-form" onsubmit="App.handleStudentFormSubmit(event, '${instId}', '${studentId || ''}')" class="space-y-4 overflow-y-auto flex-1 pr-1">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1">
                Talebe No (Okul/Kurum No) <span class="text-rose-400">*</span>
              </label>
              <input type="text" id="st-no" required value="${student ? student.studentNo : ''}" placeholder="Örn: 101" class="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 font-mono font-bold text-xs focus:border-emerald-500 focus:outline-none">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1">
                Sınıf / Şube <span class="text-rose-400">*</span>
              </label>
              <input type="text" id="st-class" required value="${student ? student.className : defaultClass}" placeholder="Örn: 8-A" class="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none uppercase">
            </div>
          </div>

          <!-- Hızlı Şube Seçim Butonları -->
          <div>
            <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Hızlı Şube Seç:</span>
            <div class="flex flex-wrap gap-1.5">
              ${quickClasses.map(qc => `
                <button type="button" onclick="document.getElementById('st-class').value = '${qc}'" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 text-[11px] font-bold rounded-lg border border-slate-700 transition cursor-pointer">
                  ${qc}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1">
                Adı <span class="text-rose-400">*</span>
              </label>
              <input type="text" id="st-first-name" required value="${student ? student.firstName : ''}" placeholder="Örn: AHMET" class="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none uppercase">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1">
                Soyadı <span class="text-rose-400">*</span>
              </label>
              <input type="text" id="st-last-name" required value="${student ? student.lastName : ''}" placeholder="Örn: YILMAZ" class="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none uppercase">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">
              Veli Cep Telefonu (WhatsApp Karne İçin)
            </label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 text-xs font-mono">📱</span>
              <input type="tel" id="st-phone" value="${student ? (student.parentPhone || '') : ''}" placeholder="Örn: 05551234567" class="w-full pl-8 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-emerald-500 focus:outline-none">
            </div>
            <p class="text-[10px] text-slate-500 mt-1">Sınav tamamlandığında veliye doğrudan WhatsApp karne mesajı gönderilmesini sağlar.</p>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1">
              Özel Notlar / Açıklama
            </label>
            <input type="text" id="st-notes" value="${student ? (student.notes || '') : ''}" placeholder="İsteğe bağlı not..." class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:border-emerald-500 focus:outline-none">
          </div>

          <div class="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            ${isEdit ? `
              <button type="button" onclick="document.getElementById('student-form-modal').remove(); App.deleteStudentPrompt('${instId}', '${student.id}', '${student.firstName} ${student.lastName}')" class="px-3 py-2.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white font-bold text-xs rounded-xl border border-rose-500/30 transition flex items-center gap-1 cursor-pointer" title="Talebeyi Sil">
                <span>🗑️</span> <span>Talebeyi Sil</span>
              </button>
            ` : '<div></div>'}
            <div class="flex items-center gap-2">
              <button type="button" onclick="document.getElementById('student-form-modal').remove()" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
                Vazgeç
              </button>
              <button type="submit" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer">
                <span>${isEdit ? '💾' : '➕'}</span>
                <span>${isEdit ? 'Değişiklikleri Kaydet' : 'Talebeyi Kaydet'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  },

  handleStudentFormSubmit(event, instId, studentId) {
    event.preventDefault();
    const studentNo = document.getElementById('st-no').value.trim();
    const firstName = document.getElementById('st-first-name').value.trim();
    const lastName = document.getElementById('st-last-name').value.trim();
    const className = document.getElementById('st-class').value.trim();
    const parentPhone = document.getElementById('st-phone').value.trim();
    const notes = document.getElementById('st-notes').value.trim();

    if (!studentNo || !firstName || !lastName) {
      this.showToast('Lütfen numara, ad ve soyad alanlarını doldurunuz.', 'warning');
      return;
    }

    if (studentId) {
      const res = window.PortalStore.updateStudent(instId, studentId, {
        studentNo,
        firstName,
        lastName,
        className,
        parentPhone,
        notes
      });
      if (res && res.success) {
        this.showToast(`✓ ${firstName} ${lastName} bilgileri başarıyla güncellendi!`, 'success');
        const modal = document.getElementById('student-form-modal');
        if (modal) modal.remove();
        this.render();
      } else {
        this.showToast(res ? res.message : 'Güncelleme yapılamadı.', 'error');
      }
    } else {
      const students = window.PortalStore.getStudents(instId);
      if (students.some(s => s.studentNo === studentNo)) {
        this.showToast(`"${studentNo}" numaralı bir talebe zaten kayıtlı!`, 'error');
        return;
      }
      window.PortalStore.addStudent(instId, {
        studentNo,
        firstName,
        lastName,
        className,
        parentPhone,
        notes
      });
      this.showToast(`✓ ${firstName} ${lastName} başarıyla kaydedildi!`, 'success');
      const modal = document.getElementById('student-form-modal');
      if (modal) modal.remove();
      this.render();
    }
  },

  showAddStudentModal(instId) {
    this.showStudentModal(instId, null);
  },

  handleStudentSearch(query) {
    this.studentSearchQuery = query || '';
    const q = window.PortalStore.normalizeTr(query);
    const rows = document.querySelectorAll('.student-table-row');
    let visibleCount = 0;
    rows.forEach(row => {
      const text = row.dataset.search || '';
      const cls = row.dataset.class || '';
      const classMatch = !this.studentClassFilter || this.studentClassFilter === 'all' || cls === this.studentClassFilter;
      const textMatch = !q || text.includes(q);
      if (classMatch && textMatch) {
        row.style.display = '';
        visibleCount++;
      } else {
        row.style.display = 'none';
      }
    });
    const emptyRow = document.getElementById('student-table-empty-row');
    if (emptyRow) {
      emptyRow.style.display = visibleCount === 0 ? '' : 'none';
    }
    const countBadge = document.getElementById('student-filtered-count-badge');
    if (countBadge) {
      countBadge.textContent = visibleCount.toString();
    }
  },

  handleStudentClassFilter(cls) {
    this.studentClassFilter = cls || 'all';
    this.handleStudentSearch(this.studentSearchQuery || '');
  },

  deleteStudentPrompt(instId, studentId, name) {
    if (confirm(`"${name}" adlı talebeyi silmek istediğinize emin misiniz?`)) {
      window.PortalStore.deleteStudent(instId, studentId);
      this.showToast('Talebe silindi.', 'info');
      this.render();
    }
  },

  // --- TOPLU TALEBE YÜKLEME MODALI (EXCEL .xlsx, .xls, .csv & KOPYALA-YAPIŞTIR) ---
  showBulkStudentModal(instId) {
    const existing = document.getElementById('bulk-student-modal');
    if (existing) existing.remove();

    window._pendingBulkStudents = [];

    const modal = document.createElement('div');
    modal.id = 'bulk-student-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-2xl w-full shadow-2xl relative max-h-[92vh] flex flex-col">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">📥</span>
            <div>
              <h3 class="text-base font-black text-white">Excel'den Toplu Talebe Yükleme</h3>
              <p class="text-xs text-slate-400 font-medium">Excel (.xlsx, .xls) veya CSV dosyanızı yükleyin ya da tablodan kopyalayıp yapıştırın.</p>
            </div>
          </div>
          <button onclick="document.getElementById('bulk-student-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <!-- Sekmeler: Dosya Yükle vs Kopyala-Yapıştır -->
        <div class="flex gap-2 mb-3 border-b border-slate-800 pb-2 flex-shrink-0">
          <button type="button" id="tab-btn-bulk-file" onclick="App.switchBulkTab('file')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 transition">
            📁 Excel / CSV Dosyası Yükle
          </button>
          <button type="button" id="tab-btn-bulk-paste" onclick="App.switchBulkTab('paste')" class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 transition">
            📋 Excel'den Kopyala - Yapıştır
          </button>
          <div class="ml-auto">
            <button type="button" onclick="App.downloadExcelTemplate()" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold rounded-xl border border-cyan-800/40 transition flex items-center gap-1 cursor-pointer">
              <span>📄</span> <span>Örnek Excel Şablonu</span>
            </button>
          </div>
        </div>

        <div class="overflow-y-auto flex-1 space-y-4 pr-1">
          <!-- 1. Dosya Yükleme Alanı -->
          <div id="bulk-pane-file" class="space-y-3">
            <div id="bulk-drop-zone" onclick="document.getElementById('bulk-file-input').click()" class="border-2 border-dashed border-slate-700 hover:border-emerald-500/70 bg-slate-950/60 p-6 rounded-2xl text-center cursor-pointer transition">
              <span class="text-3xl block mb-2">📊</span>
              <p class="text-xs font-bold text-white mb-1">Excel (.xlsx, .xls) veya CSV Dosyasını Seçin ya da Buraya Sürükleyin</p>
              <p class="text-[11px] text-slate-400">Microsoft Excel, Google E-Tablolar veya e-Okul listeleriyle tam uyumludur.</p>
              <input type="file" id="bulk-file-input" accept=".xlsx,.xls,.csv,.tsv,.txt" onchange="App.handleBulkFileSelect(event, '${instId}')" class="hidden">
            </div>
          </div>

          <!-- 2. Kopyala Yapıştır Alanı -->
          <div id="bulk-pane-paste" class="space-y-3 hidden">
            <div>
              <label class="block text-xs font-bold text-slate-300 mb-1">Excel Tablosundan Kopyaladığınız Hücreleri Buraya Yapıştırın:</label>
              <textarea id="bulk-paste-input" oninput="App.handleBulkPasteInput('${instId}')" rows="5" placeholder="Excel'de satırları seçip Ctrl+C yapın, ardından buraya Ctrl+V ile yapıştırın...&#10;Örn: 101 [TAB] AHMET [TAB] YILMAZ [TAB] 8-A [TAB] 05551112233" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300 focus:border-emerald-500 focus:outline-none"></textarea>
            </div>
            <p class="text-[11px] text-slate-400">İpucu: Sütun sırası fark etmez. Sistem isimleri, numaraları ve şubeleri otomatik tespit eder.</p>
          </div>

          <!-- 3. Canlı Önizleme Alanı -->
          <div id="bulk-preview-section" class="hidden space-y-2">
            <div class="flex items-center justify-between">
              <span id="bulk-preview-badge" class="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                0 Talebe Algılandı
              </span>
              <span class="text-[11px] text-slate-400">Lütfen aşağıdaki listeyi kontrol edip onaylayınız.</span>
            </div>

            <div class="border border-slate-800 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              <table class="w-full text-left text-xs min-w-[400px]">
                <thead class="bg-slate-950 text-slate-400 font-bold uppercase sticky top-0 border-b border-slate-800">
                  <tr>
                    <th class="p-2">No</th>
                    <th class="p-2">Adı</th>
                    <th class="p-2">Soyadı</th>
                    <th class="p-2">Sınıfı</th>
                    <th class="p-2">Veli Telefon</th>
                  </tr>
                </thead>
                <tbody id="bulk-preview-tbody" class="divide-y divide-slate-800/60 bg-slate-900/80">
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Alt Kaydet Butonu -->
        <div class="pt-3 border-t border-slate-800 mt-3 flex-shrink-0 flex items-center justify-between gap-3">
          <button type="button" onclick="document.getElementById('bulk-student-modal').remove()" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
            Vazgeç
          </button>
          <button type="button" id="btn-save-bulk-students" onclick="App.saveBulkStudents('${instId}')" disabled class="px-5 py-2.5 bg-slate-800 text-slate-500 font-black text-xs rounded-xl transition flex items-center gap-2 cursor-not-allowed">
            <span>💾</span> <span>Talebeleri Listeye Ekle</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  },

  switchBulkTab(tab) {
    const paneFile = document.getElementById('bulk-pane-file');
    const panePaste = document.getElementById('bulk-pane-paste');
    const btnFile = document.getElementById('tab-btn-bulk-file');
    const btnPaste = document.getElementById('tab-btn-bulk-paste');

    if (tab === 'file') {
      if (paneFile) paneFile.classList.remove('hidden');
      if (panePaste) panePaste.classList.add('hidden');
      if (btnFile) btnFile.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 transition';
      if (btnPaste) btnPaste.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 transition';
    } else {
      if (paneFile) paneFile.classList.add('hidden');
      if (panePaste) panePaste.classList.remove('hidden');
      if (btnPaste) btnPaste.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 transition';
      if (btnFile) btnFile.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 transition';
    }
  },

  async handleBulkFileSelect(event, instId) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      this.showToast('Dosya inceleniyor...', 'info');
      const students = await this.parseStudentFile(file);
      this.updateBulkPreview(students);
    } catch (err) {
      this.showToast('Dosya okunamadı: ' + err.message, 'error');
    }
    event.target.value = '';
  },

  handleBulkPasteInput(instId) {
    const textarea = document.getElementById('bulk-paste-input');
    if (!textarea) return;
    const text = textarea.value;
    const students = this.parseStudentText(text);
    this.updateBulkPreview(students);
  },

  updateBulkPreview(students) {
    window._pendingBulkStudents = Array.isArray(students) ? students : [];
    const previewSection = document.getElementById('bulk-preview-section');
    const tbody = document.getElementById('bulk-preview-tbody');
    const badge = document.getElementById('bulk-preview-badge');
    const saveBtn = document.getElementById('btn-save-bulk-students');

    if (!previewSection || !tbody || !badge || !saveBtn) return;

    if (window._pendingBulkStudents.length > 0) {
      previewSection.classList.remove('hidden');
      badge.textContent = `✓ ${window._pendingBulkStudents.length} Talebe Algılandı`;
      badge.className = 'px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';

      tbody.innerHTML = window._pendingBulkStudents.slice(0, 100).map(s => `
        <tr class="hover:bg-slate-800/40">
          <td class="p-2 font-mono font-bold text-emerald-400">${s.studentNo}</td>
          <td class="p-2 font-bold text-white">${s.firstName}</td>
          <td class="p-2 font-bold text-slate-200">${s.lastName}</td>
          <td class="p-2 font-semibold text-slate-300">${s.className}</td>
          <td class="p-2 font-mono text-slate-400">${s.parentPhone || '-'}</td>
        </tr>
      `).join('');

      saveBtn.disabled = false;
      saveBtn.className = 'px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer';
      saveBtn.innerHTML = `<span>💾</span> <span>${window._pendingBulkStudents.length} Talebeyi Listeye Ekle</span>`;
    } else {
      previewSection.classList.add('hidden');
      saveBtn.disabled = true;
      saveBtn.className = 'px-5 py-2.5 bg-slate-800 text-slate-500 font-black text-xs rounded-xl transition flex items-center gap-2 cursor-not-allowed';
      saveBtn.innerHTML = `<span>💾</span> <span>Talebeleri Listeye Ekle</span>`;
    }
  },

  saveBulkStudents(instId) {
    const list = window._pendingBulkStudents || [];
    if (list.length === 0) {
      this.showToast('Lütfen önce Excel dosyası seçiniz veya yapıştırınız.', 'warning');
      return;
    }

    const res = window.PortalStore.importStudentsArray(instId, list);
    if (res && res.success) {
      this.showToast(`✓ ${res.added} yeni talebe başarıyla kaydedildi! Toplam: ${res.count}`, 'success');
      const modal = document.getElementById('bulk-student-modal');
      if (modal) modal.remove();
      this.render();
    } else {
      this.showToast('Kayıt başarısız: ' + (res ? res.message : 'Bilinmeyen hata'), 'error');
    }
  },

  async parseStudentFile(file) {
    const fileName = (file.name || '').toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isExcel) {
      if (typeof XLSX === 'undefined') {
        throw new Error('Excel okuma kütüphanesi yükleniyor, lütfen birkaç saniye sonra tekrar deneyiniz.');
      }
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      return window.PortalStore.parseStudentsFromMatrix(rows);
    } else {
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buffer);
      if (text.includes('\uFFFD')) {
        try {
          text = new TextDecoder('windows-1254').decode(buffer);
        } catch (e) {}
      }
      return this.parseStudentText(text);
    }
  },

  parseStudentText(rawText) {
    if (!rawText || !rawText.trim()) return [];
    const cleanText = rawText.replace(/^\uFEFF/, '').trim();
    const lines = cleanText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];

    const firstLine = lines[0];
    let delimiter = ';';
    const semiCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const pipeCount = (firstLine.match(/\|/g) || []).length;

    if (tabCount >= semiCount && tabCount >= commaCount && tabCount > 0) delimiter = '\t';
    else if (pipeCount > semiCount && pipeCount > commaCount) delimiter = '|';
    else if (semiCount >= commaCount) delimiter = ';';
    else delimiter = ',';

    const matrix = lines.map(line => line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, '')));
    return window.PortalStore.parseStudentsFromMatrix(matrix);
  },

  downloadExcelTemplate() {
    try {
      if (typeof XLSX !== 'undefined') {
        const data = [
          ['Okul No', 'Adı', 'Soyadı', 'Sınıfı', 'Veli Telefon', 'Notlar'],
          [101, 'AHMET', 'YILMAZ', '8-A', '05551112233', 'LGS Grubu'],
          [102, 'MEHMET', 'KAYA', '8-A', '05552223344', 'LGS Grubu'],
          [103, 'AYŞE', 'DEMİR', '8-B', '05553334455', 'LGS Grubu'],
          [104, 'FATMA', 'ÇELİK', '8-B', '05554445566', 'LGS Grubu'],
          [105, 'ALİ', 'ÖZTÜRK', '7-A', '05555556677', 'Ara Sınıf']
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Talebeler');
        XLSX.writeFile(wb, 'ogrenciler_sablon.xlsx');
        this.showToast('✓ Excel şablonu başarıyla indirildi (ogrenciler_sablon.xlsx)', 'success');
        return;
      }
    } catch (e) {
      console.warn('XLSX indirme hatası, CSV üretiliyor:', e);
    }

    try {
      const csvContent = '\uFEFF' + 
        'Okul No;Adı;Soyadı;Sınıfı;Veli Telefon;Notlar\r\n' +
        '101;AHMET;YILMAZ;8-A;05551112233;LGS Grubu\r\n' +
        '102;MEHMET;KAYA;8-A;05552223344;LGS Grubu\r\n' +
        '103;AYŞE;DEMİR;8-B;05553334455;LGS Grubu\r\n' +
        '104;FATMA;ÇELİK;8-B;05554445566;LGS Grubu\r\n' +
        '105;ALİ;ÖZTÜRK;7-A;05555556677;Ara Sınıf\r\n';
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'ogrenciler_sablon.csv');
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 300);
      this.showToast('✓ CSV şablonu başarıyla indirildi (ogrenciler_sablon.csv)', 'success');
    } catch (err) {
      this.showToast('Şablon oluşturulamadı: ' + err.message, 'error');
    }
  },

  async handleCsvUpload(event, instId) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      this.showToast('Dosya inceleniyor...', 'info');
      const students = await this.parseStudentFile(file);
      if (students.length === 0) {
        this.showToast('Dosyada geçerli talebe kaydı bulunamadı.', 'warning');
        return;
      }
      const res = window.PortalStore.importStudentsArray(instId, students);
      if (res && res.success) {
        this.showToast(`✓ ${res.added} yeni talebe başarıyla aktarıldı! Toplam: ${res.count}`, 'success');
        this.render();
      } else {
        this.showToast('Aktarım hatası: ' + (res ? res.message : ''), 'error');
      }
    } catch (err) {
      this.showToast('Dosya okuma hatası: ' + err.message, 'error');
    }
    event.target.value = '';
  },

  // 6. KURS PANELİ: OPTİK FORM YAZDIRMA
  renderOpticalPrintView(instId) {
    const exams = window.PortalStore.getExams(instId);
    const students = window.PortalStore.getStudents(instId);
    const session = window.PortalStore.getCurrentSession();
    const uniqueClasses = Array.from(new Set(students.map(s => (s.className || '').trim()).filter(Boolean))).sort();

    return `
      <div class="space-y-6">
        <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <h2 class="text-xl font-black text-white tracking-tight">Optik Cevap Kağıdı Yazdır</h2>
          <p class="text-xs text-slate-400 mt-0.5 mb-4">Seçtiğiniz sınav ve şube için talebelerin isimleri ve QR kodları hazır basılı A4 optik formlar üretin.</p>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1">Sınav Seçiniz</label>
              <select id="print-exam-select" onchange="App.handlePrintFilterChange('${instId}')" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
                ${exams.map(e => `<option value="${e.id}">${e.title} (${e.questionCount} Soru)</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1">🎯 Sınıf / Şube Seçiniz</label>
              <select id="print-class-select" onchange="App.handlePrintFilterChange('${instId}')" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
                <option value="all">Tüm Şubeler (${students.length} Talebe)</option>
                ${uniqueClasses.map(c => {
                  const count = students.filter(s => s.className === c).length;
                  return `<option value="${c}">${c} Şubesi (${count} Talebe)</option>`;
                }).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1">Baskı Türü</label>
              <select id="print-type-select" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
                <option value="all_students">Talebelere Özel İsimli & QR Kodlu</option>
                <option value="blank_10">Boş Form (10 Adet)</option>
                <option value="blank_25">Boş Form (25 Adet)</option>
                <option value="blank_50">Boş Form (50 Adet)</option>
              </select>
            </div>
            <div class="flex items-end">
              <button onclick="App.generateAndPrintSheets('${instId}')" class="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer">
                <span>🖨️</span> <span>Optik Kağıtları Bas</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Örnek Önizleme (Yatay A4) -->
        <div class="border border-slate-800 rounded-2xl p-3 sm:p-4 bg-slate-900/60 w-full max-w-full overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3 px-1">
            <h4 class="text-xs font-bold text-slate-400 uppercase flex items-center gap-1.5">
              <span>📄</span> <span>Yatay A4 Optik Form Canlı Önizleme</span>
            </h4>
            <span class="text-[11px] text-emerald-400 font-mono">297mm × 210mm (Sıfır Taşma Formatı)</span>
          </div>
          <div class="w-full max-w-full overflow-x-auto pb-4" style="-webkit-overflow-scrolling: touch;">
            <div id="optical-preview-container" class="w-[980px] min-w-[980px] max-w-[1050px] mx-auto border border-gray-400 rounded-xl shadow-2xl bg-white text-black p-2 text-left">
              ${window.OpticalSheetGenerator.renderSheetHtml({
                institutionName: session.institutionName || 'TABAKÇILAR B BLOK',
                examTitle: exams[0] ? exams[0].title : 'İsabet Ortaokul 8. Sınıf Deneme 3 (23-28 Ara)',
                student: students[0] || { firstName: 'ADAR', lastName: 'GÖZE', studentNo: '29828977800', className: 'ORTAOKUL 8 - ORTAOKUL SEVİYE 1' },
                questionCount: exams[0] ? exams[0].questionCount : 90,
                subjects: (exams[0] && exams[0].subjects && exams[0].subjects.length > 0) ? exams[0].subjects : [
                  { name: 'Türkçe', startQ: 1, endQ: 20 },
                  { name: 'İnkılap Tarihi', startQ: 21, endQ: 30 },
                  { name: 'Din Kültürü', startQ: 31, endQ: 40 },
                  { name: 'İngilizce', startQ: 41, endQ: 50 },
                  { name: 'Matematik', startQ: 51, endQ: 70 },
                  { name: 'Fen Bilimleri', startQ: 71, endQ: 90 }
                ],
                bookletTypes: exams[0] ? exams[0].bookletTypes : undefined
              })}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  handlePrintFilterChange(instId) {
    const examSelect = document.getElementById('print-exam-select');
    const classSelect = document.getElementById('print-class-select');
    const previewContainer = document.getElementById('optical-preview-container');
    if (!examSelect || !previewContainer) return;

    const examId = examSelect.value;
    const exam = window.PortalStore.getExamById(instId, examId) || window.PortalStore.getExams(instId)[0];
    const session = window.PortalStore.getCurrentSession();
    let students = window.PortalStore.getStudents(instId);
    const selectedClass = classSelect ? classSelect.value : 'all';
    if (selectedClass && selectedClass !== 'all') {
      students = students.filter(s => s.className === selectedClass);
    }
    const sampleStudent = students[0] || { 
      firstName: 'ÖRNEK', 
      lastName: 'TALEBE', 
      studentNo: '29828977800', 
      className: selectedClass !== 'all' ? selectedClass : (exam ? exam.targetClass : '8-A') 
    };

    previewContainer.innerHTML = window.OpticalSheetGenerator.renderSheetHtml({
      institutionName: session.institutionName || 'TABAKÇILAR B BLOK',
      examTitle: exam ? exam.title : 'Deneme Sınavı',
      student: sampleStudent,
      questionCount: exam ? exam.questionCount : 75,
      subjects: (exam && exam.subjects) ? exam.subjects : [],
      bookletTypes: exam ? exam.bookletTypes : undefined
    });
  },

  generateAndPrintSheets(instId) {
    const examSelect = document.getElementById('print-exam-select');
    const classSelect = document.getElementById('print-class-select');
    const typeSelect = document.getElementById('print-type-select');
    if (!examSelect) return;

    const examId = examSelect.value;
    const exam = window.PortalStore.getExamById(instId, examId);
    if (!exam) {
      this.showToast('Lütfen bir sınav seçiniz.', 'warning');
      return;
    }

    const session = window.PortalStore.getCurrentSession();
    let students = window.PortalStore.getStudents(instId);
    const selectedClass = classSelect ? classSelect.value : 'all';
    if (selectedClass && selectedClass !== 'all') {
      students = students.filter(s => s.className === selectedClass);
    }
    const printType = typeSelect ? typeSelect.value : 'all_students';

    let sheetsHtml = '';
    if (printType === 'all_students') {
      if (students.length === 0) {
        this.showToast('Seçilen şubede kayıtlı talebe bulunamadı. Boş form basılıyor.', 'info');
        for (let i = 0; i < 5; i++) {
          sheetsHtml += window.OpticalSheetGenerator.renderSheetHtml({
            institutionName: session.institutionName,
            examTitle: exam.title,
            examDate: exam.examDate,
            student: null,
            questionCount: exam.questionCount,
            subjects: exam.subjects,
            bookletTypes: exam.bookletTypes,
            examId: exam.id
          });
        }
      } else {
        students.forEach(st => {
          sheetsHtml += window.OpticalSheetGenerator.renderSheetHtml({
            institutionName: session.institutionName,
            examTitle: exam.title,
            examDate: exam.examDate,
            student: st,
            questionCount: exam.questionCount,
            subjects: exam.subjects,
            bookletTypes: exam.bookletTypes,
            examId: exam.id
          });
        });
      }
    } else {
      const count = printType === 'blank_50' ? 50 : (printType === 'blank_25' ? 25 : 10);
      for (let i = 0; i < count; i++) {
        sheetsHtml += window.OpticalSheetGenerator.renderSheetHtml({
          institutionName: session.institutionName,
          examTitle: exam.title,
          examDate: exam.examDate,
          student: null,
          questionCount: exam.questionCount,
          subjects: exam.subjects,
          bookletTypes: exam.bookletTypes,
          examId: exam.id
        });
      }
    }

    window.OpticalSheetGenerator.printSheets(sheetsHtml);
  },

  printExamSheets(instId, examId) {
    this.currentTab = 'optik_yazdir';
    this.render();
  },

  // 7. KURS PANELİ: KAMERA İLE OKUMA (OMR Live Scanner)
  renderCameraScannerView(instId) {
    const exams = window.PortalStore.getExams(instId);
    const students = window.PortalStore.getStudents(instId);

    return `
      <div class="space-y-4">
        <!-- Üst Kontrol Çubuğu -->
        <div class="bg-slate-900 border border-slate-800 p-3.5 sm:p-4 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-lg w-full max-w-full overflow-hidden">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full lg:w-auto flex-1 min-w-0">
            <select id="scanner-exam-select" onchange="App.handleScannerExamChange('${instId}')" class="w-full sm:w-auto px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs">
              ${exams.map(e => `<option value="${e.id}" ${this.activeExamId === e.id ? 'selected' : ''}>${e.title} (${e.questionCount} Soru)</option>`).join('')}
            </select>
            <select id="scanner-student-select" class="w-full sm:w-auto px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs">
              <option value="">-- Talebe Seç (veya QR Koddan Oku) --</option>
              ${students.map(s => `<option value="${s.studentNo}">${s.studentNo} - ${s.firstName} ${s.lastName} (${s.className})</option>`).join('')}
            </select>
            <select id="scanner-booklet-select" class="w-full sm:w-auto px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs" title="Kitapçık Türü">
              <option value="auto">📖 Kitapçık: Otomatik (OMR/QR)</option>
              <option value="A">Kitapçık A</option>
              <option value="B">Kitapçık B</option>
              <option value="C">Kitapçık C</option>
              <option value="D">Kitapçık D</option>
            </select>
          </div>

          <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <!-- Seri Otomatik Okuma Butonu -->
            <button id="btn-continuous-scan" onclick="App.toggleContinuousScan('${instId}')" class="flex-1 sm:flex-initial px-3.5 py-2.5 bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white font-black text-xs rounded-xl border border-cyan-500/50 shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer">
              <span>⚡</span> <span id="continuous-btn-text">Seri Otomatik Okuma</span>
            </button>
            <button onclick="App.triggerScan()" class="flex-1 sm:flex-initial px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer">
              <span>📸</span> <span>Tek Kare Oku</span>
            </button>
            <button onclick="App.showImportTxtResultsModal('${instId}', '${this.activeExamId}')" class="flex-1 sm:flex-initial px-3.5 py-2.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white font-black text-xs rounded-xl border border-indigo-500/50 shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer" title="Optik Okuyucu TXT Dosyası Yükle">
              <span>📄</span> <span>TXT Yükle</span>
            </button>
            <div class="px-3 py-2 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 font-mono hidden sm:flex items-center gap-1.5">
              <span>Okunan:</span>
              <strong id="continuous-counter" class="text-emerald-400 font-black text-sm">0</strong>
            </div>
          </div>
        </div>

        <!-- Seri Okuma Canlı Bilgi Şeridi -->
        <div id="continuous-status-badge" class="hidden text-xs font-bold px-4 py-2 rounded-xl bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 animate-pulse text-center max-w-2xl mx-auto shadow-lg"></div>

        <!-- Canlı Kamera Ekranı -->
        <div class="relative bg-black rounded-3xl overflow-hidden border-2 border-slate-800 max-w-2xl w-full mx-auto shadow-2xl" style="aspect-ratio: 4/3;">
          <video id="omr-video" playsinline webkit-playsinline autoplay muted class="w-full h-full object-cover"></video>
          <canvas id="omr-canvas" class="hidden"></canvas>

          <!-- Kamera Başlatma / İzin İsteme Katmanı (Mobil Uyumlu) -->
          <div id="camera-start-prompt" class="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20 transition-all">
            <div class="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mb-2.5 border border-emerald-500/40 shadow-lg animate-pulse">
              📷
            </div>
            <h4 class="text-sm font-black text-white mb-1">Kamerayı Başlat</h4>
            <p class="text-xs text-slate-300 max-w-xs mb-3">Telefonunuzun kamerasını açarak sınav kağıtlarını canlı okutabilirsiniz.</p>
            <button onclick="App.startCameraExplicitly('${instId}')" class="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer active:scale-95">
              <span>📸</span> <span>Kamerayı Aç ve İzin Ver</span>
            </button>
            <p class="text-[10px] text-slate-400 mt-2">Tarayıcınız izin isterse lütfen <strong>"İzin Ver"</strong> seçeneğine dokununuz.</p>
          </div>

          <!-- Nişangah Çerçevesi (Kağıt Hizalama Rehberi) -->
          <div class="absolute inset-8 sm:inset-12 border-2 border-dashed border-emerald-400/70 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
            <div class="flex justify-between items-center text-[11px] font-mono font-bold text-emerald-400 bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm w-fit">
              <span>[+] Yatay A4 Kağıdı Bu Çerçeveye Hizalayınız</span>
            </div>
            <div class="text-center text-[10px] text-emerald-300 font-bold bg-black/60 py-1 rounded backdrop-blur-sm">
              4 Köşe Noktası ve QR Kod Çerçeve İçinde Olmalıdır
            </div>
          </div>
        </div>

        <!-- Okunan Sonuç Kartı (Varsa) -->
        <div id="scan-result-card" class="max-w-2xl mx-auto"></div>
      </div>
    `;
  },

  initCameraScanner() {
    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = (session && session.institutionId) ? session.institutionId : 'inst_oay';

    let exams = window.PortalStore.getExams(effectiveInstId);
    if (!exams || exams.length === 0) {
      const defaultExam = {
        id: 'exam_lgs_auto',
        title: '8. Sınıf LGS 1. Prova Denemesi',
        examDate: new Date().toISOString().split('T')[0],
        questionCount: 90,
        targetClass: '8. Sınıf',
        bookletTypes: ['A', 'B', 'C', 'D'],
        subjects: [
          { name: 'Türkçe', startQ: 1, endQ: 20, wrongPenalty: 0.333, coeff: 4 },
          { name: 'T.C. İnkılap', startQ: 21, endQ: 30, wrongPenalty: 0.333, coeff: 1 },
          { name: 'Din Kültürü', startQ: 31, endQ: 40, wrongPenalty: 0.333, coeff: 1 },
          { name: 'İngilizce', startQ: 41, endQ: 50, wrongPenalty: 0.333, coeff: 1 },
          { name: 'Matematik', startQ: 51, endQ: 70, wrongPenalty: 0.333, coeff: 4 },
          { name: 'Fen Bilimleri', startQ: 71, endQ: 90, wrongPenalty: 0.333, coeff: 4 }
        ],
        answerKeys: {
          'A': 'ABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD',
          'B': 'BCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDA'
        },
        canceledQuestions: [],
        createdAt: new Date().toISOString()
      };
      window.PortalStore.saveExams(effectiveInstId, [defaultExam]);
      exams = [defaultExam];
    }

    const currentExam = exams.find(e => e.id === this.activeExamId) || exams[0];
    this.activeExamId = currentExam.id;

    setTimeout(() => {
      this.startCameraExplicitly(effectiveInstId, currentExam);
    }, 120);
  },

  async startCameraExplicitly(instId, exam) {
    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null) || 'inst_oay';
    const effectiveExam = exam || (this.activeExamId ? window.PortalStore.getExamById(effectiveInstId, this.activeExamId) : null) || (window.PortalStore.getExams(effectiveInstId)[0]);

    if (!effectiveExam) {
      this.showToast('Lütfen önce bir sınav seçiniz.', 'warning');
      return;
    }

    const promptEl = document.getElementById('camera-start-prompt');
    const res = await window.OmrScanner.startCamera('omr-video', effectiveExam, effectiveInstId);
    if (res && res.success) {
      if (promptEl) promptEl.classList.add('hidden');
      this.showToast('✓ Kamera başarıyla açıldı. Kağıdı çerçeveye tutunuz.', 'success');
    } else {
      if (promptEl) promptEl.classList.remove('hidden');
      if (res && res.message) {
        this.showToast(res.message, 'warning');
      }
    }
  },

  handleScannerExamChange(instId) {
    const select = document.getElementById('scanner-exam-select');
    if (!select) return;
    this.activeExamId = select.value;
    const exam = window.PortalStore.getExamById(instId, this.activeExamId);
    window.OmrScanner.activeExam = exam;
  },

  startScanForExam(instId, examId) {
    this.activeExamId = examId;
    this.currentTab = 'kamera_tara';
    this.render();
  },

  toggleContinuousScan(instId) {
    const video = document.getElementById('omr-video');
    const canvas = document.getElementById('omr-canvas');
    const btn = document.getElementById('btn-continuous-scan');
    const btnText = document.getElementById('continuous-btn-text');
    const statusBadge = document.getElementById('continuous-status-badge');

    if (window.OmrScanner && window.OmrScanner.isContinuousActive) {
      window.OmrScanner.stopContinuousScanning();
      if (btn) btn.className = 'px-4 py-2.5 bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white font-black text-xs rounded-xl border border-cyan-500/50 shadow-lg transition flex items-center gap-1.5 cursor-pointer';
      if (btnText) btnText.textContent = 'Seri Otomatik Okuma (Başlat)';
      if (statusBadge) statusBadge.classList.add('hidden');
      this.showToast('Seri okuma durduruldu.', 'info');
    } else {
      if (!video) return;
      if (btn) btn.className = 'px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer animate-pulse';
      if (btnText) btnText.textContent = '⏹ Seri Okumayı Durdur';
      if (statusBadge) {
        statusBadge.classList.remove('hidden');
        statusBadge.textContent = '⚡ Seri okuma devrede. Kağıtları sırayla kameraya tutunuz...';
      }

      window.OmrScanner.startContinuousScanning(
        video,
        canvas,
        (result) => {
          this.handleScannedPaper(instId, result);
        },
        (statusMsg) => {
          if (statusBadge) statusBadge.textContent = statusMsg;
        },
        () => {
          const bookletSelect = document.getElementById('scanner-booklet-select');
          return (bookletSelect && bookletSelect.value !== 'auto') ? bookletSelect.value : null;
        },
        () => {
          const studentSelect = document.getElementById('scanner-student-select');
          return (studentSelect && studentSelect.value) ? studentSelect.value : null;
        }
      );
      this.showToast('⚡ Seri otomatik okuma devrede! Kağıtları sırayla kameraya tutun.', 'success');
    }
  },

  handleScannedPaper(instId, result) {
    if (!result) return;
    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null);

    // 1. ÖNCELİKLİ ŞART: Karekod henüz algılanamadıysa dur ve uyar
    if (result.stage === 'qr_search' || (!result.studentNo && !result.qrDetected)) {
      const studentSelect = document.getElementById('scanner-student-select');
      if (studentSelect && studentSelect.value) {
        result.studentNo = studentSelect.value;
      } else {
        this.showToast('⚠️ Talebe karekodu okunamadı! Lütfen kağıdın sol üstündeki karekodu kameraya net tutunuz veya yukarıdan talebeyi seçiniz.', 'warning');
        this.renderScanResultCard(result);
        return;
      }
    }

    // 2. ÖNCELİKLİ ŞART: Cevap anahtarı kodlanmamışsa DERHAL UYARI VER!
    if (result.isMissingAnswerKey || result.stage === 'no_answer_key') {
      this.showToast(`⚠️ "${result.examTitle || 'Sınav'}" (${result.booklet || 'A'} Kitapçığı) cevap anahtarı henüz kodlanmamış!`, 'error');
      this.renderScanResultCard(result);
      return;
    }

    const students = window.PortalStore.getStudents(effectiveInstId);
    const matchedSt = students.find(s => s.studentNo === result.studentNo);

    result.studentName = matchedSt ? `${matchedSt.firstName} ${matchedSt.lastName}` : (result.studentName || `Talebe #${result.studentNo}`);
    result.className = matchedSt ? matchedSt.className : (result.className || 'Genel');
    result.parentPhone = matchedSt ? matchedSt.parentPhone : (result.parentPhone || '');

    if (result.isBlank) {
      this.showToast('ℹ️ Boş optik form algılandı: Kağıt üzerinde işaretleme tespit edilemedi (0 Net).', 'warning');
    } else {
      // Neticeyi kaydet
      window.PortalStore.saveExamResult(effectiveInstId, result);

      const counter = document.getElementById('continuous-counter');
      if (counter) {
        const cur = parseInt(counter.textContent, 10) || 0;
        counter.textContent = (cur + 1).toString();
      }

      this.showToast(`✓ ${result.studentName} okundu! (${result.totalNet} Net - ${result.totalScore} Puan)`, 'success');
    }
    this.renderScanResultCard(result);
  },

  // Butona tıklandığında veya tek kare okutulduğunda
  triggerScan() {
    const video = document.getElementById('omr-video');
    const canvas = document.getElementById('omr-canvas');
    const studentSelect = document.getElementById('scanner-student-select');
    const studentNo = (studentSelect && studentSelect.value) ? studentSelect.value : null;

    if (!video || video.readyState < 2) {
      this.showToast('Kamera henüz hazır değil, lütfen birkaç saniye bekleyiniz.', 'warning');
      return;
    }

    const bookletSelect = document.getElementById('scanner-booklet-select');
    const selectedBooklet = (bookletSelect && bookletSelect.value !== 'auto') ? bookletSelect.value : null;

    const result = window.OmrScanner.scanCurrentFrame(video, canvas, studentNo, selectedBooklet);
    if (!result) {
      this.showToast('Optik form algılanamadı. Lütfen beyaz A4 kağıdı kamera çerçevesine net şekilde hizalayınız.', 'warning');
      return;
    }

    const session = window.PortalStore.getCurrentSession();
    this.handleScannedPaper(session ? session.institutionId : null, result);
  },

  renderScanResultCard(result) {
    const container = document.getElementById('scan-result-card');
    if (!container) return;

    // 1. Durum: Cevap anahtarı kodlanmamışsa belirgin uyarı kartı göster
    if (result.isMissingAnswerKey || result.stage === 'no_answer_key') {
      const session = window.PortalStore.getCurrentSession();
      const instId = session ? session.institutionId : '';
      container.innerHTML = `
        <div class="bg-amber-950/60 border-2 border-amber-500 rounded-3xl p-6 shadow-2xl animate-fade-in text-center space-y-3">
          <div class="w-14 h-14 bg-amber-500/20 text-amber-300 rounded-2xl flex items-center justify-center text-3xl mx-auto border border-amber-500/40 shadow-lg">
            🔑
          </div>
          <h3 class="text-base font-black text-amber-200">Cevap Anahtarı Kodlanmamış!</h3>
          <p class="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            <strong>${result.examTitle || 'Sınav'}</strong> için <strong>${result.booklet || 'A'} Kitapçığı</strong> cevap anahtarı henüz sisteme girilmemiştir. Hatalı net ve puan hesaplanmaması için optik okuma durduruldu.
          </p>
          <div class="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-[11px] text-slate-300 inline-flex items-center gap-2">
            <span>Talebe: <strong class="text-white">${result.studentName || '#' + result.studentNo}</strong></span>
            <span>•</span>
            <span>Kitapçık: <strong class="text-cyan-400 font-bold">${result.booklet || 'A'}</strong></span>
          </div>
          <div class="pt-2">
            <button onclick="App.showEditExamModal('${instId}', '${result.examId}')" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition inline-flex items-center gap-1.5 cursor-pointer">
              <span>🔑</span> <span>Cevap Anahtarını Şimdi Gir & Düzenle →</span>
            </button>
          </div>
        </div>
      `;
      return;
    }

    // 2. Durum: Eğer talebe karekodu henüz okunamadıysa uyarı kartı göster
    if (result.stage === 'qr_search' || (!result.studentNo && !result.qrDetected)) {
      container.innerHTML = `
        <div class="bg-amber-950/40 border-2 border-amber-500/70 rounded-3xl p-5 shadow-2xl animate-fade-in text-center space-y-3">
          <div class="w-12 h-12 bg-amber-500/20 text-amber-300 rounded-2xl flex items-center justify-center text-2xl mx-auto border border-amber-500/40">
            ⚠️
          </div>
          <h3 class="text-base font-black text-amber-200">Talebe Karekodu Okunamadı</h3>
          <p class="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            Kağıdın sol üstündeki karekod okunamadığı için sonuç kaydedilmedi. Lütfen kağıdı kameraya biraz yaklaştırınız veya yukarıdaki <strong>"Talebe Seç"</strong> açılır kutusundan talebenin adını seçip tekrar <strong>Tek Kare Oku</strong> butonuna basınız.
          </p>
          <div class="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-xl border border-slate-800 text-[11px] text-slate-300 font-mono">
            <span>Kitapçık: <strong class="text-cyan-400">${result.booklet || 'A'}</strong></span>
          </div>
        </div>
      `;
      return;
    }

    const isBlank = !!result.isBlank;

    container.innerHTML = `
      <div class="bg-slate-900 border-2 ${isBlank ? 'border-amber-500 shadow-amber-500/10' : 'border-emerald-500 shadow-emerald-500/10'} rounded-3xl p-5 shadow-2xl animate-fade-in">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div>
            ${isBlank ? `
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">⚠️ Boş Form Okundu (İşaretleme Yok)</span>
            ` : `
              <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Son Okunan Kağıt</span>
            `}
            <h3 class="text-lg font-black text-white mt-0.5">${result.studentName}</h3>
            <span class="text-xs text-slate-400 font-mono">${result.studentNo ? `No: ${result.studentNo} • ` : ''}Sınıf: ${result.className} • Kitapçık: <span class="text-emerald-400 font-bold">${result.booklet || 'A'}</span></span>
          </div>
          <div class="text-right">
            <span class="text-2xl font-black ${isBlank ? 'text-amber-400' : 'text-emerald-400'} font-mono">${result.totalScore}</span>
            <span class="block text-[10px] font-bold text-slate-400 uppercase">Toplam Puan</span>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-2 text-center mb-4">
          <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
            <span class="block text-[10px] text-slate-500 font-bold uppercase">Doğru</span>
            <span class="text-base font-black text-emerald-400 font-mono">${result.totalCorrect}</span>
          </div>
          <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
            <span class="block text-[10px] text-slate-500 font-bold uppercase">Yanlış</span>
            <span class="text-base font-black text-rose-400 font-mono">${result.totalWrong}</span>
          </div>
          <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
            <span class="block text-[10px] text-slate-500 font-bold uppercase">Boş</span>
            <span class="text-base font-black text-slate-300 font-mono font-bold">${result.totalEmpty}</span>
          </div>
          <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
            <span class="block text-[10px] text-slate-500 font-bold uppercase">Toplam Net</span>
            <span class="text-base font-black text-cyan-400 font-mono">${result.totalNet}</span>
          </div>
        </div>

        ${(result.topicAnalysis && result.topicAnalysis.length > 0) ? `
          <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 mb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                <span>🎯</span> <span>Konu Başarı Analizi</span>
              </span>
              <span class="text-[10px] text-slate-400 font-mono">${result.topicAnalysis.length} Konu</span>
            </div>
            <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              ${result.topicAnalysis.slice(0, 6).map(t => `
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-slate-300 truncate max-w-[180px]">${t.subject}: <strong class="text-white">${t.topic}</strong></span>
                  <div class="flex items-center gap-1.5 font-mono">
                    <span class="${t.percent >= 70 ? 'text-emerald-400' : (t.percent >= 40 ? 'text-amber-400' : 'text-rose-400')} font-bold">%${t.percent}</span>
                    <span class="text-slate-500 text-[10px]">(${t.correct}/${t.total} D)</span>
                  </div>
                </div>
              `).join('')}
              ${result.topicAnalysis.length > 6 ? `
                <div class="text-[10px] text-indigo-300 text-center pt-1">+${result.topicAnalysis.length - 6} konu daha (Karneden inceleyin)</div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <div class="flex flex-wrap gap-2">
          ${(result.parentPhone && !isBlank) ? `
            <button onclick="App.sendWhatsAppCard('${encodeURIComponent(result.parentPhone)}', '${encodeURIComponent(result.studentName)}', '${result.totalNet}', '${result.totalScore}', '${encodeURIComponent(JSON.stringify(result.topicAnalysis || []))}')" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer">
              <span>💬</span> <span>WhatsApp</span>
            </button>
          ` : ''}
          <button onclick="App.showManualResultModal('${result.institutionId || ''}', '${result.examId}', '${result.studentNo}')" class="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 cursor-pointer" title="Cevapları ve Notu Düzenle">
            <span>✍️</span> <span>Düzenle</span>
          </button>
          <button onclick="App.deleteExamResultPrompt('${result.institutionId || ''}', '${result.examId}', '${result.id || ''}', '${result.studentNo}', '${encodeURIComponent(result.studentName)}')" class="px-3 py-2.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white font-bold text-xs rounded-xl border border-rose-500/30 transition flex items-center justify-center gap-1 cursor-pointer" title="Bu Okunan Optik Kağıdı Sil">
            <span>🗑️</span> <span>Sil</span>
          </button>
          <button onclick="App.switchTab('neticeler')" class="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer">
            Tüm Neticeler →
          </button>
        </div>
      </div>
    `;
  },

  sendWhatsAppCard(phone, name, net, score, topicsJson = null) {
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanName = decodeURIComponent(name);
    let topicText = '';
    if (topicsJson) {
      try {
        const topics = typeof topicsJson === 'string' ? JSON.parse(decodeURIComponent(topicsJson)) : topicsJson;
        if (Array.isArray(topics) && topics.length > 0) {
          const weakTopics = topics.filter(t => t.percent < 60);
          const strongTopics = topics.filter(t => t.percent >= 80);
          if (weakTopics.length > 0) {
            topicText += `\n\n📌 *Tekrar Edilmesi Önerilen Konular:*\n` + weakTopics.slice(0, 4).map(t => `• ${t.topic} (%${t.percent} başarı - ${t.correct}/${t.total} D)`).join('\n');
          }
          if (strongTopics.length > 0) {
            topicText += `\n\n🌟 *Güçlü Konular:*\n` + strongTopics.slice(0, 3).map(t => `• ${t.topic} (%${t.percent})`).join('\n');
          }
        }
      } catch (e) {
        console.error('WhatsApp konu parse hatası', e);
      }
    }
    const message = `*DENEME SINAVI SONUÇ BİLGİLENDİRMESİ*\n\nSayın Velimiz,\nTalebeniz *${cleanName}* deneme sınavını tamamlamıştır:\n\n• Toplam Net: *${net}*\n• Sınav Puanı: *${score}*${topicText}\n\nTalebemizi tebrik eder, başarılarının devamını dileriz.`;
    const url = `https://wa.me/90${cleanPhone.startsWith('0') ? cleanPhone.substring(1) : cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  },

  // 8. KURS PANELİ: NETİCELER VE DERECE SIRALAMASI
  renderResultsView(instId) {
    const exams = window.PortalStore.getExams(instId);
    if (exams.length === 0) {
      return `<div class="p-8 text-center text-slate-400">Henüz sınav bulunmuyor.</div>`;
    }

    const currentExamId = this.activeExamId || exams[0].id;
    const currentExam = exams.find(e => e.id === currentExamId) || exams[0];
    const rankings = window.PortalStore.calculateExamRankings(instId, currentExam.id);

    return `
      <div class="space-y-6">
        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-lg w-full max-w-full">
          <div class="w-full lg:w-auto">
            <h2 class="text-xl font-black text-white tracking-tight">Sınav Neticeleri & Sıralama</h2>
            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
              <p class="text-xs text-slate-400 truncate">${currentExam.title} (${rankings.length} Talebe Katıldı)</p>
              <span class="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 font-mono font-bold text-[10px] border border-amber-500/20">Taban: 200 • Tavan: 500 Puan</span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <select onchange="App.handleResultsExamChange(this.value, '${instId}')" class="w-full sm:w-auto px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs max-w-full">
              ${exams.map(e => `<option value="${e.id}" ${e.id === currentExam.id ? 'selected' : ''}>${e.title}</option>`).join('')}
            </select>
            <button onclick="App.showImportTxtResultsModal('${instId}', '${currentExam.id}')" class="flex-1 sm:flex-initial px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-xs rounded-xl border border-indigo-500/40 transition flex items-center justify-center gap-1 cursor-pointer" title="FMT Format Şablonu ve Optik TXT / DAT Yükle">
              <span>📄</span> <span>FMT / TXT Yükle</span>
            </button>
            <button onclick="App.showManualResultModal('${instId}', '${currentExam.id}')" class="flex-1 sm:flex-initial px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white font-bold text-xs rounded-xl border border-cyan-500/40 transition flex items-center justify-center gap-1 cursor-pointer" title="Elle Öğrenci Notu / Cevabı Ekle">
              <span>✍️</span> <span>Elle Not Gir</span>
            </button>
            <button onclick="App.showItemAnalysisModal('${instId}', '${currentExam.id}', false)" class="flex-1 sm:flex-initial px-3 py-2 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-xs rounded-xl border border-amber-500/40 transition flex items-center justify-center gap-1 cursor-pointer" title="Soru ve Madde Başarı Analizi">
              <span>📊</span> <span>Soru Analizi</span>
            </button>
            <button onclick="App.showTopicAnalysisModal('${instId}', '${currentExam.id}', false)" class="flex-1 sm:flex-initial px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-xs rounded-xl border border-indigo-500/40 transition flex items-center justify-center gap-1 cursor-pointer" title="Konu ve Kazanım Başarı Analizi">
              <span>🎯</span> <span>Konu Analizi</span>
            </button>
            <button onclick="App.showBatchWhatsAppModal('${instId}', '${currentExam.id}')" class="flex-1 sm:flex-initial px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white font-bold text-xs rounded-xl border border-emerald-500/40 transition flex items-center justify-center gap-1 cursor-pointer" title="Sınıfa Toplu WhatsApp Karnesi Gönder">
              <span>💬</span> <span>Toplu WhatsApp</span>
            </button>
            <button onclick="App.downloadResultsCsv('${instId}', '${currentExam.id}', false)" class="flex-1 sm:flex-initial px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center gap-1 cursor-pointer" title="Excel / CSV Olarak İndir">
              <span>📥</span> <span>Excel İndir</span>
            </button>
            <button onclick="App.showBulkReportCardListModal('${instId}', '${currentExam.id}')" class="w-full sm:w-auto px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer" title="Tüm öğrencilerin ders ders D-Y-Net ve puanlarını içeren resmi toplu sonuç listesi karnesini aç ve yazdır">
              <span>📋</span> <span>Toplu Liste Karne</span>
            </button>
            <button onclick="App.printAllReportCards('${instId}', '${currentExam.id}')" class="w-full sm:w-auto px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1 cursor-pointer">
              <span>📜</span> <span>Tüm Karneler</span>
            </button>
          </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg w-full max-w-full">
          <div class="w-full max-w-full overflow-x-auto" style="-webkit-overflow-scrolling: touch;">
            <table class="w-full text-left text-xs min-w-[640px]">
              <thead class="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th class="p-3 text-center">Derece</th>
                  <th class="p-3">No</th>
                  <th class="p-3">Adı Soyadı</th>
                  <th class="p-3">Sınıfı</th>
                  <th class="p-3 text-center">Doğru</th>
                  <th class="p-3 text-center">Yanlış</th>
                  <th class="p-3 text-center">Net</th>
                  <th class="p-3 text-center">Puan (200-500)</th>
                  <th class="p-3 text-right">Karne & Paylaş</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/80">
                ${rankings.length === 0 ? `
                  <tr>
                    <td colspan="9" class="p-8 text-center text-slate-500">
                      Bu sınava ait henüz taranmış bir optik kağıt bulunmuyor. "Kamera ile Oku" bölümünden kağıtları okutabilir veya "Elle Not Gir" ile manuel sonuç ekleyebilirsiniz.
                    </td>
                  </tr>
                ` : rankings.map(r => `
                  <tr class="hover:bg-slate-800/40 transition">
                    <td class="p-3 text-center">
                      <span class="w-6 h-6 inline-flex items-center justify-center rounded-full font-black text-xs ${r.generalRank === 1 ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20' : (r.generalRank === 2 ? 'bg-slate-300 text-slate-950' : (r.generalRank === 3 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'))}">
                        ${r.generalRank}
                      </span>
                    </td>
                    <td class="p-3 font-mono font-bold text-emerald-400">${r.studentNo}</td>
                    <td class="p-3 font-bold text-white">${r.studentName}</td>
                    <td class="p-3 font-semibold text-slate-300">${r.className}</td>
                    <td class="p-3 text-center font-bold text-emerald-400">${r.totalCorrect}</td>
                    <td class="p-3 text-center font-bold text-rose-400">${r.totalWrong}</td>
                    <td class="p-3 text-center font-mono font-bold text-cyan-400">${r.totalNet}</td>
                    <td class="p-3 text-center font-mono font-black text-amber-400 text-sm">${r.totalScore}</td>
                    <td class="p-3 text-right">
                      <div class="flex items-center justify-end gap-1.5">
                        <button onclick="App.showManualResultModal('${instId}', '${currentExam.id}', '${r.studentNo}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-[11px] font-bold transition cursor-pointer" title="Cevapları / Puanı Elle Düzenle">
                          ✍️
                        </button>
                        <button onclick="App.deleteExamResultPrompt('${instId}', '${currentExam.id}', '${r.id || ''}', '${r.studentNo}', '${encodeURIComponent(r.studentName)}')" class="px-2 py-1 bg-slate-800 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 rounded-lg text-[11px] font-bold transition cursor-pointer" title="Bu Talebenin Optik Okuma Neticesini Sil">
                          🗑️
                        </button>
                        <button onclick="App.showStudentTopicAnalysisModal('${instId}', '${currentExam.id}', '${r.studentNo}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg text-[11px] font-bold transition cursor-pointer" title="Talebenin Konu ve Kazanım Karnesi">
                          🎯
                        </button>
                        <button onclick="App.printSingleReportCard('${instId}', '${currentExam.id}', '${r.studentNo}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer" title="Renkli & Grafikli A4 Karne Bas">
                          <span>📜</span> <span>Karne</span>
                        </button>
                        ${r.parentPhone ? `
                          <button onclick="App.sendWhatsAppCard('${encodeURIComponent(r.parentPhone)}', '${encodeURIComponent(r.studentName)}', '${r.totalNet}', '${r.totalScore}', '${encodeURIComponent(JSON.stringify(r.topicAnalysis || []))}')" class="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-[11px] font-bold transition cursor-pointer" title="WhatsApp Gönder">
                            💬
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  handleResultsExamChange(examId, instId) {
    this.activeExamId = examId;
    this.render();
  },

  viewExamResults(instId, examId) {
    this.activeExamId = examId;
    this.currentTab = 'neticeler';
    this.render();
  },

  printSingleReportCard(instId, examId, studentNo) {
    const exam = window.PortalStore.getExamById(instId, examId);
    const rankings = window.PortalStore.calculateExamRankings(instId, examId);
    const result = rankings.find(r => r.studentNo === studentNo);
    if (!result) {
      this.showToast('Talebenin sınav kaydı bulunamadı.', 'error');
      return;
    }
    const session = window.PortalStore.getCurrentSession();
    const instName = session ? session.institutionName : 'Eğitim Kurumu';
    const cardHtml = window.OpticalSheetGenerator.renderReportCardHtml(result, exam, instName);
    window.OpticalSheetGenerator.printReportCards(cardHtml);
  },

  printAllReportCards(instId, examId) {
    const exam = window.PortalStore.getExamById(instId, examId);
    const rankings = window.PortalStore.calculateExamRankings(instId, examId);
    if (rankings.length === 0) {
      this.showToast('Bu sınavda henüz basılacak sonuç bulunmuyor.', 'warning');
      return;
    }
    const session = window.PortalStore.getCurrentSession();
    const instName = session ? session.institutionName : 'Eğitim Kurumu';
    let combinedHtml = '';
    rankings.forEach(r => {
      combinedHtml += window.OpticalSheetGenerator.renderReportCardHtml(r, exam, instName);
    });
    window.OpticalSheetGenerator.printReportCards(combinedHtml);
  },

  // Optik Okuma Neticesi Silme Onay Kutusu
  deleteExamResultPrompt(instId, examId, resultId, studentNo, encodedStudentName) {
    const studentName = decodeURIComponent(encodedStudentName || '');
    const displayName = studentName ? `"${studentName}" (${studentNo || ''})` : `Talebe #${studentNo}`;
    if (confirm(`${displayName} adlı talebenin bu sınavdaki optik okuma neticesini silmek istediğinize emin misiniz?\n\nBu işlem sonucunda okunan cevaplar silinir ve derece sıralaması anında güncellenir.`)) {
      const session = window.PortalStore.getCurrentSession();
      const effectiveInstId = instId || (session ? session.institutionId : null);
      const ok = window.PortalStore.deleteExamResult(effectiveInstId, examId, resultId || studentNo);
      if (ok) {
        this.showToast(`${displayName} optik neticesi başarıyla silindi.`, 'info');
        const modal = document.getElementById('manual-result-modal');
        if (modal) modal.remove();
        const scanCard = document.getElementById('scan-result-card');
        if (scanCard) scanCard.innerHTML = '';
        this.render();
      } else {
        this.showToast('Silme işlemi tamamlanamadı.', 'error');
      }
    }
  },

  // Toplu Liste Karne (Resmi Sonuç Çizelgesi) Modalı
  showBulkReportCardListModal(instId, examId, selectedClass = 'all') {
    const existing = document.getElementById('bulk-report-modal');
    if (existing) existing.remove();

    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null);
    const exam = window.PortalStore.getExamById(effectiveInstId, examId);
    if (!exam) {
      this.showToast('Sınav bulunamadı.', 'error');
      return;
    }

    const rankings = window.PortalStore.calculateExamRankings(effectiveInstId, examId);
    if (rankings.length === 0) {
      this.showToast('Bu sınavda henüz optik okuma sonucu bulunmuyor.', 'warning');
      return;
    }

    const classes = [...new Set(rankings.map(r => r.className || 'Genel'))];
    const instName = session ? session.institutionName : 'EĞİTİM KURUMU';

    const modal = document.createElement('div');
    modal.id = 'bulk-report-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 max-w-5xl w-full shadow-2xl relative max-h-[94vh] flex flex-col">
        <!-- Başlık ve Üst Butonlar -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-800 mb-3 gap-3">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center text-2xl border border-purple-500/30">
              📋
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-black text-white">Toplu Liste Karne & Resmi Sonuç Çizelgesi</h3>
              <p class="text-xs text-slate-400 font-medium">${exam.title} (${rankings.length} Talebe Katıldı)</p>
            </div>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <button onclick="App.printBulkReportCardList('${effectiveInstId}', '${exam.id}')" class="flex-1 sm:flex-initial px-4 py-2 bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-600 hover:to-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer">
              <span>🖨️</span> <span>Listeyi Yazdır / PDF Al</span>
            </button>
            <button onclick="App.downloadResultsCsv('${effectiveInstId}', '${exam.id}', false)" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center gap-1 cursor-pointer" title="Excel Olarak İndir">
              <span>📥</span> <span>Excel</span>
            </button>
            <button onclick="document.getElementById('bulk-report-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
          </div>
        </div>

        <!-- Şube Filtreleme Çubuğu -->
        <div class="flex items-center justify-between mb-3 bg-slate-950 p-3 rounded-2xl border border-slate-800 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-300">Şube / Sınıf Seçiniz:</label>
            <select id="bulk-list-class-filter" onchange="App.handleBulkReportCardListFilter('${effectiveInstId}', '${exam.id}')" class="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-bold">
              <option value="all" ${selectedClass === 'all' ? 'selected' : ''}>Tüm Şubeler (${rankings.length} Talebe)</option>
              ${classes.map(c => `<option value="${c}" ${c === selectedClass ? 'selected' : ''}>${c} Şubesi (${rankings.filter(r => (r.className || 'Genel') === c).length} Talebe)</option>`).join('')}
            </select>
          </div>
          <div class="text-[11px] text-slate-400 font-mono">
            Puanlama Standardı: <strong class="text-amber-400 font-bold">Taban 200 • Tavan 500 Puan</strong>
          </div>
        </div>

        <!-- Önizleme Alanı (Kaydırılabilir) -->
        <div id="bulk-list-preview-container" class="flex-1 overflow-y-auto overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40 p-2" style="-webkit-overflow-scrolling: touch;">
          ${window.OpticalSheetGenerator.renderBulkReportCardListHtml(exam, rankings, instName, selectedClass)}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  handleBulkReportCardListFilter(instId, examId) {
    const select = document.getElementById('bulk-list-class-filter');
    const container = document.getElementById('bulk-list-preview-container');
    if (!select || !container) return;

    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null);
    const exam = window.PortalStore.getExamById(effectiveInstId, examId);
    const rankings = window.PortalStore.calculateExamRankings(effectiveInstId, examId);
    const instName = session ? session.institutionName : 'EĞİTİM KURUMU';

    container.innerHTML = window.OpticalSheetGenerator.renderBulkReportCardListHtml(exam, rankings, instName, select.value);
  },

  printBulkReportCardList(instId, examId) {
    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null);
    const exam = window.PortalStore.getExamById(effectiveInstId, examId);
    if (!exam) return;

    const rankings = window.PortalStore.calculateExamRankings(effectiveInstId, examId);
    const filterSelect = document.getElementById('bulk-list-class-filter');
    const selectedClass = filterSelect ? filterSelect.value : 'all';
    const instName = session ? session.institutionName : 'EĞİTİM KURUMU';

    const html = window.OpticalSheetGenerator.renderBulkReportCardListHtml(exam, rankings, instName, selectedClass);
    window.OpticalSheetGenerator.printBulkReportCardList(html);
  },

  // 9. SÜPER YÖNETİCİ: MERKEZİ ORTAK SINAVLAR VE LEADERBOARD
  renderSuperGlobalExams() {
    const globalExams = window.PortalStore.getGlobalExams();
    const institutions = window.PortalStore.getInstitutions();

    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-lg w-full max-w-full">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">🌐</span>
              <h2 class="text-xl font-black text-white tracking-tight">Merkezi Ortak Deneme Sınavları</h2>
            </div>
            <p class="text-xs text-slate-400 mt-1">Buradan açtığınız sınavlar sisteme kayıtlı tüm kurs ve okulların panellerinde anında görünür. Kurumlar optik formları okuttukça ortak derece sıralaması canlı oluşur.</p>
          </div>
          <button onclick="App.showCreateExamModal(null, true)" class="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer">
            <span>+</span> <span>Yeni Merkezi Ortak Sınav Aç</span>
          </button>
        </div>

        ${globalExams.length === 0 ? `
          <div class="bg-slate-900 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
            <span class="text-4xl block mb-2">🌐</span>
            <h3 class="text-base font-bold text-white">Henüz Ortak Sınav Tanımlanmadı</h3>
            <p class="text-xs text-slate-400 mt-1 mb-4">Tüm kurumların eşzamanlı katılabileceği ilk genel prova denemesini oluşturun.</p>
            <button onclick="App.showCreateExamModal(null, true)" class="px-4 py-2 bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl">
              Merkezi Sınav Oluştur
            </button>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${globalExams.map(gExam => {
              const globalRankings = window.PortalStore.calculateGlobalRankings(gExam.id);
              const participatingInsts = new Set(globalRankings.map(r => r.institutionId)).size;
              return `
                <div class="bg-gradient-to-b from-slate-900 to-cyan-950/30 border-2 border-cyan-500/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">Genel Ortak Sınav</span>
                      <span class="px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-bold">${gExam.questionCount} Soru</span>
                    </div>

                    <h3 class="text-base font-black text-white mb-1">${gExam.title}</h3>
                    <p class="text-xs text-slate-400">Tarih: <strong class="text-slate-200">${gExam.examDate}</strong> • Hedef: <strong class="text-slate-200">${gExam.targetClass}</strong></p>

                    <div class="grid grid-cols-2 gap-2 my-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-center">
                      <div>
                        <span class="block text-[10px] text-slate-500 font-bold uppercase">Katılan Kurum</span>
                        <span class="text-sm font-black text-cyan-400 font-mono">${participatingInsts} / ${institutions.length}</span>
                      </div>
                      <div>
                        <span class="block text-[10px] text-slate-500 font-bold uppercase">Toplam Talebe</span>
                        <span class="text-sm font-black text-emerald-400 font-mono">${globalRankings.length}</span>
                      </div>
                    </div>
                  </div>

                  <div class="mt-4 pt-3 border-t border-slate-800/80 flex flex-col gap-2">
                    <button onclick="App.viewGlobalExamLeaderboard('${gExam.id}')" class="w-full py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer">
                      <span>🏆</span> <span>Genel Derece Sıralaması</span>
                    </button>
                    <div class="flex gap-1.5">
                      <button onclick="App.showItemAnalysisModal(null, '${gExam.id}', true)" class="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1" title="Madde & Soru Analizi">
                        <span>📊</span> <span>Analiz</span>
                      </button>
                      <button onclick="App.showTopicAnalysisModal(null, '${gExam.id}', true)" class="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1" title="Konu & Kazanım Analizi">
                        <span>🎯</span> <span>Konu</span>
                      </button>
                      <button onclick="App.showEditExamModal(null, '${gExam.id}', true)" class="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1" title="Sınavı Düzenle & Soru İptali">
                        <span>✏️</span> <span>Düzenle</span>
                      </button>
                      <button onclick="App.downloadResultsCsv(null, '${gExam.id}', true)" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition" title="Tüm Kurumları Excel Olarak İndir (CSV)">
                        📥
                      </button>
                      <button onclick="App.deleteGlobalExamPrompt('${gExam.id}', '${gExam.title}')" class="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-xl transition cursor-pointer" title="Ortak Sınavı Sil">
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  },

  deleteGlobalExamPrompt(examId, title) {
    if (confirm(`"${title}" merkezi ortak sınavını silmek istediğinize emin misiniz? Tüm kurumlardan kaldırılacaktır.`)) {
      window.PortalStore.deleteGlobalExam(examId);
      this.showToast('Merkezi ortak sınav silindi.', 'info');
      this.render();
    }
  },

  viewGlobalExamLeaderboard(examId) {
    const globalExams = window.PortalStore.getGlobalExams();
    const exam = globalExams.find(e => e.id === examId);
    if (!exam) return;

    const rankings = window.PortalStore.calculateGlobalRankings(examId);

    const existing = document.getElementById('global-leaderboard-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'global-leaderboard-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-4xl w-full shadow-2xl relative max-h-[90vh] flex flex-col">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-800 mb-4 gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">🏆</span>
              <h3 class="text-base sm:text-lg font-black text-white">${exam.title} - Genel Derece Sıralaması</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">Tüm kurs ve okulların katılımıyla ortak sıralama tablosu (${rankings.length} Talebe)</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="App.showItemAnalysisModal(null, '${exam.id}', true)" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1 cursor-pointer">
              <span>📊</span> <span>Soru Analizi</span>
            </button>
            <button onclick="App.showTopicAnalysisModal(null, '${exam.id}', true)" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1 cursor-pointer">
              <span>🎯</span> <span>Konu Analizi</span>
            </button>
            <button onclick="App.downloadResultsCsv(null, '${exam.id}', true)" class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-black rounded-xl shadow transition flex items-center gap-1 cursor-pointer">
              <span>📥</span> <span>Excel İndir (CSV)</span>
            </button>
            <button onclick="document.getElementById('global-leaderboard-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
          </div>
        </div>

        <div class="overflow-y-auto overflow-x-auto w-full max-w-full flex-1 rounded-2xl border border-slate-800" style="-webkit-overflow-scrolling: touch;">
          <table class="w-full text-left text-xs min-w-[640px]">
            <thead class="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider sticky top-0">
              <tr>
                <th class="p-3 text-center">Genel Derece</th>
                <th class="p-3">Kurum Adı</th>
                <th class="p-3">No</th>
                <th class="p-3">Talebe Adı</th>
                <th class="p-3">Sınıfı</th>
                <th class="p-3 text-center">Doğru</th>
                <th class="p-3 text-center">Yanlış</th>
                <th class="p-3 text-center">Net</th>
                <th class="p-3 text-center">Puan</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/80">
              ${rankings.length === 0 ? `
                <tr>
                  <td colspan="9" class="p-8 text-center text-slate-500">Henüz hiçbir kurum bu sınava ait optik kağıt taratmadı.</td>
                </tr>
              ` : rankings.map(r => `
                <tr class="hover:bg-slate-800/40 transition">
                  <td class="p-3 text-center">
                    <span class="w-6 h-6 inline-flex items-center justify-center rounded-full font-black text-xs ${r.globalRank === 1 ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20' : (r.globalRank === 2 ? 'bg-slate-300 text-slate-950' : (r.globalRank === 3 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'))}">
                      ${r.globalRank}
                    </span>
                  </td>
                  <td class="p-3 font-bold text-cyan-300">${r.institutionName || '-'}</td>
                  <td class="p-3 font-mono font-bold text-emerald-400">${r.studentNo}</td>
                  <td class="p-3 font-bold text-white">${r.studentName}</td>
                  <td class="p-3 font-semibold text-slate-300">${r.className}</td>
                  <td class="p-3 text-center font-bold text-emerald-400">${r.totalCorrect}</td>
                  <td class="p-3 text-center font-bold text-rose-400">${r.totalWrong}</td>
                  <td class="p-3 text-center font-mono font-bold text-cyan-400">${r.totalNet}</td>
                  <td class="p-3 text-center font-mono font-black text-amber-400 text-sm">${r.totalScore}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  // ==========================================
  // 10. ELLE (MANUEL) OPTİK CEVAP VE NOT GİRİŞİ
  // ==========================================
  showManualResultModal(instId, examId, studentNoToPreload = null) {
    const existing = document.getElementById('manual-result-modal');
    if (existing) existing.remove();

    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null);
    const exam = window.PortalStore.getExamById(effectiveInstId, examId);
    if (!exam) {
      this.showToast('Sınav bulunamadı.', 'error');
      return;
    }

    const students = window.PortalStore.getStudents(effectiveInstId);
    const existingResults = window.PortalStore.getResultsByExam(effectiveInstId, examId);
    const existingResult = studentNoToPreload ? existingResults.find(r => r.studentNo === studentNoToPreload) : null;

    const initialAnswers = existingResult ? existingResult.answers : '';
    const initialBooklet = existingResult ? (existingResult.booklet || 'A') : 'A';
    const initialStudentNo = studentNoToPreload || (students[0] ? students[0].studentNo : '');
    const initialScoreOverride = (existingResult && existingResult.totalScore !== undefined) ? existingResult.totalScore : '';

    const modal = document.createElement('div');
    modal.id = 'manual-result-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-xl w-full shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">✍️</span>
            <div>
              <h3 class="text-base font-black text-white">Elle Optik Cevap & Not Girişi</h3>
              <p class="text-xs text-slate-400 font-medium">${exam.title} (${exam.questionCount} Soru)</p>
            </div>
          </div>
          <button onclick="document.getElementById('manual-result-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <form onsubmit="App.handleSaveManualResult(event, '${effectiveInstId}', '${exam.id}')" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Talebe Seçiniz</label>
              <select id="manual-student-select" onchange="App.handleManualStudentChange(this.value, '${effectiveInstId}')" class="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
                <option value="">-- Kayıtlı Listeden Seç --</option>
                ${students.map(s => `<option value="${s.studentNo}" ${s.studentNo === initialStudentNo ? 'selected' : ''}>${s.studentNo} - ${s.firstName} ${s.lastName} (${s.className})</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Talebe No (Manuel Giriş)</label>
              <input type="text" id="manual-student-no" required value="${initialStudentNo}" placeholder="Örn: 105" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Kitapçık Türü</label>
              <select id="manual-booklet-select" onchange="App.handleManualAnswersInput('${exam.id}')" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs">
                <option value="A" ${initialBooklet === 'A' ? 'selected' : ''}>A Kitapçığı</option>
                <option value="B" ${initialBooklet === 'B' ? 'selected' : ''}>B Kitapçığı</option>
                <option value="C" ${initialBooklet === 'C' ? 'selected' : ''}>C Kitapçığı</option>
                <option value="D" ${initialBooklet === 'D' ? 'selected' : ''}>D Kitapçığı</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Özel Puan (İsteğe Bağlı)</label>
              <input type="number" step="0.1" id="manual-score-override" placeholder="Otomatik hesaplanır" value="${initialScoreOverride}" class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-amber-300 font-mono text-xs focus:border-amber-400 focus:outline-none">
            </div>
          </div>

          <!-- Öğrenci Cevapları Girişi -->
          <div class="space-y-2 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-emerald-400 uppercase">Öğrenci Cevap Dizilimi (${exam.questionCount} Soru)</label>
              <span id="manual-char-count" class="text-[11px] font-mono text-slate-400">0 / ${exam.questionCount}</span>
            </div>
            <textarea id="manual-answers-input" rows="3" oninput="App.handleManualAnswersInput('${exam.id}')" placeholder="Örn: ABCDABCD... (Boş sorular için boşluk bırakınız)" class="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white tracking-widest focus:border-emerald-500 focus:outline-none uppercase">${initialAnswers}</textarea>
            <div class="flex gap-2">
              <button type="button" onclick="App.fillSampleAnswers('${exam.id}', 'A')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 rounded font-mono">Tümünü 'A' Yap</button>
              <button type="button" onclick="App.fillSampleAnswers('${exam.id}', 'key')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-cyan-300 rounded font-mono">Cevap Anahtarını Kopyala</button>
              <button type="button" onclick="App.fillSampleAnswers('${exam.id}', 'clear')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-rose-300 rounded font-mono">Temizle</button>
            </div>
          </div>

          <!-- Canlı Önizleme Kartı -->
          <div id="manual-preview-card" class="grid grid-cols-5 gap-2 text-center p-3 bg-slate-950 rounded-2xl border border-slate-800">
            <div>
              <span class="block text-[10px] text-slate-500 font-bold uppercase">Doğru</span>
              <span id="manual-prev-correct" class="text-base font-black text-emerald-400 font-mono">0</span>
            </div>
            <div>
              <span class="block text-[10px] text-slate-500 font-bold uppercase">Yanlış</span>
              <span id="manual-prev-wrong" class="text-base font-black text-rose-400 font-mono">0</span>
            </div>
            <div>
              <span class="block text-[10px] text-slate-500 font-bold uppercase">Boş</span>
              <span id="manual-prev-empty" class="text-base font-black text-slate-400 font-mono">0</span>
            </div>
            <div>
              <span class="block text-[10px] text-slate-500 font-bold uppercase">Net</span>
              <span id="manual-prev-net" class="text-base font-black text-cyan-400 font-mono">0.00</span>
            </div>
            <div>
              <span class="block text-[10px] text-slate-500 font-bold uppercase">Hesaplanan Puan</span>
              <span id="manual-prev-score" class="text-base font-black text-amber-400 font-mono">0.0</span>
            </div>
          </div>

          <div class="pt-2 flex items-center gap-2">
            ${existingResult ? `
              <button type="button" onclick="App.deleteExamResultPrompt('${effectiveInstId}', '${exam.id}', '${existingResult.id || ''}', '${existingResult.studentNo}', '${encodeURIComponent(existingResult.studentName || '')}')" class="py-3.5 px-4 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white font-bold text-xs rounded-xl border border-rose-500/30 transition flex items-center justify-center gap-1.5 cursor-pointer" title="Bu optik okuma kaydını sil">
                <span>🗑️</span> <span>Sonucu Sil</span>
              </button>
            ` : ''}
            <button type="submit" class="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer">
              <span>💾</span> <span>Sonucu Kaydet & Sıralamayı Güncelle</span>
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    this.handleManualAnswersInput(exam.id);
  },

  handleManualStudentChange(studentNo, instId) {
    const input = document.getElementById('manual-student-no');
    if (input && studentNo) {
      input.value = studentNo;
    }
  },

  handleManualAnswersInput(examId) {
    const session = window.PortalStore.getCurrentSession();
    const instId = session ? session.institutionId : null;
    const exam = window.PortalStore.getExamById(instId, examId) || window.PortalStore.getGlobalExams().find(e => e.id === examId);
    if (!exam) return;

    const answersInput = document.getElementById('manual-answers-input');
    const bookletSelect = document.getElementById('manual-booklet-select');
    const charCount = document.getElementById('manual-char-count');

    const answers = answersInput ? answersInput.value.toUpperCase() : '';
    const booklet = bookletSelect ? bookletSelect.value : 'A';

    if (charCount) {
      charCount.textContent = `${answers.length} / ${exam.questionCount}`;
    }

    const scored = window.PortalStore.scoreStudentAnswers(answers, exam, booklet);
    if (!scored) return;

    const elC = document.getElementById('manual-prev-correct');
    const elW = document.getElementById('manual-prev-wrong');
    const elE = document.getElementById('manual-prev-empty');
    const elN = document.getElementById('manual-prev-net');
    const elS = document.getElementById('manual-prev-score');

    if (elC) elC.textContent = scored.totalCorrect;
    if (elW) elW.textContent = scored.totalWrong;
    if (elE) elE.textContent = scored.totalEmpty;
    if (elN) elN.textContent = scored.totalNet;
    if (elS) elS.textContent = scored.totalScore;
  },

  fillSampleAnswers(examId, type) {
    const session = window.PortalStore.getCurrentSession();
    const instId = session ? session.institutionId : null;
    const exam = window.PortalStore.getExamById(instId, examId) || window.PortalStore.getGlobalExams().find(e => e.id === examId);
    if (!exam) return;

    const answersInput = document.getElementById('manual-answers-input');
    const bookletSelect = document.getElementById('manual-booklet-select');
    const booklet = bookletSelect ? bookletSelect.value : 'A';
    const qCount = parseInt(exam.questionCount, 10) || 20;

    if (!answersInput) return;

    if (type === 'clear') {
      answersInput.value = '';
    } else if (type === 'A') {
      answersInput.value = 'A'.repeat(qCount);
    } else if (type === 'key') {
      const key = (exam.answerKeys && exam.answerKeys[booklet]) ? exam.answerKeys[booklet] : 'A'.repeat(qCount);
      answersInput.value = key;
    }

    this.handleManualAnswersInput(examId);
  },

  handleSaveManualResult(e, instId, examId) {
    e.preventDefault();
    const studentNo = document.getElementById('manual-student-no').value.trim();
    if (!studentNo) {
      this.showToast('Lütfen talebe numarasını giriniz.', 'warning');
      return;
    }

    const booklet = document.getElementById('manual-booklet-select').value;
    const answers = document.getElementById('manual-answers-input').value.trim().toUpperCase();
    const scoreOverride = document.getElementById('manual-score-override').value;

    const res = window.PortalStore.saveManualExamResult(instId, {
      examId,
      studentNo,
      booklet,
      answers,
      scoreOverride: scoreOverride !== '' ? parseFloat(scoreOverride) : undefined
    });

    if (res && res.success) {
      this.showToast(`✓ #${studentNo} için optik cevaplar ve not başarıyla kaydedildi!`, 'success');
      const modal = document.getElementById('manual-result-modal');
      if (modal) modal.remove();
      this.render();
    } else {
      this.showToast('Kayıt başarısız: ' + (res ? res.message : ''), 'error');
    }
  },

  // ==========================================
  // 10.B. FMT İLE OPTİK OKUYUCU DOSYASI (.TXT / .DAT) İÇE AKTARMA MOTORU
  // ==========================================
  showImportTxtResultsModal(instId, preselectedExamId = null) {
    const existing = document.getElementById('import-txt-modal');
    if (existing) existing.remove();

    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null);
    const exams = window.PortalStore.getExams(effectiveInstId) || [];

    if (exams.length === 0) {
      this.showToast('Lütfen önce "Sınavlar" sekmesinden bir deneme sınavı oluşturunuz.', 'warning');
      return;
    }

    const defaultExamId = preselectedExamId || (exams[0] ? exams[0].id : '');
    const currentExam = exams.find(e => e.id === defaultExamId) || exams[0];

    // Aktif FMT şablonunu belirle (varsayılan: sınavın soru sayısına en uygun şablon)
    const fmtList = window.PortalStore.getFmtTemplates(effectiveInstId);
    let initialFmt = fmtList[0];
    if (currentExam.questionCount === 60) {
      initialFmt = fmtList.find(f => f.id === 'fmt_sekonik_60') || fmtList[0];
    } else if (currentExam.questionCount === 120) {
      initialFmt = fmtList.find(f => f.id === 'fmt_tyt_120') || fmtList[0];
    }
    this.activeFmt = JSON.parse(JSON.stringify(initialFmt));

    const modal = document.createElement('div');
    modal.id = 'import-txt-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div ondragover="event.preventDefault();" 
           ondrop="App.handleSmartFileDrop(event, '${effectiveInstId}');"
           class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 max-w-4xl w-full shadow-2xl relative max-h-[94vh] flex flex-col">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-3.5 flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-2xl border border-indigo-500/30">
              📑
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-black text-white">Optik Okuyucu Dosyası Yükle (.FMT ve .TXT)</h3>
              <p class="text-xs text-slate-400 font-medium">Önce optik formatı (.FMT) belirleyin, ardından sınav sonuç dosyasını (.TXT/.DAT) hatasız aktarın.</p>
            </div>
          </div>
          <button onclick="document.getElementById('import-txt-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <form onsubmit="App.handleImportTxtSubmit(event, '${effectiveInstId}')" class="space-y-3.5 flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
          <!-- Hedef Sınav Seçimi -->
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex-1">
              <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Hedef Deneme Sınavı</label>
              <select id="import-txt-exam-select" onchange="App.handleImportExamChange('${effectiveInstId}', this.value)" class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-indigo-500 focus:outline-none">
                ${exams.map(e => `<option value="${e.id}" ${e.id === defaultExamId ? 'selected' : ''}>${e.title} (${e.questionCount} Soru)</option>`).join('')}
              </select>
            </div>
            <div class="w-full sm:w-56">
              <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Kitapçık Seçimi</label>
              <select id="import-txt-booklet-mode" onchange="App.updateTxtImportPreview('${effectiveInstId}')" class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-indigo-500 focus:outline-none">
                <option value="auto">Otomatik Tespit (FMT'den Oku)</option>
                <option value="force_A">Tümünü A Kitapçığı Kabul Et</option>
                <option value="force_B">Tümünü B Kitapçığı Kabul Et</option>
                <option value="force_C">Tümünü C Kitapçığı Kabul Et</option>
                <option value="force_D">Tümünü D Kitapçığı Kabul Et</option>
              </select>
            </div>
          </div>

          <!-- İki Adımlı Görsel Kılavuz -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-slate-950/90 rounded-2xl border border-slate-800 text-xs">
            <div class="flex items-center gap-2.5 p-2.5 bg-indigo-950/40 rounded-xl border border-indigo-500/30">
              <span class="text-2xl">1️⃣</span>
              <div>
                <strong class="text-indigo-300 block font-bold text-xs">1. Dosya: FMT (Sütun Düzeni)</strong>
                <span class="text-[11px] text-slate-400">Listeden şablon seçin veya <code>.fmt</code> dosyanızı seçip bırakın.</span>
              </div>
            </div>
            <div class="flex items-center gap-2.5 p-2.5 bg-emerald-950/40 rounded-xl border border-emerald-500/30">
              <span class="text-2xl">2️⃣</span>
              <div>
                <strong class="text-emerald-300 block font-bold text-xs">2. Dosya: TXT / DAT (Talebe Cevapları)</strong>
                <span class="text-[11px] text-slate-400">Notları yapıştırın veya <code>.txt</code> dosyanızı doğrudan kutunun içine bırakın.</span>
              </div>
            </div>
          </div>

          <!-- ADIM 1: OPTİK FORMAT (.FMT) BÖLÜMÜ -->
          <div ondragover="event.preventDefault(); this.classList.add('border-indigo-400');"
               ondragleave="this.classList.remove('border-indigo-400');"
               ondrop="event.preventDefault(); this.classList.remove('border-indigo-400'); App.handleSmartFileDrop(event, '${effectiveInstId}');"
               class="bg-indigo-950/20 border border-indigo-500/30 rounded-2xl p-3.5 space-y-3 transition">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-500/20 pb-2.5">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-lg bg-indigo-500 text-slate-950 font-black text-xs flex items-center justify-center">1</span>
                <div>
                  <h4 class="text-xs font-black text-white uppercase tracking-wider">Optik Format (.FMT) Tanımı</h4>
                  <p class="text-[10px] text-indigo-300">Optik okuyucunuzun sütun dizilimi. Şablon seçebilir veya .fmt dosyası yükleyebilirsiniz.</p>
                </div>
              </div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <button type="button" onclick="App.toggleFmtFieldEditor()" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px] font-bold rounded-lg border border-indigo-500/30 transition cursor-pointer flex items-center gap-1">
                  <span>⚙️</span> <span id="btn-toggle-fmt-editor-text">Sütunları Düzenle</span>
                </button>
                <button type="button" onclick="App.saveCurrentFmtPrompt('${effectiveInstId}')" class="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-bold rounded-lg border border-emerald-500/40 transition cursor-pointer flex items-center gap-1">
                  <span>💾</span> <span>FMT'yi Kaydet</span>
                </button>
              </div>
            </div>

            <!-- FMT Seçim ve Yükleme Araç Çubuğu -->
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div class="sm:col-span-7">
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Kullanılacak FMT Formatı</label>
                <select id="import-fmt-select" onchange="App.switchFmtTemplate('${effectiveInstId}', this.value)" class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-indigo-500 focus:outline-none">
                  ${fmtList.map(f => `<option value="${f.id}" ${f.id === this.activeFmt.id ? 'selected' : ''}>${f.name} ${f.isCustom ? '★ (Özel)' : ''}</option>`).join('')}
                </select>
              </div>

              <div class="sm:col-span-5 flex items-end gap-2">
                <input type="file" id="fmt-file-input" accept=".fmt,.txt,.dat,.cfg,.ini" onchange="App.handleFmtFileSelected(this, '${effectiveInstId}')" class="hidden">
                <button type="button" onclick="document.getElementById('fmt-file-input').click()" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer">
                  <span>📁</span> <span>.FMT Dosyası Seç</span>
                </button>
                <button type="button" onclick="App.toggleFmtPasteBox()" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition cursor-pointer" title="FMT Metnini Göster / Yapıştır">
                  📝 Metin
                </button>
              </div>
            </div>

            <!-- FMT Metni Yapıştırma Kutusu (Gizlenebilir) -->
            <div id="fmt-paste-box" class="hidden p-2.5 bg-slate-950 rounded-xl border border-indigo-800/60 space-y-2 animate-fade-in">
              <label class="block text-[11px] font-bold text-indigo-300">FMT Dosyası İçeriği (Örnek: Sekonik / Kuantum formatı):</label>
              <textarea id="fmt-paste-textarea" oninput="App.handleFmtPasteInput('${effectiveInstId}')" rows="4" class="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-indigo-200 focus:outline-none focus:border-indigo-500 leading-relaxed">${this.activeFmt.rawText || ''}</textarea>
              <p class="text-[10px] text-slate-400">Örnek Sekonik: <code>1 1 KTP</code> / <code>2 11 OGRNO</code> / <code>12 35 ADSOYAD</code> / <code>36 39 SINIF</code> / <code>40 129 CEVAP</code></p>
            </div>

            <!-- FMT Görsel Rozetleri (Aktif Dilimler) -->
            <div id="fmt-visual-badge-container">
              ${this.renderFmtVisualBadge(this.activeFmt)}
            </div>

            <!-- FMT Sütun Elle Düzenleme Formu (Gizlenebilir) -->
            <div id="fmt-field-editor" class="hidden bg-slate-950/80 rounded-xl border border-indigo-500/30 p-3 space-y-2.5 animate-fade-in">
              <span class="block text-[11px] font-bold text-white uppercase">Sütun Başlangıç ve Bitiş Değerlerini Düzenle:</span>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                ${this.renderFmtFieldInputs(this.activeFmt, effectiveInstId)}
              </div>
            </div>
          </div>

          <!-- ADIM 2: OPTİK SONUÇ DOSYASI (.TXT / .DAT) BÖLÜMÜ -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">2</span>
                <div>
                  <h4 class="text-xs font-black text-white uppercase tracking-wider">Optik Sonuç Dosyası (.TXT / .DAT / .CSV)</h4>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" onclick="App.switchTxtImportTab('paste')" id="btn-txt-tab-paste" class="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-600 text-white transition cursor-pointer">📋 Metin Yapıştır</button>
                <button type="button" onclick="App.switchTxtImportTab('file')" id="btn-txt-tab-file" class="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 transition cursor-pointer">📁 Dosya Seç (.txt, .dat)</button>
              </div>
            </div>

            <!-- Metin Yapıştırma Alanı -->
            <div id="txt-import-pane-paste" class="flex flex-col">
              <textarea id="import-txt-textarea" 
                        oninput="App.updateTxtImportPreview('${effectiveInstId}')" 
                        ondragover="event.preventDefault(); this.classList.add('border-emerald-400', 'bg-emerald-950/20');"
                        ondragleave="this.classList.remove('border-emerald-400', 'bg-emerald-950/20');"
                        ondrop="this.classList.remove('border-emerald-400', 'bg-emerald-950/20'); App.handleSmartFileDrop(event, '${effectiveInstId}');"
                        placeholder="Optik okuyucu dosyasının satırlarını buraya yapıştırabilir veya .txt / .dat dosyanızı doğrudan bu alana sürükleyip bırakabilirsiniz...&#10;Örnek:&#10;A  352         4FMUHAMMEDAZİZ İNAN              AAACDCBDACCADD...&#10;B  105         4FAHMET YILMAZ                   CDCACCCADDCDBD..." 
                        class="w-full p-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs font-mono text-emerald-300 focus:border-indigo-500 focus:outline-none resize-none leading-relaxed h-28 transition"></textarea>
            </div>

            <!-- Dosya Seçme Alanı -->
            <div id="txt-import-pane-file" 
                 ondragover="event.preventDefault(); this.classList.add('border-emerald-500', 'bg-emerald-950/40');" 
                 ondragleave="this.classList.remove('border-emerald-500', 'bg-emerald-950/40');" 
                 ondrop="event.preventDefault(); this.classList.remove('border-emerald-500', 'bg-emerald-950/40'); App.handleSmartFileDrop(event, '${effectiveInstId}');"
                 class="hidden flex-col items-center justify-center p-5 border-2 border-dashed border-slate-800 hover:border-emerald-500 rounded-2xl bg-slate-950/60 transition text-center min-h-[110px] cursor-pointer"
                 onclick="document.getElementById('import-txt-file-input').click()">
              <span class="text-3xl mb-1">📁</span>
              <p class="text-xs text-white font-bold mb-0.5">Talebe cevaplarının bulunduğu TXT veya DAT dosyanızı buraya sürükleyip bırakın</p>
              <input type="file" id="import-txt-file-input" accept=".txt,.dat,.csv" onchange="App.handleTxtFileSelected(this)" class="hidden">
              <button type="button" onclick="event.stopPropagation(); document.getElementById('import-txt-file-input').click()" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer mt-1">
                Dosya Seçiniz (.txt, .dat)
              </button>
              <div id="import-txt-file-info" class="text-xs font-mono text-emerald-400 mt-2 font-bold"></div>
            </div>
          </div>

          <!-- ADIM 3: CANLI ÖNİZLEME (FMT Cetveli + Canlı Net/Puan Tablosu) -->
          <div id="import-txt-preview-section">
            <div class="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 text-center text-slate-500 text-xs font-medium">
              Yukarıya optik dosyasını yapıştırdığınızda veya dosya seçtiğinizde FMT cetveli ve canlı net/puan tablosu anında burada görüntülenecektir.
            </div>
          </div>

          <!-- Otomatik Kayıt Onayı -->
          <div class="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
            <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium">
              <input type="checkbox" id="import-txt-autoregister" checked class="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer">
              <span>Listede olmayan yeni talebeleri kurumuma otomatik kaydet</span>
            </label>
            <span class="text-[10px] text-slate-500 font-mono">Otomatik Sınıf & No</span>
          </div>

          <!-- İşlem Butonları -->
          <div class="pt-1 flex gap-2">
            <button type="button" onclick="document.getElementById('import-txt-modal').remove()" class="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
              Vazgeç
            </button>
            <button type="submit" class="flex-2 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer">
              <span>🚀</span> <span>FMT Kurallarıyla Sonuçları Portala Aktar</span>
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    this.updateTxtImportPreview(effectiveInstId);
  },

  handleImportExamChange(instId, examId) {
    const exam = window.PortalStore.getExamById(instId, examId);
    if (exam && this.activeFmt) {
      const qCount = parseInt(exam.questionCount, 10) || 20;
      if (this.activeFmt.fields && this.activeFmt.fields.answers) {
        this.activeFmt.fields.answers.length = qCount;
        this.activeFmt.fields.answers.end = this.activeFmt.fields.answers.start + qCount - 1;
      }
      const badgeBox = document.getElementById('fmt-visual-badge-container');
      if (badgeBox) badgeBox.innerHTML = this.renderFmtVisualBadge(this.activeFmt);
      const editorBox = document.getElementById('fmt-field-editor');
      if (editorBox) {
        editorBox.innerHTML = `
          <span class="block text-[11px] font-bold text-white uppercase">Sütun Başlangıç ve Bitiş Değerlerini Düzenle:</span>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            ${this.renderFmtFieldInputs(this.activeFmt, instId)}
          </div>
        `;
      }
    }
    this.updateTxtImportPreview(instId);
  },

  renderFmtVisualBadge(fmt) {
    if (!fmt || !fmt.fields) return '';
    const f = fmt.fields;
    return `
      <div class="flex flex-wrap items-center gap-1.5 text-xs font-mono">
        <span class="px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
          <strong class="font-sans text-[10px] text-slate-400 block">Kitapçık:</strong>
          Sütun ${f.booklet.start}-${f.booklet.end}
        </span>
        <span class="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <strong class="font-sans text-[10px] text-slate-400 block">Talebe No:</strong>
          Sütun ${f.studentNo.start}-${f.studentNo.end} (${f.studentNo.length} Hane)
        </span>
        <span class="px-2 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40">
          <strong class="font-sans text-[10px] text-slate-400 block">Adı Soyadı:</strong>
          Sütun ${f.studentName.start}-${f.studentName.end} (${f.studentName.length} Hane)
        </span>
        <span class="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <strong class="font-sans text-[10px] text-slate-400 block">Sınıf / Şube:</strong>
          Sütun ${f.className.start}-${f.className.end} (${f.className.length} Hane)
        </span>
        <span class="px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex-1 min-w-[150px]">
          <strong class="font-sans text-[10px] text-slate-400 block">Cevaplar:</strong>
          Sütun ${f.answers.start}-${f.answers.end} (${f.answers.length} Soru)
        </span>
      </div>
      ${(fmt.subjects && fmt.subjects.length > 0) ? `
        <div class="mt-1.5 flex flex-wrap gap-1 text-[10px] font-mono text-cyan-300">
          ${fmt.subjects.map(s => `<span class="bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/50">${s.name}: ${s.start}-${s.end}</span>`).join(' ')}
        </div>
      ` : ''}
    `;
  },

  renderFmtFieldInputs(fmt, instId) {
    if (!fmt || !fmt.fields) return '';
    const f = fmt.fields;
    const items = [
      { key: 'booklet', label: 'Kitapçık', obj: f.booklet },
      { key: 'studentNo', label: 'Talebe No', obj: f.studentNo },
      { key: 'studentName', label: 'Adı Soyadı', obj: f.studentName },
      { key: 'className', label: 'Sınıf / Şube', obj: f.className },
      { key: 'answers', label: 'Cevaplar', obj: f.answers }
    ];

    return items.map(it => `
      <div class="bg-slate-900 p-2 rounded-xl border border-slate-800">
        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">${it.label}</label>
        <div class="flex items-center gap-1">
          <input type="number" min="1" value="${it.obj.start}" oninput="App.handleFmtFieldChange('${it.key}', 'start', this.value, '${instId}')" class="w-full px-1.5 py-1 bg-slate-950 border border-slate-700 rounded text-center text-white font-mono font-bold text-xs" title="Başlangıç sütunu">
          <span class="text-slate-500">-</span>
          <input type="number" min="1" value="${it.obj.end}" oninput="App.handleFmtFieldChange('${it.key}', 'end', this.value, '${instId}')" class="w-full px-1.5 py-1 bg-slate-950 border border-slate-700 rounded text-center text-white font-mono font-bold text-xs" title="Bitiş sütunu">
        </div>
      </div>
    `).join('');
  },

  handleFmtFieldChange(fieldKey, prop, val, instId) {
    if (!this.activeFmt || !this.activeFmt.fields || !this.activeFmt.fields[fieldKey]) return;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) return;

    this.activeFmt.fields[fieldKey][prop] = num;
    const f = this.activeFmt.fields[fieldKey];
    if (f.end >= f.start) {
      f.length = (f.end - f.start + 1);
    }

    const badgeBox = document.getElementById('fmt-visual-badge-container');
    if (badgeBox) badgeBox.innerHTML = this.renderFmtVisualBadge(this.activeFmt);
    this.updateTxtImportPreview(instId);
  },

  toggleFmtFieldEditor() {
    const editor = document.getElementById('fmt-field-editor');
    const btnText = document.getElementById('btn-toggle-fmt-editor-text');
    if (!editor) return;
    const isHidden = editor.classList.contains('hidden');
    if (isHidden) {
      editor.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Kapat ▲';
    } else {
      editor.classList.add('hidden');
      if (btnText) btnText.textContent = 'Sütunları Düzenle';
    }
  },

  toggleFmtPasteBox() {
    const box = document.getElementById('fmt-paste-box');
    if (!box) return;
    box.classList.toggle('hidden');
  },

  switchFmtTemplate(instId, tplId) {
    const fmtList = window.PortalStore.getFmtTemplates(instId);
    const selected = fmtList.find(f => f.id === tplId);
    if (!selected) return;

    this.activeFmt = JSON.parse(JSON.stringify(selected));

    const examSelect = document.getElementById('import-txt-exam-select');
    const examId = examSelect ? examSelect.value : null;
    const exam = window.PortalStore.getExamById(instId, examId);
    if (exam && this.activeFmt.fields && this.activeFmt.fields.answers) {
      const qCount = parseInt(exam.questionCount, 10) || 20;
      this.activeFmt.fields.answers.length = qCount;
      this.activeFmt.fields.answers.end = this.activeFmt.fields.answers.start + qCount - 1;
    }

    const badgeBox = document.getElementById('fmt-visual-badge-container');
    if (badgeBox) badgeBox.innerHTML = this.renderFmtVisualBadge(this.activeFmt);

    const ta = document.getElementById('fmt-paste-textarea');
    if (ta) ta.value = this.activeFmt.rawText || '';

    const editorBox = document.getElementById('fmt-field-editor');
    if (editorBox) {
      editorBox.innerHTML = `
        <span class="block text-[11px] font-bold text-white uppercase">Sütun Başlangıç ve Bitiş Değerlerini Düzenle:</span>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          ${this.renderFmtFieldInputs(this.activeFmt, instId)}
        </div>
      `;
    }

    this.showToast(`✓ Format değiştirildi: ${this.activeFmt.name}`, 'info');
    this.updateTxtImportPreview(instId);
  },

  handleFmtFileSelected(input, instId) {
    const file = input.files && input.files[0];
    if (!file) return;

    const examSelect = document.getElementById('import-txt-exam-select');
    const examId = examSelect ? examSelect.value : null;
    const exam = window.PortalStore.getExamById(instId, examId);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const parsedFmt = window.PortalStore.parseFmtDefinition(content, exam);
      parsedFmt.name = file.name.replace(/\.[^/.]+$/, '') + ' (.FMT)';
      this.activeFmt = parsedFmt;

      const badgeBox = document.getElementById('fmt-visual-badge-container');
      if (badgeBox) badgeBox.innerHTML = this.renderFmtVisualBadge(this.activeFmt);

      const ta = document.getElementById('fmt-paste-textarea');
      if (ta) ta.value = content;

      const editorBox = document.getElementById('fmt-field-editor');
      if (editorBox) {
        editorBox.innerHTML = `
          <span class="block text-[11px] font-bold text-white uppercase">Sütun Başlangıç ve Bitiş Değerlerini Düzenle:</span>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            ${this.renderFmtFieldInputs(this.activeFmt, instId)}
          </div>
        `;
      }

      this.showToast(`✓ "${file.name}" FMT dosyası başarıyla çözümlendi!`, 'success');
      this.updateTxtImportPreview(instId);
    };
    reader.readAsText(file, 'UTF-8');
  },

  handleFmtPasteInput(instId) {
    const ta = document.getElementById('fmt-paste-textarea');
    if (!ta) return;
    const content = ta.value;

    const examSelect = document.getElementById('import-txt-exam-select');
    const examId = examSelect ? examSelect.value : null;
    const exam = window.PortalStore.getExamById(instId, examId);

    const parsedFmt = window.PortalStore.parseFmtDefinition(content, exam);
    parsedFmt.name = 'Özel Yapıştırılan FMT';
    this.activeFmt = parsedFmt;

    const badgeBox = document.getElementById('fmt-visual-badge-container');
    if (badgeBox) badgeBox.innerHTML = this.renderFmtVisualBadge(this.activeFmt);

    const editorBox = document.getElementById('fmt-field-editor');
    if (editorBox) {
      editorBox.innerHTML = `
        <span class="block text-[11px] font-bold text-white uppercase">Sütun Başlangıç ve Bitiş Değerlerini Düzenle:</span>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          ${this.renderFmtFieldInputs(this.activeFmt, instId)}
        </div>
      `;
    }

    this.updateTxtImportPreview(instId);
  },

  saveCurrentFmtPrompt(instId) {
    if (!this.activeFmt) return;
    const name = prompt('Bu FMT formatına bir isim veriniz:', this.activeFmt.name || 'Özel Kurum FMT');
    if (!name) return;

    this.activeFmt.name = name.trim();
    const res = window.PortalStore.saveFmtTemplate(instId, this.activeFmt);
    if (res && res.success) {
      this.showToast(`✓ "${name}" FMT şablonu kurumunuza kaydedildi!`, 'success');
      const fmtSelect = document.getElementById('import-fmt-select');
      if (fmtSelect) {
        const fmtList = window.PortalStore.getFmtTemplates(instId);
        fmtSelect.innerHTML = fmtList.map(f => `<option value="${f.id}" ${f.id === res.template.id ? 'selected' : ''}>${f.name} ${f.isCustom ? '★ (Özel)' : ''}</option>`).join('');
      }
    } else {
      this.showToast('Kayıt başarısız: ' + (res ? res.message : ''), 'error');
    }
  },

  switchTxtImportTab(mode) {
    const panePaste = document.getElementById('txt-import-pane-paste');
    const paneFile = document.getElementById('txt-import-pane-file');
    const btnPaste = document.getElementById('btn-txt-tab-paste');
    const btnFile = document.getElementById('btn-txt-tab-file');

    if (mode === 'paste') {
      if (panePaste) panePaste.classList.remove('hidden');
      if (paneFile) {
        paneFile.classList.add('hidden');
        paneFile.classList.remove('flex');
      }
      if (btnPaste) btnPaste.className = 'px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-600 text-white transition cursor-pointer';
      if (btnFile) btnFile.className = 'px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 transition cursor-pointer';
    } else {
      if (panePaste) panePaste.classList.add('hidden');
      if (paneFile) {
        paneFile.classList.remove('hidden');
        paneFile.classList.add('flex');
      }
      if (btnPaste) btnPaste.className = 'px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 transition cursor-pointer';
      if (btnFile) btnFile.className = 'px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-600 text-white transition cursor-pointer';
    }
  },

  handleSmartFileDrop(e, instId) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const dt = e ? e.dataTransfer : null;
    if (!dt || !dt.files || dt.files.length === 0) return;
    const files = Array.from(dt.files);

    const fmtFile = files.find(f => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      return ['fmt', 'cfg', 'ini'].includes(ext);
    });

    const txtFile = files.find(f => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      return ['txt', 'dat', 'csv'].includes(ext);
    }) || (files.length === 1 && !fmtFile ? files[0] : null);

    if (fmtFile) {
      this.handleFmtFileSelected({ files: [fmtFile] }, instId);
    }
    if (txtFile) {
      this.handleTxtFileSelected({ files: [txtFile] });
    }
  },

  handleTxtFileDrop(e) {
    const session = window.PortalStore.getCurrentSession();
    const instId = session ? session.institutionId : null;
    this.handleSmartFileDrop(e, instId);
  },

  handleTxtFileSelected(input) {
    const file = input.files && input.files[0];
    const info = document.getElementById('import-txt-file-info');
    if (!file) return;

    if (info) info.textContent = `Seçilen: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const ta = document.getElementById('import-txt-textarea');
      if (ta) ta.value = content;
      this.showToast(`✓ "${file.name}" yüklendi.`, 'success');
      const session = window.PortalStore.getCurrentSession();
      const instId = session ? session.institutionId : null;
      this.updateTxtImportPreview(instId);
    };
    reader.readAsText(file, 'UTF-8');
  },

  handleImportTxtSubmit(e, instId) {
    e.preventDefault();
    const examSelect = document.getElementById('import-txt-exam-select');
    const examId = examSelect ? examSelect.value : null;
    const textarea = document.getElementById('import-txt-textarea');
    const autoRegister = document.getElementById('import-txt-autoregister') ? document.getElementById('import-txt-autoregister').checked : true;
    const rawContent = textarea ? textarea.value : '';

    const bookletSelect = document.getElementById('import-txt-booklet-mode');

    const options = {
      bookletMode: bookletSelect ? bookletSelect.value : 'auto'
    };

    if (!rawContent || !rawContent.trim()) {
      this.showToast('Lütfen metin alanına sonuçları yapıştırınız veya dosya seçiniz.', 'warning');
      return;
    }

    const exam = window.PortalStore.getExamById(instId, examId);
    if (!exam) {
      this.showToast('Seçilen sınav bulunamadı.', 'error');
      return;
    }

    const result = this.processOpticalTxtLines(instId, exam, rawContent, autoRegister, options);
    if (result && result.count > 0) {
      const modal = document.getElementById('import-txt-modal');
      if (modal) modal.remove();
      this.showToast(`✓ ${result.count} talebenin sınav sonucu başarıyla portala aktarıldı!`, 'success');
      if (result.missingKeys && result.missingKeys.length > 0) {
        setTimeout(() => {
          this.showToast(`⚠️ Dikkat: (${result.missingKeys.join(', ')}) Kitapçığı cevap anahtarı henüz girilmemiş. Cevaplar kaydedildi, cevap anahtarını girdiğinizde netler otomatik hesaplanacaktır.`, 'warning');
        }, 800);
      }
      this.render();
    } else {
      this.showToast('Dosyadan okunabilir sınav sonucu çıkarılamadı. Lütfen satırları kontrol ediniz.', 'error');
    }
  },

  renderFmtRuler(sampleLine, fmt) {
    if (!sampleLine || !fmt || !fmt.fields) return '';
    const f = fmt.fields;
    const len = sampleLine.length;

    // Alanların değerlerini al
    const bSlice = (f.booklet.start > 0 && f.booklet.start <= len) ? sampleLine.substring(f.booklet.start - 1, f.booklet.end).trim() : '-';
    const noSlice = (f.studentNo.start > 0 && f.studentNo.start <= len) ? sampleLine.substring(f.studentNo.start - 1, f.studentNo.end).trim() : '-';
    const nameSlice = (f.studentName.start > 0 && f.studentName.start <= len) ? sampleLine.substring(f.studentName.start - 1, f.studentName.end).trim() : '-';
    const classSlice = (f.className.start > 0 && f.className.start <= len) ? sampleLine.substring(f.className.start - 1, f.className.end).trim() : '-';
    const ansSlice = (f.answers.start > 0 && f.answers.start <= len) ? sampleLine.substring(f.answers.start - 1, f.answers.end).trim() : '';

    return `
      <div class="bg-slate-900/90 rounded-2xl border border-slate-800 p-3.5 space-y-2.5">
        <div class="flex items-center justify-between text-[11px] font-bold">
          <span class="text-white flex items-center gap-1.5">
            <span>📏</span> <span>1. Satır Canlı FMT Dilimleme Cetveli</span>
          </span>
          <span class="font-mono text-cyan-400">Satır Uzunluğu: ${len} Karakter</span>
        </div>

        <!-- Renkli Kesilen Alan Kartları -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
          <div class="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">
            <span class="text-[10px] text-slate-400 block font-sans font-bold">Kitapçık (${f.booklet.start}-${f.booklet.end})</span>
            <strong class="text-sm text-indigo-200">${bSlice || '-'}</strong>
          </div>
          <div class="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
            <span class="text-[10px] text-slate-400 block font-sans font-bold">Talebe No (${f.studentNo.start}-${f.studentNo.end})</span>
            <strong class="text-sm text-emerald-200 truncate block">${noSlice || '-'}</strong>
          </div>
          <div class="p-2 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300">
            <span class="text-[10px] text-slate-400 block font-sans font-bold">Ad Soyad (${f.studentName.start}-${f.studentName.end})</span>
            <strong class="text-sm text-purple-200 truncate block">${nameSlice || '-'}</strong>
          </div>
          <div class="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <span class="text-[10px] text-slate-400 block font-sans font-bold">Sınıf (${f.className.start}-${f.className.end})</span>
            <strong class="text-sm text-amber-200 truncate block">${classSlice || '-'}</strong>
          </div>
          <div class="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
            <span class="text-[10px] text-slate-400 block font-sans font-bold">Cevaplar (${f.answers.start}-${f.answers.end})</span>
            <strong class="text-xs text-cyan-200 truncate block">${ansSlice.substring(0, 15)}... (${ansSlice.replace(/\s/g, '').length} Cevap)</strong>
          </div>
        </div>

        <!-- Karakter Çizelgesi -->
        <div class="overflow-x-auto p-2 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono whitespace-pre leading-relaxed select-none">
          <div class="text-slate-600 border-b border-slate-800 pb-1 mb-1">
            <span>Sütun: </span><span>1....5....10...15...20...25...30...35...40...45...50...55...60...70...80...90...100..110..120..130</span>
          </div>
          <div class="text-slate-300">
            ${sampleLine.substring(0, 135)}
          </div>
        </div>
      </div>
    `;
  },

  updateTxtImportPreview(instId) {
    const previewContainer = document.getElementById('import-txt-preview-section');
    const textarea = document.getElementById('import-txt-textarea');
    const examSelect = document.getElementById('import-txt-exam-select');
    const bookletSelect = document.getElementById('import-txt-booklet-mode');

    if (!previewContainer || !textarea) return;

    const rawText = textarea.value || '';
    if (!rawText.trim()) {
      previewContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 text-center text-slate-500 text-xs font-medium">
          Yukarıya optik dosyasını yapıştırdığınızda veya dosya seçtiğinizde FMT cetveli ve canlı net/puan tablosu anında burada görüntülenecektir.
        </div>
      `;
      return;
    }

    const examId = examSelect ? examSelect.value : null;
    const exam = window.PortalStore.getExamById(instId, examId);
    if (!exam) {
      previewContainer.innerHTML = `
        <div class="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-300 text-xs">
          ⚠️ Sınav seçilemedi. Lütfen geçerli bir deneme sınavı seçiniz.
        </div>
      `;
      return;
    }

    const options = {
      bookletMode: bookletSelect ? bookletSelect.value : 'auto'
    };

    const cleanRaw = rawText.replace(/^\uFEFF/, '');
    const lines = cleanRaw.split(/\r?\n/).map(l => l.replace(/[\r\n]/g, '')).filter(l => l.trim().length > 0);
    const parsedStudents = [];
    const missingKeysSet = new Set();
    const bookletStats = { A: 0, B: 0, C: 0, D: 0 };

    lines.forEach((line, idx) => {
      const parsed = this.parseSingleOpticalLineWithFmt(line, exam, this.activeFmt, options);
      if (parsed) {
        if (!parsed.studentNo) {
          parsed.studentNo = (1000 + idx + 1).toString();
        }

        // Skor hesapla
        let scored = {
          totalCorrect: 0,
          totalWrong: 0,
          totalEmpty: exam.questionCount || 20,
          totalNet: 0,
          totalScore: 200,
          isMissingAnswerKey: false
        };

        const hasKey = exam.answerKeys && exam.answerKeys[parsed.booklet] && exam.answerKeys[parsed.booklet].replace(/[^A-E*]/g, '').length > 0;
        if (hasKey && typeof window.PortalStore.scoreStudentAnswers === 'function') {
          const sc = window.PortalStore.scoreStudentAnswers(parsed.answers, exam, parsed.booklet);
          if (sc && !sc.isMissingAnswerKey) {
            scored = sc;
          } else {
            scored.isMissingAnswerKey = true;
            missingKeysSet.add(parsed.booklet);
          }
        } else {
          scored.isMissingAnswerKey = true;
          missingKeysSet.add(parsed.booklet);
        }

        bookletStats[parsed.booklet] = (bookletStats[parsed.booklet] || 0) + 1;
        parsedStudents.push({ ...parsed, scored });
      }
    });

    if (parsedStudents.length === 0) {
      previewContainer.innerHTML = `
        <div class="p-3 rounded-xl bg-rose-950/30 border border-rose-800/50 text-rose-300 text-xs">
          ⚠️ Yapıştırılan metinden talebe kaydı tespit edilemedi. Lütfen satır biçimini veya FMT ayarlarını kontrol ediniz.
        </div>
      `;
      return;
    }

    const previewList = parsedStudents.slice(0, 7);
    const missingKeysArr = Array.from(missingKeysSet);
    const sampleLine = lines[0] || '';

    let html = `
      <div class="space-y-3">
        <!-- 1. Satır Görsel FMT Cetveli -->
        ${this.renderFmtRuler(sampleLine, this.activeFmt)}

        <div class="bg-slate-950/80 rounded-2xl border border-slate-800 p-3 space-y-3">
          <!-- Özet Başlık Çubuğu -->
          <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80 text-xs">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span class="text-white font-bold">FMT Çözümleme Önizlemesi</span>
              <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono font-bold text-[11px]">${parsedStudents.length} Talebe Algılandı</span>
            </div>
            <div class="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span>Sınav: <strong class="text-indigo-400">${exam.questionCount} Soru</strong></span>
              <span>•</span>
              <span>Kitapçıklar: ${Object.entries(bookletStats).filter(([_, c]) => c > 0).map(([b, c]) => `<span class="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 font-bold">${b}: ${c}</span>`).join(' ') || 'A: ' + parsedStudents.length}</span>
            </div>
          </div>

          ${missingKeysArr.length > 0 ? `
            <div class="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span><strong>Uyarı:</strong> Bu sınavda <strong>${missingKeysArr.join(', ')} Kitapçığı</strong> cevap anahtarı henüz girilmemiştir. Aktarım yapılabilir, anahtar girildiğinde netler otomatik hesaplanacaktır.</span>
            </div>
          ` : ''}

          <!-- Canlı Tablo Önizlemesi (İlk 7 Talebe) -->
          <div class="overflow-x-auto max-h-52 overflow-y-auto rounded-xl border border-slate-800">
            <table class="w-full text-left border-collapse text-xs">
              <thead class="sticky top-0 bg-slate-900 text-slate-400 uppercase text-[10px] font-bold tracking-wider z-10">
                <tr>
                  <th class="p-2 text-center w-8">#</th>
                  <th class="p-2">No</th>
                  <th class="p-2">Ad Soyad</th>
                  <th class="p-2">Sınıf</th>
                  <th class="p-2 text-center">Ktp</th>
                  <th class="p-2">Cevaplar (Özet)</th>
                  <th class="p-2 text-center text-emerald-400">D</th>
                  <th class="p-2 text-center text-rose-400">Y</th>
                  <th class="p-2 text-center text-amber-400">B</th>
                  <th class="p-2 text-center text-cyan-400">Net</th>
                  <th class="p-2 text-center text-indigo-400">Puan</th>
                  <th class="p-2 text-center">Durum</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60 bg-slate-950/60 font-mono text-[11px]">
                ${previewList.map((st, i) => {
                  const marked = st.answers.replace(/\s/g, '').length;
                  const sampleAns = st.answers.substring(0, 18) + (st.answers.length > 18 ? '...' : '');
                  return `
                    <tr class="hover:bg-slate-800/40 transition">
                      <td class="p-2 text-center text-slate-500">${i + 1}</td>
                      <td class="p-2 text-indigo-300 font-bold">${st.studentNo}</td>
                      <td class="p-2 text-white font-sans font-medium truncate max-w-[130px]" title="${st.studentName}">${st.studentName}</td>
                      <td class="p-2 text-slate-300">${st.className}</td>
                      <td class="p-2 text-center">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${st.booklet === 'A' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'bg-amber-600/30 text-amber-300 border border-amber-500/40'}">${st.booklet}</span>
                      </td>
                      <td class="p-2 text-emerald-300 tracking-widest text-[10px]" title="${st.answers}">
                        ${sampleAns} <span class="text-slate-500 font-sans">(${marked} Cevap)</span>
                      </td>
                      <td class="p-2 text-center text-emerald-400 font-bold">${st.scored.totalCorrect || 0}</td>
                      <td class="p-2 text-center text-rose-400 font-bold">${st.scored.totalWrong || 0}</td>
                      <td class="p-2 text-center text-amber-400 font-bold">${st.scored.totalEmpty !== undefined ? st.scored.totalEmpty : (exam.questionCount || 20)}</td>
                      <td class="p-2 text-center text-cyan-300 font-black">${typeof st.scored.totalNet === 'number' ? st.scored.totalNet.toFixed(2) : '0.00'}</td>
                      <td class="p-2 text-center text-indigo-300 font-black">${typeof st.scored.totalScore === 'number' ? st.scored.totalScore.toFixed(2) : '200.00'}</td>
                      <td class="p-2 text-center">
                        ${st.scored.isMissingAnswerKey ? `
                          <span class="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 font-bold">Anahtar Yok</span>
                        ` : `
                          <span class="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold">✓ Hazır</span>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${parsedStudents.length > 7 ? `
            <div class="text-center text-[10px] text-slate-500 font-medium">
              Toplam ${parsedStudents.length} talebeden ilk 7'si gösterilmektedir. "FMT Kurallarıyla Sonuçları Portala Aktar" butonuna bastığınızda tümü aktarılacaktır.
            </div>
          ` : ''}
        </div>
      </div>
    `;

    previewContainer.innerHTML = html;
  },

  parseSingleOpticalLineWithFmt(rawLine, exam, fmt, options = {}) {
    if (!rawLine || typeof rawLine !== 'string') return null;
    const line = rawLine.replace(/[\r\n]/g, '');
    if (!line.trim()) return null;

    // Başlık ve açıklama satırlarını filtrele
    const upperTrim = line.trim().toUpperCase();
    if (
      upperTrim.startsWith('KURUM') ||
      upperTrim.startsWith('SINAV') ||
      upperTrim.startsWith('TARİH') ||
      upperTrim.startsWith('TARİH:') ||
      upperTrim.startsWith('ÖĞRENCİ NO') ||
      upperTrim.startsWith('TALEBE NO') ||
      upperTrim.startsWith('AD SOYAD') ||
      upperTrim.startsWith('---') ||
      upperTrim.startsWith('===') ||
      upperTrim.length < 5
    ) {
      return null;
    }

    const qCount = (exam && exam.questionCount) ? parseInt(exam.questionCount, 10) : 20;
    const bookletMode = options.bookletMode || 'auto';

    const f = (fmt && fmt.fields) ? fmt.fields : {
      booklet: { enabled: true, start: 1, end: 1 },
      studentNo: { enabled: true, start: 2, end: 11 },
      studentName: { enabled: true, start: 12, end: 35 },
      className: { enabled: true, start: 36, end: 39 },
      answers: { enabled: true, start: 40, end: 40 + qCount - 1 }
    };

    // 1. Kitapçık Türü (A, B, C, D)
    let booklet = 'A';
    if (bookletMode.startsWith('force_')) {
      booklet = bookletMode.replace('force_', '').toUpperCase();
    } else if (f.booklet && f.booklet.enabled !== false && f.booklet.start > 0) {
      const bSlice = line.substring(f.booklet.start - 1, f.booklet.end).trim().toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(bSlice)) {
        booklet = bSlice;
      } else {
        const firstChar = line[0].toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(firstChar)) {
          booklet = firstChar;
        }
      }
    }

    // 2. Talebe No / TC Kimlik No
    let studentNo = '';
    if (f.studentNo && f.studentNo.enabled !== false && f.studentNo.start > 0) {
      const noSlice = line.substring(f.studentNo.start - 1, f.studentNo.end).trim();
      const numMatch = noSlice.match(/\d+/);
      if (numMatch) {
        studentNo = numMatch[0];
      }
    }
    if (!studentNo) {
      const prefix40 = line.substring(0, Math.min(40, line.length));
      const tc = prefix40.match(/\b\d{11}\b/);
      if (tc) studentNo = tc[0];
      else {
        const anyNum = prefix40.match(/\b\d{1,8}\b/);
        if (anyNum) studentNo = anyNum[0];
      }
    }

    // 3. Adı Soyadı
    let studentName = '';
    if (f.studentName && f.studentName.enabled !== false && f.studentName.start > 0) {
      studentName = line.substring(f.studentName.start - 1, f.studentName.end)
        .replace(/[^A-Za-zÇĞİÖŞÜçğıöşü\s]/g, ' ')
        .trim()
        .replace(/\s{2,}/g, ' ');
    }
    if (!studentName || studentName.length < 2) {
      studentName = studentNo ? `Talebe #${studentNo}` : 'İsimsiz Talebe';
    }

    // 4. Sınıf / Şube
    let className = 'Genel';
    if (f.className && f.className.enabled !== false && f.className.start > 0) {
      const classSlice = line.substring(f.className.start - 1, f.className.end).trim().toUpperCase();
      if (classSlice) {
        className = classSlice.replace(/\s+/g, '-').replace('/', '-');
      }
    }

    // 5. Cevaplar (FMT ile Tam Konum Kesimi)
    let finalAnswers = '';
    if (fmt && fmt.subjects && fmt.subjects.length > 0) {
      fmt.subjects.forEach(sub => {
        const sStart = Math.max(0, sub.start - 1);
        const sEnd = sub.end;
        let sSlice = line.substring(sStart, sEnd).toUpperCase();
        sSlice = sSlice.replace(/1/g, 'A').replace(/2/g, 'B').replace(/3/g, 'C').replace(/4/g, 'D').replace(/5/g, 'E').replace(/0/g, ' ');
        sSlice = sSlice.replace(/[^A-E* ]/g, '');
        const subLen = sub.length || (sub.end - sub.start + 1);
        finalAnswers += sSlice.padEnd(subLen, ' ').substring(0, subLen);
      });
    } else if (f.answers && f.answers.enabled !== false && f.answers.start > 0) {
      const aStart = Math.max(0, f.answers.start - 1);
      const aEnd = f.answers.end || (aStart + qCount);
      let aSlice = line.substring(aStart, aEnd).toUpperCase();
      const digitCount = (aSlice.match(/[1-5]/g) || []).length;
      const letterCount = (aSlice.match(/[A-E]/g) || []).length;
      if (digitCount > letterCount && digitCount >= 5) {
        aSlice = aSlice.replace(/1/g, 'A').replace(/2/g, 'B').replace(/3/g, 'C').replace(/4/g, 'D').replace(/5/g, 'E').replace(/0/g, ' ');
      }

      const rawBlocks = aSlice.split(/\s{2,}/).map(b => b.replace(/[^A-E* ]/g, '').trim()).filter(b => b.length > 0);
      const examSubjects = (exam && exam.subjects && exam.subjects.length > 0) ? exam.subjects : [];

      if (rawBlocks.length > 1 && examSubjects.length === rawBlocks.length) {
        examSubjects.forEach((sub, sIdx) => {
          const subCount = (sub.endQ - sub.startQ + 1);
          const blk = rawBlocks[sIdx] || '';
          finalAnswers += blk.padEnd(subCount, ' ').substring(0, subCount);
        });
      } else {
        const cleanAns = aSlice.replace(/[^A-E* ]/g, '');
        finalAnswers = cleanAns.padEnd(qCount, ' ').substring(0, qCount);
      }
    } else {
      finalAnswers = ''.padEnd(qCount, ' ');
    }

    if (finalAnswers.length < qCount) {
      finalAnswers = finalAnswers.padEnd(qCount, ' ');
    } else if (finalAnswers.length > qCount) {
      finalAnswers = finalAnswers.substring(0, qCount);
    }

    return {
      studentNo: studentNo || '',
      studentName,
      className: className || 'Genel',
      booklet: booklet || 'A',
      answers: finalAnswers
    };
  },

  parseSingleOpticalLine(rawLine, exam, options = {}) {
    return this.parseSingleOpticalLineWithFmt(rawLine, exam, this.activeFmt, options);
  },

  processOpticalTxtLines(instId, exam, rawText, autoRegister = true, options = {}) {
    const cleanRaw = (rawText || '').replace(/^\uFEFF/, '');
    const lines = cleanRaw.split(/\r?\n/).map(l => l.replace(/[\r\n]/g, '')).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { count: 0 };

    let count = 0;
    const missingKeysSet = new Set();
    const students = window.PortalStore.getStudents(instId) || [];

    lines.forEach((line, lineIdx) => {
      const parsed = this.parseSingleOpticalLineWithFmt(line, exam, this.activeFmt, options);
      if (!parsed) return;

      let studentNo = parsed.studentNo;
      if (!studentNo) {
        studentNo = (1000 + lineIdx + 1).toString();
      }
      const studentName = parsed.studentName;
      const className = parsed.className;
      const booklet = parsed.booklet;
      const finalAnswers = parsed.answers;

      // Talebeyi Kuruma Otomatik Kaydet (Varsa güncelle, yoksa ekle)
      if (autoRegister) {
        const existingSt = students.find(s => s.studentNo === studentNo || (s.firstName + ' ' + s.lastName).toUpperCase() === studentName.toUpperCase());
        if (!existingSt) {
          const nameParts = studentName.split(/\s+/);
          const lastName = nameParts.length > 1 ? nameParts.pop() : '';
          const firstName = nameParts.join(' ');
          const newSt = window.PortalStore.addStudent(instId, {
            studentNo,
            firstName,
            lastName,
            className,
            parentPhone: '',
            notes: 'Optik TXT dosyasından yüklendi'
          });
          students.push(newSt);
        }
      }

      // Puanlama & Kaydetme
      let scored = {
        totalCorrect: 0,
        totalWrong: 0,
        totalEmpty: exam.questionCount || 20,
        totalNet: 0,
        totalScore: 200,
        subjectsResult: {},
        answers: finalAnswers
      };

      const hasKey = exam.answerKeys && exam.answerKeys[booklet] && exam.answerKeys[booklet].replace(/[^A-E*]/g, '').length > 0;
      if (hasKey && typeof window.PortalStore.scoreStudentAnswers === 'function') {
        const sc = window.PortalStore.scoreStudentAnswers(finalAnswers, exam, booklet);
        if (sc && !sc.isMissingAnswerKey) {
          scored = sc;
        } else {
          missingKeysSet.add(booklet);
        }
      } else {
        missingKeysSet.add(booklet);
      }

      const examResultObj = {
        examId: exam.id,
        examTitle: exam.title,
        studentNo,
        studentName,
        className,
        parentPhone: '',
        booklet,
        answers: finalAnswers,
        subjectsResult: scored.subjectsResult || {},
        totalCorrect: scored.totalCorrect || 0,
        totalWrong: scored.totalWrong || 0,
        totalEmpty: scored.totalEmpty !== undefined ? scored.totalEmpty : (exam.questionCount || 20),
        totalNet: scored.totalNet || 0,
        totalScore: scored.totalScore || 0,
        topicAnalysis: scored.topicAnalysis || [],
        markedCount: finalAnswers.replace(/\s/g, '').length,
        isBlank: finalAnswers.replace(/\s/g, '').length === 0,
        qrDetected: false,
        scannedAt: new Date().toISOString()
      };

      window.PortalStore.saveExamResult(instId, examResultObj);
      count++;
    });

    return { count, missingKeys: Array.from(missingKeysSet) };
  },

  // ==========================================
  // 11. SORU VE MADDE BAŞARI ANALİZİ (Item Analysis)
  // ==========================================
  showItemAnalysisModal(instId, examId, isGlobal = false) {
    const existing = document.getElementById('item-analysis-modal');
    if (existing) existing.remove();

    const exam = isGlobal 
      ? window.PortalStore.getGlobalExams().find(e => e.id === examId)
      : window.PortalStore.getExamById(instId, examId);

    if (!exam) {
      this.showToast('Sınav bulunamadı.', 'error');
      return;
    }

    const items = isGlobal 
      ? window.PortalStore.getGlobalItemAnalysis(examId)
      : window.PortalStore.getItemAnalysis(instId, examId);

    const totalStudents = items[0] ? items[0].totalStudents : 0;
    const easyCount = items.filter(i => i.difficulty === 'Kolay').length;
    const mediumCount = items.filter(i => i.difficulty === 'Orta').length;
    const hardCount = items.filter(i => i.difficulty === 'Zor').length;
    const canceledCount = items.filter(i => i.isCanceled).length;

    const subjects = exam.subjects || [{ name: 'Genel' }];

    const modal = document.createElement('div');
    modal.id = 'item-analysis-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-4xl w-full shadow-2xl relative max-h-[92vh] flex flex-col">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-800 mb-4 gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">📊</span>
              <h3 class="text-base sm:text-lg font-black text-white">${exam.title} - Soru & Madde Başarı Analizi</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              ${isGlobal ? 'Türkiye Geneli Tüm Kurumların Ortak Katılımı' : 'Kurumunuza Ait Sonuçlar'} (${totalStudents} Talebe Değerlendirildi)
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="App.downloadResultsCsv('${instId || ''}', '${exam.id}', ${isGlobal})" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1 cursor-pointer">
              <span>📥</span> <span>Excel İndir</span>
            </button>
            <button onclick="document.getElementById('item-analysis-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
          </div>
        </div>

        <!-- Özet İstatistik Kartları -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
            <span class="block text-[10px] text-slate-500 font-bold uppercase">Toplam Soru</span>
            <span class="text-lg font-black text-white font-mono">${items.length}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-emerald-950/50 text-center">
            <span class="block text-[10px] text-emerald-400 font-bold uppercase">Kolay Soru (%70+)</span>
            <span class="text-lg font-black text-emerald-400 font-mono">${easyCount}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-amber-950/50 text-center">
            <span class="block text-[10px] text-amber-400 font-bold uppercase">Orta Soru (%40-%69)</span>
            <span class="text-lg font-black text-amber-400 font-mono">${mediumCount}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-rose-950/50 text-center">
            <span class="block text-[10px] text-rose-400 font-bold uppercase">Zor Soru (<%40)</span>
            <span class="text-lg font-black text-rose-400 font-mono">${hardCount}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-purple-950/50 text-center">
            <span class="block text-[10px] text-purple-400 font-bold uppercase">İptal Edilen Soru</span>
            <span class="text-lg font-black text-purple-400 font-mono">${canceledCount}</span>
          </div>
        </div>

        <!-- Ders Filtresi -->
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs text-slate-400 font-bold">Ders Filtrele:</span>
          <select id="item-subject-filter" onchange="App.filterItemAnalysisTable(this.value)" class="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-bold">
            <option value="all">Tüm Dersler (${items.length} Soru)</option>
            ${subjects.map(s => `<option value="${s.name}">${s.name} (${s.startQ}-${s.endQ}. Sorular)</option>`).join('')}
          </select>
        </div>

        <!-- Madde Analiz Tablosu -->
        <div class="overflow-y-auto overflow-x-auto w-full max-w-full flex-1 rounded-2xl border border-slate-800" style="-webkit-overflow-scrolling: touch;">
          <table class="w-full text-left text-xs min-w-[640px]">
            <thead class="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider sticky top-0">
              <tr>
                <th class="p-2.5 text-center w-14">Soru No</th>
                <th class="p-2.5">Ders</th>
                <th class="p-2.5 text-center w-14">Cevap (A)</th>
                <th class="p-2.5">Başarı Oranı</th>
                <th class="p-2.5 text-center">Zorluk Seviyesi</th>
                <th class="p-2.5 text-center">Şık Dağılımı (A - B - C - D - E - Boş)</th>
                <th class="p-2.5 text-right w-24">Soru İptali</th>
              </tr>
            </thead>
            <tbody id="item-analysis-tbody" class="divide-y divide-slate-800/80">
              ${items.map(item => `
                <tr class="item-analysis-row hover:bg-slate-800/40 transition" data-subject="${item.subjectName}">
                  <td class="p-2.5 text-center font-mono font-bold ${item.isCanceled ? 'text-purple-400 line-through' : 'text-emerald-400'}">
                    #${item.questionNo}
                  </td>
                  <td class="p-2.5 font-bold text-white">${item.subjectName}</td>
                  <td class="p-2.5 text-center font-mono font-black text-amber-300">
                    ${item.isCanceled ? '*' : item.correctKeyA}
                  </td>
                  <td class="p-2.5">
                    <div class="flex items-center gap-2">
                      <div class="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div class="h-full rounded-full ${item.isCanceled ? 'bg-purple-500' : (item.successRate >= 70 ? 'bg-emerald-500' : (item.successRate >= 40 ? 'bg-amber-500' : 'bg-rose-500'))}" style="width: ${item.successRate}%"></div>
                      </div>
                      <span class="font-mono font-bold text-[11px] text-slate-300">${item.successRate}%</span>
                    </div>
                  </td>
                  <td class="p-2.5 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${item.isCanceled ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : (item.difficulty === 'Kolay' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : (item.difficulty === 'Orta' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'))}">
                      ${item.difficulty}
                    </span>
                  </td>
                  <td class="p-2.5 text-center font-mono text-[11px] text-slate-300">
                    <span class="${item.correctKeyA === 'A' ? 'text-emerald-400 font-black' : ''}">A:${item.distribution.A || 0}</span> •
                    <span class="${item.correctKeyA === 'B' ? 'text-emerald-400 font-black' : ''}">B:${item.distribution.B || 0}</span> •
                    <span class="${item.correctKeyA === 'C' ? 'text-emerald-400 font-black' : ''}">C:${item.distribution.C || 0}</span> •
                    <span class="${item.correctKeyA === 'D' ? 'text-emerald-400 font-black' : ''}">D:${item.distribution.D || 0}</span> •
                    <span class="text-slate-500">Boş:${item.distribution.empty || 0}</span>
                  </td>
                  <td class="p-2.5 text-right">
                    <button onclick="App.toggleCancelQuestionFromModal('${instId || ''}', '${exam.id}', ${item.questionNo}, ${isGlobal})" class="px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer ${item.isCanceled ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-slate-700'}">
                      ${item.isCanceled ? 'İptali Kaldır' : 'İptal Et'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  filterItemAnalysisTable(subjectName) {
    const rows = document.querySelectorAll('.item-analysis-row');
    rows.forEach(r => {
      if (subjectName === 'all' || r.getAttribute('data-subject') === subjectName) {
        r.classList.remove('hidden');
      } else {
        r.classList.add('hidden');
      }
    });
  },

  toggleCancelQuestionFromModal(instId, examId, qNum, isGlobal) {
    window.PortalStore.cancelQuestion(instId, examId, qNum, isGlobal);
    this.showToast(`✓ #${qNum}. soru iptal durumu güncellendi ve tüm sonuçlar baştan hesaplandı!`, 'success');
    this.showItemAnalysisModal(instId, examId, isGlobal);
  },

  // ==========================================
  // 11-B. KONU VE KAZANIM BAŞARI ANALİZİ (Topic Analysis)
  // ==========================================
  showTopicAnalysisModal(instId, examId, isGlobal = false) {
    const existing = document.getElementById('topic-analysis-modal');
    if (existing) existing.remove();

    const exam = isGlobal 
      ? window.PortalStore.getGlobalExams().find(e => e.id === examId)
      : window.PortalStore.getExamById(instId, examId);

    if (!exam) {
      this.showToast('Sınav bulunamadı.', 'error');
      return;
    }

    const topics = isGlobal 
      ? window.PortalStore.getGlobalTopicAnalysis(examId)
      : window.PortalStore.getExamTopicAnalysis(instId, examId);

    const subjects = exam.subjects || [{ name: 'Genel' }];
    const strongCount = topics.filter(t => t.percent >= 70).length;
    const warningCount = topics.filter(t => t.percent >= 40 && t.percent < 70).length;
    const dangerCount = topics.filter(t => t.percent < 40).length;

    const modal = document.createElement('div');
    modal.id = 'topic-analysis-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-4xl w-full shadow-2xl relative max-h-[92vh] flex flex-col">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-800 mb-4 gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">🎯</span>
              <h3 class="text-base sm:text-lg font-black text-white">${exam.title} - Konu ve Kazanım Analizi</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              ${isGlobal ? 'Ortak Deneme Tüm Kurumlar Katılımı' : 'Kurum Sınav Sonuçları'} (${topics.length} Konu & Kazanım)
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="document.getElementById('topic-analysis-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
          </div>
        </div>

        <!-- Özet İstatistik Kartları -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
            <span class="block text-[10px] text-slate-500 font-bold uppercase">Toplam Konu</span>
            <span class="text-lg font-black text-white font-mono">${topics.length}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-emerald-950/50 text-center">
            <span class="block text-[10px] text-emerald-400 font-bold uppercase">Güçlü Konular (%70+)</span>
            <span class="text-lg font-black text-emerald-400 font-mono">${strongCount}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-amber-950/50 text-center">
            <span class="block text-[10px] text-amber-400 font-bold uppercase">Geliştirilmeli (%40-%69)</span>
            <span class="text-lg font-black text-amber-400 font-mono">${warningCount}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-rose-950/50 text-center">
            <span class="block text-[10px] text-rose-400 font-bold uppercase">Kritik Eksikler (<%40)</span>
            <span class="text-lg font-black text-rose-400 font-mono">${dangerCount}</span>
          </div>
        </div>

        <!-- Ders Filtresi -->
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs text-slate-400 font-bold">Ders Filtrele:</span>
          <select id="topic-subject-filter" onchange="App.filterTopicAnalysisTable(this.value)" class="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-bold">
            <option value="all">Tüm Dersler (${topics.length} Konu)</option>
            ${subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
        </div>

        <!-- Konu Analiz Tablosu -->
        <div class="overflow-y-auto overflow-x-auto w-full max-w-full flex-1 rounded-2xl border border-slate-800" style="-webkit-overflow-scrolling: touch;">
          <table class="w-full text-left text-xs min-w-[640px]">
            <thead class="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider sticky top-0">
              <tr>
                <th class="p-2.5">Ders</th>
                <th class="p-2.5">Konu / Kazanım</th>
                <th class="p-2.5 text-center">İlgili Sorular</th>
                <th class="p-2.5">Başarı Yüzdesi</th>
                <th class="p-2.5 text-center">Ort. Doğru</th>
                <th class="p-2.5 text-center">Ort. Yanlış</th>
                <th class="p-2.5 text-center">Durum</th>
              </tr>
            </thead>
            <tbody id="topic-analysis-tbody" class="divide-y divide-slate-800/80">
              ${topics.length === 0 ? `
                <tr>
                  <td colspan="7" class="p-8 text-center text-slate-500">
                    Bu sınavda henüz sorulara konu/kazanım atanmamış veya taranmış öğrenci kağıdı bulunmuyor. Sınav düzenleme ekranından sorulara MEB konu havuzundan konu atayabilirsiniz.
                  </td>
                </tr>
              ` : topics.map(item => `
                <tr class="topic-analysis-row hover:bg-slate-800/40 transition" data-subject="${item.subject}">
                  <td class="p-2.5 font-bold text-white">${item.subject}</td>
                  <td class="p-2.5 font-medium text-slate-200">${item.topic}</td>
                  <td class="p-2.5 text-center font-mono text-[11px] text-cyan-300">
                    ${(item.questionNumbers || []).map(q => '#' + q).join(', ')}
                  </td>
                  <td class="p-2.5">
                    <div class="flex items-center gap-2">
                      <div class="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div class="h-full rounded-full ${item.percent >= 70 ? 'bg-emerald-500' : (item.percent >= 40 ? 'bg-amber-500' : 'bg-rose-500')}" style="width: ${item.percent}%"></div>
                      </div>
                      <span class="font-mono font-bold text-[11px] text-slate-300">${item.percent}%</span>
                    </div>
                  </td>
                  <td class="p-2.5 text-center font-mono font-bold text-emerald-400">${item.avgCorrect}</td>
                  <td class="p-2.5 text-center font-mono font-bold text-rose-400">${item.avgWrong}</td>
                  <td class="p-2.5 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${item.status === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : (item.status === 'warning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40')}">
                      ${item.status === 'success' ? 'Güçlü' : (item.status === 'warning' ? 'Geliştirilmeli' : 'Kritik Eksik')}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  filterTopicAnalysisTable(subjectName) {
    const rows = document.querySelectorAll('.topic-analysis-row');
    rows.forEach(r => {
      if (subjectName === 'all' || r.getAttribute('data-subject') === subjectName) {
        r.classList.remove('hidden');
      } else {
        r.classList.add('hidden');
      }
    });
  },

  showStudentTopicAnalysisModal(instId, examId, studentNo) {
    const existing = document.getElementById('student-topic-modal');
    if (existing) existing.remove();

    const exam = window.PortalStore.getExamById(instId, examId) || window.PortalStore.getGlobalExams().find(e => e.id === examId);
    const rankings = instId ? window.PortalStore.calculateExamRankings(instId, examId) : window.PortalStore.calculateGlobalRankings(examId);
    const result = rankings.find(r => r.studentNo === studentNo);

    if (!result) {
      this.showToast('Talebe sınav kaydı bulunamadı.', 'error');
      return;
    }

    const topics = result.topicAnalysis || [];
    const weakTopics = topics.filter(t => t.percent < 60);

    const modal = document.createElement('div');
    modal.id = 'student-topic-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-3xl w-full shadow-2xl relative max-h-[92vh] flex flex-col">
        <div class="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">🎯</span>
              <h3 class="text-base sm:text-lg font-black text-white">${result.studentName} - Konu & Kazanım Karnesi</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              No: <strong class="text-emerald-400 font-mono">${result.studentNo}</strong> • Sınıf: ${result.className} • Toplam Net: <strong class="text-cyan-400 font-mono">${result.totalNet}</strong> • Puan: <strong class="text-amber-400 font-mono">${result.totalScore}</strong>
            </p>
          </div>
          <button onclick="document.getElementById('student-topic-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        ${weakTopics.length > 0 ? `
          <div class="bg-rose-950/30 border border-rose-500/40 rounded-2xl p-3.5 mb-4">
            <span class="text-xs font-bold text-rose-300 uppercase block mb-1">⚠️ Tekrar Edilmesi Önerilen Konular (${weakTopics.length}):</span>
            <div class="flex flex-wrap gap-1.5">
              ${weakTopics.map(t => `
                <span class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-500/30 text-xs font-semibold">
                  ${t.subject}: <strong>${t.topic}</strong> (%${t.percent})
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="overflow-y-auto overflow-x-auto w-full max-w-full flex-1 rounded-2xl border border-slate-800 mb-4" style="-webkit-overflow-scrolling: touch;">
          <table class="w-full text-left text-xs min-w-[500px]">
            <thead class="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider sticky top-0">
              <tr>
                <th class="p-2.5">Ders</th>
                <th class="p-2.5">Konu / Kazanım</th>
                <th class="p-2.5 text-center">Soru Sayısı</th>
                <th class="p-2.5 text-center">Doğru</th>
                <th class="p-2.5 text-center">Yanlış</th>
                <th class="p-2.5 text-center">Boş</th>
                <th class="p-2.5">Başarı</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/80">
              ${topics.length === 0 ? `
                <tr>
                  <td colspan="7" class="p-8 text-center text-slate-500">Bu sınav soruları için henüz konu tanımlanmamıştır.</td>
                </tr>
              ` : topics.map(t => `
                <tr class="hover:bg-slate-800/40 transition">
                  <td class="p-2.5 font-bold text-white">${t.subject}</td>
                  <td class="p-2.5 font-medium text-slate-200">${t.topic}</td>
                  <td class="p-2.5 text-center font-mono font-bold text-slate-400">${t.total}</td>
                  <td class="p-2.5 text-center font-mono font-bold text-emerald-400">${t.correct}</td>
                  <td class="p-2.5 text-center font-mono font-bold text-rose-400">${t.wrong}</td>
                  <td class="p-2.5 text-center font-mono font-bold text-slate-400">${t.empty}</td>
                  <td class="p-2.5">
                    <div class="flex items-center gap-2">
                      <div class="w-20 bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div class="h-full rounded-full ${t.percent >= 70 ? 'bg-emerald-500' : (t.percent >= 40 ? 'bg-amber-500' : 'bg-rose-500')}" style="width: ${t.percent}%"></div>
                      </div>
                      <span class="font-mono font-bold text-[11px] text-slate-300 min-w-[32px]">${t.percent}%</span>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="flex justify-end gap-2">
          ${result.parentPhone ? `
            <button onclick="App.sendWhatsAppCard('${encodeURIComponent(result.parentPhone)}', '${encodeURIComponent(result.studentName)}', '${result.totalNet}', '${result.totalScore}', '${encodeURIComponent(JSON.stringify(topics))}')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer">
              <span>💬</span> <span>Konulu WhatsApp Karnesi Gönder</span>
            </button>
          ` : ''}
          <button onclick="document.getElementById('student-topic-modal').remove()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
            Kapat
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  // ==========================================
  // 12. TOPLU VELİ WHATSAPP GÖNDERİM MODÜLÜ
  // ==========================================
  showBatchWhatsAppModal(instId, examId) {
    const existing = document.getElementById('batch-whatsapp-modal');
    if (existing) existing.remove();

    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null);
    const exam = window.PortalStore.getExamById(effectiveInstId, examId);
    if (!exam) return;

    const rankings = window.PortalStore.calculateExamRankings(effectiveInstId, examId);
    const classes = [...new Set(rankings.map(r => r.className || 'Genel'))];

    const modal = document.createElement('div');
    modal.id = 'batch-whatsapp-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-3xl w-full shadow-2xl relative max-h-[92vh] flex flex-col">
        <div class="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">💬</span>
            <div>
              <h3 class="text-base sm:text-lg font-black text-white">Sınıfa Toplu WhatsApp Karnesi Gönder</h3>
              <p class="text-xs text-slate-400 font-medium">${exam.title} (${rankings.length} Talebe)</p>
            </div>
          </div>
          <button onclick="document.getElementById('batch-whatsapp-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <div class="flex items-center justify-between mb-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-300">Şube / Sınıf Seçiniz:</label>
            <select id="batch-whatsapp-class" onchange="App.filterBatchWhatsAppClass(this.value)" class="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-bold">
              <option value="all">Tüm Sınıflar (${rankings.length} Talebe)</option>
              ${classes.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="text-[11px] text-slate-400">
            Telefonu kayıtlı: <strong class="text-emerald-400">${rankings.filter(r => !!r.parentPhone).length}</strong> / ${rankings.length}
          </div>
        </div>

        <div class="overflow-y-auto overflow-x-auto w-full max-w-full flex-1 rounded-2xl border border-slate-800 mb-4" style="-webkit-overflow-scrolling: touch;">
          <table class="w-full text-left text-xs min-w-[560px]">
            <thead class="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider sticky top-0">
              <tr>
                <th class="p-2.5 text-center w-12">Sıra</th>
                <th class="p-2.5">No & Talebe Adı</th>
                <th class="p-2.5">Sınıf</th>
                <th class="p-2.5 font-mono">Veli Telefonu</th>
                <th class="p-2.5 text-center">Net</th>
                <th class="p-2.5 text-center">Puan</th>
                <th class="p-2.5 text-right w-36">İşlem</th>
              </tr>
            </thead>
            <tbody id="batch-whatsapp-tbody" class="divide-y divide-slate-800/80">
              ${rankings.map((r, idx) => `
                <tr class="batch-wa-row hover:bg-slate-800/40 transition" data-class="${r.className || 'Genel'}" id="wa-row-${r.studentNo}">
                  <td class="p-2.5 text-center font-bold text-slate-400">${idx + 1}</td>
                  <td class="p-2.5">
                    <strong class="text-white block">${r.studentName}</strong>
                    <span class="text-[10px] text-slate-500 font-mono">#${r.studentNo}</span>
                  </td>
                  <td class="p-2.5 font-semibold text-slate-300">${r.className}</td>
                  <td class="p-2.5 font-mono ${r.parentPhone ? 'text-emerald-400' : 'text-slate-600'}">
                    ${r.parentPhone || 'Kayıtsız'}
                  </td>
                  <td class="p-2.5 text-center font-mono font-bold text-cyan-400">${r.totalNet}</td>
                  <td class="p-2.5 text-center font-mono font-black text-amber-400">${r.totalScore}</td>
                  <td class="p-2.5 text-right">
                    ${r.parentPhone ? `
                      <button onclick="App.markWhatsAppSent('wa-row-${r.studentNo}', '${encodeURIComponent(r.parentPhone)}', '${encodeURIComponent(r.studentName)}', '${r.totalNet}', '${r.totalScore}', '${encodeURIComponent(JSON.stringify(r.topicAnalysis || []))}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-xl shadow transition flex items-center gap-1.5 ml-auto cursor-pointer">
                        <span>💬</span> <span>Gönder</span>
                      </button>
                    ` : `
                      <span class="text-[10px] text-slate-500 italic">Telefon Yok</span>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  filterBatchWhatsAppClass(className) {
    const rows = document.querySelectorAll('.batch-wa-row');
    rows.forEach(r => {
      if (className === 'all' || r.getAttribute('data-class') === className) {
        r.classList.remove('hidden');
      } else {
        r.classList.add('hidden');
      }
    });
  },

  markWhatsAppSent(rowId, phone, name, net, score, topicsJson = null) {
    this.sendWhatsAppCard(phone, name, net, score, topicsJson);
    const row = document.getElementById(rowId);
    if (row) {
      const btn = row.querySelector('button');
      if (btn) {
        btn.className = 'px-3 py-1.5 bg-slate-800 text-emerald-400 border border-emerald-500/50 font-bold text-[11px] rounded-xl shadow transition flex items-center gap-1 ml-auto cursor-pointer';
        btn.innerHTML = '<span>✓</span> <span>Gönderildi</span>';
      }
    }
  },

  // ==========================================
  // 13. EXCEL / CSV TOPLU İNDİRME TETİKLEYİCİ
  // ==========================================
  downloadResultsCsv(instId, examId, isGlobal = false) {
    const exam = isGlobal 
      ? window.PortalStore.getGlobalExams().find(e => e.id === examId)
      : window.PortalStore.getExamById(instId, examId);

    if (!exam) {
      this.showToast('Sınav bulunamadı.', 'error');
      return;
    }

    const results = isGlobal 
      ? window.PortalStore.calculateGlobalRankings(examId)
      : window.PortalStore.calculateExamRankings(instId, examId);

    if (results.length === 0) {
      this.showToast('Bu sınava ait henüz indirilmeye hazır bir sonuç kaydı bulunmuyor.', 'warning');
      return;
    }

    const ok = window.PortalStore.downloadResultsCsv(results, exam, isGlobal);
    if (ok) {
      this.showToast('✓ Sınav sonuçları Excel (CSV) olarak indirildi.', 'success');
    } else {
      this.showToast('Dosya indirilemedi.', 'error');
    }
  },

  // --- TEMA VE GÖRÜNÜM YÖNETİMİ ---
  initTheme() {
    try {
      const saved = localStorage.getItem('optik_portal_theme') || 'dark';
      this.applyTheme(saved);
    } catch (e) {
      this.applyTheme('dark');
    }
  },

  applyTheme(themeId) {
    this.currentTheme = themeId || 'dark';
    const root = document.documentElement;
    if (root) {
      root.classList.remove('theme-light', 'theme-navy', 'theme-emerald');
      if (this.currentTheme === 'light') {
        root.classList.remove('dark');
        root.classList.add('theme-light');
      } else {
        root.classList.add('dark');
        if (this.currentTheme !== 'dark') {
          root.classList.add(`theme-${this.currentTheme}`);
        }
      }
    }
    try {
      localStorage.setItem('optik_portal_theme', this.currentTheme);
    } catch (e) {}
  },

  showThemeModal() {
    const existing = document.getElementById('theme-modal');
    if (existing) existing.remove();

    const themes = [
      { id: 'dark', name: 'Klasik Gece (Koyu)', desc: 'Gözü yormayan modern koyu tema', icon: '🌙' },
      { id: 'light', name: 'Aydınlık (Gündüz)', desc: 'Gündüz kullanımı için ferah açık tema', icon: '☀️' },
      { id: 'navy', name: 'Derin Okyanus (Mavi)', desc: 'Asil gece mavisi ve lacivert tonları', icon: '🌊' },
      { id: 'emerald', name: 'Zümrüt Yeşili (Orman)', desc: 'Doğal koyu yeşil ve ferah tonlar', icon: '🌲' }
    ];

    const current = localStorage.getItem('optik_portal_theme') || 'dark';

    const modal = document.createElement('div');
    modal.id = 'theme-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative">
        <div class="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-500 flex items-center justify-center text-xl shadow-lg">
              🎨
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-black text-white">Görünüm & Tema Seçimi</h3>
              <p class="text-xs text-slate-400 font-medium">Sistem renk temasını dilediğiniz gibi belirleyin</p>
            </div>
          </div>
          <button onclick="document.getElementById('theme-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold transition cursor-pointer">
            ✕
          </button>
        </div>

        <div class="space-y-3 mb-6">
          ${themes.map(t => `
            <div onclick="App.selectTheme('${t.id}')" class="p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between ${current === t.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 hover:border-slate-700 bg-slate-950/50'}">
              <div class="flex items-center gap-3">
                <span class="text-2xl">${t.icon}</span>
                <div>
                  <h4 class="text-sm font-bold text-white flex items-center gap-2">
                    ${t.name}
                    ${current === t.id ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black">Aktif</span>' : ''}
                  </h4>
                  <p class="text-xs text-slate-400">${t.desc}</p>
                </div>
              </div>
              <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center ${current === t.id ? 'border-emerald-400 bg-emerald-400' : 'border-slate-600'}">
                ${current === t.id ? '<span class="text-[10px] text-slate-950 font-black">✓</span>' : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="flex justify-end">
          <button onclick="document.getElementById('theme-modal').remove()" class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer">
            Kapat
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  },

  selectTheme(themeId) {
    this.applyTheme(themeId);
    const modal = document.getElementById('theme-modal');
    if (modal) modal.remove();
    this.showToast('Görünüm teması başarıyla güncellendi.', 'success');
  },

  // --- ŞİFRE YÖNETİMİ ---
  showChangePasswordModal() {
    const session = window.PortalStore.getCurrentSession();
    if (!session) return;

    const existing = document.getElementById('password-modal');
    if (existing) existing.remove();

    const isSuper = session.role === 'superadmin';
    const roleTitle = isSuper ? 'Süper Yönetici Şifresi' : 'Kurum Şifresi';

    const modal = document.createElement('div');
    modal.id = 'password-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative">
        <div class="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-xl shadow-lg">
              🔑
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-black text-white">Şifre Değiştir</h3>
              <p class="text-xs text-slate-400 font-medium">${roleTitle} (${session.username})</p>
            </div>
          </div>
          <button onclick="document.getElementById('password-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold transition cursor-pointer">
            ✕
          </button>
        </div>

        <form onsubmit="App.handleSaveNewPassword(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Mevcut Şifre</label>
            <input type="password" id="old-password-input" required placeholder="Şu anki şifreniz"
              class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:border-amber-400 focus:outline-none transition">
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Yeni Şifre</label>
            <input type="password" id="new-password-input" required placeholder="En az 3 karakter"
              class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:border-amber-400 focus:outline-none transition">
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Yeni Şifre (Tekrar)</label>
            <input type="password" id="new-password-confirm" required placeholder="Yeni şifrenizi tekrar yazın"
              class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:border-amber-400 focus:outline-none transition">
          </div>

          <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button type="button" onclick="document.getElementById('password-modal').remove()" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
              Vazgeç
            </button>
            <button type="submit" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition cursor-pointer">
              Şifreyi Güncelle
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => {
      const inp = document.getElementById('old-password-input');
      if (inp) inp.focus();
    }, 50);
  },

  handleSaveNewPassword(e) {
    e.preventDefault();
    const oldPass = document.getElementById('old-password-input').value;
    const newPass = document.getElementById('new-password-input').value;
    const confirmPass = document.getElementById('new-password-confirm').value;

    if (!newPass || newPass.length < 3) {
      this.showToast('Yeni şifre en az 3 karakter olmalıdır.', 'warning');
      return;
    }
    if (newPass !== confirmPass) {
      this.showToast('Yeni şifreler birbiriyle uyuşmuyor.', 'error');
      return;
    }

    const session = window.PortalStore.getCurrentSession();
    const res = window.PortalStore.changePassword(session, oldPass, newPass);
    if (res.success) {
      this.showToast('Şifreniz başarıyla değiştirildi!', 'success');
      const modal = document.getElementById('password-modal');
      if (modal) modal.remove();
      this.render();
    } else {
      this.showToast(res.message || 'Mevcut şifre hatalı.', 'error');
    }
  },

  showResetInstPasswordModal(instId) {
    const existing = document.getElementById('reset-inst-modal');
    if (existing) existing.remove();

    const inst = window.PortalStore.getInstitutions().find(i => i.id === instId);
    if (!inst) {
      this.showToast('Kurum bulunamadı.', 'error');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'reset-inst-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative">
        <div class="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-500 flex items-center justify-center text-xl shadow-lg">
              🔑
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-black text-white">Kurum Şifresini Belirle</h3>
              <p class="text-xs text-slate-400 font-medium">${inst.name} (${inst.username})</p>
            </div>
          </div>
          <button onclick="document.getElementById('reset-inst-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold transition cursor-pointer">
            ✕
          </button>
        </div>

        <form onsubmit="App.handleSaveInstResetPassword(event, '${inst.id}')" class="space-y-4">
          <div class="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
            Mevcut Şifre: <strong class="text-amber-400 font-mono">${inst.password || '123'}</strong>
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Yeni Şifre</label>
            <input type="text" id="reset-inst-password-input" required placeholder="Yeni şifreyi giriniz"
              class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:border-amber-400 focus:outline-none transition">
          </div>

          <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button type="button" onclick="document.getElementById('reset-inst-modal').remove()" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
              Vazgeç
            </button>
            <button type="submit" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition cursor-pointer">
              Şifreyi Kaydet
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => {
      const inp = document.getElementById('reset-inst-password-input');
      if (inp) inp.focus();
    }, 50);
  },

  handleSaveInstResetPassword(e, instId) {
    e.preventDefault();
    const newPass = document.getElementById('reset-inst-password-input').value.trim();
    if (!newPass) {
      this.showToast('Lütfen geçerli bir şifre giriniz.', 'warning');
      return;
    }

    const res = window.PortalStore.resetInstitutionPassword(instId, newPass);
    if (res.success) {
      this.showToast('Kurum şifresi başarıyla güncellendi.', 'success');
      const modal = document.getElementById('reset-inst-modal');
      if (modal) modal.remove();
      this.render();
    } else {
      this.showToast(res.message || 'Şifre güncellenemedi.', 'error');
    }
  },

  // --- HİBRİT BULUT SENKRONİZASYON PENCERESİ ---
  showCloudSyncModal() {
    const existing = document.getElementById('cloud-sync-modal');
    if (existing) existing.remove();

    const currentConfig = window.CloudSync ? window.CloudSync.getConfig() : null;
    const configString = currentConfig ? JSON.stringify(currentConfig, null, 2) : '';
    const status = window.CloudSync ? window.CloudSync.getStatus() : { code: 'not_configured', label: 'Yerel Mod' };

    const modal = document.createElement('div');
    modal.id = 'cloud-sync-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg">
              ☁️
            </div>
            <div>
              <h3 class="text-base sm:text-lg font-black text-white">Hibrit Bulut Senkronizasyonu</h3>
              <p class="text-xs text-slate-400 font-medium">Firebase Firestore ile Cihazlar Arası Canlı Eşitleme</p>
            </div>
          </div>
          <button onclick="App.closeCloudSyncModal()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold transition">
            ✕
          </button>
        </div>

        <!-- Durum Bildirim Kartı -->
        <div class="p-3.5 rounded-2xl mb-5 flex items-center gap-3 border ${status.code === 'connected' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : (status.code === 'not_configured' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-slate-800/80 border-slate-700 text-slate-300')}">
          <span class="w-3 h-3 rounded-full ${status.code === 'connected' ? 'bg-emerald-400 animate-pulse' : (status.code === 'not_configured' ? 'bg-amber-400' : 'bg-slate-400')}"></span>
          <div class="text-xs">
            <strong class="block font-bold">${status.label}</strong>
            <span class="text-[11px] opacity-80">
              ${status.code === 'connected' 
                ? 'Tüm hocaların kaydettiği talebeler, sınavlar ve okunan optik formlar anlık olarak bu merkeze eşitlenmektedir.' 
                : 'Sistem şu anda güvenle yerel hafızada çalışmaktadır. Ortak bulut havuzu için aşağıdaki Firebase yapılandırmasını tanımlayabilirsiniz.'}
            </span>
          </div>
        </div>

        <!-- Yapılandırma Giriş Alanı -->
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
              <span>Firebase Yapılandırması (firebaseConfig)</span>
              ${currentConfig ? '<span class="text-emerald-400 text-[11px] font-bold">✓ Tanımlı</span>' : '<span class="text-slate-500 text-[11px]">JSON veya JS kodu yapıştırın</span>'}
            </label>
            <textarea id="firebase-config-input" rows="6" placeholder="const firebaseConfig = {&#10;  apiKey: &quot;AIzaSy...&quot;,&#10;  authDomain: &quot;projeniz.firebaseapp.com&quot;,&#10;  projectId: &quot;projeniz&quot;,&#10;  storageBucket: &quot;projeniz.firebasestorage.app&quot;,&#10;  messagingSenderId: &quot;123456&quot;,&#10;  appId: &quot;1:123456:web:...&quot;&#10;};"
              class="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:border-emerald-500 focus:outline-none transition leading-relaxed">${configString}</textarea>
          </div>

          <!-- Aksiyon Butonları -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button onclick="App.handleSaveCloudConfig()" class="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2">
              <span>💾</span> <span>Kaydet & Bağlan</span>
            </button>
            <button onclick="App.handlePullCloudData()" class="py-2.5 px-4 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white font-bold text-xs rounded-xl border border-cyan-500/40 transition flex items-center justify-center gap-2">
              <span>🔄</span> <span>Buluttan Şimdi Çek</span>
            </button>
            <button onclick="App.handlePushCloudData()" class="py-2.5 px-4 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-xs rounded-xl border border-amber-500/40 transition flex items-center justify-center gap-2">
              <span>⬆️</span> <span>Yerel Verileri Buluta Aktar</span>
            </button>
            <button onclick="App.handleClearCloudConfig()" class="py-2.5 px-4 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 text-slate-400 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center gap-2">
              <span>🗑️</span> <span>Ayarları Sıfırla</span>
            </button>
          </div>
        </div>

        <!-- 3 Adımda Firebase Kurulum Kılavuzu -->
        <div class="mt-5 pt-4 border-t border-slate-800/80">
          <details class="text-xs text-slate-400 group">
            <summary class="font-bold text-slate-300 cursor-pointer hover:text-emerald-400 transition flex items-center justify-between">
              <span>📖 3 Adımda Ücretsiz Firebase Kurulum Rehberi</span>
              <span class="group-open:rotate-180 transition transform">▾</span>
            </summary>
            <div class="mt-3 space-y-2 text-[11px] leading-relaxed text-slate-400 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              <p><strong>1. Proje Oluşturun:</strong> <a href="https://console.firebase.google.com" target="_blank" class="text-emerald-400 underline font-bold">console.firebase.google.com</a> adresine Google hesabınızla girin ve <em>"Proje Ekle"</em> butonuna basın.</p>
              <p><strong>2. Firestore Veritabanını Açın:</strong> Sol menüden <em>Build > Firestore Database</em> bölümüne gelin, <em>"Create database"</em> deyin ve başlangıç kuralını <em>"Test mode"</em> seçerek onaylayın.</p>
              <p><strong>3. Web Kodunu Kopyalayın:</strong> Sol üstteki Proje Ayarları (Dişli çark) > <em>Genel</em> sekmesinde sayfanın altına inip Web Uygulaması Ekle (<code>&lt;/&gt;</code>) ikonuna tıklayın. Karşınıza gelen <code>const firebaseConfig = { ... };</code> kodunu kopyalayıp buradaki kutucuğa yapıştırın.</p>
            </div>
          </details>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  },

  closeCloudSyncModal() {
    const modal = document.getElementById('cloud-sync-modal');
    if (modal) modal.remove();
  },

  handleSaveCloudConfig() {
    const input = document.getElementById('firebase-config-input');
    if (!input) return;
    const val = input.value.trim();
    if (!val) {
      this.showToast('Lütfen Firebase yapılandırma kodunu giriniz.', 'warning');
      return;
    }

    if (window.CloudSync && window.CloudSync.saveConfigFromInput(val)) {
      this.showToast('Bulut yapılandırması kaydedildi! Bağlantı kuruluyor...', 'success');
      setTimeout(() => {
        this.closeCloudSyncModal();
        this.render();
      }, 700);
    } else {
      this.showToast('Yapılandırma çözümlenemedi. Lütfen apiKey ve projectId içeren geçerli kodu yapıştırın.', 'error');
    }
  },

  handlePullCloudData() {
    if (window.CloudSync) {
      this.showToast('Buluttaki veriler taranıyor ve eşitleniyor...', 'info');
      window.CloudSync.pullAllFromCloud(true);
    }
  },

  handlePushCloudData() {
    if (window.CloudSync) {
      this.showToast('Yereldeki tüm kayıtlar buluta aktarılıyor...', 'info');
      window.CloudSync.pushAllToCloud(true);
    }
  },

  handleClearCloudConfig() {
    if (confirm('Bulut yapılandırmasını silmek ve yerel hafıza moduna dönmek istediğinize emin misiniz? (Yerel verileriniz korunacaktır)')) {
      if (window.CloudSync) {
        window.CloudSync.clearConfig();
        this.showToast('Bulut yapılandırması temizlendi. Yerel hafıza moduna geçildi.', 'info');
        this.closeCloudSyncModal();
        this.render();
      }
    }
  },

  startPhotoScanForExam(instId, examId) {
    this.activeExamId = examId;
    this.currentTab = 'foto_tara';
    this.render();
  },

  initPasteListener() {
    if (this._pasteListenerAttached) return;
    this._pasteListenerAttached = true;
    window.addEventListener('paste', (e) => {
      if (this.currentTab !== 'foto_tara') return;
      const items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData))?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            const session = window.PortalStore ? window.PortalStore.getCurrentSession() : null;
            const instId = session ? (session.institutionId || 'inst_oay') : 'inst_oay';
            this.showToast('📋 Panodaki görsel algılandı, işleniyor...', 'info');
            this.processSinglePhotoFile(blob, instId);
            break;
          }
        }
      }
    });
  },

  renderPhotoScannerView(instId) {
    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null) || 'inst_oay';

    let exams = window.PortalStore.getExams(effectiveInstId);
    if (!exams || exams.length === 0) {
      return `
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center max-w-xl mx-auto space-y-4">
          <div class="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center text-3xl mx-auto">
            📝
          </div>
          <h3 class="text-lg font-black text-white">Henüz Kayıtlı Sınav Yok</h3>
          <p class="text-xs text-slate-400">Fotoğraf ile optik form okutmak için önce bir deneme sınavı tanımlamalısınız.</p>
          <button onclick="App.showCreateExamModal('${effectiveInstId}')" class="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition">
            + Yeni Sınav Tanımla
          </button>
        </div>
      `;
    }

    const currentExam = exams.find(e => e.id === this.activeExamId) || exams[0];
    this.activeExamId = currentExam.id;
    const students = window.PortalStore.getStudents(effectiveInstId);

    // If activePhotoResult exists with overlayCanvas, mount after render
    if (this.activePhotoResult && this.activePhotoResult.overlayCanvas) {
      setTimeout(() => {
        const mount = document.getElementById('photo-overlay-mount');
        if (mount && this.activePhotoResult && this.activePhotoResult.overlayCanvas) {
          mount.innerHTML = '';
          this.activePhotoResult.overlayCanvas.style.maxWidth = '100%';
          this.activePhotoResult.overlayCanvas.style.height = 'auto';
          this.activePhotoResult.overlayCanvas.style.borderRadius = '8px';
          this.activePhotoResult.overlayCanvas.style.display = 'block';
          mount.appendChild(this.activePhotoResult.overlayCanvas);
        }
      }, 50);
    }

    return `
      <div class="space-y-5 max-w-5xl mx-auto">
        <!-- Üst Kontrol Çubuğu -->
        <div class="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-lg">
          <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <span class="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center text-lg flex-shrink-0 border border-teal-500/30">
              📷
            </span>
            <div>
              <h2 class="text-sm sm:text-base font-black text-white tracking-tight">Fotoğraf ile Optik Form Okuma</h2>
              <p class="text-[10px] text-slate-400">Yüksek netlikte fotoğraf çekin veya seçin; köşe işaretleri, QR kod ve cevaplar otomatik okunur.</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <select id="photo-exam-select" onchange="App.handlePhotoExamChange(this.value, '${effectiveInstId}')" class="flex-1 sm:flex-initial px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-teal-500 focus:outline-none">
              ${exams.map(e => `<option value="${e.id}" ${this.activeExamId === e.id ? 'selected' : ''}>${e.title} (${e.questionCount} Soru)</option>`).join('')}
            </select>
            <select id="photo-student-select" class="flex-1 sm:flex-initial px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-teal-500 focus:outline-none">
              <option value="">-- Talebe: QR Koddan Oku --</option>
              ${students.map(s => `<option value="${s.studentNo}">${s.studentNo} - ${s.firstName} ${s.lastName} (${s.className})</option>`).join('')}
            </select>
            <select id="photo-booklet-select" class="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-teal-500 focus:outline-none" title="Kitapçık Türü">
              <option value="auto">📖 Kitapçık: Otomatik</option>
              <option value="A">Kitapçık A</option>
              <option value="B">Kitapçık B</option>
              <option value="C">Kitapçık C</option>
              <option value="D">Kitapçık D</option>
            </select>
          </div>
        </div>

        <!-- Fotoğraf Yükleme / Çekme Alanı (Dropzone) -->
        <div id="photo-dropzone" 
          ondragover="App.handlePhotoDragOver(event)" 
          ondragleave="App.handlePhotoDragLeave(event)" 
          ondrop="App.handlePhotoDrop(event, '${effectiveInstId}')"
          class="border-2 border-dashed border-teal-500/40 hover:border-teal-400 bg-slate-900/60 hover:bg-slate-900/90 rounded-3xl p-6 sm:p-8 text-center transition-all shadow-xl relative overflow-hidden group">
          
          <input type="file" id="photo-input-cam" accept="image/*" capture="environment" onchange="App.handlePhotoUpload(event, '${effectiveInstId}')" class="hidden">
          <input type="file" id="photo-input-file" accept="image/*" onchange="App.handlePhotoUpload(event, '${effectiveInstId}')" class="hidden">
          <input type="file" id="photo-input-batch" accept="image/*" multiple onchange="App.handleBatchPhotoUpload(event, '${effectiveInstId}')" class="hidden">

          <div class="max-w-xl mx-auto space-y-4">
            <div class="w-16 h-16 rounded-2xl bg-teal-500/20 text-teal-300 flex items-center justify-center text-3xl mx-auto border border-teal-500/30 group-hover:scale-110 transition-transform">
              📸
            </div>
            
            <div>
              <h3 class="text-base sm:text-lg font-black text-white">Optik Form Fotoğrafı Çekin veya Seçin</h3>
              <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Yatay A4 optik formunuzun 4 köşesi ve sol üstteki karekodu görünecek biçimde dik açıdan çekiniz.
              </p>
            </div>

            <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
              <!-- Kameradan Çek (Mobil Uyumlu) -->
              <button type="button" onclick="document.getElementById('photo-input-cam').click()" class="px-5 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer active:scale-95">
                <span>📸</span> <span>Kameradan Fotoğraf Çek</span>
              </button>

              <!-- Galeriden / Dosyadan Seç -->
              <button type="button" onclick="document.getElementById('photo-input-file').click()" class="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm rounded-xl border border-slate-700 transition flex items-center gap-2 cursor-pointer active:scale-95">
                <span>🖼️</span> <span>Galeriden / Dosyadan Seç</span>
              </button>

              <!-- Toplu Çoklu Fotoğraf Seçimi -->
              <button type="button" onclick="document.getElementById('photo-input-batch').click()" class="px-4 py-3 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-xs sm:text-sm rounded-xl border border-indigo-500/50 transition flex items-center gap-2 cursor-pointer active:scale-95" title="Birden fazla kağıt fotoğrafını aynı anda yükleyin">
                <span>📚</span> <span>Toplu Çoklu Seç</span>
              </button>
            </div>

            <div class="pt-2 text-[11px] text-slate-500 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-medium">
              <span>💡 İpucu: Fotoğrafı buraya sürükleyip bırakabilirsiniz</span>
              <span>•</span>
              <span>📋 Panodaki resmi <kbd class="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded font-mono border border-slate-700">Ctrl + V</kbd> ile yapıştırabilirsiniz</span>
            </div>
          </div>

          <!-- Yükleme Göstergesi -->
          <div id="photo-scanner-loading" class="hidden absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-20">
            <div class="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p id="photo-loading-text" class="text-xs font-bold text-teal-300">Fotoğraf taranıyor, köşe işaretleri aranıyor...</p>
          </div>
        </div>

        <!-- Okuma Sonuç Alanı -->
        <div id="photo-scan-result-container">
          ${this.activePhotoResult ? this.buildPhotoScanResultHtml(this.activePhotoResult, effectiveInstId) : ''}
        </div>

        <!-- Toplu Okuma Liste Alanı -->
        <div id="photo-batch-results-container">
          ${(this.activePhotoBatchResults && this.activePhotoBatchResults.length > 0) ? this.buildPhotoBatchListHtml(this.activePhotoBatchResults, effectiveInstId, this.activeExamId) : ''}
        </div>
      </div>
    `;
  },

  handlePhotoExamChange(examId, instId) {
    this.activeExamId = examId;
    const exam = window.PortalStore.getExamById(instId, examId);
    if (exam) {
      this.showToast(`Seçili Sınav: ${exam.title}`, 'info');
    }
  },

  handlePhotoDragOver(event) {
    event.preventDefault();
    const zone = document.getElementById('photo-dropzone');
    if (zone) zone.classList.add('border-teal-300', 'bg-slate-900');
  },

  handlePhotoDragLeave(event) {
    event.preventDefault();
    const zone = document.getElementById('photo-dropzone');
    if (zone) zone.classList.remove('border-teal-300', 'bg-slate-900');
  },

  handlePhotoDrop(event, instId) {
    event.preventDefault();
    const zone = document.getElementById('photo-dropzone');
    if (zone) zone.classList.remove('border-teal-300', 'bg-slate-900');

    const dt = event.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;

    if (dt.files.length === 1) {
      this.processSinglePhotoFile(dt.files[0], instId);
    } else {
      this.handleBatchPhotoUpload({ target: { files: dt.files } }, instId);
    }
  },

  handlePhotoUpload(event, instId) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    this.processSinglePhotoFile(file, instId);
    event.target.value = '';
  },

  async processSinglePhotoFile(file, instId) {
    if (!window.PhotoOmrScanner) {
      this.showToast('Fotoğraf OMR motoru yükleniyor, lütfen birkaç saniye sonra tekrar deneyiniz.', 'warning');
      return;
    }
    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null) || 'inst_oay';
    const examSelect = document.getElementById('photo-exam-select');
    const examId = examSelect ? examSelect.value : this.activeExamId;
    const exam = window.PortalStore.getExamById(effectiveInstId, examId) || window.PortalStore.getExams(effectiveInstId)[0];

    if (!exam) {
      this.showToast('Lütfen önce bir sınav seçiniz.', 'warning');
      return;
    }

    const studentSelect = document.getElementById('photo-student-select');
    const forcedStudentNo = (studentSelect && studentSelect.value) ? studentSelect.value : null;

    const bookletSelect = document.getElementById('photo-booklet-select');
    const forcedBooklet = (bookletSelect && bookletSelect.value !== 'auto') ? bookletSelect.value : null;

    this.showPhotoLoading(true, 'Fotoğraf taranıyor, 4 köşe ve QR kod analiz ediliyor...');

    try {
      const scanRes = await window.PhotoOmrScanner.scanImageFile(file, exam, forcedStudentNo, forcedBooklet, true);
      this.showPhotoLoading(false);

      if (!scanRes || !scanRes.success) {
        this.showToast(scanRes ? scanRes.message : 'Fotoğraf okunamadı.', 'error');
        this.renderPhotoScanResultView(null, effectiveInstId, scanRes ? scanRes.message : 'Kağıt algılanamadı');
        return;
      }

      const res = scanRes.result;
      const students = window.PortalStore.getStudents(effectiveInstId);
      const matchedSt = students.find(s => s.studentNo === res.studentNo);

      res.studentName = matchedSt ? `${matchedSt.firstName} ${matchedSt.lastName}` : (res.studentName || `Talebe #${res.studentNo}`);
      res.className = matchedSt ? matchedSt.className : (res.className || 'Genel');
      res.parentPhone = matchedSt ? matchedSt.parentPhone : (res.parentPhone || '');
      res.overlayCanvas = scanRes.overlayCanvas || null;

      this.activePhotoResult = res;

      // Otomatik Kayıt
      if (res.studentNo && !res.isMissingAnswerKey) {
        window.PortalStore.saveExamResult(effectiveInstId, res);
        this.showToast(`✓ ${res.studentName} başarıyla okundu ve kaydedildi! (${res.totalNet} Net - ${res.totalScore} Puan)`, 'success');
      }

      this.renderPhotoScanResultView(res, effectiveInstId);
    } catch (err) {
      this.showPhotoLoading(false);
      console.error('Fotoğraf okuma hatası:', err);
      this.showToast('Fotoğraf işlenirken hata oluştu: ' + (err.message || err), 'error');
    }
  },

  async handleBatchPhotoUpload(event, instId) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (files.length === 1) {
      this.processSinglePhotoFile(files[0], instId);
      event.target.value = '';
      return;
    }

    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null) || 'inst_oay';
    const examSelect = document.getElementById('photo-exam-select');
    const examId = examSelect ? examSelect.value : this.activeExamId;
    const exam = window.PortalStore.getExamById(effectiveInstId, examId) || window.PortalStore.getExams(effectiveInstId)[0];

    if (!exam) {
      this.showToast('Lütfen önce bir sınav seçiniz.', 'warning');
      return;
    }

    this.showPhotoLoading(true, `Toplu okuma başlatılıyor (${files.length} fotoğraf)...`);
    const results = [];
    const students = window.PortalStore.getStudents(effectiveInstId);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this.updatePhotoLoadingText(`İşleniyor: ${i + 1} / ${files.length} (${file.name})...`);
      try {
        const scanRes = await window.PhotoOmrScanner.scanImageFile(file, exam, null, null, false);
        if (scanRes && scanRes.success) {
          const res = scanRes.result;
          const matchedSt = students.find(s => s.studentNo === res.studentNo);
          res.studentName = matchedSt ? `${matchedSt.firstName} ${matchedSt.lastName}` : (res.studentName || `Talebe #${res.studentNo}`);
          res.className = matchedSt ? matchedSt.className : (res.className || 'Genel');
          res.parentPhone = matchedSt ? matchedSt.parentPhone : '';
          res.fileName = file.name;

          if (res.studentNo && !res.isMissingAnswerKey) {
            window.PortalStore.saveExamResult(effectiveInstId, res);
          }
          results.push({ success: true, result: res, fileName: file.name });
        } else {
          results.push({ success: false, message: scanRes ? scanRes.message : 'Algılanamadı', fileName: file.name });
        }
      } catch (e) {
        results.push({ success: false, message: e.message, fileName: file.name });
      }
    }

    this.showPhotoLoading(false);
    this.activePhotoBatchResults = results;
    const successCount = results.filter(r => r.success).length;
    this.showToast(`✓ Toplu okuma tamamlandı: ${successCount} / ${files.length} optik form kaydedildi.`, 'success');
    this.renderPhotoBatchListView(results, effectiveInstId, exam.id);
    if (event.target) event.target.value = '';
  },

  showPhotoLoading(show, message) {
    const el = document.getElementById('photo-scanner-loading');
    const txt = document.getElementById('photo-loading-text');
    if (!el) return;
    if (show) {
      el.classList.remove('hidden');
      if (txt && message) txt.textContent = message;
    } else {
      el.classList.add('hidden');
    }
  },

  updatePhotoLoadingText(text) {
    const txt = document.getElementById('photo-loading-text');
    if (txt) txt.textContent = text;
  },

  renderPhotoScanResultView(res, instId, errorMsg = null) {
    const container = document.getElementById('photo-scan-result-container');
    if (!container) return;
    container.innerHTML = this.buildPhotoScanResultHtml(res, instId, errorMsg);

    if (res && res.overlayCanvas) {
      setTimeout(() => {
        const mount = document.getElementById('photo-overlay-mount');
        if (mount && res.overlayCanvas) {
          mount.innerHTML = '';
          res.overlayCanvas.style.maxWidth = '100%';
          res.overlayCanvas.style.height = 'auto';
          res.overlayCanvas.style.borderRadius = '8px';
          res.overlayCanvas.style.display = 'block';
          mount.appendChild(res.overlayCanvas);
        }
      }, 50);
    }
  },

  buildPhotoScanResultHtml(result, instId, errorMsg = null) {
    if (errorMsg || !result) {
      return `
        <div class="bg-rose-950/40 border-2 border-rose-500/70 rounded-3xl p-6 shadow-2xl animate-fade-in text-center space-y-3">
          <div class="w-14 h-14 bg-rose-500/20 text-rose-300 rounded-2xl flex items-center justify-center text-3xl mx-auto border border-rose-500/40">
            ⚠️
          </div>
          <h3 class="text-base font-black text-rose-200">Fotoğraf Okunamadı</h3>
          <p class="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            ${errorMsg || 'Fotoğrafta optik formun 4 köşe işareti veya karekodu net olarak tespit edilemedi.'}
          </p>
          <div class="pt-2 flex justify-center gap-2">
            <button onclick="document.getElementById('photo-input-cam').click()" class="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-slate-950 font-black text-xs rounded-xl shadow transition cursor-pointer">
              📸 Tekrar Fotoğraf Çek
            </button>
            <button onclick="App.clearPhotoResult()" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer">
              Temizle
            </button>
          </div>
        </div>
      `;
    }

    if (result.isMissingAnswerKey) {
      return `
        <div class="bg-amber-950/60 border-2 border-amber-500 rounded-3xl p-6 shadow-2xl animate-fade-in text-center space-y-3">
          <div class="w-14 h-14 bg-amber-500/20 text-amber-300 rounded-2xl flex items-center justify-center text-3xl mx-auto border border-amber-500/40 shadow-lg">
            🔑
          </div>
          <h3 class="text-base font-black text-amber-200">Cevap Anahtarı Kodlanmamış!</h3>
          <p class="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            <strong>${result.examTitle || 'Sınav'}</strong> için <strong>${result.booklet || 'A'} Kitapçığı</strong> cevap anahtarı henüz sisteme girilmemiştir.
          </p>
          <div class="pt-2">
            <button onclick="App.showEditExamModal('${instId}', '${result.examId}')" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition inline-flex items-center gap-1.5 cursor-pointer">
              <span>🔑</span> <span>Cevap Anahtarını Gir & Düzenle →</span>
            </button>
          </div>
        </div>
      `;
    }

    const isBlank = !!result.isBlank;

    return `
      <div class="space-y-4 animate-fade-in">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <!-- Sol Sütun: Görsel Teşhis ve İşlenmiş Optik Form Önizlemesi -->
          <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-slate-800">
              <div class="flex items-center gap-2">
                <span class="text-base">🔍</span>
                <h4 class="text-xs font-black text-white uppercase tracking-wider">İşlenen Form Önizlemesi</h4>
              </div>
              <span class="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                ✓ 4 Köşe & QR Doğrulandı
              </span>
            </div>
            
            <div id="photo-overlay-mount" class="w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center p-1 min-h-[220px]">
              <div class="text-xs text-slate-500 p-4">Önizleme hazırlanıyor...</div>
            </div>

            <div class="text-[10px] text-slate-400 flex flex-wrap items-center justify-between gap-2 px-1 pt-1 font-mono">
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow"></span> Yeşil: Algılanan İşaret</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow"></span> Kırmızı: Boş Soru</span>
              <span class="text-slate-500">Çözünürlük: 1600x1126</span>
            </div>
          </div>

          <!-- Sağ Sütun: Talebe Karnesi & Puan Özeti -->
          <div class="bg-slate-900 border-2 ${isBlank ? 'border-amber-500' : 'border-teal-500'} rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div class="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span class="text-[10px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1">
                  <span>✓</span> <span>Fotoğraftan Başarıyla Okundu</span>
                </span>
                <h3 class="text-xl font-black text-white mt-1">${result.studentName}</h3>
                <div class="flex items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
                  <span>No: <strong class="text-slate-200">${result.studentNo || '-'}</strong></span>
                  <span>•</span>
                  <span>Şube: <strong class="text-slate-200">${result.className}</strong></span>
                  <span>•</span>
                  <span>Kitapçık: <strong class="text-teal-400 font-black">${result.booklet || 'A'}</strong></span>
                </div>
              </div>
              <div class="text-right">
                <span class="text-3xl font-black font-mono ${isBlank ? 'text-amber-400' : 'text-teal-400'}">${result.totalScore}</span>
                <span class="block text-[10px] font-bold text-slate-400 uppercase">Sınav Puanı</span>
                <span class="text-[9px] text-slate-500 font-mono">Taban 200 • Tavan 500</span>
              </div>
            </div>

            <!-- İstatistik Kutucukları -->
            <div class="grid grid-cols-4 gap-2 text-center">
              <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span class="block text-[10px] text-slate-500 font-bold uppercase">Doğru</span>
                <span class="text-lg font-black text-emerald-400 font-mono">${result.totalCorrect}</span>
              </div>
              <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span class="block text-[10px] text-slate-500 font-bold uppercase">Yanlış</span>
                <span class="text-lg font-black text-rose-400 font-mono">${result.totalWrong}</span>
              </div>
              <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span class="block text-[10px] text-slate-500 font-bold uppercase">Boş</span>
                <span class="text-lg font-black text-slate-300 font-mono font-bold">${result.totalEmpty}</span>
              </div>
              <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span class="block text-[10px] text-slate-500 font-bold uppercase">Toplam Net</span>
                <span class="text-lg font-black text-cyan-400 font-mono">${result.totalNet}</span>
              </div>
            </div>

            <!-- Ders Dökümü -->
            ${(result.subjectResults && result.subjectResults.length > 0) ? `
              <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ders Başarı Tablosu</div>
                <div class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  ${result.subjectResults.map(s => `
                    <div class="flex items-center justify-between text-xs py-1 border-b border-slate-800/40">
                      <span class="text-slate-200 font-bold truncate">${s.name}</span>
                      <div class="flex items-center gap-2 font-mono text-[11px]">
                        <span class="text-emerald-400">${s.correct}D</span>
                        <span class="text-rose-400">${s.wrong}Y</span>
                        <span class="text-slate-500">${s.empty}B</span>
                        <span class="text-teal-300 font-black">${s.net} Net</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Konu Analizleri (Varsa) -->
            ${(result.topicAnalysis && result.topicAnalysis.length > 0) ? `
              <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                    <span>🎯</span> <span>Konu Başarı Analizi</span>
                  </span>
                  <span class="text-[10px] text-slate-400 font-mono">${result.topicAnalysis.length} Konu</span>
                </div>
                <div class="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  ${result.topicAnalysis.slice(0, 5).map(t => `
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-slate-300 truncate max-w-[180px]">${t.subject}: <strong class="text-white">${t.topic}</strong></span>
                      <div class="flex items-center gap-1.5 font-mono">
                        <span class="${t.percent >= 70 ? 'text-emerald-400' : (t.percent >= 40 ? 'text-amber-400' : 'text-rose-400')} font-bold">%${t.percent}</span>
                        <span class="text-slate-500 text-[10px]">(${t.correct}/${t.total} D)</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Aksiyon Butonları -->
            <div class="flex flex-wrap gap-2 pt-1">
              ${(result.parentPhone && !isBlank) ? `
                <button onclick="App.sendWhatsAppCard('${encodeURIComponent(result.parentPhone)}', '${encodeURIComponent(result.studentName)}', '${result.totalNet}', '${result.totalScore}', '${encodeURIComponent(JSON.stringify(result.topicAnalysis || []))}')" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer">
                  <span>💬</span> <span>WhatsApp Karnesi</span>
                </button>
              ` : ''}
              <button onclick="App.showManualResultModal('${result.institutionId || instId}', '${result.examId}', '${result.studentNo}')" class="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 cursor-pointer" title="Cevapları ve Notu Düzenle">
                <span>✍️</span> <span>Düzenle</span>
              </button>
              <button onclick="App.deleteExamResultPrompt('${result.institutionId || instId}', '${result.examId}', '${result.id || ''}', '${result.studentNo}', '${encodeURIComponent(result.studentName)}')" class="px-3.5 py-2.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white font-bold text-xs rounded-xl border border-rose-500/30 transition flex items-center justify-center gap-1 cursor-pointer" title="Bu Okunan Optik Kağıdı Sil">
                <span>🗑️</span> <span>Sil</span>
              </button>
              <button onclick="App.clearPhotoResult()" class="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer" title="Yeni Okuma İçin Temizle">
                ✕ Temizle
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderPhotoBatchListView(batchList, instId, examId) {
    const container = document.getElementById('photo-batch-results-container');
    if (!container) return;
    container.innerHTML = this.buildPhotoBatchListHtml(batchList, instId, examId);
  },

  buildPhotoBatchListHtml(batchList, instId, examId) {
    if (!Array.isArray(batchList) || batchList.length === 0) return '';
    const successCount = batchList.filter(b => b.success).length;

    return `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4 animate-fade-in mt-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 class="text-base font-black text-white flex items-center gap-2">
              <span>📚</span> <span>Toplu Fotoğraf Okuma Listesi</span>
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">
              Toplam <strong>${batchList.length}</strong> kağıt işlendi: <span class="text-emerald-400 font-bold">${successCount} Başarılı</span>, <span class="text-rose-400 font-bold">${batchList.length - successCount} Hatalı/Eksik</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="App.switchTab('neticeler')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition">
              🏆 Neticeler Listesine Git →
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th class="p-2">#</th>
                <th class="p-2">Dosya Adı</th>
                <th class="p-2">Talebe</th>
                <th class="p-2">Kitapçık</th>
                <th class="p-2 text-center">Net</th>
                <th class="p-2 text-center">Puan</th>
                <th class="p-2 text-center">Durum</th>
                <th class="p-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-mono">
              ${batchList.map((item, idx) => {
                if (item.success && item.result) {
                  const r = item.result;
                  return `
                    <tr class="hover:bg-slate-800/40">
                      <td class="p-2 text-slate-500">${idx + 1}</td>
                      <td class="p-2 text-slate-400 truncate max-w-[140px]" title="${item.fileName || ''}">${item.fileName || '-'}</td>
                      <td class="p-2 font-sans font-bold text-white">${r.studentName}</td>
                      <td class="p-2 text-teal-400 font-bold text-center">${r.booklet || 'A'}</td>
                      <td class="p-2 text-cyan-400 font-bold text-center">${r.totalNet}</td>
                      <td class="p-2 text-emerald-400 font-black text-center">${r.totalScore}</td>
                      <td class="p-2 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✓ Kaydedildi</span>
                      </td>
                      <td class="p-2 text-right">
                        <button onclick="App.inspectBatchItem(${idx})" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-sans font-bold cursor-pointer">
                          İncele 👁️
                        </button>
                      </td>
                    </tr>
                  `;
                } else {
                  return `
                    <tr class="hover:bg-slate-800/40 bg-rose-950/20">
                      <td class="p-2 text-slate-500">${idx + 1}</td>
                      <td class="p-2 text-slate-400 truncate max-w-[140px]">${item.fileName || '-'}</td>
                      <td class="p-2 font-sans text-rose-300 font-bold" colspan="4">⚠️ ${item.message || 'Okunamadı'}</td>
                      <td class="p-2 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">Hata</span>
                      </td>
                      <td class="p-2 text-right">
                        <span class="text-slate-500 text-[10px] font-sans">-</span>
                      </td>
                    </tr>
                  `;
                }
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  inspectBatchItem(index) {
    if (!this.activePhotoBatchResults || !this.activePhotoBatchResults[index]) return;
    const item = this.activePhotoBatchResults[index];
    if (item.success && item.result) {
      this.activePhotoResult = item.result;
      const session = window.PortalStore.getCurrentSession();
      this.renderPhotoScanResultView(item.result, session ? session.institutionId : 'inst_oay');
      const container = document.getElementById('photo-scan-result-container');
      if (container) container.scrollIntoView({ behavior: 'smooth' });
    }
  },

  clearPhotoResult() {
    this.activePhotoResult = null;
    const container = document.getElementById('photo-scan-result-container');
    if (container) container.innerHTML = '';
  },

  renderFooter() {
    return `
      <footer class="bg-slate-900 border-t border-slate-800 py-3 text-center text-xs text-slate-500 font-mono">
        Optik Sınav Portalı • Tüm hakları saklıdır.
      </footer>
    `;
  }
};

// Güvenli Otomatik Başlatıcı: Sayfa hazırsa hemen çalıştır, yükleniyorsa DOMContentLoaded'da çalıştır
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.App.init();
  });
} else {
  window.App.init();
}
