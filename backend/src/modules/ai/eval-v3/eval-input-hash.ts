// Değerlendirme girdi özeti (input hash). Cache anahtarı DEĞİL, değişiklik tespiti:
// aşağıdakilerden biri değişirse hash değişir; eski cevap "aynı girdi" sanılmaz.
import { createHash } from 'crypto';

export interface EvalInputHashParts {
    controlVersion: number | string | null;
    controlTextHash: string;
    evidence: { id: string; checksum: string }[];
    evidenceTextHash: string | null;
    additionalNote: string | null;
    followUpQuestion: string | null;
    /** Modele iletilen kaynak birimleri (retrieval + seçili): id + sürüm + metin özeti. */
    sourceUnits: { unitId: string; versionId: string; textHash: string }[];
    regulationArticleIds: string[];
    knowledgeDocIds: string[];
    promptVersion: string;
    modelVersion: string;
    methodologyHash: string;
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

export function textChecksum(text: string | null | undefined): string {
    return sha(text ?? '').slice(0, 32);
}

export function computeEvalInputHash(p: EvalInputHashParts): string {
    const canonical = JSON.stringify({
        cv: p.controlVersion ?? null,
        ct: p.controlTextHash,
        ev: [...p.evidence].sort((a, b) => a.id.localeCompare(b.id)).map((e) => [e.id, e.checksum]),
        et: p.evidenceTextHash,
        an: (p.additionalNote ?? '').trim(),
        fq: (p.followUpQuestion ?? '').trim(),
        su: [...p.sourceUnits].sort((a, b) => a.unitId.localeCompare(b.unitId)).map((u) => [u.unitId, u.versionId, u.textHash]),
        ra: [...p.regulationArticleIds].sort(),
        kd: [...p.knowledgeDocIds].sort(),
        pv: p.promptVersion,
        mv: p.modelVersion,
        mh: p.methodologyHash,
    });
    return sha(canonical).slice(0, 32);
}
