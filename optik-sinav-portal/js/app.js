/**
 * app.js - Çoklu Kurum Optik Sınav Platformu Ana Kontrolörü
 */

window.App = {
  currentTab: 'login',
  activeExamId: null,
  activeScanResult: null,
  currentTheme: 'dark',

  init() {
    this.initTheme();
    const session = window.PortalStore.getCurrentSession();
    if (session) {
      if (session.role === 'superadmin') {
        this.currentTab = 'kurumlar';
      } else {
        this.currentTab = 'sinavlar';
      }
    } else {
      this.currentTab = 'login';
    }

    if (window.CloudSync && typeof window.CloudSync.init === 'function') {
      window.CloudSync.init();
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
    e.preventDefault();
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
    const session = window.PortalStore.getCurrentSession();
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
      <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        ${this.renderHeader(session)}
        <main class="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6">
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
  },

  renderHeader(session) {
    const isSuper = session.role === 'superadmin';
    return `
      <header class="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-emerald-500/20">
              📸
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-base sm:text-lg font-black tracking-tight text-white">Optik Sınav Portalı</h1>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${isSuper ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}">
                  ${isSuper ? 'Ana Yönetici' : 'Kurs Paneli'}
                </span>
              </div>
              <p class="text-xs text-slate-400 font-medium">${session.institutionName}</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Tema Değiştir Butonu -->
            <button onclick="App.showThemeModal()" title="Görünüm ve Tema Seçimi" class="px-2.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-slate-800 text-slate-300 border-slate-700 hover:text-white cursor-pointer">
              <span>🎨</span>
              <span class="hidden sm:inline">Tema</span>
            </button>

            <!-- Şifre Değiştir Butonu -->
            <button onclick="App.showChangePasswordModal()" title="Şifre Değiştir" class="px-2.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-slate-800 text-amber-300 border-slate-700 hover:text-amber-200 cursor-pointer">
              <span>🔑</span>
              <span class="hidden sm:inline">Şifre</span>
            </button>

            <!-- Bulut Senkronizasyon Rozeti -->
            <button id="cloud-sync-badge" onclick="App.showCloudSyncModal()" title="Bulut Senkronizasyon Ayarları" class="px-2.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-slate-800 text-slate-300 border-slate-700">
              <span class="w-2 h-2 rounded-full bg-slate-400"></span>
              <span class="hidden sm:inline">Bulut Durumu</span>
            </button>

            ${session.isImpersonating ? `
              <button onclick="App.returnToSuperAdmin()" class="px-3 py-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1">
                <span>👑</span> <span>Merkeze Dön</span>
              </button>
            ` : ''}
            <button onclick="App.handleLogout()" class="px-3 py-1.5 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 text-slate-300 border border-slate-700 hover:border-rose-800 rounded-xl text-xs font-bold transition flex items-center gap-1">
              <span>Çıkış</span> <span>🚪</span>
            </button>
          </div>
        </div>

        <!-- Sekme Menüsü -->
        <nav class="max-w-7xl mx-auto px-4 flex gap-1 sm:gap-2 overflow-x-auto border-t border-slate-800/80 pt-1 pb-1">
          ${isSuper ? `
            <button onclick="App.switchTab('kurumlar')" class="px-4 py-2 rounded-lg text-xs font-bold transition ${this.currentTab === 'kurumlar' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
              🏢 Kurs & Okul Yönetimi
            </button>
            <button onclick="App.switchTab('ortak_sinavlar')" class="px-4 py-2 rounded-lg text-xs font-bold transition ${this.currentTab === 'ortak_sinavlar' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
              🌐 Merkezi Ortak Sınavlar
            </button>
            <button onclick="App.switchTab('istatistikler')" class="px-4 py-2 rounded-lg text-xs font-bold transition ${this.currentTab === 'istatistikler' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
              📊 Sistem İstatistikleri
            </button>
          ` : `
            <button onclick="App.switchTab('sinavlar')" class="px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${this.currentTab === 'sinavlar' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
              <span>📝</span> <span>Sınavlar</span>
            </button>
            <button onclick="App.switchTab('ogrenciler')" class="px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${this.currentTab === 'ogrenciler' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
              <span>👥</span> <span>Talebeler</span>
            </button>
            <button onclick="App.switchTab('optik_yazdir')" class="px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${this.currentTab === 'optik_yazdir' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
              <span>🖨️</span> <span>Optik Form Yazdır</span>
            </button>
            <button onclick="App.switchTab('kamera_tara')" class="px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${this.currentTab === 'kamera_tara' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
              <span>📱</span> <span>Kamera ile Oku</span>
            </button>
            <button onclick="App.switchTab('neticeler')" class="px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${this.currentTab === 'neticeler' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white'}">
              <span>🏆</span> <span>Neticeler & Sıralama</span>
            </button>
          `}
        </nav>
      </header>
    `;
  },

  renderTabContent(session) {
    if (session.role === 'superadmin') {
      if (this.currentTab === 'kurumlar') return this.renderSuperInstitutions();
      if (this.currentTab === 'ortak_sinavlar') return this.renderSuperGlobalExams();
      if (this.currentTab === 'istatistikler') return this.renderSuperStats();
    } else {
      if (this.currentTab === 'sinavlar') return this.renderExamsView(session.institutionId);
      if (this.currentTab === 'ogrenciler') return this.renderStudentsView(session.institutionId);
      if (this.currentTab === 'optik_yazdir') return this.renderOpticalPrintView(session.institutionId);
      if (this.currentTab === 'kamera_tara') return this.renderCameraScannerView(session.institutionId);
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
              <input type="text" id="login-username" required placeholder="admin veya kurs adınız"
                class="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:border-emerald-500 focus:outline-none transition">
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Şifre</label>
              <input type="password" id="login-password" required placeholder="••••••••"
                class="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:border-emerald-500 focus:outline-none transition">
            </div>

            <button type="submit"
              class="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer">
              <span>Giriş Yap</span>
              <span>→</span>
            </button>
          </form>

          <div class="mt-6 pt-4 border-t border-slate-800/80 text-center">
            <p class="text-[11px] text-slate-500">
              💡 <strong>Ana Yönetici Girişi:</strong> Kullanıcı Adı: <code>admin</code> • Şifre: <code>123</code><br>
              💡 <strong>Örnek Kurs Girişi:</strong> Kullanıcı Adı: <code>oay</code> • Şifre: <code>123</code>
            </p>
          </div>
        </div>
      </div>
    `;
  },

  // 2. SÜPER YÖNETİCİ: KURUM YÖNETİMİ
  renderSuperInstitutions() {
    const list = window.PortalStore.getInstitutions();
    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div>
            <h2 class="text-xl font-black text-white tracking-tight">Kayıtlı Kurs & Okullar</h2>
            <p class="text-xs text-slate-400 mt-0.5">Sistemi kullanan tüm kurumları buradan açabilir, yönetebilir ve panellerine doğrudan geçebilirsiniz.</p>
          </div>
          <button onclick="App.showAddInstitutionModal()" class="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition flex items-center gap-1.5">
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
                  <button onclick="App.showResetInstPasswordModal('${inst.id}', '${inst.name.replace(/'/g, "\\'")}')" class="p-2 text-amber-300 hover:bg-amber-950/40 rounded-xl transition cursor-pointer" title="Kurum Şifresini Değiştir">
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
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div>
            <h2 class="text-xl font-black text-white tracking-tight">Deneme Sınavları</h2>
            <p class="text-xs text-slate-400 mt-0.5">Sınav tanımlayabilir, optik form basabilir veya kamerayla okumaya geçebilirsiniz.</p>
          </div>
          <button onclick="App.showCreateExamModal('${instId}')" class="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition flex items-center gap-1.5">
            <span>+</span> <span>Yeni Deneme Sınavı Oluştur</span>
          </button>
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
                      <button onclick="App.startScanForExam('${instId}', '${exam.id}')" class="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1">
                        <span>📱</span> <span>Kamerayla Oku</span>
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

    const modal = document.createElement('div');
    modal.id = 'create-exam-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 max-w-2xl w-full shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">\${isGlobal ? '🌐' : '📝'}</span>
            <div>
              <h3 class="text-base font-black text-white">\${isGlobal ? 'Merkezi Ortak Deneme Sınavı Oluştur' : 'Yeni Deneme Sınavı Oluştur'}</h3>
              <p class="text-xs text-slate-400 font-medium">\${isGlobal ? 'Tüm kursların katılabileceği genel ortak sınav' : 'Kurumunuza özel deneme sınavı'}</p>
            </div>
          </div>
          <button onclick="document.getElementById('create-exam-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <form onsubmit="App.handleSaveExamForm(event, '\${instId || ''}', \${isGlobal})" class="space-y-4">
          <!-- Hazır Şablon Seçimi -->
          <div class="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <label class="block text-[11px] font-bold uppercase text-emerald-400 mb-1">⚡ Hazır Sınav Formatı / Şablonu Seçiniz</label>
            <select id="exam-template-select" onchange="App.handleTemplateChange(this.value)" class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
              \${templates.map(t => `<option value="\${t.id}">\${t.name}</option>`).join('')}
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
              <input type="date" id="exam-form-date" value="\${new Date().toISOString().split('T')[0]}" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Toplam Soru Sayısı</label>
              <input type="number" id="exam-form-qcount" min="1" max="300" value="90" onchange="App.handleExamQCountChange(this.value)" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Hedef Sınıf / Seviye</label>
              <input type="text" id="exam-form-target" value="8. Sınıf" class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
          </div>

          <!-- Dersler ve Katsayılar Tablosu -->
          <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
            <div class="flex items-center justify-between pb-1">
              <div>
                <label class="text-xs font-bold uppercase text-slate-300">📚 Ders Bölümleri & Katsayılar</label>
                <p class="text-[10px] text-slate-500">Her dersin soru aralığını, puan katsayısını ve yanlış götürme oranını belirleyebilirsiniz.</p>
              </div>
              <button type="button" onclick="App.addSubjectRow('subject-rows-container')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-bold rounded-lg border border-slate-700 transition">
                + Ders Ekle
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-[11px]">
                <thead class="text-slate-500 uppercase border-b border-slate-800 font-bold">
                  <tr>
                    <th class="p-1.5">Ders Adı</th>
                    <th class="p-1.5 text-center">İlk Soru</th>
                    <th class="p-1.5 text-center">Son Soru</th>
                    <th class="p-1.5 text-center">Ceza (Yanlış Götürme)</th>
                    <th class="p-1.5 text-center">Katsayı</th>
                    <th class="p-1.5 text-right">Sil</th>
                  </tr>
                </thead>
                <tbody id="subject-rows-container" class="divide-y divide-slate-800/60">
                  <!-- Dinamik Ders Satırları Buraya Eklenir -->
                </tbody>
              </table>
            </div>
          </div>

          <!-- 4 Kitapçık (A, B, C, D) Cevap Anahtarları -->
          <div class="space-y-3 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <span>🔑</span> <span>Cevap Anahtarları (4 Kitapçık)</span>
              </label>
              <div class="flex gap-1" id="booklet-tab-buttons">
                <button type="button" onclick="App.switchBookletTab('A')" id="btn-tab-A" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 transition">Kitapçık A</button>
                <button type="button" onclick="App.switchBookletTab('B')" id="btn-tab-B" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık B</button>
                <button type="button" onclick="App.switchBookletTab('C')" id="btn-tab-C" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık C</button>
                <button type="button" onclick="App.switchBookletTab('D')" id="btn-tab-D" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık D</button>
              </div>
            </div>

            <div id="booklet-pane-A" class="booklet-pane">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[11px] font-bold text-emerald-400 uppercase">A Kitapçığı Cevapları:</span>
                <button type="button" onclick="App.openScanAnswerKeyModal('exam-form-key-a')" class="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded-lg border border-cyan-800/50 cursor-pointer">
                  <span>📷</span> <span>Kameradan Tara</span>
                </button>
              </div>
              <textarea id="exam-form-key-a" rows="2" placeholder="Örn: ABCDABCD..." class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300 focus:border-emerald-500 focus:outline-none uppercase"></textarea>
            </div>

            <div id="booklet-pane-B" class="booklet-pane hidden">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[11px] font-bold text-amber-400 uppercase">B Kitapçığı Cevapları:</span>
                <button type="button" onclick="App.openScanAnswerKeyModal('exam-form-key-b')" class="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded-lg border border-cyan-800/50 cursor-pointer">
                  <span>📷</span> <span>Kameradan Tara</span>
                </button>
              </div>
              <textarea id="exam-form-key-b" rows="2" placeholder="Örn: BCDABCDA..." class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-amber-300 focus:border-emerald-500 focus:outline-none uppercase"></textarea>
            </div>

            <div id="booklet-pane-C" class="booklet-pane hidden">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[11px] font-bold text-cyan-400 uppercase">C Kitapçığı Cevapları:</span>
                <button type="button" onclick="App.openScanAnswerKeyModal('exam-form-key-c')" class="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded-lg border border-cyan-800/50 cursor-pointer">
                  <span>📷</span> <span>Kameradan Tara</span>
                </button>
              </div>
              <textarea id="exam-form-key-c" rows="2" placeholder="Örn: CDABCDAB..." class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 focus:border-emerald-500 focus:outline-none uppercase"></textarea>
            </div>

            <div id="booklet-pane-D" class="booklet-pane hidden">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[11px] font-bold text-purple-400 uppercase">D Kitapçığı Cevapları:</span>
                <button type="button" onclick="App.openScanAnswerKeyModal('exam-form-key-d')" class="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded-lg border border-cyan-800/50 cursor-pointer">
                  <span>📷</span> <span>Kameradan Tara</span>
                </button>
              </div>
              <textarea id="exam-form-key-d" rows="2" placeholder="Örn: DABCDABC..." class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-purple-300 focus:border-emerald-500 focus:outline-none uppercase"></textarea>
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

  // Sınav Şablonu Seçildiğinde Alanları Otomatik Doldur
  handleTemplateChange(tplId) {
    const templates = window.PortalStore.getTemplates();
    const tpl = templates.find(t => t.id === tplId);
    const titleInput = document.getElementById('exam-form-title');
    const qCountInput = document.getElementById('exam-form-qcount');
    const targetInput = document.getElementById('exam-form-target');

    if (tpl) {
      if (titleInput && (!titleInput.value || titleInput.value.includes('Deneme') || titleInput.value.includes('Prova'))) {
        titleInput.value = tpl.name;
      }
      if (qCountInput) {
        qCountInput.value = tpl.questionCount;
      }
      if (targetInput) {
        if (tpl.id.includes('lgs')) targetInput.value = '8. Sınıf';
        else if (tpl.id.includes('tyt')) targetInput.value = '12. Sınıf / Mezun';
        else targetInput.value = 'Tüm Sınıflar';
      }
      this.renderSubjectRows(tpl.subjects || [], 'subject-rows-container');
      this.handleExamQCountChange(tpl.questionCount.toString());
    } else {
      // Özel şablon
      const currentQ = qCountInput ? parseInt(qCountInput.value, 10) || 20 : 20;
      this.renderSubjectRows([
        { name: 'Bölüm 1', startQ: 1, endQ: currentQ, wrongPenalty: 0.333, coeff: 1 }
      ], 'subject-rows-container');
    }
  },

  // Ders Satırlarını Tabloya Basma
  renderSubjectRows(subjects, containerId = 'subject-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = subjects.map((sub, idx) => `
      <tr class="subject-row">
        <td class="p-1.5">
          <input type="text" class="sub-name w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded font-bold text-white text-xs" value="\${sub.name || 'Ders ' + (idx + 1)}">
        </td>
        <td class="p-1.5 text-center">
          <input type="number" class="sub-start w-14 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-slate-200" value="\${sub.startQ || 1}">
        </td>
        <td class="p-1.5 text-center">
          <input type="number" class="sub-end w-14 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-slate-200" value="\${sub.endQ || 20}">
        </td>
        <td class="p-1.5 text-center">
          <select class="sub-penalty px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 font-medium">
            <option value="0.333" \${sub.wrongPenalty === 0.333 ? 'selected' : ''}>3 Yanlış 1 Doğru (0.33)</option>
            <option value="0.25" \${sub.wrongPenalty === 0.25 ? 'selected' : ''}>4 Yanlış 1 Doğru (0.25)</option>
            <option value="0" \${sub.wrongPenalty === 0 ? 'selected' : ''}>Ceza Yok (0.00)</option>
          </select>
        </td>
        <td class="p-1.5 text-center">
          <input type="number" step="0.1" class="sub-coeff w-14 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-emerald-400 font-bold" value="\${sub.coeff !== undefined ? sub.coeff : 1}">
        </td>
        <td class="p-1.5 text-right">
          <button type="button" onclick="App.removeSubjectRow(this)" class="p-1 text-rose-400 hover:text-rose-300 text-xs">🗑️</button>
        </td>
      </tr>
    `).join('');
  },

  addSubjectRow(containerId = 'subject-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const existingRows = container.querySelectorAll('.subject-row');
    const nextStart = existingRows.length > 0 ? (parseInt(existingRows[existingRows.length - 1].querySelector('.sub-end').value, 10) + 1) : 1;
    const nextEnd = nextStart + 19;

    const tr = document.createElement('tr');
    tr.className = 'subject-row';
    tr.innerHTML = `
      <td class="p-1.5">
        <input type="text" class="sub-name w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded font-bold text-white text-xs" value="Yeni Ders">
      </td>
      <td class="p-1.5 text-center">
        <input type="number" class="sub-start w-14 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-slate-200" value="\${nextStart}">
      </td>
      <td class="p-1.5 text-center">
        <input type="number" class="sub-end w-14 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-slate-200" value="\${nextEnd}">
      </td>
      <td class="p-1.5 text-center">
        <select class="sub-penalty px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 font-medium">
          <option value="0.333">3 Yanlış 1 Doğru (0.33)</option>
          <option value="0.25">4 Yanlış 1 Doğru (0.25)</option>
          <option value="0">Ceza Yok (0.00)</option>
        </select>
      </td>
      <td class="p-1.5 text-center">
        <input type="number" step="0.1" class="sub-coeff w-14 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs text-emerald-400 font-bold" value="1">
      </td>
      <td class="p-1.5 text-right">
        <button type="button" onclick="App.removeSubjectRow(this)" class="p-1 text-rose-400 hover:text-rose-300 text-xs">🗑️</button>
      </td>
    `;
    container.appendChild(tr);
  },

  removeSubjectRow(btn) {
    const row = btn.closest('.subject-row');
    if (row) row.remove();
  },

  collectSubjectsFromForm(containerId = 'subject-rows-container') {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const rows = container.querySelectorAll('.subject-row');
    const subjects = [];

    rows.forEach(r => {
      const name = (r.querySelector('.sub-name').value || 'Genel').trim();
      const startQ = parseInt(r.querySelector('.sub-start').value, 10) || 1;
      const endQ = parseInt(r.querySelector('.sub-end').value, 10) || startQ;
      const wrongPenalty = parseFloat(r.querySelector('.sub-penalty').value) || 0;
      const coeff = parseFloat(r.querySelector('.sub-coeff').value) || 1;

      subjects.push({ name, startQ, endQ, wrongPenalty, coeff });
    });

    return subjects;
  },

  // Kitapçık Sekmesi Değiştirici
  switchBookletTab(letter) {
    ['A', 'B', 'C', 'D'].forEach(l => {
      const pane = document.getElementById('booklet-pane-' + l);
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
    const target = document.getElementById('exam-form-target').value.trim();

    const keyA = (document.getElementById('exam-form-key-a') ? document.getElementById('exam-form-key-a').value : '').trim().toUpperCase() || 'A'.repeat(qCount);
    const keyB = (document.getElementById('exam-form-key-b') ? document.getElementById('exam-form-key-b').value : '').trim().toUpperCase() || keyA;
    const keyC = (document.getElementById('exam-form-key-c') ? document.getElementById('exam-form-key-c').value : '').trim().toUpperCase() || keyA;
    const keyD = (document.getElementById('exam-form-key-d') ? document.getElementById('exam-form-key-d').value : '').trim().toUpperCase() || keyA;

    const subjects = this.collectSubjectsFromForm('subject-rows-container');

    const examData = {
      title,
      examDate,
      questionCount: qCount,
      targetClass: target,
      bookletTypes: ['A', 'B', 'C', 'D'],
      subjects: subjects.length > 0 ? subjects : [{ name: 'Genel', startQ: 1, endQ: qCount, wrongPenalty: 0.333, coeff: 1 }],
      answerKeys: { 'A': keyA, 'B': keyB, 'C': keyC, 'D': keyD },
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
              <p class="text-xs text-slate-400 font-medium">\${exam.title}</p>
            </div>
          </div>
          <button onclick="document.getElementById('edit-exam-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <form onsubmit="App.handleSaveEditExamForm(event, '\${instId || ''}', '\${exam.id}', \${isGlobal})" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="sm:col-span-2">
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Sınav Adı / Başlığı</label>
              <input type="text" id="edit-form-title" required value="\${exam.title}" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Sınav Tarihi</label>
              <input type="date" id="edit-form-date" value="\${exam.examDate || ''}" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Toplam Soru Sayısı</label>
              <input type="number" id="edit-form-qcount" value="\${exam.questionCount}" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Hedef Sınıf / Seviye</label>
              <input type="text" id="edit-form-target" value="\${exam.targetClass || ''}" class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
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
            <input type="text" id="edit-form-canceled" placeholder="Örn: 14, 25" value="\${canceledList.join(', ')}" class="w-full px-3.5 py-2 bg-slate-950 border border-purple-800/80 rounded-xl text-purple-200 font-mono text-xs focus:border-purple-400 focus:outline-none">
          </div>

          <!-- Dersler Tablosu -->
          <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
            <div class="flex items-center justify-between pb-1">
              <div>
                <label class="text-xs font-bold uppercase text-slate-300">📚 Ders Bölümleri & Katsayılar</label>
                <p class="text-[10px] text-slate-500">Ders aralıklarını, katsayıları ve ceza oranlarını düzenleyin.</p>
              </div>
              <button type="button" onclick="App.addSubjectRow('edit-subject-rows-container')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[11px] font-bold rounded-lg border border-slate-700 transition">
                + Ders Ekle
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-[11px]">
                <thead class="text-slate-500 uppercase border-b border-slate-800 font-bold">
                  <tr>
                    <th class="p-1.5">Ders Adı</th>
                    <th class="p-1.5 text-center">İlk Soru</th>
                    <th class="p-1.5 text-center">Son Soru</th>
                    <th class="p-1.5 text-center">Ceza</th>
                    <th class="p-1.5 text-center">Katsayı</th>
                    <th class="p-1.5 text-right">Sil</th>
                  </tr>
                </thead>
                <tbody id="edit-subject-rows-container" class="divide-y divide-slate-800/60">
                  <!-- JS ile doldurulacak -->
                </tbody>
              </table>
            </div>
          </div>

          <!-- 4 Kitapçık Cevap Anahtarları -->
          <div class="space-y-3 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <span>🔑</span> <span>Cevap Anahtarları</span>
              </label>
              <div class="flex gap-1">
                <button type="button" onclick="App.switchEditBookletTab('A')" id="btn-edit-tab-A" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 transition">Kitapçık A</button>
                <button type="button" onclick="App.switchEditBookletTab('B')" id="btn-edit-tab-B" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık B</button>
                <button type="button" onclick="App.switchEditBookletTab('C')" id="btn-edit-tab-C" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık C</button>
                <button type="button" onclick="App.switchEditBookletTab('D')" id="btn-edit-tab-D" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 transition">Kitapçık D</button>
              </div>
            </div>

            <div id="edit-booklet-pane-A" class="edit-booklet-pane">
              <textarea id="edit-form-key-a" rows="2" class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300 focus:border-emerald-500 focus:outline-none uppercase">\${(exam.answerKeys && exam.answerKeys['A']) || ''}</textarea>
            </div>
            <div id="edit-booklet-pane-B" class="edit-booklet-pane hidden">
              <textarea id="edit-form-key-b" rows="2" class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-amber-300 focus:border-emerald-500 focus:outline-none uppercase">\${(exam.answerKeys && exam.answerKeys['B']) || ''}</textarea>
            </div>
            <div id="edit-booklet-pane-C" class="edit-booklet-pane hidden">
              <textarea id="edit-form-key-c" rows="2" class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 focus:border-emerald-500 focus:outline-none uppercase">\${(exam.answerKeys && exam.answerKeys['C']) || ''}</textarea>
            </div>
            <div id="edit-booklet-pane-D" class="edit-booklet-pane hidden">
              <textarea id="edit-form-key-d" rows="2" class="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-purple-300 focus:border-emerald-500 focus:outline-none uppercase">\${(exam.answerKeys && exam.answerKeys['D']) || ''}</textarea>
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
    const target = document.getElementById('edit-form-target').value.trim();

    const keyA = document.getElementById('edit-form-key-a').value.trim().toUpperCase();
    const keyB = document.getElementById('edit-form-key-b').value.trim().toUpperCase() || keyA;
    const keyC = document.getElementById('edit-form-key-c').value.trim().toUpperCase() || keyA;
    const keyD = document.getElementById('edit-form-key-d').value.trim().toUpperCase() || keyA;

    const subjects = this.collectSubjectsFromForm('edit-subject-rows-container');

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
      subjects: subjects.length > 0 ? subjects : [{ name: 'Genel', startQ: 1, endQ: qCount, wrongPenalty: 0.333, coeff: 1 }],
      answerKeys: { 'A': keyA, 'B': keyB, 'C': keyC, 'D': keyD },
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

  openScanAnswerKeyModal(targetInputId) {
    const existing = document.getElementById('scan-answer-key-modal');
    if (existing) existing.remove();

    const qCountSelect = document.getElementById('exam-form-qcount');
    const questionCount = qCountSelect ? parseInt(qCountSelect.value, 10) || 20 : 20;

    const modal = document.createElement('div');
    modal.id = 'scan-answer-key-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-md w-full shadow-2xl relative">
        <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">📷</span>
            <h4 class="text-sm font-black text-white">Cevap Anahtarını Kameradan Tara</h4>
          </div>
          <button onclick="App.closeScanAnswerKeyModal()" class="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-bold">✕</button>
        </div>

        <p class="text-xs text-slate-400 mb-3">Doğru cevapları işaretlediğiniz optik formu çerçeveye gösterip butona basınız.</p>

        <div class="relative bg-black rounded-2xl overflow-hidden border border-slate-800 mb-3" style="aspect-ratio: 4/3;">
          <video id="key-scanner-video" playsinline autoplay muted class="w-full h-full object-cover"></video>
          <canvas id="key-scanner-canvas" class="hidden"></canvas>
          <div class="absolute inset-6 border-2 border-dashed border-cyan-400/70 rounded-xl pointer-events-none flex items-center justify-center">
            <span class="text-[10px] font-mono font-bold text-cyan-300 bg-black/70 px-2.5 py-1 rounded-xl">Cevap Anahtarı Formunu Hizalayınız</span>
          </div>
        </div>

        <button onclick="App.captureAnswerKey('${targetInputId}', ${questionCount})" class="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2">
          <span>🎯</span> <span>Cevapları Otomatik Çıkar</span>
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
    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div>
            <h2 class="text-xl font-black text-white tracking-tight">Kayıtlı Talebeler (${students.length})</h2>
            <p class="text-xs text-slate-400 mt-0.5">Optik formlarda QR kod basmak ve karneleri göndermek için talebelerinizi ekleyiniz.</p>
          </div>
          <div class="flex items-center gap-2">
            <label class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition flex items-center gap-1.5">
              <span>📥</span> <span>Excel'den Yükle</span>
              <input type="file" accept=".csv" onchange="App.handleCsvUpload(event, '${instId}')" class="hidden">
            </label>
            <a href="ogrenciler_sablon.csv" download class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition" title="Excel Örnek Şablonu İndir">
              📄 Şablon
            </a>
            <button onclick="App.showAddStudentModal('${instId}')" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow transition">
              + Talebe Ekle
            </button>
          </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th class="p-3">No</th>
                  <th class="p-3">Adı Soyadı</th>
                  <th class="p-3">Sınıfı</th>
                  <th class="p-3">Veli Telefonu</th>
                  <th class="p-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/80">
                ${students.length === 0 ? `
                  <tr>
                    <td colspan="5" class="p-8 text-center text-slate-500">
                      Henüz talebe eklenmedi. "Excel'den Yükle" veya "+ Talebe Ekle" butonunu kullanabilirsiniz.
                    </td>
                  </tr>
                ` : students.map(st => `
                  <tr class="hover:bg-slate-800/40 transition">
                    <td class="p-3 font-mono font-bold text-emerald-400">${st.studentNo}</td>
                    <td class="p-3 font-bold text-white">${st.firstName} ${st.lastName}</td>
                    <td class="p-3 font-semibold text-slate-300">${st.className}</td>
                    <td class="p-3 font-mono text-slate-400">${st.parentPhone || '-'}</td>
                    <td class="p-3 text-right">
                      <button onclick="App.deleteStudentPrompt('${instId}', '${st.id}', '${st.firstName} ${st.lastName}')" class="text-rose-400 hover:text-rose-300 p-1">
                        🗑️
                      </button>
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

  showAddStudentModal(instId) {
    const studentNo = prompt('Okul / Kurum Numarası:', (100 + Math.floor(Math.random() * 900)).toString());
    if (!studentNo) return;
    const firstName = prompt('Öğrenci Adı:');
    if (!firstName) return;
    const lastName = prompt('Öğrenci Soyadı:');
    const className = prompt('Sınıfı / Şubesi:', '8-A');
    const parentPhone = prompt('Veli Telefon Numarası (WhatsApp için):', '05550000000');

    window.PortalStore.addStudent(instId, { studentNo, firstName, lastName, className, parentPhone });
    this.showToast('Talebe kaydedildi!', 'success');
    this.render();
  },

  deleteStudentPrompt(instId, studentId, name) {
    if (confirm(`"${name}" adlı talebeyi silmek istediğinize emin misiniz?`)) {
      window.PortalStore.deleteStudent(instId, studentId);
      this.showToast('Talebe silindi.', 'info');
      this.render();
    }
  },

  handleCsvUpload(event, instId) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const res = window.PortalStore.importStudentsCsv(instId, text);
      if (res && res.success) {
        this.showToast(`✓ ${res.added} yeni talebe başarıyla aktarıldı! Toplam: ${res.count}`, 'success');
        this.render();
      } else {
        this.showToast('Dosya okuma hatası: ' + (res ? res.message : ''), 'error');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  },

  // 6. KURS PANELİ: OPTİK FORM YAZDIRMA
  renderOpticalPrintView(instId) {
    const exams = window.PortalStore.getExams(instId);
    const students = window.PortalStore.getStudents(instId);
    const session = window.PortalStore.getCurrentSession();

    return `
      <div class="space-y-6">
        <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <h2 class="text-xl font-black text-white tracking-tight">Optik Cevap Kağıdı Yazdır</h2>
          <p class="text-xs text-slate-400 mt-0.5 mb-4">Seçtiğiniz sınav için öğrencilerin isimleri ve QR kodları hazır basılı A4 optik formlar üretin.</p>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1">Sınav Seçiniz</label>
              <select id="print-exam-select" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs">
                ${exams.map(e => `<option value="${e.id}">${e.title} (${e.questionCount} Soru)</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-400 mb-1">Baskı Türü</label>
              <select id="print-type-select" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs">
                <option value="all_students">Tüm Talebelere Özel İsimli & QR Kodlu (${students.length} Sayfa)</option>
                <option value="blank_10">Boş Form (10 Adet)</option>
                <option value="blank_25">Boş Form (25 Adet)</option>
              </select>
            </div>
            <div class="flex items-end">
              <button onclick="App.generateAndPrintSheets('${instId}')" class="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5">
                <span>🖨️</span> <span>Optik Kağıtları Bas</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Örnek Önizleme -->
        <div class="border border-slate-800 rounded-2xl p-4 bg-slate-900/60 text-center">
          <h4 class="text-xs font-bold text-slate-400 uppercase mb-3">Optik Kağıt Örneği</h4>
          <div class="overflow-hidden max-h-[500px] border border-gray-400 rounded shadow-2xl inline-block bg-white text-black p-4 text-left scale-90 origin-top">
            ${window.OpticalSheetGenerator.renderSheetHtml({
              institutionName: session.institutionName,
              examTitle: exams[0] ? exams[0].title : 'LGS DENEME SINAVI',
              student: students[0] || { firstName: 'ÖRNEK', lastName: 'TALEBE', studentNo: '101', className: '8-A' },
              questionCount: exams[0] ? exams[0].questionCount : 20,
              subjects: exams[0] ? exams[0].subjects : [{ name: 'Genel', startQ: 1, endQ: 20 }]
            })}
          </div>
        </div>
      </div>
    `;
  },

  generateAndPrintSheets(instId) {
    const examSelect = document.getElementById('print-exam-select');
    const typeSelect = document.getElementById('print-type-select');
    if (!examSelect) return;

    const examId = examSelect.value;
    const exam = window.PortalStore.getExamById(instId, examId);
    if (!exam) {
      this.showToast('Lütfen bir sınav seçiniz.', 'warning');
      return;
    }

    const session = window.PortalStore.getCurrentSession();
    const students = window.PortalStore.getStudents(instId);
    const printType = typeSelect.value;

    let sheetsHtml = '';
    if (printType === 'all_students') {
      if (students.length === 0) {
        this.showToast('Kayıtlı talebe bulunamadı. Boş form basılıyor.', 'info');
        for (let i = 0; i < 5; i++) {
          sheetsHtml += window.OpticalSheetGenerator.renderSheetHtml({
            institutionName: session.institutionName,
            examTitle: exam.title,
            examDate: exam.examDate,
            student: null,
            questionCount: exam.questionCount,
            subjects: exam.subjects,
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
            examId: exam.id
          });
        });
      }
    } else {
      const count = printType === 'blank_25' ? 25 : 10;
      for (let i = 0; i < count; i++) {
        sheetsHtml += window.OpticalSheetGenerator.renderSheetHtml({
          institutionName: session.institutionName,
          examTitle: exam.title,
          examDate: exam.examDate,
          student: null,
          questionCount: exam.questionCount,
          subjects: exam.subjects,
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
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div class="flex items-center gap-3">
            <select id="scanner-exam-select" onchange="App.handleScannerExamChange('${instId}')" class="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs">
              ${exams.map(e => `<option value="${e.id}" ${this.activeExamId === e.id ? 'selected' : ''}>${e.title} (${e.questionCount} Soru)</option>`).join('')}
            </select>
            <select id="scanner-student-select" class="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs">
              <option value="">-- Talebe Seç (veya QR Koddan Oku) --</option>
              ${students.map(s => `<option value="${s.studentNo}">${s.studentNo} - ${s.firstName} ${s.lastName} (${s.className})</option>`).join('')}
            </select>
          </div>

          <div class="flex items-center gap-2">
            <!-- Seri Otomatik Okuma Butonu -->
            <button id="btn-continuous-scan" onclick="App.toggleContinuousScan('${instId}')" class="px-4 py-2.5 bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white font-black text-xs rounded-xl border border-cyan-500/50 shadow-lg transition flex items-center gap-1.5 cursor-pointer">
              <span>⚡</span> <span id="continuous-btn-text">Seri Otomatik Okuma (Başlat)</span>
            </button>
            <button onclick="App.triggerScan()" class="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer">
              <span>📸</span> <span>Tek Kare Oku</span>
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
        <div class="relative bg-black rounded-3xl overflow-hidden border-2 border-slate-800 max-w-2xl mx-auto shadow-2xl" style="aspect-ratio: 4/3;">
          <video id="omr-video" playsinline autoplay muted class="w-full h-full object-cover"></video>
          <canvas id="omr-canvas" class="hidden"></canvas>

          <!-- Nişangah Çerçevesi (Kağıt Hizalama Rehberi) -->
          <div class="absolute inset-8 sm:inset-12 border-2 border-dashed border-emerald-400/70 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
            <div class="flex justify-between items-center text-[11px] font-mono font-bold text-emerald-400 bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm w-fit">
              <span>[+] Optik Kağıdı Bu Çerçeveye Hizalayınız</span>
            </div>
            <div class="text-center text-[10px] text-emerald-300 font-bold bg-black/60 py-1 rounded backdrop-blur-sm">
              4 Köşe Noktasını ve QR Kodu Kameraya Gösteriniz
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
    if (!session || !session.institutionId) return;

    const exams = window.PortalStore.getExams(session.institutionId);
    if (exams.length === 0) {
      this.showToast('Önce bir deneme sınavı tanımlamalısınız.', 'warning');
      return;
    }

    const currentExam = exams.find(e => e.id === this.activeExamId) || exams[0];
    this.activeExamId = currentExam.id;

    setTimeout(() => {
      window.OmrScanner.startCamera('omr-video', currentExam, session.institutionId);
    }, 150);
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
        }
      );
      this.showToast('⚡ Seri otomatik okuma devrede! Kağıtları sırayla kameraya tutun.', 'success');
    }
  },

  handleScannedPaper(instId, result) {
    if (!result) return;
    const session = window.PortalStore.getCurrentSession();
    const effectiveInstId = instId || (session ? session.institutionId : null);
    const students = window.PortalStore.getStudents(effectiveInstId);
    const matchedSt = students.find(s => s.studentNo === result.studentNo);

    result.studentName = matchedSt ? `${matchedSt.firstName} ${matchedSt.lastName}` : `Talebe #${result.studentNo}`;
    result.className = matchedSt ? matchedSt.className : 'Genel';
    result.parentPhone = matchedSt ? matchedSt.parentPhone : '';

    // Neticeyi kaydet
    window.PortalStore.saveExamResult(effectiveInstId, result);

    const counter = document.getElementById('continuous-counter');
    if (counter) {
      const cur = parseInt(counter.textContent, 10) || 0;
      counter.textContent = (cur + 1).toString();
    }

    this.showToast(`✓ ${result.studentName} okundu! (${result.totalNet} Net - ${result.totalScore} Puan)`, 'success');
    this.renderScanResultCard(result);
  },

  // Butona tıklandığında veya tek kare okutulduğunda
  triggerScan() {
    const video = document.getElementById('omr-video');
    const canvas = document.getElementById('omr-canvas');
    const studentSelect = document.getElementById('scanner-student-select');
    const studentNo = studentSelect ? studentSelect.value : null;

    const result = window.OmrScanner.scanCurrentFrame(video, canvas, studentNo, 'A');
    if (!result) return;

    const session = window.PortalStore.getCurrentSession();
    this.handleScannedPaper(session ? session.institutionId : null, result);
  },

  renderScanResultCard(result) {
    const container = document.getElementById('scan-result-card');
    if (!container) return;

    container.innerHTML = `
      <div class="bg-slate-900 border-2 border-emerald-500 rounded-3xl p-5 shadow-2xl animate-fade-in">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div>
            <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Son Okunan Kağıt</span>
            <h3 class="text-lg font-black text-white">${result.studentName}</h3>
            <span class="text-xs text-slate-400 font-mono">No: ${result.studentNo} • Sınıf: ${result.className}</span>
          </div>
          <div class="text-right">
            <span class="text-2xl font-black text-emerald-400 font-mono">${result.totalScore}</span>
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
            <span class="text-base font-black text-slate-400 font-mono">${result.totalEmpty}</span>
          </div>
          <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
            <span class="block text-[10px] text-slate-500 font-bold uppercase">Toplam Net</span>
            <span class="text-base font-black text-cyan-400 font-mono">${result.totalNet}</span>
          </div>
        </div>

        <div class="flex gap-2">
          ${result.parentPhone ? `
            <button onclick="App.sendWhatsAppCard('${encodeURIComponent(result.parentPhone)}', '${encodeURIComponent(result.studentName)}', '${result.totalNet}', '${result.totalScore}')" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5">
              <span>💬</span> <span>Veliye WhatsApp Karnesi Gönder</span>
            </button>
          ` : ''}
          <button onclick="App.switchTab('neticeler')" class="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition">
            Tüm Neticeler & Sıralama →
          </button>
        </div>
      </div>
    `;
  },

  sendWhatsAppCard(phone, name, net, score) {
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanName = decodeURIComponent(name);
    const message = `*DENEME SINAVI SONUÇ BİLGİLENDİRMESİ*\n\nSayın Velimiz,\nTalebeniz *${cleanName}* deneme sınavını tamamlamıştır:\n\n• Toplam Net: *${net}*\n• Sınav Puanı: *${score}*\n\nTalebemizi tebrik eder, başarılarının devamını dileriz.`;
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
        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div>
            <h2 class="text-xl font-black text-white tracking-tight">Sınav Neticeleri & Sıralama</h2>
            <p class="text-xs text-slate-400 mt-0.5">${currentExam.title} (${rankings.length} Talebe Katıldı)</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <select onchange="App.handleResultsExamChange(this.value, '${instId}')" class="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs">
              ${exams.map(e => `<option value="${e.id}" ${e.id === currentExam.id ? 'selected' : ''}>${e.title}</option>`).join('')}
            </select>
            <button onclick="App.showManualResultModal('${instId}', '${currentExam.id}')" class="px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white font-bold text-xs rounded-xl border border-cyan-500/40 transition flex items-center gap-1 cursor-pointer" title="Elle Öğrenci Notu / Cevabı Ekle">
              <span>✍️</span> <span>Elle Not Gir</span>
            </button>
            <button onclick="App.showItemAnalysisModal('${instId}', '${currentExam.id}', false)" class="px-3 py-2 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-xs rounded-xl border border-amber-500/40 transition flex items-center gap-1 cursor-pointer" title="Soru ve Madde Başarı Analizi">
              <span>📊</span> <span>Soru Analizi</span>
            </button>
            <button onclick="App.showBatchWhatsAppModal('${instId}', '${currentExam.id}')" class="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white font-bold text-xs rounded-xl border border-emerald-500/40 transition flex items-center gap-1 cursor-pointer" title="Sınıfa Toplu WhatsApp Karnesi Gönder">
              <span>💬</span> <span>Toplu WhatsApp</span>
            </button>
            <button onclick="App.downloadResultsCsv('${instId}', '${currentExam.id}', false)" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1 cursor-pointer" title="Excel / CSV Olarak İndir">
              <span>📥</span> <span>Excel İndir</span>
            </button>
            <button onclick="App.printAllReportCards('${instId}', '${currentExam.id}')" class="px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1 cursor-pointer">
              <span>📜</span> <span>Tüm Karneler</span>
            </button>
          </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th class="p-3 text-center">Derece</th>
                  <th class="p-3">No</th>
                  <th class="p-3">Adı Soyadı</th>
                  <th class="p-3">Sınıfı</th>
                  <th class="p-3 text-center">Doğru</th>
                  <th class="p-3 text-center">Yanlış</th>
                  <th class="p-3 text-center">Net</th>
                  <th class="p-3 text-center">Puan</th>
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
                        <button onclick="App.printSingleReportCard('${instId}', '${currentExam.id}', '${r.studentNo}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer" title="Renkli & Grafikli A4 Karne Bas">
                          <span>📜</span> <span>Karne</span>
                        </button>
                        ${r.parentPhone ? `
                          <button onclick="App.sendWhatsAppCard('${encodeURIComponent(r.parentPhone)}', '${encodeURIComponent(r.studentName)}', '${r.totalNet}', '${r.totalScore}')" class="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-[11px] font-bold transition cursor-pointer" title="WhatsApp Gönder">
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

  // 9. SÜPER YÖNETİCİ: MERKEZİ ORTAK SINAVLAR VE LEADERBOARD
  renderSuperGlobalExams() {
    const globalExams = window.PortalStore.getGlobalExams();
    const institutions = window.PortalStore.getInstitutions();

    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">🌐</span>
              <h2 class="text-xl font-black text-white tracking-tight">Merkezi Ortak Deneme Sınavları</h2>
            </div>
            <p class="text-xs text-slate-400 mt-1">Buradan açtığınız sınavlar sisteme kayıtlı tüm kurs ve okulların panellerinde anında görünür. Kurumlar optik formları okuttukça ortak derece sıralaması canlı oluşur.</p>
          </div>
          <button onclick="App.showCreateExamModal(null, true)" class="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer">
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
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-4xl w-full shadow-2xl relative max-h-[90vh] flex flex-col">
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
            <button onclick="App.downloadResultsCsv(null, '${exam.id}', true)" class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-black rounded-xl shadow transition flex items-center gap-1 cursor-pointer">
              <span>📥</span> <span>Excel İndir (CSV)</span>
            </button>
            <button onclick="document.getElementById('global-leaderboard-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
          </div>
        </div>

        <div class="overflow-y-auto flex-1 rounded-2xl border border-slate-800">
          <table class="w-full text-left text-xs">
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
              <p class="text-xs text-slate-400 font-medium">\${exam.title} (\${exam.questionCount} Soru)</p>
            </div>
          </div>
          <button onclick="document.getElementById('manual-result-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <form onsubmit="App.handleSaveManualResult(event, '\${effectiveInstId}', '\${exam.id}')" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Talebe Seçiniz</label>
              <select id="manual-student-select" onchange="App.handleManualStudentChange(this.value, '\${effectiveInstId}')" class="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs focus:border-emerald-500 focus:outline-none">
                <option value="">-- Kayıtlı Listeden Seç --</option>
                \${students.map(s => `<option value="\${s.studentNo}" \${s.studentNo === initialStudentNo ? 'selected' : ''}>\${s.studentNo} - \${s.firstName} \${s.lastName} (\${s.className})</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Talebe No (Manuel Giriş)</label>
              <input type="text" id="manual-student-no" required value="\${initialStudentNo}" placeholder="Örn: 105" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium text-xs focus:border-emerald-500 focus:outline-none">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Kitapçık Türü</label>
              <select id="manual-booklet-select" onchange="App.handleManualAnswersInput('\${exam.id}')" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs">
                <option value="A" \${initialBooklet === 'A' ? 'selected' : ''}>A Kitapçığı</option>
                <option value="B" \${initialBooklet === 'B' ? 'selected' : ''}>B Kitapçığı</option>
                <option value="C" \${initialBooklet === 'C' ? 'selected' : ''}>C Kitapçığı</option>
                <option value="D" \${initialBooklet === 'D' ? 'selected' : ''}>D Kitapçığı</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-slate-400 mb-1">Özel Puan (İsteğe Bağlı)</label>
              <input type="number" step="0.1" id="manual-score-override" placeholder="Otomatik hesaplanır" value="\${initialScoreOverride}" class="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-amber-300 font-mono text-xs focus:border-amber-400 focus:outline-none">
            </div>
          </div>

          <!-- Öğrenci Cevapları Girişi -->
          <div class="space-y-2 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-emerald-400 uppercase">Öğrenci Cevap Dizilimi (\${exam.questionCount} Soru)</label>
              <span id="manual-char-count" class="text-[11px] font-mono text-slate-400">0 / \${exam.questionCount}</span>
            </div>
            <textarea id="manual-answers-input" rows="3" oninput="App.handleManualAnswersInput('\${exam.id}')" placeholder="Örn: ABCDABCD... (Boş sorular için boşluk bırakınız)" class="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white tracking-widest focus:border-emerald-500 focus:outline-none uppercase">\${initialAnswers}</textarea>
            <div class="flex gap-2">
              <button type="button" onclick="App.fillSampleAnswers('\${exam.id}', 'A')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 rounded font-mono">Tümünü 'A' Yap</button>
              <button type="button" onclick="App.fillSampleAnswers('\${exam.id}', 'key')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-cyan-300 rounded font-mono">Cevap Anahtarını Kopyala</button>
              <button type="button" onclick="App.fillSampleAnswers('\${exam.id}', 'clear')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-rose-300 rounded font-mono">Temizle</button>
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

          <div class="pt-2">
            <button type="submit" class="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer">
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
      charCount.textContent = `\${answers.length} / \${exam.questionCount}`;
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
      this.showToast(`✓ #\${studentNo} için optik cevaplar ve not başarıyla kaydedildi!`, 'success');
      const modal = document.getElementById('manual-result-modal');
      if (modal) modal.remove();
      this.render();
    } else {
      this.showToast('Kayıt başarısız: ' + (res ? res.message : ''), 'error');
    }
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
              <h3 class="text-base sm:text-lg font-black text-white">\${exam.title} - Soru & Madde Başarı Analizi</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              \${isGlobal ? 'Türkiye Geneli Tüm Kurumların Ortak Katılımı' : 'Kurumunuza Ait Sonuçlar'} (\${totalStudents} Talebe Değerlendirildi)
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="App.downloadResultsCsv('\${instId || ''}', '\${exam.id}', \${isGlobal})" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1 cursor-pointer">
              <span>📥</span> <span>Excel İndir</span>
            </button>
            <button onclick="document.getElementById('item-analysis-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
          </div>
        </div>

        <!-- Özet İstatistik Kartları -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
            <span class="block text-[10px] text-slate-500 font-bold uppercase">Toplam Soru</span>
            <span class="text-lg font-black text-white font-mono">\${items.length}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-emerald-950/50 text-center">
            <span class="block text-[10px] text-emerald-400 font-bold uppercase">Kolay Soru (%70+)</span>
            <span class="text-lg font-black text-emerald-400 font-mono">\${easyCount}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-amber-950/50 text-center">
            <span class="block text-[10px] text-amber-400 font-bold uppercase">Orta Soru (%40-%69)</span>
            <span class="text-lg font-black text-amber-400 font-mono">\${mediumCount}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-rose-950/50 text-center">
            <span class="block text-[10px] text-rose-400 font-bold uppercase">Zor Soru (<%40)</span>
            <span class="text-lg font-black text-rose-400 font-mono">\${hardCount}</span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-purple-950/50 text-center">
            <span class="block text-[10px] text-purple-400 font-bold uppercase">İptal Edilen Soru</span>
            <span class="text-lg font-black text-purple-400 font-mono">\${canceledCount}</span>
          </div>
        </div>

        <!-- Ders Filtresi -->
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs text-slate-400 font-bold">Ders Filtrele:</span>
          <select id="item-subject-filter" onchange="App.filterItemAnalysisTable(this.value)" class="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-bold">
            <option value="all">Tüm Dersler (\${items.length} Soru)</option>
            \${subjects.map(s => `<option value="\${s.name}">\${s.name} (\${s.startQ}-\${s.endQ}. Sorular)</option>`).join('')}
          </select>
        </div>

        <!-- Madde Analiz Tablosu -->
        <div class="overflow-y-auto flex-1 rounded-2xl border border-slate-800">
          <table class="w-full text-left text-xs">
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
              \${items.map(item => `
                <tr class="item-analysis-row hover:bg-slate-800/40 transition" data-subject="\${item.subjectName}">
                  <td class="p-2.5 text-center font-mono font-bold \${item.isCanceled ? 'text-purple-400 line-through' : 'text-emerald-400'}">
                    #\${item.questionNo}
                  </td>
                  <td class="p-2.5 font-bold text-white">\${item.subjectName}</td>
                  <td class="p-2.5 text-center font-mono font-black text-amber-300">
                    \${item.isCanceled ? '*' : item.correctKeyA}
                  </td>
                  <td class="p-2.5">
                    <div class="flex items-center gap-2">
                      <div class="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div class="h-full rounded-full \${item.isCanceled ? 'bg-purple-500' : (item.successRate >= 70 ? 'bg-emerald-500' : (item.successRate >= 40 ? 'bg-amber-500' : 'bg-rose-500'))}" style="width: \${item.successRate}%"></div>
                      </div>
                      <span class="font-mono font-bold text-[11px] text-slate-300">\${item.successRate}%</span>
                    </div>
                  </td>
                  <td class="p-2.5 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase \${item.isCanceled ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : (item.difficulty === 'Kolay' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : (item.difficulty === 'Orta' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'))}">
                      \${item.difficulty}
                    </span>
                  </td>
                  <td class="p-2.5 text-center font-mono text-[11px] text-slate-300">
                    <span class="\${item.correctKeyA === 'A' ? 'text-emerald-400 font-black' : ''}">A:\${item.distribution.A || 0}</span> •
                    <span class="\${item.correctKeyA === 'B' ? 'text-emerald-400 font-black' : ''}">B:\${item.distribution.B || 0}</span> •
                    <span class="\${item.correctKeyA === 'C' ? 'text-emerald-400 font-black' : ''}">C:\${item.distribution.C || 0}</span> •
                    <span class="\${item.correctKeyA === 'D' ? 'text-emerald-400 font-black' : ''}">D:\${item.distribution.D || 0}</span> •
                    <span class="text-slate-500">Boş:\${item.distribution.empty || 0}</span>
                  </td>
                  <td class="p-2.5 text-right">
                    <button onclick="App.toggleCancelQuestionFromModal('\${instId || ''}', '\${exam.id}', \${item.questionNo}, \${isGlobal})" class="px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer \${item.isCanceled ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-slate-700'}">
                      \${item.isCanceled ? 'İptali Kaldır' : 'İptal Et'}
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
    this.showToast(`✓ #\${qNum}. soru iptal durumu güncellendi ve tüm sonuçlar baştan hesaplandı!`, 'success');
    this.showItemAnalysisModal(instId, examId, isGlobal);
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
              <p class="text-xs text-slate-400 font-medium">\${exam.title} (\${rankings.length} Talebe)</p>
            </div>
          </div>
          <button onclick="document.getElementById('batch-whatsapp-modal').remove()" class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
        </div>

        <div class="flex items-center justify-between mb-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-300">Şube / Sınıf Seçiniz:</label>
            <select id="batch-whatsapp-class" onchange="App.filterBatchWhatsAppClass(this.value)" class="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-bold">
              <option value="all">Tüm Sınıflar (\${rankings.length} Talebe)</option>
              \${classes.map(c => `<option value="\${c}">\${c}</option>`).join('')}
            </select>
          </div>
          <div class="text-[11px] text-slate-400">
            Telefonu kayıtlı: <strong class="text-emerald-400">\${rankings.filter(r => !!r.parentPhone).length}</strong> / \${rankings.length}
          </div>
        </div>

        <div class="overflow-y-auto flex-1 rounded-2xl border border-slate-800 mb-4">
          <table class="w-full text-left text-xs">
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
              \${rankings.map((r, idx) => `
                <tr class="batch-wa-row hover:bg-slate-800/40 transition" data-class="\${r.className || 'Genel'}" id="wa-row-\${r.studentNo}">
                  <td class="p-2.5 text-center font-bold text-slate-400">\${idx + 1}</td>
                  <td class="p-2.5">
                    <strong class="text-white block">\${r.studentName}</strong>
                    <span class="text-[10px] text-slate-500 font-mono">#\${r.studentNo}</span>
                  </td>
                  <td class="p-2.5 font-semibold text-slate-300">\${r.className}</td>
                  <td class="p-2.5 font-mono \${r.parentPhone ? 'text-emerald-400' : 'text-slate-600'}">
                    \${r.parentPhone || 'Kayıtsız'}
                  </td>
                  <td class="p-2.5 text-center font-mono font-bold text-cyan-400">\${r.totalNet}</td>
                  <td class="p-2.5 text-center font-mono font-black text-amber-400">\${r.totalScore}</td>
                  <td class="p-2.5 text-right">
                    \${r.parentPhone ? `
                      <button onclick="App.markWhatsAppSent('wa-row-\${r.studentNo}', '\${encodeURIComponent(r.parentPhone)}', '\${encodeURIComponent(r.studentName)}', '\${r.totalNet}', '\${r.totalScore}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-xl shadow transition flex items-center gap-1.5 ml-auto cursor-pointer">
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

  markWhatsAppSent(rowId, phone, name, net, score) {
    this.sendWhatsAppCard(phone, name, net, score);
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
    const saved = localStorage.getItem('optik_portal_theme') || 'dark';
    this.applyTheme(saved);
  },

  applyTheme(themeId) {
    this.currentTheme = themeId;
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-navy', 'theme-emerald');
    if (themeId !== 'dark') {
      root.classList.add(`theme-${themeId}`);
    }
    localStorage.setItem('optik_portal_theme', themeId);
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

  showResetInstPasswordModal(instId, instName) {
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

  renderFooter() {
    return `
      <footer class="bg-slate-900 border-t border-slate-800 py-3 text-center text-xs text-slate-500 font-mono">
        Optik Sınav Portalı • Tüm hakları saklıdır.
      </footer>
    `;
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
