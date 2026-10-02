// Sistem kaynağı A — Kurumsal Denetim ve Kontrol Sonucu Yazım Metodolojisi.
// Bu metin (1) import script'i ile Source/SourceVersion olarak DB'ye alınır,
// (2) DB'de henüz yoksa Kontrol & Kanıt Değerlendirme prompt'unda doğrudan
// GÜVENİLİR sistem talimatı olarak kullanılır (bkz. ai/prompts/eval-v3.ts).
// Metni değiştirmek = yeni sürüm demektir: METHODOLOGY_VERSION artırılmalıdır.

import { createHash } from 'crypto';

export const METHODOLOGY_SLUG = 'kurumsal-denetim-kontrol-sonucu-yazim-metodolojisi';
export const METHODOLOGY_TITLE = 'Kurumsal Denetim ve Kontrol Sonucu Yazım Metodolojisi';
export const METHODOLOGY_VERSION = '1.0';

export const METHODOLOGY_TEXT = `Kurumsal Denetim ve Kontrol Sonucu Yazım Metodolojisi

Bu yazım yöntemi, gerçekleştirilen kontrol ve denetim çalışmalarının sonuçlarının nesnel, kanıta dayalı, teknik ve standartlaştırılmış bir denetim diliyle raporlanmasını esas alır.

Metodolojinin temel kurgusu:

İnceleme/Kontrol → Kanıt → Gözlem → Sonuç

Metinlerde denetçinin kişisel değerlendirmesi yerine, gerçekleştirilen inceleme sonucunda kanıtlarla doğrulanabilen mevcut durum aktarılır.

‘Düşünüyoruz’, ‘yetersizdir’, ‘hatalıdır’, ‘kesinlikle uyumsuzdur’ gibi öznel veya kanıt sınırını aşan ifadelerden kaçınılır.

Bunun yerine:

- görülmüştür
- tespit edilmiştir
- anlaşılmıştır
- doğrulanmıştır
- doğrulanamamıştır
- kanıta rastlanmamıştır

gibi nesnel ve edilgen ifadeler kullanılır.

Standart kontrol sonucu yapısı:

Kontrol Sonucu:
[Yapılan inceleme ve kapsam]
+
[İncelenen sistem, kayıt veya kanıt]
+
[Kanıtla doğrulanan mevcut durum]
+
[görülmüştür / tespit edilmiştir / anlaşılmıştır]

Kanıtın gösterdiğinden daha ileri bir sonuca ulaşılmaz.

Örneğin kanıt yalnızca şifrelemenin doğrulanamadığını gösteriyorsa:

‘İletişim açık metindir.’

denilmez.

Bunun yerine:

‘İletişimin şifreli olarak gerçekleştirildiği doğrulanamamıştır.’

veya:

‘İncelenen ağ trafiğinde iletişimin gizliliğinin sağlandığını gösteren bir kanıta rastlanmamıştır.’

ifadesi kullanılır.

Mevzuat hükmü, incelenen kanıt, denetim tespiti ve birim cevabı birbirine karıştırılmaz.

Bir bulgu ancak yeterli ve ilişkili kanıt bulunması halinde oluşturulur. Kanıtın yetersiz olduğu durumda uyumsuzluk varsayılmaz; ek kanıt ihtiyacı belirtilir.`;

/** Metnin içerik özeti — sürüm/girdi hash'lerinde ve import idempotency'sinde kullanılır. */
export const METHODOLOGY_HASH = createHash('sha256').update(METHODOLOGY_TEXT).digest('hex').slice(0, 32);
