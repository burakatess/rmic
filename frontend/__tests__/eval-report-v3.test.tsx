import { render, screen, fireEvent, within } from '@testing-library/react';
import { EvalReportV3 } from '@/components/ai/EvalReportV3';
import type { EvalOutputV3, EvalV3Reference, EvalV3Status } from '@/types/ai';

const ref1: EvalV3Reference = {
    refId: 'R1',
    sourceType: 'REGULATION',
    sourceName: 'BDDK Bilgi Sistemleri Yönetmeliği',
    version: 'v2020.1',
    articleNumber: 'md. 12',
    articleTitle: 'Erişim yönetimi',
    page: 7,
    sourceUnitId: 'u1',
    relation: 'Erişim haklarının periyodik gözden geçirilmesini şart koşar.',
    assessment: 'NON_COMPLIANT',
    snapshotText: 'Erişim yetkileri en az yılda bir kez gözden geçirilir.',
    retrievalScore: 0.8123,
    retrievalRank: 1,
    retrievalMethod: 'HYBRID',
    bindingNote: 'Bu hüküm bağlayıcıdır.',
};
const ref2: EvalV3Reference = {
    ...ref1, refId: 'R2', sourceType: 'OFFICIAL_GUIDE', sourceName: 'BTK Rehberi', articleNumber: 'T-4',
    assessment: 'RELEVANT', page: null, bindingNote: null,
};

const base: EvalOutputV3 = {
    expectedState: 'Erişim hakları yılda bir gözden geçirilir.',
    evaluatedEvidence: [
        { evidenceId: 'E1', name: 'erisim-listesi.xlsx', type: 'Excel', observation: 'Liste 2024 tarihli.', limitations: 'Yalnız bir sayfa okundu.', used: true },
        { evidenceId: 'E2', name: 'eski.pdf', type: 'PDF', observation: 'İlgisiz.', limitations: 'Yok.', used: false },
        { evidenceId: 'E3', name: 'bozuk.docx', type: 'Word', observation: '—', limitations: 'Dosya açılamadı.', used: false, readStatus: 'FAILED' },
    ],
    controlResult: { status: 'NON_COMPLIANT', text: 'Gözden geçirme yapılmamıştır.' },
    references: [ref1, ref2],
    impact: 'Yetkisiz erişim riski.',
    recommendation: 'Periyodik gözden geçirme yapılmalı.',
    finding: { exists: true, title: 'Gözden geçirme eksik', explanation: 'Kanıt yok.', relatedReferenceIds: ['R1'] },
    additionalEvidenceRequired: ['Onaylı gözden geçirme tutanağı'],
    usedSourceUnitIds: ['u1'],
};

const make = (over: Partial<EvalOutputV3> = {}): EvalOutputV3 => ({ ...base, ...over });

