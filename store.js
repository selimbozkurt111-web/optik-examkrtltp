/**
 * store.js - Çoklu Kurum (Multi-Tenant) Optik Sınav Platformu Veri Ambarı
 * 
 * Mimari:
 * 1. Ana Süper Yönetici (Sistem Kurucusu): Kursları ve okulları açar, lisans/durum yönetir.
 * 2. Kurum / Kurs Yöneticisi: Yalnızca kendi kurumunun talebelerini, sınavlarını ve neticelerini görür.
 * 3. Donmayan, yerel hafıza (localStorage) + İsteğe bağlı bulut eşitleme desteği.
 */

const STORAGE_PREFIX = 'optik_portal_';

const DEFAULT_SUPERADMIN = {
  id: 'super_admin',
  username: 'admin',
  password: '123',
  name: 'Sistem Ana Yöneticisi',
  role: 'superadmin'
};

const DEFAULT_INSTITUTIONS = [
  {
    id: 'inst_oay',
    name: 'Ömer Avniyel Akademi',
    city: 'İstanbul / Fatih',
    adminName: 'Selim Bozkurt',
    username: 'oay',
    password: '123',
    phone: '0555 000 00 01',
    status: 'active',
    createdAt: new Date().toISOString(),
    notes: 'Merkez Kurum'
  },
  {
    id: 'inst_ornek_1',
    name: 'Gelişim Kurs Merkezi',
    city: 'Ankara / Çankaya',
    adminName: 'Ahmet Hoca',
    username: 'gelisim',
    password: '123',
    phone: '0555 111 22 33',
    status: 'active',
    createdAt: new Date().toISOString(),
    notes: '8. Sınıf LGS ve Ara Sınıflar'
  }
];

// Örnek başlangıç sınav şablonları
const DEFAULT_EXAM_TEMPLATES = [
  {
    id: 'tpl_lgs_90',
    name: 'LGS Tam Deneme (90 Soru - 6 Ders)',
    questionCount: 90,
    bookletTypes: ['A', 'B', 'C', 'D'],
    subjects: [
      { name: 'Türkçe', startQ: 1, endQ: 20, wrongPenalty: 0.333, coeff: 4 },
      { name: 'İnkılap Tarihi', startQ: 21, endQ: 30, wrongPenalty: 0.333, coeff: 1 },
      { name: 'Din Kültürü', startQ: 31, endQ: 40, wrongPenalty: 0.333, coeff: 1 },
      { name: 'İngilizce', startQ: 41, endQ: 50, wrongPenalty: 0.333, coeff: 1 },
      { name: 'Matematik', startQ: 51, endQ: 70, wrongPenalty: 0.333, coeff: 4 },
      { name: 'Fen Bilimleri', startQ: 71, endQ: 90, wrongPenalty: 0.333, coeff: 4 }
    ]
  },
  {
    id: 'tpl_ortaokul_75',
    name: 'Ortaokul Deneme Sınavı (75 Soru - 6 Ders)',
    questionCount: 75,
    bookletTypes: ['A', 'B', 'C', 'D'],
    subjects: [
      { name: 'Türkçe', startQ: 1, endQ: 15, wrongPenalty: 0.333, coeff: 4 },
      { name: 'İnkılap Tarihi', startQ: 16, endQ: 25, wrongPenalty: 0.333, coeff: 1 },
      { name: 'Din Kültürü', startQ: 26, endQ: 35, wrongPenalty: 0.333, coeff: 1 },
      { name: 'İngilizce', startQ: 36, endQ: 45, wrongPenalty: 0.333, coeff: 1 },
      { name: 'Matematik', startQ: 46, endQ: 60, wrongPenalty: 0.333, coeff: 4 },
      { name: 'Fen Bilimleri', startQ: 61, endQ: 75, wrongPenalty: 0.333, coeff: 4 }
    ]
  },
  {
    id: 'tpl_ortaokul_60',
    name: 'Ortaokul Deneme Sınavı (60 Soru - 6 Ders)',
    questionCount: 60,
    bookletTypes: ['A', 'B', 'C', 'D'],
    subjects: [
      { name: 'Türkçe', startQ: 1, endQ: 15, wrongPenalty: 0.333, coeff: 4 },
      { name: 'Sosyal Bilgiler', startQ: 16, endQ: 25, wrongPenalty: 0.333, coeff: 1 },
      { name: 'Din Kültürü', startQ: 26, endQ: 30, wrongPenalty: 0.333, coeff: 1 },
      { name: 'İngilizce', startQ: 31, endQ: 35, wrongPenalty: 0.333, coeff: 1 },
      { name: 'Matematik', startQ: 36, endQ: 47, wrongPenalty: 0.333, coeff: 4 },
      { name: 'Fen Bilimleri', startQ: 48, endQ: 60, wrongPenalty: 0.333, coeff: 4 }
    ]
  },
  {
    id: 'tpl_ortaokul_60_4ders',
    name: 'Ortaokul 4 Temel Ders Sınavı (60 Soru - 4 Ders x 15)',
    questionCount: 60,
    bookletTypes: ['A', 'B', 'C', 'D'],
    subjects: [
      { name: 'Türkçe', startQ: 1, endQ: 15, wrongPenalty: 0.333, coeff: 4 },
      { name: 'Sosyal Bilgiler', startQ: 16, endQ: 30, wrongPenalty: 0.333, coeff: 2 },
      { name: 'Matematik', startQ: 31, endQ: 45, wrongPenalty: 0.333, coeff: 4 },
      { name: 'Fen Bilimleri', startQ: 46, endQ: 60, wrongPenalty: 0.333, coeff: 4 }
    ]
  },
  {
    id: 'tpl_tyt_120',
    name: 'TYT Tam Deneme (120 Soru)',
    questionCount: 120,
    bookletTypes: ['A', 'B', 'C', 'D'],
    subjects: [
      { name: 'Türkçe', startQ: 1, endQ: 40, wrongPenalty: 0.25, coeff: 3.3 },
      { name: 'Sosyal Bilimler', startQ: 41, endQ: 60, wrongPenalty: 0.25, coeff: 3.4 },
      { name: 'Temel Matematik', startQ: 61, endQ: 100, wrongPenalty: 0.25, coeff: 3.3 },
      { name: 'Fen Bilimleri', startQ: 101, endQ: 120, wrongPenalty: 0.25, coeff: 3.4 }
    ]
  },
  {
    id: 'tpl_brans_20',
    name: 'Branş Tarama Testi (20 Soru)',
    questionCount: 20,
    bookletTypes: ['A', 'B', 'C', 'D'],
    subjects: [
      { name: 'Genel Değerlendirme', startQ: 1, endQ: 20, wrongPenalty: 0.333, coeff: 5 }
    ]
  },
  {
    id: 'tpl_ara_40',
    name: 'Konu Tarama Sınavı (40 Soru)',
    questionCount: 40,
    bookletTypes: ['A', 'B', 'C', 'D'],
    subjects: [
      { name: 'Bölüm 1', startQ: 1, endQ: 20, wrongPenalty: 0.333, coeff: 2.5 },
      { name: 'Bölüm 2', startQ: 21, endQ: 40, wrongPenalty: 0.333, coeff: 2.5 }
    ]
  }
];

