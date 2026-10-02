// Otomatik kaynak taraması için saf yardımcılar: sorgu üretimi, Türkçe-duyarlı
// BM25 sözcük skoru, anlamsal skorla birleştirme (fusion), yeniden sıralama (rerank)
// ve eşik. DB/embedding çağrısı YOK — hepsi test edilebilir.

const STOPWORDS = new Set((
    'acaba ama ancak artık aslında bazı belki ben beri bile bir biri birkaç birçok biz bu buna bunda bundan bunu bunun ' +
    'çok çünkü da daha de defa diye dolayı en fakat gibi hem hep hepsi her hiç için ile ise kadar ki kim mi mı mu mü ' +
    'nasıl ne neden nerede niçin o olan olarak olarak oldu olduğu olması olan ona ondan onu onun oysa pek sadece sanki ' +
    'şey siz şu tüm ve veya ya yani yoksa ayrıca ilgili göre üzere sonra önce kadar tarafından içinde arasında ' +
    'edilmiştir edilmektedir yapılmıştır bulunmaktadır bulunmaktadır olup olmak olmadığı olduğunu vardır yoktur'
).split(/\s+/));

/** Bu alanda her metinde geçen, ayırt edici olmayan kökler (kök düzeyinde elenir). */
const STEM_STOP = new Set(['kontr', 'kurum', 'sağla', 'yapıl', 'edilm', 'gerçe', 'incel', 'bulun']);

export const tokenize = (text: string): string[] =>
    (text || '')
        .toLocaleLowerCase('tr')
        .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
        .split(/\s+/)
        .map((t) => t.replace(/^\.+|\.+$/g, ''))
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

/** Türkçe eklemeli yapıya karşı sabit-önek (F5) kökleme: ilk 5 harf. */
export const stem = (t: string): string => (t.length > 5 && !/\d/.test(t) ? t.slice(0, 5) : t);

/** "3.2.9.1" tarzı madde/tedbir numarası veya "md. 12" anmaları. */
export function extractCodeMentions(text: string): string[] {
    const out = new Set<string>();
    for (const m of (text || '').matchAll(/\b\d{1,2}(?:\.\d{1,3}){1,4}\b/g)) out.add(m[0]);
    for (const m of (text || '').matchAll(/\bmd\.?\s?(\d{1,3})\b/gi)) out.add(`md.${m[1]}`);
    return [...out];
}

export interface RetrievalQuery {
    /** Anlamsal arama için düz metin. */
    text: string;
    /** Sözcük araması için ağırlıklı kök terimler. */
    terms: { stem: string; weight: number }[];
    codeMentions: string[];
    controlStems: Set<string>;
}

export function buildRetrievalQuery(input: {
    controlName?: string | null;
    controlText: string;
    riskNames?: string[];
    evidenceText?: string | null;
    userNote?: string | null;
    followUp?: string | null;
    maxTerms?: number;
}): RetrievalQuery {
    const controlBlob = [input.controlName, input.controlText, ...(input.riskNames ?? [])].filter(Boolean).join('\n');
    const otherBlob = [input.evidenceText, input.userNote, input.followUp].filter(Boolean).join('\n');

    const freq = new Map<string, number>();
    const bump = (text: string, w: number) => {
        for (const tok of tokenize(text)) {
            const s = stem(tok);
            freq.set(s, (freq.get(s) ?? 0) + w);
        }
    };
    // Kontrol tanımı ve kullanıcı açıklaması, kanıt ham metninden daha belirleyici.
    bump(controlBlob, 3);
    bump([input.userNote, input.followUp].filter(Boolean).join('\n'), 3);
    bump(input.evidenceText ?? '', 1);

    const max = input.maxTerms ?? 40;
    const terms = [...freq.entries()]
        .filter(([s]) => !STEM_STOP.has(s))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, max)
        .map(([s, w]) => ({ stem: s, weight: w }));

    const controlStems = new Set(tokenize(controlBlob).map(stem));
    const text = [
        input.controlName, input.controlText,
        input.userNote, input.followUp,
        (input.evidenceText ?? '').slice(0, 1500),
    ].filter(Boolean).join('\n').slice(0, 3500);
    return { text, terms, codeMentions: extractCodeMentions(`${controlBlob}\n${otherBlob}`), controlStems };
}

export interface CandidateDoc {
    unitId: string;
    unitCode: string;
    title: string;
    text: string;
    /** Ek aranabilir metin (denetim sorusu vb.). */
    extra?: string | null;
}

export interface LexicalHit { unitId: string; score: number; matched: number }