describe('EvalReportV3', () => {
    it('renders seven numbered sections in order', () => {
        render(<EvalReportV3 e={make()} />);
        const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
        expect(titles).toEqual([
            '1Beklenen Durum',
            '2Değerlendirmeye Alınan Kanıtlar',
            '3Kontrol Sonucu',
            '4İlişkili Mevzuat ve Rehber Maddeleri',
            '5Etki',
            '6Öneri',
            '7Bulguya İlişkin Açıklama / Değerlendirme',
        ]);
    });

    it('does not render the legacy four-column requirement table', () => {
        render(<EvalReportV3 e={make()} />);
        for (const h of ['Gereklilik', 'Uygulanabilirlik', 'Sonuç', 'Gerekçe / kanıt']) {
            expect(screen.queryByText(h)).not.toBeInTheDocument();
        }
        expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it.each<[EvalV3Status, string, string]>([
        ['COMPLIANT', 'Uyumlu', 'check'],
        ['PARTIALLY_COMPLIANT', 'Kısmen uyumlu', 'half'],
        ['NON_COMPLIANT', 'Uyumsuz', 'cross'],
        ['INSUFFICIENT_EVIDENCE', 'Yetersiz kanıt', 'question'],
    ])('shows status text and icon for %s', (status, label, icon) => {
        render(<EvalReportV3 e={make({ controlResult: { status, text: 'Açıklama' } })} />);
        const box = screen.getByTestId('eval-v3-status');
        expect(within(box).getByText(label)).toBeInTheDocument();
        expect(within(box).getByTestId(`status-icon-${status}`)).toHaveAttribute('data-icon', icon);
        expect(screen.getByText('Açıklama')).toBeInTheDocument();
    });

    it('shows additional evidence needs and re-evaluation box', () => {
        render(<EvalReportV3 e={make({ reEvaluation: { changed: true, changedPoints: ['Sonuç değişti'], unchangedPoints: ['Kanıt aynı'], explanation: 'Yeni açıklama eklendi.' } })} />);
        expect(screen.getByText('Ek kanıt ihtiyacı')).toBeInTheDocument();
        expect(screen.getByText('Onaylı gözden geçirme tutanağı')).toBeInTheDocument();
        const box = screen.getByTestId('eval-v3-reeval');
        expect(within(box).getByText('Önceki değerlendirmeye göre')).toBeInTheDocument();
        expect(within(box).getByText('Sonuç değişti')).toBeInTheDocument();
        expect(within(box).getByText('Kanıt aynı')).toBeInTheDocument();
    });

    it('shows used / not used / unreadable evidence badges and evidence fields', () => {
        render(<EvalReportV3 e={make()} />);
        expect(screen.getByText('erisim-listesi.xlsx')).toBeInTheDocument();
        expect(screen.getAllByText('Kullanıldı')).toHaveLength(1);
        expect(screen.getAllByText('Kullanılmadı')).toHaveLength(2);
        expect(screen.getAllByText('Okunamadı')).toHaveLength(1);
        expect(screen.getAllByText('Modelin değerlendirmeye aldığı husus')).toHaveLength(3);
        expect(screen.getAllByText('Kanıt kısıtı')).toHaveLength(3);
        expect(screen.getByText('Yalnız bir sayfa okundu.')).toBeInTheDocument();
    });

    it('lists references with source-type and assessment badges', () => {
        render(<EvalReportV3 e={make()} />);
        const list = screen.getByTestId('eval-v3-reference-list');
        expect(within(list).getByText('Mevzuat')).toBeInTheDocument();
        expect(within(list).getByText('Resmî Rehber')).toBeInTheDocument();
        expect(within(list).getByText('Uyumsuz')).toBeInTheDocument();
        expect(within(list).getByText('İlişkili')).toBeInTheDocument();
        expect(within(list).getAllByText('Kaynak detayını aç')).toHaveLength(2);
    });

    it('opens the source modal when clicking the article number', () => {
        render(<EvalReportV3 e={make()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'md. 12' }));
        const dlg = screen.getByRole('dialog');
        expect(within(dlg).getAllByText('BDDK Bilgi Sistemleri Yönetmeliği').length).toBeGreaterThan(0);
        expect(within(dlg).getByText('v2020.1')).toBeInTheDocument();
        expect(within(dlg).getByText('md. 12')).toBeInTheDocument();
        expect(within(dlg).getByText('Erişim yönetimi')).toBeInTheDocument();
        expect(within(dlg).getByText('7')).toBeInTheDocument();
        expect(within(dlg).getByText('Neden kullanıldı')).toBeInTheDocument();
        expect(within(dlg).getByText(ref1.relation)).toBeInTheDocument();
        expect(within(dlg).getByText('Değerlendirme anındaki kaynak metni')).toBeInTheDocument();
        expect(within(dlg).getByText(ref1.snapshotText!)).toBeInTheDocument();
        expect(within(dlg).getByText(/Bu hüküm bağlayıcıdır/)).toBeInTheDocument();
        expect(within(dlg).getByText(/skor 0\.812/)).toBeInTheDocument();
        fireEvent.click(within(dlg).getByRole('button', { name: 'Kapat' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens the source modal from the "Kaynak detayını aç" action', () => {
        render(<EvalReportV3 e={make()} />);
        fireEvent.click(within(screen.getByTestId('eval-v3-reference-list')).getAllByText('Kaynak detayını aç')[1]);
        const dlg = screen.getByRole('dialog');
        expect(within(dlg).getByText('T-4')).toBeInTheDocument();
        expect(within(dlg).queryByText('Sayfa')).not.toBeInTheDocument();
    });

    it('shows scope notes above the references', () => {
        render(<EvalReportV3 e={make({ scopeNotes: ['Yalnız 2020 sürümü incelendi.'] })} />);
        expect(screen.getByTestId('eval-v3-scope-notes')).toHaveTextContent('Yalnız 2020 sürümü incelendi.');
    });

    it('shows the fixed sentence when there are no references', () => {
        render(<EvalReportV3 e={make({ references: [], finding: { exists: false, title: '', explanation: '', relatedReferenceIds: [] } })} />);
        expect(screen.getByTestId('eval-v3-no-refs')).toHaveTextContent(
            'İncelenen kaynaklarda mevcut kanıtla doğrudan ilişkilendirilebilen bir hüküm tespit edilememiştir.',
        );
        expect(screen.queryByTestId('eval-v3-reference-list')).not.toBeInTheDocument();
    });

    it('prefers referencesNote when provided', () => {
        render(<EvalReportV3 e={make({ references: [], referencesNote: 'Özel not.' })} />);
        expect(screen.getByTestId('eval-v3-no-refs')).toHaveTextContent('Özel not.');
    });

    it('shows "Bulgu tespit edilmemiştir." when finding does not exist', () => {
        render(<EvalReportV3 reviewable onReview={jest.fn()} e={make({ finding: { exists: false, title: '', explanation: '', relatedReferenceIds: [] } })} />);
        expect(screen.getByText('Bulgu tespit edilmemiştir.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Kabul et' })).not.toBeInTheDocument();
    });

    it('shows related reference chips and review buttons that call onReview', () => {
        const onReview = jest.fn();
        render(<EvalReportV3 e={make()} reviewable onReview={onReview} />);
        const chips = screen.getByTestId('eval-v3-finding-refs');
        expect(within(chips).getByRole('button', { name: /BDDK Bilgi Sistemleri Yönetmeliği md\. 12/ })).toBeInTheDocument();
        expect(within(chips).queryByText(/BTK Rehberi/)).not.toBeInTheDocument();
        fireEvent.click(within(chips).getByRole('button', { name: /md\. 12/ }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));

        fireEvent.click(screen.getByRole('button', { name: 'Kabul et' }));
        expect(onReview).toHaveBeenCalledWith('ACCEPTED');

        fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
        const confirm = screen.getByRole('button', { name: 'Reddi onayla' });
        expect(confirm).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/Reddetme gerekçesi/), { target: { value: ' Yanlış tespit ' } });
        fireEvent.click(confirm);
        expect(onReview).toHaveBeenLastCalledWith('REJECTED', 'Yanlış tespit');
    });

    it('hides review buttons when not reviewable and shows current review status', () => {
        render(<EvalReportV3 e={make({ finding: { ...base.finding, _review: { status: 'REJECTED', reason: 'Yanlış' } } })} />);
        expect(screen.queryByRole('button', { name: 'Kabul et' })).not.toBeInTheDocument();
        expect(screen.getByText('Reddedildi')).toBeInTheDocument();
    });

    it('keeps rejectedReferences out of the normal reference list', () => {
        render(<EvalReportV3 e={make({ rejectedReferences: [{ refId: 'X', claimed: 'HAYALİ-md. 99', reason: 'Kaynakta bulunamadı' }] })} />);
        const list = screen.getByTestId('eval-v3-reference-list');
        expect(within(list).queryByText(/HAYALİ/)).not.toBeInTheDocument();
        expect(within(list).getAllByRole('listitem')).toHaveLength(2);
        const details = screen.getByTestId('eval-v3-rejected-refs');
        expect(details.tagName).toBe('DETAILS');
        expect(within(details).getByText('Doğrulanamayan atıflar (1)')).toBeInTheDocument();
        expect(within(details).getByText(/HAYALİ-md\. 99/)).toBeInTheDocument();
        expect(within(details).getByText(/Kaynakta bulunamadı/)).toBeInTheDocument();
    });

    it('does not render the rejected-references block when empty', () => {
        render(<EvalReportV3 e={make({ rejectedReferences: [] })} />);
        expect(screen.queryByTestId('eval-v3-rejected-refs')).not.toBeInTheDocument();
    });

    it('renders the retrieval note strip', () => {
        render(
            <EvalReportV3
                e={make()}
                retrievalNote={{
                    method: 'LEXICAL_ONLY', semanticUsed: false, semanticUnavailableReason: 'Embedding servisi kapalı',
                    poolSize: 20, thresholds: { minScore: 0.1, topK: 8 }, candidates: [], selectedByUser: [],
                    sentUnitIds: ['a', 'b', 'c'], notes: [], unchangedInput: true,
                }}
            />,
        );
        const strip = screen.getByTestId('eval-v3-retrieval');
        expect(strip).toHaveTextContent('Otomatik kaynak taraması: yalnız sözcüksel tarama, 3 birim gönderildi');
        expect(strip).toHaveTextContent('Embedding servisi kapalı');
        expect(strip).toHaveTextContent('Girdi önceki değerlendirmeyle aynı');
    });
});
