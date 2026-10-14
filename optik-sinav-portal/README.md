# 📸 Optik Sınav Portalı (Çoklu Kurum Deneme Sınavı & Kamera ile Hızlı Okuma)

Bu proje; kurslar, medreseler, etüt merkezleri ve okullar için geliştirilmiş **tam bağımsız, çoklu kurumlu (Multi-Tenant) deneme sınavı ve telefondan optik form okuma platformudur**.

---

## 🌟 Öne Çıkan Özellikler

1. **👑 Süper Yönetici (Sistem Kurucusu) Paneli:**
   - Dilediğiniz kurs veya okula özel hesap (Kullanıcı adı ve şifre) açma.
   - Tüm kurumların talebe ve sınav istatistiklerini izleme.
   - Tek tıkla herhangi bir kursun paneline girip yardımcı olabilme.

2. **🏢 Kurs / Kurum Paneli:**
   - Her kurum yalnızca kendi talebelerini ve kendi sınavlarını görür.
   - Excel/CSV ile tek tıkla toplu talebe aktarma (`ogrenciler_sablon.csv`).
   - Soru sayısı (20, 40, 90 LGS vb.), ders katsayıları ve A/B kitapçığı cevap anahtarları girme.

3. **🖨️ A4 Optik Form Baskı Motoru:**
   - Talebelere özel (İsim, Okul No, Şube ve QR Kod basılı) tek tıkla A4 optik cevap kağıdı çıktısı.
   - Veya boş optik form çıktısı alma imkanı.
   - 4 köşe kamera hizalama nişanları ile yüksek okuma hassasiyeti.

4. **📱 Telefondan Canlı Kamera ile Optik Okuma:**
   - Telefon veya tablet kamerasını optik kağıda tutarak anında okuma.
   - QR kod ile öğrenciyi otomatik tanıma.
   - Anında doğru, yanlış, boş, net ve puan hesaplama.
   - Başarılı okumalarda sesli geri bildirim (Bip efekti).

5. **🏆 Neticeler, Derece Sıralaması & WhatsApp Karnesi:**
   - Okul geneli ve şube bazlı derece sıralaması.
   - Tek tıkla velinin telefonuna sınav karne mesajı gönderme.

---

## 🚀 Canlıya Alma (Vercel & GitHub ile 1 Dakikada Yayınlama)

1. [GitHub](https://github.com/new) üzerinde `optik-sinav` adında yeni bir boş repository (depo) oluşturun.
2. Bu `optik-sinav-portal` klasöründeki dosyaları sürükleyip GitHub'a yükleyin.
3. [Vercel](https://vercel.com) panelinizden bu depoyu seçip **Deploy** butonuna basın.
4. Yeni web adresiniz (Örn: `optik-sinav.vercel.app`) anında yayına girecektir.

---

## 🔑 Varsayılan Giriş Bilgileri

* **👑 Ana Süper Yönetici (Siz):**
  - Kullanıcı Adı: `admin`
  - Şifre: `123`

* **🏢 Örnek Kurs Hesabı:**
  - Kullanıcı Adı: `oay`
  - Şifre: `123`
