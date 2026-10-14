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
    name: 'LGS Tam Deneme (90 Soru)',
    questionCount: 90,
    bookletTypes: ['A', 'B'],
    subjects: [
      { name: 'Türkçe', startQ: 1, endQ: 20, wrongPenalty: 0.333, coeff: 4 },
      { name: 'T.C. İnkılap', startQ: 21, endQ: 30, wrongPenalty: 0.333, coeff: 1 },
      { name: 'Din Kültürü', startQ: 31, endQ: 40, wrongPenalty: 0.333, coeff: 1 },
      { name: 'İngilizce', startQ: 41, endQ: 50, wrongPenalty: 0.333, coeff: 1 },
      { name: 'Matematik', startQ: 51, endQ: 70, wrongPenalty: 0.333, coeff: 4 },
      { name: 'Fen Bilimleri', startQ: 71, endQ: 90, wrongPenalty: 0.333, coeff: 4 }
    ]
  },
  {
    id: 'tpl_brans_20',
    name: 'Branş Tarama Testi (20 Soru)',
    questionCount: 20,
    bookletTypes: ['A', 'B'],
    subjects: [
      { name: 'Genel Değerlendirme', startQ: 1, endQ: 20, wrongPenalty: 0.333, coeff: 5 }
    ]
  },
  {
    id: 'tpl_ara_40',
    name: 'Konu Tarama Sınavı (40 Soru)',
    questionCount: 40,
    bookletTypes: ['A', 'B'],
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
    // Kurumlar listesi kontrolü
    if (!localStorage.getItem(STORAGE_PREFIX + 'institutions')) {
      localStorage.setItem(STORAGE_PREFIX + 'institutions', JSON.stringify(DEFAULT_INSTITUTIONS));
    }
    // Sınav şablonları kontrolü
    if (!localStorage.getItem(STORAGE_PREFIX + 'templates')) {
      localStorage.setItem(STORAGE_PREFIX + 'templates', JSON.stringify(DEFAULT_EXAM_TEMPLATES));
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

  logout() {
    sessionStorage.removeItem(STORAGE_PREFIX + 'session');
    localStorage.removeItem(STORAGE_PREFIX + 'session');
  }

  login(usernameInput, passwordInput) {
    const u = (usernameInput || '').trim().toLowerCase();
    const p = (passwordInput || '').trim();

    // 1. Süper Yönetici Kontrolü
    if (u === DEFAULT_SUPERADMIN.username && p === DEFAULT_SUPERADMIN.password) {
      const session = {
        role: 'superadmin',
        userId: DEFAULT_SUPERADMIN.id,
        name: DEFAULT_SUPERADMIN.name,
        institutionId: null,
        institutionName: 'Tüm Kurumlar (Merkez)'
      };
      this.setSession(session);
      return { success: true, session };
    }

    // 2. Kurs / Kurum Yöneticisi Kontrolü
    const institutions = this.getInstitutions();
    const matchedInst = institutions.find(inst => {
      const instU = (inst.username || '').toLowerCase().trim();
      const instP = (inst.password || '').toString().trim();
      return instU === u && instP === p;
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

  // Excel / CSV metninden toplu talebe içe aktarma
  importStudentsCsv(instId, csvText) {
    if (!csvText || typeof csvText !== 'string') return { success: false, message: 'Geçersiz dosya.' };
    const cleanText = csvText.replace(/^\uFEFF/, '').trim();
    const lines = cleanText.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return { success: false, message: 'Dosya boş.' };

    const delimiter = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');
    const currentList = this.getStudents(instId);
    const studentMap = new Map();
    currentList.forEach(s => studentMap.set(s.studentNo || s.id, s));

    let addedCount = 0;
    const startIdx = lines[0].toLowerCase().includes('no') || lines[0].toLowerCase().includes('ad') ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 2) {
        const sNo = parts[0] || (Date.now() + '_' + i);
        let fn = '';
        let ln = '';
        let cName = '8-A';
        let phone = '';
        let notes = '';

        if (parts.length >= 3) {
          fn = (parts[1] || '').toUpperCase();
          ln = (parts[2] || '').toUpperCase();
          cName = (parts[3] || '8-A').toUpperCase();
          phone = parts[4] || '';
          notes = parts[5] || '';
        } else {
          const names = (parts[1] || '').split(' ');
          ln = (names.pop() || '').toUpperCase();
          fn = (names.join(' ') || parts[1]).toUpperCase();
        }

        const stObj = {
          id: 'st_' + sNo,
          studentNo: sNo,
          firstName: fn,
          lastName: ln,
          className: cName,
          parentPhone: phone,
          notes: notes,
          updatedAt: new Date().toISOString()
        };

        studentMap.set(sNo, stObj);
        addedCount++;
      }
    }

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

  // --- Kurum Bazlı Sınav İşlemleri ---
  getExams(instId) {
    if (!instId) return [];
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + instId + '_exams');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
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
    const list = this.getExams(instId);
    const newExam = {
      id: 'ex_' + Date.now(),
      title: (examData.title || 'Deneme Sınavı').trim(),
      examDate: examData.examDate || new Date().toISOString().split('T')[0],
      targetClass: (examData.targetClass || 'TÜM SINIFLAR').trim().toUpperCase(),
      questionCount: parseInt(examData.questionCount, 10) || 20,
      bookletTypes: examData.bookletTypes || ['A', 'B'],
      subjects: examData.subjects || [
        { name: 'Genel', startQ: 1, endQ: parseInt(examData.questionCount, 10) || 20, wrongPenalty: 0.333, coeff: 1 }
      ],
      answerKeys: examData.answerKeys || { 'A': '', 'B': '' },
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

  deleteExam(instId, examId) {
    let list = this.getExams(instId).filter(e => e.id !== examId);
    this.saveExams(instId, list);
    // Sınavın neticelerini de temizle
    const allResults = this.getAllResults(instId);
    const filtered = allResults.filter(r => r.examId !== examId);
    this.saveAllResults(instId, filtered);
    if (window.CloudSync && typeof window.CloudSync.deleteExam === 'function') {
      window.CloudSync.deleteExam(instId, examId);
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

  // --- Hazır Sınav Şablonları ---
  getTemplates() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + 'templates');
      return raw ? JSON.parse(raw) : DEFAULT_EXAM_TEMPLATES;
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
