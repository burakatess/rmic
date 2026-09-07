import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiRuntimeConfig, AiTier, loadAiConfig } from './ai.constants';

export interface AiImagePart {
    mimeType: string;
    dataBase64: string;
}

export interface AiChatRequest {
    tier: AiTier;
    /** tier yerine bu model kullanılır (ör. AI_EVAL_MODEL). */
    modelOverride?: string | null;
    system?: string;
    user: string;
    images?: AiImagePart[];
    /** Nemotron muhakeme modu. Yalnızca yargı gerektiren çağrılarda. */
    reasoning?: boolean;
    /** JSON nesne çıktısı iste + yanıtı ayrıştır. */
    json?: boolean;
    maxTokens?: number;
    temperature?: number;
}

export interface AiChatResponse {
    text: string;
    parsed?: unknown;
    model: string;
    tier: AiTier;
    tokensIn?: number;
    tokensOut?: number;
    latencyMs: number;
}

/**
 * OpenAI-uyumlu tek istemci. NVIDIA NIM (integrate.api.nvidia.com/v1) varsayılan,
 * ama AI_BASE_URL ile kurum içi NIM'e de yönlendirilebilir — kod değişmez.
 */
@Injectable()
export class AiProviderService {
    private readonly logger = new Logger('AiProvider');
    private cfg: AiRuntimeConfig = loadAiConfig();

    /** .env değişmişse (test/geliştirme) yeniden oku. */
    reload(): AiRuntimeConfig {
        this.cfg = loadAiConfig();
        return this.cfg;
    }

    get config(): AiRuntimeConfig {
        return this.cfg;
    }

    isEnabled(): boolean {
        return this.cfg.enabled;
    }

    /** Sağlayıcının canlı model listesi — /v1/models. Model ID'lerini doğrulamak için. */
    async listModels(): Promise<string[]> {
        this.assertEnabled();
        const res = await fetch(`${this.cfg.baseUrl}/models`, {
            headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
        });
        if (!res.ok) {
            throw new ServiceUnavailableException(`Model listesi alınamadı (HTTP ${res.status})`);
        }
        const body = await res.json();
        return ((body.data as { id: string }[]) || []).map((m) => m.id).sort();
    }

    async chat(req: AiChatRequest): Promise<AiChatResponse> {
        this.assertEnabled();
        const model = req.modelOverride?.trim() || this.cfg.models[req.tier];
        const started = Date.now();

        const userContent: unknown = req.images?.length
            ? [
                  { type: 'text', text: req.user },
                  ...req.images.map((im) => ({
                      type: 'image_url',
                      image_url: { url: `data:${im.mimeType};base64,${im.dataBase64}` },
                  })),
              ]
            : req.user;

        const messages: unknown[] = [];
        if (req.system?.trim()) messages.push({ role: 'system', content: req.system.trim() });
        messages.push({ role: 'user', content: userContent });

        const body: Record<string, unknown> = {
            model,
            messages,
            temperature: req.temperature ?? 0.2,
            max_tokens: req.maxTokens ?? this.cfg.maxTokens,
            // Nemotron 3 muhakeme anahtarı (bkz. build.nvidia.com örnek kodu).
            // Desteklemeyen modeller bu template kwarg'ını yok sayar.
            chat_template_kwargs: { enable_thinking: !!req.reasoning },
        };
        if (req.json) body.response_format = { type: 'json_object' };

        // Geçici hatalarda (429 hız sınırı, 503 kapasite) kısa beklemeyle yeniden
        // dene — ücretsiz katmanda paylaşımlı kapasite sık dolabiliyor (gözlemle:
        // arka arkaya 2 "ResourceExhausted" sonrası 3. denemede başarı oldu).
        const MAX_ATTEMPTS = 3;
        let res!: Response;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
            try {
                res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.cfg.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                    signal: ctrl.signal,
                });
            } catch (e) {
                const err = e as Error;
                throw new ServiceUnavailableException(
                    err?.name === 'AbortError'
                        ? `AI modeli ${Math.round(this.cfg.timeoutMs / 1000)} sn içinde yanıt vermedi (${model})`
                        : `AI servisine ulaşılamadı: ${err?.message}`,
                );
            } finally {
                clearTimeout(timer);
            }

            if (res.ok) break;

            const errText = await res.text().catch(() => '');
            const detail = this.extractError(errText);
            this.logger.warn(`AI ${model} HTTP ${res.status} (deneme ${attempt + 1}): ${errText.slice(0, 300)}`);

            const transient = res.status === 429 || res.status === 503;
            if (transient && attempt < MAX_ATTEMPTS - 1) {
                await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
                continue;
            }
            if (res.status === 401 || res.status === 403) {
                throw new ServiceUnavailableException('AI anahtarı geçersiz veya yetkisiz (401/403). backend/.env → AI_API_KEY');
            }
            if (res.status === 404) {
                throw new ServiceUnavailableException(
                    `Model bulunamadı: "${model}". Ayarlar sayfasından "Canlı model listesini doğrula" ile ID'yi kontrol edin.`,
                );
            }
            if (transient) {
                throw new ServiceUnavailableException(
                    `AI modeli şu an meşgul (HTTP ${res.status})${detail ? ` — ${detail}` : ''}. Birazdan tekrar deneyin.`,
                );
            }
            throw new ServiceUnavailableException(`AI modeli hata verdi (HTTP ${res.status})${detail ? ` — ${detail}` : ''}`);
        }

        const data = await res.json();
        const raw: string = data.choices?.[0]?.message?.content ?? '';
        const text = this.stripThinking(raw);

        const out: AiChatResponse = {
            text,
            model,
            tier: req.tier,
            tokensIn: data.usage?.prompt_tokens,
            tokensOut: data.usage?.completion_tokens,
            latencyMs: Date.now() - started,
        };
        if (req.json) out.parsed = this.parseJson(text);
        return out;
    }

    private stripThinking(t: string): string {
        return t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();
    }

    /** NVIDIA hata gövdesinden okunabilir mesajı çıkar. */
    private extractError(body: string): string {
        try {
            const j = JSON.parse(body) as { message?: string; detail?: string; error?: { message?: string } };
            return (j.error?.message || j.message || j.detail || '').slice(0, 160);
        } catch {
            return body.slice(0, 160);
        }
    }

    private parseJson(t: string): unknown {
        const attempt = (s: string): unknown => {
            try {
                return JSON.parse(s);
            } catch {
                return undefined;
            }
        };
        const direct = attempt(t);
        if (direct !== undefined) return direct;

        // ```json ... ``` bloğu veya gövdedeki ilk { ... } aralığını dene
        const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence) {
            const fenced = attempt(fence[1].trim());
            if (fenced !== undefined) return fenced;
        }
        const start = t.indexOf('{');
        const end = t.lastIndexOf('}');
        if (start >= 0 && end > start) {
            const sliced = attempt(t.slice(start, end + 1));
            if (sliced !== undefined) return sliced;
        }
        return null;
    }

    private assertEnabled(): void {
        if (!this.cfg.enabled) {
            throw new ServiceUnavailableException(
                'Yapay zeka modülü devre dışı. backend/.env içinde AI_ENABLED=true ve AI_API_KEY tanımlı olmalı.',
            );
        }
    }
}
