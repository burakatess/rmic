// Testlerde kullanılan SENTETİK kaynak birimleri (gerçek rehber/mevzuat metni DEĞİLDİR).
import { RetrievedUnit } from './eval-v3.types';

export function unit(over: Partial<RetrievedUnit> & { unitId: string; unitCode: string }): RetrievedUnit {
    return {
        sourceId: 'src-guide', versionId: 'ver-1', sourceSlug: 'bilgi-ve-iletisim-guvenligi-rehberi',
        sourceName: 'Bilgi ve İletişim Güvenliği Rehberi', sourceKind: 'OFFICIAL_GUIDE', versionLabel: '1.1',
        title: 'Başlık', page: 10, text: 'Metin', textHash: 'hash', truncated: false,
        scopeStatus: 'IN_SCOPE', score: 0.8, rank: 1, method: 'HYBRID', origin: 'RETRIEVAL',
        ...over,
    };
}

export const U_TLS = unit({
    unitId: 'u-tls', unitCode: 'BIGR-3.2.9.1', title: 'İletişim kanallarında gizliliğin sağlanması', page: 87,
    text: 'Kurumlar, ağ üzerinden iletilen verinin gizliliğini sağlamak için şifreli iletişim protokolleri kullanır. Şifreleme yapılandırması belgelenir.',
});
export const U_LOG = unit({
    unitId: 'u-log', unitCode: 'BIGR-4.4.1', title: 'İz kayıtlarının merkezi olarak toplanması ve incelenmesi', page: 140,
    text: 'Sistem ve uygulama iz kayıtları merkezi bir kayıt yönetim sisteminde toplanır ve düzenli aralıklarla incelenir.',
});
export const U_PATCH = unit({
    unitId: 'u-patch', unitCode: 'BIGR-5.1.1', title: 'Yama ve güvenlik güncellemesi yönetimi', page: 170,
    text: 'Yazılım ve sistem bileşenleri için güvenlik güncellemeleri belirlenen sürelerde uygulanır; yaşam döngüsü sonu yazılımlar izlenir.',
});
export const U_REG = unit({
    unitId: 'u-reg', unitCode: 'md.9', title: 'Bilgi güvenliği politikası', page: null,
    sourceId: 'src-teblig', versionId: 'ver-t', sourceSlug: 'spk-bilgi-sistemleri-yonetimi-tebligi-vii-128-10',
    sourceName: 'Bilgi Sistemleri Yönetimine İlişkin Usul ve Esaslar Tebliği (VII-128.10)', sourceKind: 'REGULATION',
    versionLabel: '2025-03-13', scopeStatus: 'UNVERIFIED', text: 'Üst yönetim bilgi güvenliği politikasını onaylar.',
});

export function validV3(over: Record<string, unknown> = {}) {
    return {
        expectedState: 'Ağ iletişiminin şifreli protokollerle gerçekleştirilmesi beklenir.',
        evaluatedEvidence: [
            { evidenceId: 'E1', name: 'x', type: 'ekran görüntüsü', observation: 'Yapılandırma ekranı incelenmiştir.', limitations: 'Yalnız bir anı gösterir.' },
        ],
        controlResult: {
            status: 'INSUFFICIENT_EVIDENCE',
            text: 'İletilen kanıtlar incelendiğinde şifrelemenin uygulandığını gösteren bir kanıta rastlanmamıştır.',
        },
        references: [
            { refId: 'REF1', sourceType: 'OFFICIAL_GUIDE', sourceName: 'x', version: '1.1', articleNumber: 'BIGR-3.2.9.1',
              articleTitle: 'x', page: 87, sourceUnitId: 'u-tls', relation: 'Şifreli iletişim beklentisi ile ilişkilidir.', assessment: 'NEEDS_CONFIRMATION' },
        ],
        impact: 'İletişim gizliliğine yönelik olası bir risk bulunabilir.',
        recommendation: 'TLS yapılandırma çıktısı ve ağ trafiği örneği istenmelidir.',
        finding: { exists: false, title: '', explanation: '', relatedReferenceIds: [] },
        additionalEvidenceRequired: ['TLS yapılandırma çıktısı'],
        usedSourceUnitIds: ['u-tls'],
        reEvaluation: null,
        ...over,
    };
}