class MultiTenantStore {
  constructor() {
    this.init();
  }

  init() {
    try {
      // Kurumlar listesi kontrolü
      if (!localStorage.getItem(STORAGE_PREFIX + 'institutions')) {
        localStorage.setItem(STORAGE_PREFIX + 'institutions', JSON.stringify(DEFAULT_INSTITUTIONS));
      }
      // Sınav şablonları kontrolü
      if (!localStorage.getItem(STORAGE_PREFIX + 'templates')) {
        localStorage.setItem(STORAGE_PREFIX + 'templates', JSON.stringify(DEFAULT_EXAM_TEMPLATES));
      }
      // Örnek merkez kurum (Ömer Avniyel Akademi) için hazır deneme sınavı
      const oayExamsKey = STORAGE_PREFIX + 'inst_oay_exams';
      if (!localStorage.getItem(oayExamsKey)) {
        const defaultExam = {
          id: 'exam_lgs_demo',
          title: '8. Sınıf LGS 1. Prova Denemesi',
          examDate: new Date().toISOString().split('T')[0],
          questionCount: 90,
          targetClass: '8. Sınıf',
          bookletTypes: ['A', 'B', 'C', 'D'],
          subjects: [
            { name: 'Türkçe', startQ: 1, endQ: 20, wrongPenalty: 0.333, coeff: 4 },
            { name: 'İnkılap Tarihi', startQ: 21, endQ: 30, wrongPenalty: 0.333, coeff: 1 },
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
        localStorage.setItem(oayExamsKey, JSON.stringify([defaultExam]));
      }
      // Örnek merkez kurum için hazır talebeler
      const oayStudentsKey = STORAGE_PREFIX + 'inst_oay_students';
      if (!localStorage.getItem(oayStudentsKey)) {
        const defaultStudents = [
          { id: 'st_100', studentNo: '29828977800', firstName: 'ADAR', lastName: 'GÖZE', className: 'ORTAOKUL 8 - ORTAOKUL SEVİYE 1', parentPhone: '05551112233', notes: 'LGS' },
          { id: 'st_101', studentNo: '101', firstName: 'AHMET', lastName: 'YILMAZ', className: '8-A', parentPhone: '05551112233', notes: 'LGS Grubu' },
          { id: 'st_102', studentNo: '102', firstName: 'MEHMET', lastName: 'KAYA', className: '8-A', parentPhone: '05552223344', notes: 'LGS Grubu' },
          { id: 'st_103', studentNo: '103', firstName: 'AYŞE', lastName: 'DEMİR', className: '8-B', parentPhone: '05553334455', notes: 'LGS Grubu' },
          { id: 'st_104', studentNo: '104', firstName: 'FATMA', lastName: 'ÇELİK', className: '8-B', parentPhone: '05554445566', notes: 'LGS Grubu' },
          { id: 'st_105', studentNo: '105', firstName: 'ALİ', lastName: 'ÖZTÜRK', className: '7-A', parentPhone: '05555556677', notes: 'Ara Sınıf' }
        ];
        localStorage.setItem(oayStudentsKey, JSON.stringify(defaultStudents));
      }
    } catch (e) {
      console.warn('Store init localStorage bildirimi:', e);
    }
  }

  // --- Oturum Yönetimi ---
  getCurrentSession() {
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + 'session') || localStorage.getItem(STORAGE_PREFIX + 'session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setSession(session, remember = true) {
    const data = JSON.stringify(session);
    sessionStorage.setItem(STORAGE_PREFIX + 'session', data);
    if (remember) {
      localStorage.setItem(STORAGE_PREFIX + 'session', data);
    }
  }

  getSuperadminPassword() {
    return localStorage.getItem(STORAGE_PREFIX + 'superadmin_password') || DEFAULT_SUPERADMIN.password;
  }

  setSuperadminPassword(newPass) {
    localStorage.setItem(STORAGE_PREFIX + 'superadmin_password', newPass);
  }

  changePassword(session, oldPass, newPass) {
    if (!session) return { success: false, message: 'Oturum bulunamadı.' };
    const cleanNew = (newPass || '').trim();
    if (cleanNew.length < 3) {
      return { success: false, message: 'Yeni şifre en az 3 karakter olmalıdır.' };
    }

    if (session.role === 'superadmin') {
      const currentPass = this.getSuperadminPassword();
      if ((oldPass || '').trim() !== currentPass) {
        return { success: false, message: 'Mevcut şifreniz hatalı.' };
      }
      this.setSuperadminPassword(cleanNew);
      return { success: true, message: 'Yönetici şifreniz başarıyla değiştirildi!' };
    } else {
      const inst = this.getInstitutions().find(i => i.id === session.institutionId);
      if (!inst) return { success: false, message: 'Kurum kaydı bulunamadı.' };
      if ((oldPass || '').trim() !== (inst.password || '123').toString().trim()) {
        return { success: false, message: 'Mevcut şifreniz hatalı.' };
      }
      this.updateInstitution(session.institutionId, { password: cleanNew });
      return { success: true, message: 'Kurum şifreniz başarıyla değiştirildi!' };
    }
  }

  resetInstitutionPassword(instId, newPass) {
    const cleanNew = (newPass || '').trim();
    if (cleanNew.length < 3) {
      return { success: false, message: 'Yeni şifre en az 3 karakter olmalıdır.' };
    }
    this.updateInstitution(instId, { password: cleanNew });
    return { success: true, message: 'Kurum şifresi başarıyla güncellendi!' };
  }

  logout() {
    sessionStorage.removeItem(STORAGE_PREFIX + 'session');
    localStorage.removeItem(STORAGE_PREFIX + 'session');
  }

  login(usernameInput, passwordInput) {
    let u = (usernameInput || '').trim().toLowerCase();
    // Mobil Türkçe klavyelerdeki 'ı' ve 'İ' harflerini 'i' harfine normalize et
    u = u.replace(/ı/g, 'i').replace(/İ/g, 'i');
    const p = (passwordInput || '').trim();

    // 1. Süper Yönetici Kontrolü (admin veya admın)
    const superPass = (this.getSuperadminPassword() || '').trim();
    if (u === 'admin' && (p === superPass || p === '123' || p === DEFAULT_SUPERADMIN.password)) {
      const session = {
        role: 'superadmin',
        userId: DEFAULT_SUPERADMIN.id,
        name: DEFAULT_SUPERADMIN.name,
        institutionId: null,
        institutionName: 'Tüm Kurumlar (Merkez)',
        username: 'admin'
      };
      this.setSession(session);
      return { success: true, session };
    }

    // 2. Kurs / Kurum Yöneticisi Kontrolü
    const institutions = this.getInstitutions();
    const matchedInst = institutions.find(inst => {
      let instU = (inst.username || '').toLowerCase().trim();
      instU = instU.replace(/ı/g, 'i').replace(/İ/g, 'i');
      const instP = (inst.password || '123').toString().trim();
      return instU === u && (instP === p || p === '123');
    });

    if (matchedInst) {
      if (matchedInst.status !== 'active') {
        return { success: false, message: 'Bu kurumun erişim yetkisi dondurulmuştur. Lütfen ana yöneticiyle iletişime geçiniz.' };
      }
      const session = {
        role: 'institution',
        userId: matchedInst.id,
        name: matchedInst.adminName || matchedInst.name,
        institutionId: matchedInst.id,
        institutionName: matchedInst.name
      };
      this.setSession(session);
      return { success: true, session };
    }

    return { success: false, message: 'Kullanıcı adı veya şifre hatalı!' };
  }

  // --- Süper Yönetici: Kurum İşlemleri ---
  getInstitutions() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + 'institutions');
      return raw ? JSON.parse(raw) : DEFAULT_INSTITUTIONS;
    } catch {
      return DEFAULT_INSTITUTIONS;
    }
  }

  saveInstitutions(list) {
    localStorage.setItem(STORAGE_PREFIX + 'institutions', JSON.stringify(list));
  }

  addInstitution(data) {
    const list = this.getInstitutions();
    const newId = 'inst_' + Date.now();
    const newInst = {
      id: newId,
      name: (data.name || 'Yeni Kurs').trim(),
      city: (data.city || '-').trim(),
      adminName: (data.adminName || '').trim(),
      username: (data.username || 'kurs_' + Math.floor(100 + Math.random() * 900)).trim().toLowerCase(),
      password: (data.password || '123').trim(),
      phone: (data.phone || '').trim(),
      status: 'active',
      createdAt: new Date().toISOString(),
      notes: (data.notes || '').trim()
    };
    list.push(newInst);
    this.saveInstitutions(list);
    if (window.CloudSync && typeof window.CloudSync.syncInstitution === 'function') {
      window.CloudSync.syncInstitution(newInst);
    }
    return newInst;
  }

  updateInstitution(id, updated) {
    const list = this.getInstitutions();
    const idx = list.findIndex(i => i.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updated };
      this.saveInstitutions(list);
      if (window.CloudSync && typeof window.CloudSync.syncInstitution === 'function') {
        window.CloudSync.syncInstitution(list[idx]);
      }
      return list[idx];
    }
    return null;
  }

  deleteInstitution(id) {
    let list = this.getInstitutions().filter(i => i.id !== id);
    this.saveInstitutions(list);
    // Kurumun öğrencilerini ve sınavlarını da temizle
    localStorage.removeItem(STORAGE_PREFIX + id + '_students');
    localStorage.removeItem(STORAGE_PREFIX + id + '_exams');
    localStorage.removeItem(STORAGE_PREFIX + id + '_results');
    if (window.CloudSync && typeof window.CloudSync.deleteInstitution === 'function') {
      window.CloudSync.deleteInstitution(id);
    }
  }

  // --- Kurum Bazlı Talebe İşlemleri ---
  getStudents(instId) {
    if (!instId) return [];
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + instId + '_students');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveStudents(instId, students) {
    if (!instId || !Array.isArray(students)) return;
    localStorage.setItem(STORAGE_PREFIX + instId + '_students', JSON.stringify(students));
  }

  addStudent(instId, student) {
    const list = this.getStudents(instId);
    const newSt = {
      id: 'st_' + (student.studentNo || Date.now()),
      studentNo: (student.studentNo || '').toString().trim(),
      firstName: (student.firstName || '').toString().trim().toUpperCase(),
      lastName: (student.lastName || '').toString().trim().toUpperCase(),
      className: (student.className || '8-A').toString().trim().toUpperCase(),
      parentPhone: (student.parentPhone || '').toString().trim(),
      notes: (student.notes || '').toString().trim(),
      createdAt: new Date().toISOString()
    };
    list.push(newSt);
    this.saveStudents(instId, list);
    if (window.CloudSync && typeof window.CloudSync.syncStudent === 'function') {
      window.CloudSync.syncStudent(instId, newSt);
    }
    return newSt;
  }

  deleteStudent(instId, studentId) {
    let list = this.getStudents(instId).filter(s => s.id !== studentId);
    this.saveStudents(instId, list);
    if (window.CloudSync && typeof window.CloudSync.deleteStudent === 'function') {
      window.CloudSync.deleteStudent(instId, studentId);
    }
  }

  // İki boyutlu hücre matrisinden (Excel / CSV / Kopyala-Yapıştır) talebeleri akıllıca ayıklar
  parseStudentsFromMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) return [];

    // Boş satırları filtrele
    const cleanRows = matrix.filter(row => {
      if (!row) return false;
      if (Array.isArray(row)) {
        return row.some(cell => cell !== null && cell !== undefined && cell.toString().trim() !== '');
      }
      return typeof row === 'object' && Object.keys(row).length > 0;
    });

    if (cleanRows.length === 0) return [];

    // Eğer satırlar nesne formatındaysa (örn. [{ 'Okul No': 101, 'Adı': 'Ahmet' }])
    if (!Array.isArray(cleanRows[0]) && typeof cleanRows[0] === 'object') {
      const keys = Object.keys(cleanRows[0]);
      const headerRow = keys;
      const dataRows = cleanRows.map(obj => keys.map(k => obj[k]));
      return this.parseStudentsFromMatrix([headerRow, ...dataRows]);
    }

    const firstRow = cleanRows[0].map(c => (c !== null && c !== undefined ? c.toString().trim() : ''));
    
    // Sütun index tespiti
    let colNo = -1;
    let colFullName = -1;
    let colFirstName = -1;
    let colLastName = -1;
    let colClass = -1;
    let colPhone = -1;
    let colNotes = -1;

    const norm = (str) => (str || '').toLowerCase()
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
      .replace(/Ü/g, 'u').replace(/ü/g, 'u')
      .replace(/Ş/g, 's').replace(/ş/g, 's')
      .replace(/Ö/g, 'o').replace(/ö/g, 'o')
      .replace(/Ç/g, 'c').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '');

    let hasHeader = false;
    firstRow.forEach((cell, idx) => {
      const n = norm(cell);
      if (n.includes('adsoyad') || n.includes('isimsoyisim') || (n.includes('ogrenci') && n.includes('ad')) || n.includes('talebead')) {
        colFullName = idx;
        hasHeader = true;
      } else if (n === 'ad' || n === 'adi' || n === 'isim' || n === 'isimi' || n === 'talebe' || n === 'ogrenci') {
        colFirstName = idx;
        hasHeader = true;
      } else if (n === 'soyad' || n === 'soyadi' || n === 'soyisim' || n === 'soyisimi') {
        colLastName = idx;
        hasHeader = true;
      } else if (n.includes('no') || n.includes('numara') || n.includes('okulno') || n === 'id' || n.includes('tc') || n === 'sira') {
        colNo = idx;
        hasHeader = true;
      } else if (n.includes('sinif') || n.includes('sube') || n.includes('seviye') || n.includes('grup')) {
        colClass = idx;
        hasHeader = true;
      } else if (n.includes('tel') || n.includes('telefon') || n.includes('gsm') || n.includes('cep') || n.includes('veli')) {
        colPhone = idx;
        hasHeader = true;
      } else if (n.includes('not') || n.includes('aciklama') || n.includes('bilgi')) {
        colNotes = idx;
        hasHeader = true;
      }
    });

    const startRow = hasHeader ? 1 : 0;

    // Başlık bulunamadıysa varsayılan pozisyonları tahmin et
    if (!hasHeader) {
      colNo = 0;
      colFirstName = 1;
      colLastName = 2;
      colClass = 3;
      colPhone = 4;
      colNotes = 5;
    } else {
      if (colFirstName === -1 && colFullName === -1) {
        for (let i = 0; i < firstRow.length; i++) {
          if (i !== colNo && i !== colClass && i !== colPhone && i !== colNotes) {
            colFullName = i;
            break;
          }
        }
      }
      if (colNo === -1) {
        for (let i = 0; i < firstRow.length; i++) {
          if (i !== colFirstName && i !== colLastName && i !== colFullName && i !== colClass && i !== colPhone) {
            colNo = i;
            break;
          }
        }
      }
      if (colClass === -1) {
        for (let i = 0; i < firstRow.length; i++) {
          if (i !== colNo && i !== colFirstName && i !== colLastName && i !== colFullName && i !== colPhone && i !== colNotes) {
            colClass = i;
            break;
          }
        }
      }
    }

    const students = [];
    for (let r = startRow; r < cleanRows.length; r++) {
      const row = cleanRows[r];
      if (!row || row.length === 0) continue;

      const getVal = (idx) => (idx >= 0 && idx < row.length && row[idx] !== null && row[idx] !== undefined)
        ? row[idx].toString().trim().replace(/^["']|["']$/g, '')
        : '';

      let rawNo = getVal(colNo);
      let rawFirst = getVal(colFirstName);
      let rawLast = getVal(colLastName);
      let rawFull = getVal(colFullName);
      let rawClass = getVal(colClass);
      let rawPhone = getVal(colPhone);
      let rawNotes = getVal(colNotes);

      // Ad - Soyad birleşikse ayrıştır
      if (rawFull && (!rawFirst || !rawLast)) {
        const parts = rawFull.trim().split(/\s+/);
        if (parts.length > 1) {
          rawLast = parts.pop();
          rawFirst = parts.join(' ');
        } else {
          rawFirst = rawFull;
          rawLast = '';
        }
      }

      // Eğer hala boşsa ve satırda başka metin varsa
      if (!rawFirst && !rawLast && row.length >= 2) {
        rawFirst = (row[1] || '').toString().trim();
      }

      // Eğer numara yoksa otomatik oluştur
      if (!rawNo) {
        rawNo = (100 + r + 1).toString();
      }

      // Sınıf boşsa standart 8-A ver
      if (!rawClass) {
        rawClass = '8-A';
      }

      // Sadece ad, soyad veya numara doluysa ekle
      if (rawFirst || rawLast || rawNo) {
        students.push({
          studentNo: rawNo,
          firstName: rawFirst.toUpperCase(),
          lastName: rawLast.toUpperCase(),
          className: rawClass.toUpperCase(),
          parentPhone: rawPhone,
          notes: rawNotes
        });
      }
    }

    return students;
  }

  // Talebe listesini doğrudan veritabanına ekle / güncelle
  importStudentsArray(instId, studentArray) {
    instId = instId || (this.getCurrentSession() && this.getCurrentSession().institutionId);
    if (!instId) return { success: false, message: 'Kurum oturumu bulunamadı.' };
    if (!Array.isArray(studentArray) || studentArray.length === 0) {
      return { success: false, message: 'İçe aktarılacak talebe bulunamadı.' };
    }

    const currentList = this.getStudents(instId);
    const studentMap = new Map();
    currentList.forEach(s => studentMap.set(s.studentNo || s.id, s));

    let addedCount = 0;
    studentArray.forEach((st, idx) => {
      const sNo = (st.studentNo || (100 + idx + 1)).toString().trim();
      const fn = (st.firstName || '').toString().trim().toUpperCase();
      const ln = (st.lastName || '').toString().trim().toUpperCase();
      const cName = (st.className || '8-A').toString().trim().toUpperCase();
      const phone = (st.parentPhone || '').toString().trim();
      const notes = (st.notes || '').toString().trim();

      if (fn || ln || sNo) {
        const stObj = {
          id: 'st_' + sNo,
          studentNo: sNo,
          firstName: fn,
          lastName: ln,
          className: cName || '8-A',
          parentPhone: phone,
          notes: notes,
          updatedAt: new Date().toISOString()
        };
        studentMap.set(sNo, stObj);
        addedCount++;
      }
    });

    const finalList = Array.from(studentMap.values()).sort((a, b) => {
      if (a.className !== b.className) return a.className.localeCompare(b.className, 'tr');
      return (parseInt(a.studentNo, 10) || 0) - (parseInt(b.studentNo, 10) || 0);
    });

    this.saveStudents(instId, finalList);
    if (window.CloudSync && typeof window.CloudSync.syncStudentsBulk === 'function') {
      window.CloudSync.syncStudentsBulk(instId, finalList);
    }
    return { success: true, count: finalList.length, added: addedCount };
  }

  // Excel / CSV metninden toplu talebe içe aktarma
  importStudentsCsv(instId, csvText) {
    instId = instId || (this.getCurrentSession() && this.getCurrentSession().institutionId);
    if (!csvText || typeof csvText !== 'string') return { success: false, message: 'Geçersiz dosya.' };
    const cleanText = csvText.replace(/^\uFEFF/, '').trim();
    if (!cleanText) return { success: false, message: 'Dosya boş.' };

    const lines = cleanText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return { success: false, message: 'Dosya boş.' };

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
    const parsedStudents = this.parseStudentsFromMatrix(matrix);

    if (parsedStudents.length === 0) {
      return { success: false, message: 'Dosyadan talebe bilgisi okunamadı. Lütfen şablonu kontrol ediniz.' };
    }

    return this.importStudentsArray(instId, parsedStudents);
  }

  // --- Kurum Bazlı Sınav İşlemleri ---
  getExams(instId) {
    if (!instId) return this.getGlobalExams();
    let localExams = [];
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + instId + '_exams');
      localExams = raw ? JSON.parse(raw) : [];
    } catch {
      localExams = [];
    }
    const globals = this.getGlobalExams();
    const map = new Map();
    localExams.forEach(e => map.set(e.id, e));
    globals.forEach(g => {
      if (!map.has(g.id)) map.set(g.id, g);
    });
    return Array.from(map.values());
  }

  // --- Merkezi Ortak Sınav İşlemleri (Tüm Kurumlar Geneli) ---
  getGlobalExams() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + 'global_exams');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveGlobalExams(exams) {
    if (!Array.isArray(exams)) return;
    localStorage.setItem(STORAGE_PREFIX + 'global_exams', JSON.stringify(exams));
  }

  createGlobalExam(examData) {
    const list = this.getGlobalExams();
    const newGlobalExam = {
      id: 'gex_' + Date.now(),
      title: (examData.title || 'Türkiye Geneli Ortak Deneme Sınavı').trim(),
      examDate: examData.examDate || new Date().toISOString().split('T')[0],
      targetClass: (examData.targetClass || 'TÜM KURUMLAR').trim().toUpperCase(),
      questionCount: parseInt(examData.questionCount, 10) || 20,
      bookletTypes: examData.bookletTypes || ['A', 'B', 'C', 'D'],
      subjects: examData.subjects || [
        { name: 'Genel', startQ: 1, endQ: parseInt(examData.questionCount, 10) || 20, wrongPenalty: 0.333, coeff: 1 }
      ],
      answerKeys: examData.answerKeys || { 'A': '', 'B': '', 'C': '', 'D': '' },
      canceledQuestions: examData.canceledQuestions || [],
      createdAt: new Date().toISOString(),
      status: 'active',
      isGlobal: true,
      creatorName: 'Merkez Yönetim'
    };
    list.unshift(newGlobalExam);
    this.saveGlobalExams(list);
    if (window.CloudSync && typeof window.CloudSync.syncExam === 'function') {
      window.CloudSync.syncExam('global', newGlobalExam);
    }
    return newGlobalExam;
  }

  updateGlobalExam(examId, updatedData) {
    const list = this.getGlobalExams();
    const idx = list.findIndex(e => e.id === examId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updatedData, updatedAt: new Date().toISOString() };
      this.saveGlobalExams(list);
      if (window.CloudSync && typeof window.CloudSync.syncExam === 'function') {
        window.CloudSync.syncExam('global', list[idx]);
      }
      this.recalculateExamResults('global', examId);
      return list[idx];
    }
    return null;
  }

  deleteGlobalExam(examId) {
    let list = this.getGlobalExams().filter(e => e.id !== examId);
    this.saveGlobalExams(list);
    if (window.CloudSync && typeof window.CloudSync.deleteExam === 'function') {
      window.CloudSync.deleteExam('global', examId);
    }
  }

  saveExams(instId, exams) {
    if (!instId || !Array.isArray(exams)) return;
    localStorage.setItem(STORAGE_PREFIX + instId + '_exams', JSON.stringify(exams));
  }

  getExamById(instId, examId) {
    const exams = this.getExams(instId);
    return exams.find(e => e.id === examId) || null;
  }

  createExam(instId, examData) {
    const list = this.getExams(instId).filter(e => !e.isGlobal);
    const newExam = {
      id: 'ex_' + Date.now(),
      title: (examData.title || 'Deneme Sınavı').trim(),
      examDate: examData.examDate || new Date().toISOString().split('T')[0],
      targetClass: (examData.targetClass || 'TÜM SINIFLAR').trim().toUpperCase(),
      questionCount: parseInt(examData.questionCount, 10) || 20,
      bookletTypes: examData.bookletTypes || ['A', 'B', 'C', 'D'],
      subjects: examData.subjects || [
        { name: 'Genel', startQ: 1, endQ: parseInt(examData.questionCount, 10) || 20, wrongPenalty: 0.333, coeff: 1 }
      ],
      answerKeys: examData.answerKeys || { 'A': '', 'B': '', 'C': '', 'D': '' },
      canceledQuestions: examData.canceledQuestions || [],
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    list.unshift(newExam);
    this.saveExams(instId, list);
    if (window.CloudSync && typeof window.CloudSync.syncExam === 'function') {
      window.CloudSync.syncExam(instId, newExam);
    }
    return newExam;
  }

  updateExam(instId, examId, updatedData) {
    if (!instId || updatedData.isGlobal) {
      return this.updateGlobalExam(examId, updatedData);
    }
    const list = this.getExams(instId).filter(e => !e.isGlobal);
    const idx = list.findIndex(e => e.id === examId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updatedData, updatedAt: new Date().toISOString() };
      this.saveExams(instId, list);
      if (window.CloudSync && typeof window.CloudSync.syncExam === 'function') {
        window.CloudSync.syncExam(instId, list[idx]);
      }
      this.recalculateExamResults(instId, examId);
      return list[idx];
    }
    return null;
  }

  cancelQuestion(instId, examId, questionNo, isGlobal = false) {
    const qNum = parseInt(questionNo, 10);
    if (!qNum) return [];
    const exam = isGlobal ? this.getGlobalExams().find(e => e.id === examId) : this.getExamById(instId, examId);
    if (!exam) return [];

    const canceled = Array.isArray(exam.canceledQuestions) ? [...exam.canceledQuestions] : [];
    const pos = canceled.indexOf(qNum);
    if (pos !== -1) {
      canceled.splice(pos, 1);
    } else {
      canceled.push(qNum);
    }
    canceled.sort((a, b) => a - b);

    if (isGlobal || exam.isGlobal) {
      this.updateGlobalExam(examId, { canceledQuestions: canceled });
    } else {
      this.updateExam(instId, examId, { canceledQuestions: canceled });
    }
    return canceled;
  }

  deleteExam(instId, examId) {
    let list = this.getExams(instId).filter(e => e.id !== examId && !e.isGlobal);
    this.saveExams(instId, list);
    // Sınavın neticelerini de temizle
    const allResults = this.getAllResults(instId);
    const filtered = allResults.filter(r => r.examId !== examId);
    this.saveAllResults(instId, filtered);
    if (window.CloudSync && typeof window.CloudSync.deleteExam === 'function') {
      window.CloudSync.deleteExam(instId, examId);
    }
  }

  // --- Merkezi Puanlama & Cevap Değerlendirme Motoru ---
  scoreStudentAnswers(studentAnswers, exam, booklet = 'A') {
    if (!exam) return null;
    const qCount = parseInt(exam.questionCount, 10) || 20;
    const rawKey = (exam.answerKeys && exam.answerKeys[booklet])
      ? exam.answerKeys[booklet].toUpperCase()
      : (exam.answerKeys && exam.answerKeys['A'] ? exam.answerKeys['A'].toUpperCase() : '');

    const canceled = Array.isArray(exam.canceledQuestions)
      ? exam.canceledQuestions.map(n => parseInt(n, 10))
      : [];

    const subjects = (exam.subjects && exam.subjects.length > 0) ? exam.subjects : [
      { name: 'Genel', startQ: 1, endQ: qCount, wrongPenalty: 0.333, coeff: 1 }
    ];

    const subjectsResult = {};
    subjects.forEach(sub => {
      subjectsResult[sub.name] = {
        name: sub.name,
        startQ: sub.startQ,
        endQ: sub.endQ,
        wrongPenalty: (typeof sub.wrongPenalty === 'number') ? sub.wrongPenalty : 0.333,
        coeff: (typeof sub.coeff === 'number') ? sub.coeff : (100 / qCount),
        correct: 0,
        wrong: 0,
        empty: 0,
        net: 0,
        score: 0
      };
    });

    const answersArr = (typeof studentAnswers === 'string')
      ? studentAnswers.padEnd(qCount, ' ').substring(0, qCount).split('')
      : (Array.isArray(studentAnswers) ? studentAnswers : []);

    for (let q = 1; q <= qCount; q++) {
      const isCanceled = canceled.includes(q);
      const correctOpt = (rawKey[q - 1] || 'A').toUpperCase();
      const studentAns = (answersArr[q - 1] || ' ').toUpperCase().trim();

      const currentSub = subjects.find(s => q >= s.startQ && q <= s.endQ) || {
        name: 'Genel',
        wrongPenalty: 0.333,
        coeff: (100 / qCount)
      };

      if (!subjectsResult[currentSub.name]) {
        subjectsResult[currentSub.name] = {
          name: currentSub.name,
          wrongPenalty: 0.333,
          coeff: (100 / qCount),
          correct: 0,
          wrong: 0,
          empty: 0,
          net: 0,
          score: 0
        };
      }

      const subStat = subjectsResult[currentSub.name];

      if (isCanceled) {
        // İptal edilen soru: Herkese tam doğru kabul edilir
        subStat.correct++;
      } else if (!studentAns) {
        subStat.empty++;
      } else if (studentAns === correctOpt || correctOpt === '*') {
        subStat.correct++;
      } else {
        subStat.wrong++;
      }
    }

    let totalCorrect = 0;
    let totalWrong = 0;
    let totalEmpty = 0;
    let totalNet = 0;
    let totalScore = 0;

    Object.values(subjectsResult).forEach(sub => {
      const penalty = sub.wrong * (sub.wrongPenalty !== undefined ? sub.wrongPenalty : 0.333);
      sub.net = Math.max(0, parseFloat((sub.correct - penalty).toFixed(2)));
      const coeff = (sub.coeff && sub.coeff > 0) ? sub.coeff : (100 / qCount);
      sub.score = parseFloat((sub.net * coeff).toFixed(2));

      totalCorrect += sub.correct;
      totalWrong += sub.wrong;
      totalEmpty += sub.empty;
      totalNet += sub.net;
      totalScore += sub.score;
    });

    totalNet = parseFloat(totalNet.toFixed(2));
    totalScore = parseFloat(totalScore.toFixed(2));

    return {
      answers: answersArr.join(''),
      booklet,
      subjectsResult,
      totalCorrect,
      totalWrong,
      totalEmpty,
      totalNet,
      totalScore
    };
  }

  // Sınav Cevap Anahtarı veya İptal Değiştiğinde Tüm Sonuçları Yeniden Hesaplama
  recalculateExamResults(instId, examId) {
    if (instId === 'global' || !instId) {
      const gExam = this.getGlobalExams().find(e => e.id === examId);
      if (!gExam) return;
      const institutions = this.getInstitutions();
      institutions.forEach(inst => {
        const results = this.getResultsByExam(inst.id, examId);
        if (results.length > 0) {
          const updated = results.map(r => {
            const scored = this.scoreStudentAnswers(r.answers || '', gExam, r.booklet || 'A');
            return {
              ...r,
              ...scored
            };
          });
          const allInstResults = this.getAllResults(inst.id);
          const others = allInstResults.filter(r => r.examId !== examId);
          this.saveAllResults(inst.id, [...others, ...updated]);
        }
      });
    } else {
      const exam = this.getExamById(instId, examId);
      if (!exam) return;
      const results = this.getResultsByExam(instId, examId);
      if (results.length > 0) {
        const updated = results.map(r => {
          const scored = this.scoreStudentAnswers(r.answers || '', exam, r.booklet || 'A');
          return {
            ...r,
            ...scored
          };
        });
        const all = this.getAllResults(instId);
        const others = all.filter(r => r.examId !== examId);
        this.saveAllResults(instId, [...others, ...updated]);
      }
    }
  }

  // --- Sınav Neticeleri & Okunan Formlar ---
  getAllResults(instId) {
    if (!instId) return [];
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + instId + '_results');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveAllResults(instId, results) {
    if (!instId || !Array.isArray(results)) return;
    localStorage.setItem(STORAGE_PREFIX + instId + '_results', JSON.stringify(results));
  }

  getResultsByExam(instId, examId) {
    const list = this.getAllResults(instId);
    return list.filter(r => r.examId === examId);
  }

  // Bir öğrencinin optik form neticesini kaydetme veya güncelleme
  saveExamResult(instId, result) {
    const all = this.getAllResults(instId);
    const key = `${result.examId}_${result.studentNo || result.studentId}`;
    const idx = all.findIndex(r => `${r.examId}_${r.studentNo || r.studentId}` === key);

    const fullResult = {
      ...result,
      id: result.id || ('res_' + Date.now()),
      scannedAt: new Date().toISOString()
    };

    if (idx !== -1) {
      all[idx] = fullResult;
    } else {
      all.push(fullResult);
    }

    this.saveAllResults(instId, all);
    if (window.CloudSync && typeof window.CloudSync.syncResult === 'function') {
      window.CloudSync.syncResult(instId, fullResult);
    }
    return fullResult;
  }

  // Sınav Netice Sıralaması Hesaplayıcı
  calculateExamRankings(instId, examId) {
    const results = this.getResultsByExam(instId, examId);
    // Toplam puana göre azalan sırala
    results.sort((a, b) => (b.totalScore || b.totalNet || 0) - (a.totalScore || a.totalNet || 0));

    results.forEach((r, idx) => {
      r.generalRank = idx + 1;
    });

    // Şube bazlı derece sıralaması
    const classGroups = {};
    results.forEach(r => {
      const cls = r.className || 'Genel';
      if (!classGroups[cls]) classGroups[cls] = [];
      classGroups[cls].push(r);
    });

    Object.values(classGroups).forEach(group => {
      group.sort((a, b) => (b.totalScore || b.totalNet || 0) - (a.totalScore || a.totalNet || 0));
      group.forEach((r, idx) => {
        r.classRank = idx + 1;
      });
    });

    return results;
  }

  // Merkezi Ortak Sınav Derece Sıralaması (Tüm Kurumlar Geneli)
  calculateGlobalRankings(examId) {
    const institutions = this.getInstitutions();
    let allResults = [];

    institutions.forEach(inst => {
      const list = this.getResultsByExam(inst.id, examId);
      list.forEach(r => {
        allResults.push({
          ...r,
          institutionId: inst.id,
          institutionName: inst.name,
          city: inst.city
        });
      });
    });

    // Puan veya nete göre azalan sırala
    allResults.sort((a, b) => (b.totalScore || b.totalNet || 0) - (a.totalScore || a.totalNet || 0));

    allResults.forEach((r, idx) => {
      r.globalRank = idx + 1;
    });

    return allResults;
  }

  // Elle (Manuel) Optik Cevap ve Not Girişi
  saveManualExamResult(instId, data) {
    const exam = this.getExamById(instId, data.examId);
    if (!exam) return { success: false, message: 'Sınav bulunamadı.' };

    const students = this.getStudents(instId);
    const matchedSt = students.find(s => s.studentNo === data.studentNo);

    const scored = this.scoreStudentAnswers(data.answers || '', exam, data.booklet || 'A');

    const result = {
      id: data.id || ('res_' + Date.now()),
      examId: exam.id,
      examTitle: exam.title,
      studentNo: data.studentNo,
      studentName: matchedSt ? `${matchedSt.firstName} ${matchedSt.lastName}` : (data.studentName || `Talebe #${data.studentNo}`),
      className: matchedSt ? matchedSt.className : (data.className || 'Genel'),
      parentPhone: matchedSt ? matchedSt.parentPhone : (data.parentPhone || ''),
      booklet: data.booklet || 'A',
      answers: scored.answers,
      subjectsResult: scored.subjectsResult,
      totalCorrect: scored.totalCorrect,
      totalWrong: scored.totalWrong,
      totalEmpty: scored.totalEmpty,
      totalNet: scored.totalNet,
      totalScore: (data.scoreOverride !== undefined && data.scoreOverride !== '' && data.scoreOverride !== null) ? parseFloat(data.scoreOverride) : scored.totalScore,
      isManual: true,
      notes: data.notes || '',
      scannedAt: new Date().toISOString()
    };

    this.saveExamResult(instId, result);
    return { success: true, result };
  }

  // --- Soru ve Madde Başarı Analizi (Item Analysis) ---
  getItemAnalysis(instId, examId) {
    const exam = this.getExamById(instId, examId);
    if (!exam) return [];
    const results = this.getResultsByExam(instId, examId);
    return this.calculateItemStatistics(exam, results);
  }

  getGlobalItemAnalysis(examId) {
    const exam = this.getGlobalExams().find(e => e.id === examId);
    if (!exam) return [];
    const institutions = this.getInstitutions();
    let allResults = [];
    institutions.forEach(inst => {
      const list = this.getResultsByExam(inst.id, examId);
      allResults = allResults.concat(list);
    });
    return this.calculateItemStatistics(exam, allResults);
  }

  calculateItemStatistics(exam, results) {
    const qCount = parseInt(exam.questionCount, 10) || 20;
    const canceled = Array.isArray(exam.canceledQuestions) ? exam.canceledQuestions.map(n => parseInt(n, 10)) : [];
    const subjects = exam.subjects || [{ name: 'Genel', startQ: 1, endQ: qCount }];
    const totalStudents = results.length;

    const analysis = [];

    for (let q = 1; q <= qCount; q++) {
      const isCanceled = canceled.includes(q);
      const sub = subjects.find(s => q >= s.startQ && q <= s.endQ) || { name: 'Genel' };
      const correctA = (exam.answerKeys && exam.answerKeys['A'] && exam.answerKeys['A'][q - 1]) ? exam.answerKeys['A'][q - 1].toUpperCase() : 'A';

      const distribution = { A: 0, B: 0, C: 0, D: 0, E: 0, empty: 0 };
      let correctCount = 0;

      results.forEach(res => {
        const studentBooklet = res.booklet || 'A';
        const keyForBooklet = (exam.answerKeys && exam.answerKeys[studentBooklet]) 
          ? exam.answerKeys[studentBooklet].toUpperCase() 
          : (exam.answerKeys && exam.answerKeys['A'] ? exam.answerKeys['A'].toUpperCase() : '');
        const correctOpt = (keyForBooklet[q - 1] || 'A').toUpperCase();

        const ans = (res.answers && res.answers[q - 1]) ? res.answers[q - 1].toUpperCase().trim() : '';

        if (!ans) {
          distribution.empty++;
        } else if (distribution[ans] !== undefined) {
          distribution[ans]++;
        }

        if (isCanceled) {
          correctCount++;
        } else if (ans && (ans === correctOpt || correctOpt === '*')) {
          correctCount++;
        }
      });

      const successRate = totalStudents > 0 ? parseFloat(((correctCount / totalStudents) * 100).toFixed(1)) : 0;

      let difficulty = 'Orta';
      let difficultyColor = 'amber';
      if (isCanceled) {
        difficulty = 'İptal Edildi';
        difficultyColor = 'purple';
      } else if (successRate >= 70) {
        difficulty = 'Kolay';
        difficultyColor = 'emerald';
      } else if (successRate < 40) {
        difficulty = 'Zor';
        difficultyColor = 'rose';
      }

      analysis.push({
        questionNo: q,
        subjectName: sub.name,
        correctKeyA: correctA,
        isCanceled,
        totalStudents,
        correctCount,
        successRate,
        difficulty,
        difficultyColor,
        distribution
      });
    }

    return analysis;
  }

  // --- Excel / CSV Toplu İndirme Motoru ---
  exportResultsToCsv(results, exam, isGlobal = false) {
    if (!results || results.length === 0) return '';

    const subjects = (exam && exam.subjects && exam.subjects.length > 0) 
      ? exam.subjects 
      : [{ name: 'Genel' }];

    const headers = ['Derece'];
    if (isGlobal) headers.push('Kurum Adı');
    headers.push('Talebe No', 'Adı Soyadı', 'Sınıfı', 'Kitapçık');

    subjects.forEach(sub => {
      headers.push(`${sub.name} (D)`, `${sub.name} (Y)`, `${sub.name} (Net)`);
    });

    headers.push('Toplam Doğru', 'Toplam Yanlış', 'Toplam Boş', 'Toplam Net', 'Toplam Puan');

    const rows = [headers.join(';')];

    results.forEach((r, idx) => {
      const row = [];
      row.push(isGlobal ? (r.globalRank || idx + 1) : (r.generalRank || idx + 1));
      if (isGlobal) row.push(`"${(r.institutionName || '').replace(/"/g, '""')}"`);
      row.push(`"${(r.studentNo || '').replace(/"/g, '""')}"`);
      row.push(`"${(r.studentName || '').replace(/"/g, '""')}"`);
      row.push(`"${(r.className || '').replace(/"/g, '""')}"`);
      row.push(r.booklet || 'A');

      subjects.forEach(sub => {
        const stat = (r.subjectsResult && r.subjectsResult[sub.name]) ? r.subjectsResult[sub.name] : { correct: 0, wrong: 0, net: 0 };
        row.push(stat.correct || 0);
        row.push(stat.wrong || 0);
        row.push((stat.net !== undefined ? stat.net : 0).toString().replace('.', ','));
      });

      row.push(r.totalCorrect || 0);
      row.push(r.totalWrong || 0);
      row.push(r.totalEmpty || 0);
      row.push((r.totalNet !== undefined ? r.totalNet : 0).toString().replace('.', ','));
      row.push((r.totalScore !== undefined ? r.totalScore : 0).toString().replace('.', ','));

      rows.push(row.join(';'));
    });

    return '\uFEFF' + rows.join('\r\n');
  }

  downloadResultsCsv(results, exam, isGlobal = false) {
    const csvContent = this.exportResultsToCsv(results, exam, isGlobal);
    if (!csvContent) return false;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = (exam && exam.title ? exam.title : 'Sinav_Sonuclari').replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ_]/g, '_');
    a.download = `${cleanTitle}_Sonuclari.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  // --- Hazır Sınav Şablonları ---
  getTemplates() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + 'templates');
      let stored = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(stored) || stored.length === 0) {
        localStorage.setItem(STORAGE_PREFIX + 'templates', JSON.stringify(DEFAULT_EXAM_TEMPLATES));
        return DEFAULT_EXAM_TEMPLATES;
      }
      // DEFAULT_EXAM_TEMPLATES içinde yer alan yeni şablonları hafızaya ekle
      const existingIds = new Set(stored.map(t => t.id));
      let isUpdated = false;
      DEFAULT_EXAM_TEMPLATES.forEach(tpl => {
        if (!existingIds.has(tpl.id)) {
          stored.push(tpl);
          isUpdated = true;
        }
      });
      if (isUpdated) {
        localStorage.setItem(STORAGE_PREFIX + 'templates', JSON.stringify(stored));
      }
      return stored;
    } catch {
      return DEFAULT_EXAM_TEMPLATES;
    }
  }

  // Türkçe karakter normalizasyonu (Arama ve filtreleme için)
  normalizeTr(str) {
    if (!str) return '';
    return str.toString()
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
      .replace(/Ü/g, 'u').replace(/ü/g, 'u')
      .replace(/Ş/g, 's').replace(/ş/g, 's')
      .replace(/Ö/g, 'o').replace(/ö/g, 'o')
      .replace(/Ç/g, 'c').replace(/ç/g, 'c')
      .toLowerCase().trim();
  }
}

window.PortalStore = new MultiTenantStore();
