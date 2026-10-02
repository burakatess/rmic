// AI modülü — çalışma zamanı yapılandırması. Kod tabanının geneli gibi doğrudan
// process.env okur (bkz. PrismaService). Tek değişiklik noktası: backend/.env

export const AI_PROMPT_VERSION = '2026-09-08.1';

// Kontrol & Kanıt Değerlendirme — yapılandırılmış çıktı şemasının sürümü.
// Şema değişince BUMP et; eski AiEvalMessage kayıtları kendi sürümleriyle kalır,
// FE eski/yeni kartı schemaVersion'a göre seçer (geriye dönük veri taşıma yok).
export const EVAL_OUTPUT_SCHEMA_VERSION = '2026-09-10.1';
// Bu şema sürümünü üreten prompt şablonunun sürümü (denetim izinde saklanır).
export const EVAL_PROMPT_VERSION = '2026-09-10.1';

// Kontrol & Kanıt Değerlendirme v3 — denetim metodolojisine uygun yedi bölümlü,
// doğrulanmış JSON çıktı (Gereklilik/Uygulanabilirlik/Sonuç/Gerekçe tablosu YOK).
// Eski v2 kayıtları kendi schemaVersion'ıyla açılmaya devam eder (salt-okunur).
export const EVAL_V3_SCHEMA_VERSION = 'eval-v3.1';
export const EVAL_V3_PROMPT_VERSION = '2026-09-21.2';

export type AiTier = 'heavy' | 'light' | 'vision';

export interface AiRuntimeConfig {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    models: Record<AiTier, string>;
    embedModel: string;
    /** Kontrol & Kanıt Değerlendirme için özel model. Boşsa görsel→VISION, sonra HEAVY. */
    evalModel: string | null;
    maxTokens: number;
    timeoutMs: number;
}

export function loadAiConfig(): AiRuntimeConfig {
    const apiKey = (process.env.AI_API_KEY || '').trim();
    const flag = (process.env.AI_ENABLED || 'false').toLowerCase() === 'true';
    return {
        enabled: flag && apiKey.length > 0,
        baseUrl: (process.env.AI_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
        apiKey,
        models: {
            // Doğrulanmış ID'ler (GET /v1/models, Eylül 2026). Ultra-550b çok güçlü
            // ama ücretsiz katmanda çok yavaş (basit istek ~70sn); "super" dengeli.
            heavy: process.env.AI_HEAVY_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
            light: process.env.AI_LIGHT_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b',
            vision: process.env.AI_VISION_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
        },
        embedModel: process.env.AI_EMBED_MODEL || 'nvidia/nemotron-3-embed-1b',
        evalModel: (process.env.AI_EVAL_MODEL || '').trim() || null,
        maxTokens: Number(process.env.AI_MAX_TOKENS || 4096),
        timeoutMs: Number(process.env.AI_TIMEOUT_MS || 180000),
    };
}

// Kontrol testi asistanı çağrılarını yürütebilen roller — test iş akışıyla aynı
// (bkz. controls.controller.ts startTest / completeTest).
export const AI_TEST_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR'] as const;

// 2. kontrolcü inceleme copilot'u — onay verebilen roller (bkz. approveTest).
export const AI_REVIEW_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER'] as const;

// Doğal dil sorgu — salt okunur özet veri; geniş erişim.
export const AI_QUERY_ROLES = [
    'SYSTEM_ADMIN',
    'RISK_CONTROL_MANAGER',
    'AUDITOR',
    'RISK_ANALYST',
    'IKS_MANAGER',
    'IKS_EMPLOYEE',
] as const;

// Kontrol & Kanıt Değerlendirme — kontrol/kanıt inceleyebilen roller.
export const AI_EVAL_ROLES = ['SYSTEM_ADMIN', 'RISK_CONTROL_MANAGER', 'AUDITOR', 'IKS_MANAGER'] as const;