/** BM25 (k1=1.2, b=0.75). Başlık ×3, kod ×2 ağırlık için alan tekrarı. */
export function bm25Score(query: RetrievalQuery, docs: CandidateDoc[]): Map<string, LexicalHit> {
    const k1 = 1.2, b = 0.75;
    const tokensOf = (d: CandidateDoc) => {
        const base = tokenize(`${d.title} ${d.title} ${d.title} ${d.unitCode} ${d.unitCode} ${d.text} ${d.extra ?? ''}`).map(stem);
        return base;
    };
    const docTokens = docs.map(tokensOf);
    const avgLen = docTokens.reduce((s, t) => s + t.length, 0) / Math.max(1, docTokens.length);
    const df = new Map<string, number>();
    for (const toks of docTokens) for (const s of new Set(toks)) df.set(s, (df.get(s) ?? 0) + 1);
    const N = docs.length;

    const hits = new Map<string, LexicalHit>();
    docs.forEach((d, i) => {
        const toks = docTokens[i];
        const tf = new Map<string, number>();
        for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
        let score = 0, matched = 0;
        for (const q of query.terms) {
            const f = tf.get(q.stem);
            if (!f) continue;
            matched++;
            const idf = Math.log(1 + (N - (df.get(q.stem) ?? 0) + 0.5) / ((df.get(q.stem) ?? 0) + 0.5));
            score += q.weight * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks.length) / Math.max(1, avgLen))));
        }
        if (score > 0) hits.set(d.unitId, { unitId: d.unitId, score, matched });
    });
    return hits;
}

export interface FusedCandidate {
    unitId: string;
    unitCode: string;
    title: string;
    lexical: number; // 0..1 normalize
    lexicalRaw: number;
    matched: number;
    semantic: number | null; // ham kosinüs
    fused: number;
    codeMention: boolean;
    method: 'HYBRID' | 'LEXICAL_ONLY' | 'SEMANTIC_ONLY';
    rank?: number;
}

export interface FusionOptions {
    minScore: number; // fused eşiği
    topK: number;
    lexicalWeight?: number;
}

/**
 * Sözcük + anlamsal skor birleştirme, sezgisel yeniden sıralama ve eşik.
 * Not: burada cross-encoder yok; "rerank" = kod anması / başlık-kontrol örtüşmesi
 * güçlendirmesi + eşik. Eşiği geçmeyen birim ASLA prompt'a girmez.
 */
export function fuseAndRank(
    query: RetrievalQuery,
    docs: CandidateDoc[],
    lexical: Map<string, LexicalHit>,
    semantic: Map<string, number> | null,
    opt: FusionOptions,
): FusedCandidate[] {
    const maxLex = Math.max(0, ...[...lexical.values()].map((h) => h.score));
    const lw = opt.lexicalWeight ?? 0.55;
    const out: FusedCandidate[] = [];
    for (const d of docs) {
        const lex = lexical.get(d.unitId);
        // Tek bir (genel) terim eşleşmesi tam skor almasın: kapsam çarpanı (3+ terim = tam).
        const lexNorm = lex && maxLex > 0 ? (lex.score / maxLex) * Math.min(1, lex.matched / 3) : 0;
        const sem = semantic?.get(d.unitId) ?? null;
        const semNorm = sem == null ? 0 : Math.min(1, Math.max(0, (sem - 0.2) / 0.6));
        const method: FusedCandidate['method'] =
            semantic == null ? 'LEXICAL_ONLY' : lex ? 'HYBRID' : 'SEMANTIC_ONLY';
        let fused = semantic == null ? lexNorm : lw * lexNorm + (1 - lw) * semNorm;

        const codeMention = query.codeMentions.some(
            (c) => c.toLowerCase() === d.unitCode.toLowerCase().replace(/^bigr-/, ''),
        );
        // Rerank: açık madde/tedbir anması ve başlık ↔ kontrol örtüşmesi.
        if (codeMention) fused += 0.2;
        const titleStems = tokenize(d.title).map(stem);
        const overlap = titleStems.filter((s) => query.controlStems.has(s)).length;
        if (overlap >= 2) fused += 0.06;

        // Alaka kapısı: en az 2 farklı sorgu kökü, ya da güçlü anlamsal benzerlik, ya da açık kod anması.
        const relevant = codeMention || (lex?.matched ?? 0) >= 2 || (sem ?? 0) >= 0.45;
        if (!relevant) continue;
        if (fused < opt.minScore) continue;
        out.push({
            unitId: d.unitId, unitCode: d.unitCode, title: d.title,
            lexical: lexNorm, lexicalRaw: lex?.score ?? 0, matched: lex?.matched ?? 0,
            semantic: sem, fused, codeMention, method,
        });
    }
    out.sort((a, b) => b.fused - a.fused || a.unitCode.localeCompare(b.unitCode, 'tr', { numeric: true }));
    return out.slice(0, opt.topK).map((c, i) => ({ ...c, rank: i + 1 }));
}
