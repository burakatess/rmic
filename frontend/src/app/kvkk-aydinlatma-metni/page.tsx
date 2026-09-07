import Link from 'next/link';

export const metadata = {
  title: 'KVKK Aydınlatma Metni | RMIC GRC',
  robots: { index: false, follow: false },
};

export default function KvkkAydinlatmaMetniPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/login" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
          ← Girişe dön
        </Link>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 mt-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">KVKK Aydınlatma Metni</h1>
          <p className="text-sm text-slate-500 mt-1">
            6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında
          </p>

          <div className="mt-8 space-y-7 text-sm leading-relaxed text-slate-700">
            <section>
              <h2 className="text-base font-semibold text-slate-900 mb-2">1. Veri Sorumlusu</h2>
              <p>
                Bu platform (&quot;RMIC GRC&quot;), kurumunuz bünyesinde risk yönetimi, iç kontrol,
                denetim ve mevzuat uyum süreçlerini yürütmek amacıyla kullanılmaktadır. Veri
                sorumlusu, platformu işleten kurumun kendisidir.
                <span className="block text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  Yer tutucu metin — kurum unvanı, adresi ve iletişim bilgileri hukuk/uyum
                  ekibi tarafından doldurulmalıdır.
                </span>
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-slate-900 mb-2">2. İşlenen Kişisel Veri Kategorileri</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Kimlik bilgileri (ad, soyad)</li>
                <li>İletişim bilgileri (kurumsal e-posta adresi)</li>
                <li>Çalışan bilgileri (departman/direktörlük, rol)</li>
                <li>İşlem güvenliği bilgileri (giriş/çıkış zamanı, oturum ve denetim izi kayıtları)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-slate-900 mb-2">3. İşleme Amaçları</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Kurum içi risk, kontrol, denetim ve aksiyon takibi süreçlerinin yürütülmesi</li>
                <li>Yetkilendirme ve erişim kontrolünün sağlanması (rol bazlı erişim)</li>
                <li>SPK VII-128.10 ve CBDDO BİG Rehberi gibi mevzuat uyum yükümlülüklerinin yerine getirilmesi</li>
                <li>Denetim izi (audit trail) oluşturulması ve bilgi güvenliği olaylarının izlenmesi</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-slate-900 mb-2">4. Hukuki Sebep</h2>
              <p>
                Kişisel verileriniz, KVKK m. 5/2 kapsamında bir sözleşmenin kurulması veya
                ifasıyla doğrudan ilgili olması, veri sorumlusunun hukuki yükümlülüğünü yerine
                getirebilmesi ve meşru menfaat hukuki sebeplerine dayanılarak işlenmektedir.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-slate-900 mb-2">5. Saklama Süresi</h2>
              <p>
                Kişisel verileriniz, ilgili mevzuatta öngörülen süreler ve kurumun saklama
                politikası boyunca muhafaza edilir; bu sürenin sonunda silinir, yok edilir
                veya anonim hale getirilir.
                <span className="block text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  Yer tutucu — kurumun somut saklama/imha politikasına göre süre belirtilmelidir.
                </span>
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-slate-900 mb-2">6. İlgili Kişi Hakları (KVKK m. 11)</h2>
              <p>
                KVKK&apos;nın 11. maddesi uyarınca kişisel verinizin işlenip işlenmediğini
                öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına
                uygun kullanılıp kullanılmadığını öğrenme, düzeltilmesini veya silinmesini
                isteme haklarına sahipsiniz. Bu haklarınızı kullanmak için kurumunuzun veri
                sorumlusu/uyum birimine başvurabilirsiniz.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
