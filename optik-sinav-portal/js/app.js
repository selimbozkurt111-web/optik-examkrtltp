/**
 * app.js - Çoklu Kurum Optik Sınav Platformu Ana Kontrolörü
 */

window.App = {
  currentTab: 'login',
  activeExamId: null,
  activeScanResult: null,

  init() {
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
              return `
                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <span>📅 ${exam.examDate}</span>
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
                      <button onclick="App.printExamSheets('${instId}', '${exam.id}')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition" title="Optik Form Yazdır">
                        🖨️
                      </button>
                    </div>
                    <div class="flex gap-2">
                      <button onclick="App.viewExamResults('${instId}', '${exam.id}')" class="flex-1 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-bold text-xs rounded-xl transition text-center">
                        Neticeleri Gör 🏆
                      </button>
                      <button onclick="App.deleteExamPrompt('${instId}', '${exam.id}', '${exam.title}')" class="px-2.5 py-1.5 text-rose-400 hover:bg-rose-950/40 rounded-xl transition" title="Sınavı Sil">
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

  showCreateExamModal(instId) {
    const title = prompt('Sınav Başlığı / Adı:', 'LGS 1. Genel Deneme Sınavı');
    if (!title) return;
    const qCountStr = prompt('Toplam Soru Sayısı (Örn: 20, 40 veya 90):', '20');
    const questionCount = parseInt(qCountStr, 10) || 20;
    const targetClass = prompt('Sınava Girecek Sınıf / Şube:', '8. Sınıf');
    const keyA = prompt('A Kitapçığı Cevap Anahtarı (Örn: ABCDABCD...):', 'A'.repeat(questionCount));

    window.PortalStore.createExam(instId, {
      title,
      questionCount,
      targetClass,
      answerKeys: {
        'A': keyA,
        'B': keyA
      }
    });

    this.showToast('Sınav başarıyla oluşturuldu!', 'success');
    this.render();
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
            <button onclick="App.triggerScan()" class="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer">
              <span>📸</span> <span>Kağıdı Tara ve Oku</span>
            </button>
          </div>
        </div>

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

  // Butona tıklandığında veya otomatik kare yakalandığında kağıdı okuma
  triggerScan() {
    const video = document.getElementById('omr-video');
    const canvas = document.getElementById('omr-canvas');
    const studentSelect = document.getElementById('scanner-student-select');
    const studentNo = studentSelect ? studentSelect.value : null;

    const result = window.OmrScanner.scanCurrentFrame(video, canvas, studentNo, 'A');
    if (!result) return;

    const session = window.PortalStore.getCurrentSession();
    const students = window.PortalStore.getStudents(session.institutionId);
    const matchedSt = students.find(s => s.studentNo === result.studentNo);

    result.studentName = matchedSt ? `${matchedSt.firstName} ${matchedSt.lastName}` : `Talebe #${result.studentNo}`;
    result.className = matchedSt ? matchedSt.className : 'Genel';
    result.parentPhone = matchedSt ? matchedSt.parentPhone : '';

    // Neticeyi kaydet
    window.PortalStore.saveExamResult(session.institutionId, result);

    this.showToast(`✓ ${result.studentName} başarıyla okundu! (${result.totalNet} Net - ${result.totalScore} Puan)`, 'success');
    this.renderScanResultCard(result);
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
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div>
            <h2 class="text-xl font-black text-white tracking-tight">Sınav Neticeleri & Sıralama</h2>
            <p class="text-xs text-slate-400 mt-0.5">${currentExam.title} (${rankings.length} Talebe Katıldı)</p>
          </div>
          <div class="flex items-center gap-2">
            <select onchange="App.handleResultsExamChange(this.value, '${instId}')" class="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-bold text-xs">
              ${exams.map(e => `<option value="${e.id}" ${e.id === currentExam.id ? 'selected' : ''}>${e.title}</option>`).join('')}
            </select>
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
                  <th class="p-3 text-right">Karne</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/80">
                ${rankings.length === 0 ? `
                  <tr>
                    <td colspan="9" class="p-8 text-center text-slate-500">
                      Bu sınava ait henüz taranmış bir optik kağıt bulunmuyor. "Kamera ile Oku" bölümünden kağıtları okutabilirsiniz.
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
                      ${r.parentPhone ? `
                        <button onclick="App.sendWhatsAppCard('${encodeURIComponent(r.parentPhone)}', '${encodeURIComponent(r.studentName)}', '${r.totalNet}', '${r.totalScore}')" class="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-[11px] font-bold transition">
                          WhatsApp 💬
                        </button>
                      ` : '-'}
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
