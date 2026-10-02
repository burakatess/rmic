import type {
    AiAssessment, AiStatus, AiUsage, AiCockpit, AiQueryResult,
    AiEvalSession, AiEvalListResponse, AiEvalListParams, AiEvalOutcome, BulkEvalResult,
    EvalOutputBundle,
    KnowledgeDoc, KnowledgeDocKind,
} from '@/types/ai';
import type {
    Source as LibSource, SourceVersionDetail as LibVersionDetail, SourceUnit as LibUnit,
    RetrievalResponse as LibRetrievalResponse, SourceMapping as LibMapping, ControlTestCard as LibTestCard,
    ProcessScopeCard as LibProcessCard, EvidenceRule as LibEvidenceRule, EvalDataset as LibDataset,
    EvalScenario as LibScenario, QualityRun as LibQualityRun,
    VersionReadiness as LibVersionReadiness, IndexJob as LibIndexJob, UnitLookupResult as LibUnitLookupResult,
    SuggestSourcesResponse as LibSuggestSourcesResponse,
} from '@/types/library';
import type {
    DashboardScopeParams, DashboardScopeOptions, DashboardSummary, DashboardWorkItemsResponse,
    DashboardApprovals, DashboardCriticalIssue, DashboardAnnualPlan, DashboardUpcoming,
} from '@/types/dashboard';
import type {
    AnnualPlanWorkspace, AnnualPlanDraftItem, AnnualPlanPreview, AnnualPlanApplyResult, AnnualPlanAssignmentDecision,
    EligibleController, WorkloadByAssignee,
} from '@/types/annual-plan';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Çalışma Panosu sorgu parametrelerini querystring'e çevirir (directorateId dizisi tekrarlı key olarak). */
function buildQuery(params?: object): string {
    if (!params) return '';
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value)) {
            value.forEach(v => usp.append(key, String(v)));
        } else {
            usp.append(key, String(value));
        }
    }
    const qs = usp.toString();
    return qs ? `?${qs}` : '';
}

export class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

interface ApiOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: unknown;
    headers?: Record<string, string>;
}

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private getToken(): string | null {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('accessToken');
        }
        return null;
    }

    private setTokens(accessToken: string, refreshToken: string): void {
        if (typeof window !== 'undefined') {
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
        }
    }

    private clearTokens(): void {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
        }
    }

    async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
        const { method = 'GET', body, headers = {} } = options;

        const token = this.getToken();
        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...headers,
        };

        if (token) {
            requestHeaders['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers: requestHeaders,
            body: body ? JSON.stringify(body) : undefined,
        });


        if (response.status === 401) {
            // Skip redirect for demo token
            const token = this.getToken();
            if (token?.startsWith('demo-')) {
                // Demo mode - don't redirect, just throw
                throw new Error('Demo mode - API not available');
            }
            // Token expired, try to refresh
            const refreshed = await this.refreshToken();
            if (refreshed) {
                // Retry the request
                return this.request<T>(endpoint, options);
            }
            // Redirect to login
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            const rawMessage = errorBody?.message;
            const message = Array.isArray(rawMessage) ? rawMessage.join(', ')
                : rawMessage || `İstek başarısız (HTTP ${response.status})`;
            throw new ApiError(message, response.status, errorBody);
        }

        return response.json();
    }

    private async refreshToken(): Promise<boolean> {
        if (typeof window === 'undefined') return false;

        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) return false;

        try {
            const response = await fetch(`${this.baseUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });

            if (response.ok) {
                const data = await response.json();
                this.setTokens(data.accessToken, data.refreshToken);
                return true;
            }
        } catch {
            // Refresh failed
        }

        this.clearTokens();
        return false;
    }

    // Auth endpoints
    async login(email: string, password: string) {
        const data = await this.request<{
            accessToken: string;
            refreshToken: string;
            user: { id: string; email: string; firstName: string; lastName: string; role: string };
        }>('/auth/login', {
            method: 'POST',
            body: { email, password },
        });
        this.setTokens(data.accessToken, data.refreshToken);
        return data;
    }

    async logout() {
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
        await this.request('/auth/logout', {
            method: 'POST',
            body: { refreshToken },
        });
        this.clearTokens();
    }

    async getProfile() {
        return this.request<{
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            department?: string;
            role: { id?: string; name: string; permissions: string[] };
        }>('/auth/me');
    }

    async updateProfile(data: { firstName: string; lastName: string; department?: string }) {
        return this.request<any>('/auth/me', { method: 'PATCH', body: data });
    }

    async changePassword(data: { currentPassword: string; newPassword: string }) {
        return this.request<{ message: string }>('/auth/change-password', { method: 'POST', body: data });
    }

    // Çalışma Panosu — kapsam/tarih sözleşmesi tüm uç noktalarda ortaktır.
    async getDashboardScopeOptions() {
        return this.request<DashboardScopeOptions>('/dashboard/scope-options');
    }

    async getDashboardSummary(params?: DashboardScopeParams) {
        return this.request<DashboardSummary>(`/dashboard/summary${buildQuery(params)}`);
    }

    async getDashboardWorkItems(params?: DashboardScopeParams & { tab?: string; page?: number; pageSize?: number }) {
        return this.request<DashboardWorkItemsResponse>(`/dashboard/work-items${buildQuery(params)}`);
    }

    async getDashboardApprovals() {
        return this.request<DashboardApprovals>('/dashboard/approvals');
    }

    async getDashboardCriticalIssues(params?: DashboardScopeParams) {
        return this.request<DashboardCriticalIssue[]>(`/dashboard/critical-issues${buildQuery(params)}`);
    }

    async getDashboardAnnualPlan(params?: DashboardScopeParams) {
        return this.request<DashboardAnnualPlan>(`/dashboard/annual-plan${buildQuery(params)}`);
    }

    async getDashboardUpcoming(params?: DashboardScopeParams & { days?: number }) {
        return this.request<DashboardUpcoming>(`/dashboard/upcoming${buildQuery(params)}`);
    }

    async getUsers() {
        return this.request<any[]>('/admin/users');
    }

    async getUserOptions(params?: { search?: string; page?: number; limit?: number }) {
        return this.request<{ data: Array<{ id: string; firstName: string; lastName: string; isActive: boolean }>; pagination: { total: number; page: number; limit: number; totalPages: number } }>(`/admin/users/options${buildQuery(params)}`);
    }

    // ─── Dosya Yükleme / İndirme ──────────────────────────────────────────────
    async uploadFile(file: File): Promise<{ uploadId: string; fileName: string; originalName: string; mimeType: string; sizeBytes: number }> {
        const token = this.getToken();
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${this.baseUrl}/uploads`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: form,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new ApiError(err?.message || 'Dosya yüklenemedi', res.status, err);
        }
        return res.json();
    }

    /** XHR tabanlı yükleme — gerçek ilerleme yüzdesi için (fetch upload-progress'i güvenilir desteklemiyor). */
    uploadFileWithProgress(file: File, onProgress: (pct: number) => void): { promise: Promise<{ uploadId: string; fileName: string; originalName: string; mimeType: string; sizeBytes: number }>; abort: () => void } {
        const token = this.getToken();
        const xhr = new XMLHttpRequest();
        const promise = new Promise<any>((resolve, reject) => {
            const form = new FormData();
            form.append('file', file);
            xhr.open('POST', `${this.baseUrl}/uploads`);
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new ApiError('Sunucu yanıtı okunamadı', xhr.status)); }
                } else {
                    let msg = 'Dosya yüklenemedi';
                    try { msg = JSON.parse(xhr.responseText)?.message || msg; } catch { /* noop */ }
                    reject(new ApiError(msg, xhr.status));
                }
            };
            xhr.onerror = () => reject(new ApiError('Ağ hatası — dosya yüklenemedi', 0));
            xhr.onabort = () => reject(new ApiError('Yükleme iptal edildi', 0));
            xhr.send(form);
        });
        return { promise, abort: () => xhr.abort() };
    }

    /** Kanıt önizleme için blob URL — çağıran taraf işi bitince URL.revokeObjectURL etmeli. */
    async getAttachmentBlobUrl(kind: 'control-test' | 'finding' | 'action' | 'follow-up', attachmentId: string): Promise<string> {
        const token = this.getToken();
        const res = await fetch(`${this.baseUrl}/uploads/attachments/${kind}/${attachmentId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new ApiError('Kanıt yüklenemedi', res.status);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    }

    async addControlTestAttachment(testId: string, meta: { uploadId: string; fileName: string; originalName: string; mimeType: string; sizeBytes: number }) {
        return this.request<any>(`/controls/tests/${testId}/attachments`, { method: 'POST', body: meta });
    }

    async removeControlTestAttachment(testId: string, attachmentId: string) {
        return this.request<any>(`/controls/tests/${testId}/attachments/${attachmentId}`, { method: 'DELETE' });
    }

    async updateControlTestAttachment(testId: string, attachmentId: string, body: { displayName?: string; description?: string }) {
        return this.request<any>(`/controls/tests/${testId}/attachments/${attachmentId}`, { method: 'PATCH', body });
    }

    async downloadAttachment(kind: 'control-test' | 'finding' | 'action' | 'follow-up', attachmentId: string, originalName: string): Promise<void> {
        const token = this.getToken();
        const res = await fetch(`${this.baseUrl}/uploads/attachments/${kind}/${attachmentId}?download=true`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new ApiError('Dosya indirilemedi', res.status);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = originalName;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Directorates
    async getDirectorates(params?: { isActive?: string }) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request<any[]>(`/directorates${query}`);
    }

    async createDirectorate(data: { name: string; code?: string; gmy?: string }) {
        return this.request('/directorates', { method: 'POST', body: data });
    }

    async updateDirectorate(id: string, data: Partial<{ name: string; code: string; gmy: string; isActive: boolean }>) {
        return this.request(`/directorates/${id}`, { method: 'PUT', body: data });
    }

    // ControlTest endpoints
    async getAllControlTests(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
        return this.request(`/controls/tests${query}`);
    }

    async getControlTests(controlId: string) {
        return this.request(`/controls/${controlId}/tests`);
    }

    async getControlTestById(testId: string) {
        return this.request<any>(`/controls/tests/${testId}`);
    }

    async saveTestDraft(testId: string, data: {
        resultText?: string; evidenceSummary?: string; findingStatus?: string | null;
        stepObservations?: unknown[]; contentVersion: number;
    }) {
        return this.request<any>(`/controls/tests/${testId}/draft`, { method: 'PATCH', body: data });
    }

    async createControlTest(controlId: string, data: unknown) {
        return this.request(`/controls/${controlId}/tests`, { method: 'POST', body: data });
    }

    async startControlTest(testId: string) {
        return this.request(`/controls/tests/${testId}/start`, { method: 'PATCH' });
    }

    async completeControlTest(testId: string, data: unknown) {
        return this.request(`/controls/tests/${testId}/complete`, { method: 'PATCH', body: data });
    }

    async approveControlTest(testId: string) {
        return this.request(`/controls/tests/${testId}/approve`, { method: 'PATCH' });
    }

    async returnControlTest(testId: string, reason: string) {
        return this.request(`/controls/tests/${testId}/return`, { method: 'PATCH', body: { reason } });
    }

    async cancelControlTest(testId: string, reason: string) {
        return this.request(`/controls/tests/${testId}/cancel-final`, { method: 'PATCH', body: { reason } });
    }

    // Merkezi Onaylar
    async getMyPendingApprovals(params?: Record<string, string>) {
        const query = params ? '?' + new URLSearchParams(params).toString() : '';
        return this.request(`/approvals/my-pending${query}`);
    }

    async getApprovalDetail(id: string) {
        return this.request(`/approvals/${id}`);
    }

    async activateControl(id: string) {
        return this.request(`/controls/${id}/activate`, { method: 'PATCH' });
    }

    async passivateControl(id: string) {
        return this.request(`/controls/${id}/passivate`, { method: 'PATCH' });
    }

    // Dashboard
    async getDashboard() {
        return this.request('/reports/dashboard');
    }

    // Notifications
    async getNotifications() {
        return this.request<any[]>('/notifications');
    }

    // Risks
    async getRisks(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request(`/risks${query}`);
    }

    async getRisk(id: string) {
        return this.request(`/risks/${id}`);
    }

    async createRisk(data: unknown) {
        return this.request('/risks', { method: 'POST', body: data });
    }

    async updateRisk(id: string, data: unknown) {
        return this.request(`/risks/${id}`, { method: 'PUT', body: data });
    }

    async assessRisk(id: string, data: unknown) {
        return this.request(`/risks/${id}/assess`, { method: 'POST', body: data });
    }

    async treatRisk(id: string, data: unknown) {
        return this.request(`/risks/${id}/treat`, { method: 'POST', body: data });
    }

    async approveRiskTreatment(id: string) {
        return this.request(`/risks/${id}/approve-treatment`, { method: 'POST' });
    }

    async getRiskCategories() {
        return this.request('/risks/categories');
    }

    async deleteRisk(id: string) {
        return this.request(`/risks/${id}`, { method: 'DELETE' });
    }

    // Controls
    async getControls(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request(`/controls${query}`);
    }

    async getControl(id: string) {
        return this.request(`/controls/${id}`);
    }

    async createControl(data: unknown) {
        return this.request('/controls', { method: 'POST', body: data });
    }

    async updateControl(id: string, data: unknown) {
        return this.request(`/controls/${id}`, { method: 'PUT', body: data });
    }

    // Kalıcı silme kaldırıldı — bkz. passivateControl(). Control ana envanterdir.

    // ─── Yıllık Kapsam (ControlYearScope) ────────────────────────────────────
    async getScopeYears() {
        return this.request<{ years: number[] }>('/controls/scope-years');
    }

    async getControlDashboard(params?: Record<string, string | number | boolean>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request<any>(`/controls/dashboard${query}`);
    }

    // Dönem Kontrolleri — kontrol×yıl bazlı liste (eski "Kontrol Takip Panosu").
    async getPeriodControls(params?: Record<string, string | number | boolean>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request<any>(`/controls/scope/period-controls${query}`);
    }

    async applyControlVersion(controlId: string, year: number, data: { confirmOngoing?: boolean; dryRun?: boolean }) {
        return this.request<any>(`/controls/${controlId}/scope/${year}/apply-new-version`, { method: 'POST', body: data });
    }

    // Dönem Kontrolü Detayı — tek bir ControlYearScope kaydının tam görünümü.
    async getPeriodControlDetail(scopeId: string) {
        return this.request<any>(`/controls/scope/period-controls/${scopeId}`);
    }

    async addControlScope(controlId: string, data: {
        years: number[]; frequency?: string; selectedMonths?: string[]; controlDate?: string;
        includePastPeriods?: boolean; dryRun?: boolean;
    }) {
        return this.request<any>(`/controls/${controlId}/scope`, { method: 'POST', body: data });
    }

    async bulkAddControlScope(data: {
        controlIds: string[]; year: number; frequency?: string; selectedMonths?: string[];
        includePastPeriods?: boolean; dryRun?: boolean;
    }) {
        return this.request<any>('/controls/scope/bulk', { method: 'POST', body: data });
    }

    async copyControlScope(data: { fromYear: number; toYear: number; controlIds?: string[]; dryRun?: boolean }) {
        return this.request<any>('/controls/scope/copy', { method: 'POST', body: data });
    }

    async removeControlScope(controlId: string, year: number, data: { reason: string; decisions?: { taskId: string; action: 'CONTINUE' | 'CANCEL' }[] }) {
        return this.request<any>(`/controls/${controlId}/scope/${year}`, { method: 'DELETE', body: data });
    }

    async changeControlScopePeriodicity(controlId: string, year: number, data: { frequency?: string; selectedMonths?: string[]; reason: string; dryRun?: boolean }) {
        return this.request<any>(`/controls/${controlId}/scope/${year}`, { method: 'PATCH', body: data });
    }

    async reactivateControlScope(controlId: string, year: number) {
        return this.request<any>(`/controls/${controlId}/scope/${year}/reactivate`, { method: 'POST' });
    }

    async reactivateControlTask(taskId: string) {
        return this.request<any>(`/controls/tests/${taskId}/reactivate`, { method: 'POST' });
    }

    async getControlScopeHistory(controlId: string) {
        return this.request<{ data: any[] }>(`/controls/${controlId}/scope-history`);
    }

    // Yıllık Plan (Kontrol Yönetimi) — "Çalışma Panosu"nun /dashboard/annual-plan
    // uç noktasıyla KARIŞTIRILMASIN, ayrı bir özellik.
    async getAnnualPlanWorkspace(year: number, params?: Record<string, unknown>): Promise<AnnualPlanWorkspace> {
        return this.request<AnnualPlanWorkspace>(`/controls/annual-plan/${year}/workspace${buildQuery(params)}`);
    }

    async saveAnnualPlanDraftItems(year: number, data: { expectedRevision: number; items: Partial<AnnualPlanDraftItem & { referenceMonth?: number; assigneeId?: string; secondControllerId?: string }>[] }, scopeParams?: Record<string, unknown>) {
        return this.request(`/controls/annual-plan/${year}/draft/items${buildQuery(scopeParams)}`, { method: 'POST', body: data });
    }

    async bulkAnnualPlanDraftAction(year: number, data: {
        controlIds: string[]; action: 'ADD' | 'REMOVE' | 'ASSIGN'; frequency?: string; selectedMonths?: string[];
        assigneeId?: string; secondControllerId?: string; onlyMissing?: boolean; dryRun?: boolean; expectedRevision: number;
    }, scopeParams?: Record<string, unknown>) {
        return this.request(`/controls/annual-plan/${year}/draft/bulk${buildQuery(scopeParams)}`, { method: 'POST', body: data });
    }

    async getAnnualPlanAssignments(year: number, params?: Record<string, unknown>): Promise<AnnualPlanWorkspace> {
        return this.request<AnnualPlanWorkspace>(`/controls/annual-plan/${year}/assignments${buildQuery(params)}`);
    }

    async getEligibleControllers(year: number, role: 'assignee' | 'secondController', controlId?: string): Promise<{ data: EligibleController[]; directorateId: string | null }> {
        return this.request(`/controls/annual-plan/${year}/eligible-controllers${buildQuery({ role, controlId })}`);
    }

    async getWorkloadByAssignee(year: number, scopeParams?: Record<string, unknown>): Promise<WorkloadByAssignee> {
        return this.request<WorkloadByAssignee>(`/controls/annual-plan/${year}/workload-by-assignee${buildQuery(scopeParams)}`);
    }

    async copyAnnualPlanFromYear(
        year: number, fromYear: number,
        options: { copyScope?: boolean; copyCalendar?: boolean; copyAssignments?: boolean } = {},
        scopeParams?: Record<string, unknown>,
    ) {
        return this.request(`/controls/annual-plan/${year}/draft/copy-from/${fromYear}${buildQuery(scopeParams)}`, { method: 'POST', body: options });
    }

    async discardAnnualPlanDraft(year: number) {
        return this.request(`/controls/annual-plan/${year}/draft/discard`, { method: 'POST' });
    }

    async previewAnnualPlanApply(year: number): Promise<AnnualPlanPreview> {
        return this.request<AnnualPlanPreview>(`/controls/annual-plan/${year}/preview`, { method: 'POST' });
    }

    async applyAnnualPlan(year: number, expectedRevision: number, assignmentDecisions: AnnualPlanAssignmentDecision[] = []): Promise<AnnualPlanApplyResult> {
        return this.request<AnnualPlanApplyResult>(`/controls/annual-plan/${year}/apply`, { method: 'POST', body: { expectedRevision, assignmentDecisions } });
    }

    async submitAnnualPlan(year: number, expectedRevision: number, note?: string, assignmentDecisions: AnnualPlanAssignmentDecision[] = []) {
        return this.request(`/controls/annual-plan/${year}/submit`, { method: 'POST', body: { expectedRevision, note, assignmentDecisions } });
    }

    async approveAnnualPlan(year: number, expectedRevision: number, note?: string) {
        return this.request(`/controls/annual-plan/${year}/approve`, { method: 'POST', body: { expectedRevision, note } });
    }

    async requestAnnualPlanChanges(year: number, expectedRevision: number, note: string) {
        return this.request(`/controls/annual-plan/${year}/request-changes`, { method: 'POST', body: { expectedRevision, note } });
    }

    async previewControlVersionImpact(controlId: string) {
        return this.request<any>(`/controls/${controlId}/version-impact/preview`, { method: 'POST' });
    }

    async applyControlVersionImpact(controlId: string, expectedControlVersion: number, decisions: { year: number; action: string }[]) {
        return this.request<any>(`/controls/${controlId}/version-impact/apply`, { method: 'POST', body: { expectedControlVersion, decisions } });
    }

    async getWorkflowHealthSummary(params?: Record<string, unknown>) {
        return this.request<any>(`/workflow-health/summary${buildQuery(params)}`);
    }

    async getWorkflowHealthItems(params?: Record<string, unknown>) {
        return this.request<any>(`/workflow-health/items${buildQuery(params)}`);
    }

    async mapControlRisk(controlId: string, riskId: string, mappingType?: string) {
        return this.request(`/controls/${controlId}/map-risk`, {
            method: 'POST',
            body: { riskId, mappingType }
        });
    }

    async unmapControlRisk(controlId: string, riskId: string) {
        return this.request(`/controls/${controlId}/unmap-risk/${riskId}`, {
            method: 'DELETE'
        });
    }

    // Legacy test generator (eski endpoint)
    async generateTests() {
        return this.request('/tests/generate', { method: 'POST' });
    }

    // Findings
    async getFindings(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request(`/findings${query}`);
    }

    async getFinding(id: string) {
        return this.request(`/findings/${id}`);
    }

    async createFinding(data: unknown) {
        return this.request('/findings', { method: 'POST', body: data });
    }

    async updateFinding(id: string, data: unknown) {
        return this.request(`/findings/${id}`, { method: 'PUT', body: data });
    }

    async deleteFinding(id: string) {
        return this.request(`/findings/${id}`, { method: 'DELETE' });
    }

    // Actions
    async getActions(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request(`/actions${query}`);
    }

    async getAction(id: string) {
        return this.request(`/actions/${id}`);
    }

    async deleteAction(id: string) {
        return this.request(`/actions/${id}`, { method: 'DELETE' });
    }

    async createStandaloneAction(data: unknown) {
        return this.request('/actions', { method: 'POST', body: data });
    }

    async getActionsForRisk(riskId: string) {
        return this.request<any[]>(`/risks/${riskId}/actions`);
    }

    // Relations endpoints
    async getRiskRelations(id: string) {
        return this.request(`/risks/${id}/relations`);
    }

    async getControlRelations(id: string) {
        return this.request(`/controls/${id}/relations`);
    }

    async getFindingRelations(id: string) {
        return this.request(`/findings/${id}/relations`);
    }

    async getActionRelations(id: string) {
        return this.request(`/actions/${id}/relations`);
    }

    async createAction(findingId: string, data: unknown) {
        return this.request(`/findings/${findingId}/actions`, { method: 'POST', body: data });
    }

    async completeAction(id: string, evidenceIds: string[] = []) {
        return this.request(`/actions/${id}/complete`, { method: 'POST', body: { evidenceIds } });
    }

    // ── Risk Controls (RYK Kontrol Alanı) ───────────────────────────────────────
    async getRiskControls(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request(`/risk-controls${query}`);
    }

    async getRiskControl(id: string) {
        return this.request(`/risk-controls/${id}`);
    }

    async createRiskControl(data: unknown) {
        return this.request('/risk-controls', { method: 'POST', body: data });
    }

    async updateRiskControl(id: string, data: unknown) {
        return this.request(`/risk-controls/${id}`, { method: 'PUT', body: data });
    }

    async deleteRiskControl(id: string) {
        return this.request(`/risk-controls/${id}`, { method: 'DELETE' });
    }

    // ── Risk Actions (RYK Aksiyon Tablosu) ──────────────────────────────────────
    async getRiskActions(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request(`/risk-actions${query}`);
    }

    async getRiskAction(id: string) {
        return this.request(`/risk-actions/${id}`);
    }

    async createRiskAction(data: unknown) {
        return this.request('/risk-actions', { method: 'POST', body: data });
    }

    async updateRiskAction(id: string, data: unknown) {
        return this.request(`/risk-actions/${id}`, { method: 'PUT', body: data });
    }

    async deleteRiskAction(id: string) {
        return this.request(`/risk-actions/${id}`, { method: 'DELETE' });
    }

    // Audit Plans & Executions
    async getAuditPlans(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request<any>(`/audit-plans${query}`);
    }

    async getAuditPlan(id: string) {
        return this.request<any>(`/audit-plans/${id}`);
    }

    async createAuditPlan(data: unknown) {
        return this.request('/audit-plans', { method: 'POST', body: data });
    }

    async updateAuditPlan(id: string, data: unknown) {
        return this.request(`/audit-plans/${id}`, { method: 'PUT', body: data });
    }

    async getAuditExecutions(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request<any>(`/audit-executions${query}`);
    }

    async createAuditExecution(data: unknown) {
        return this.request('/audit-executions', { method: 'POST', body: data });
    }

    async updateAuditExecution(id: string, data: unknown) {
        return this.request(`/audit-executions/${id}`, { method: 'PUT', body: data });
    }

    // Compliance
    async getRegulations() {
        return this.request<any[]>('/regulations');
    }

    async getRegulationArticles(regulationId: string) {
        return this.request<any[]>(`/regulations/${regulationId}/articles`);
    }

    async getComplianceOverview() {
        return this.request<any[]>('/compliance/overview');
    }

    // Reports
    async getExecutiveSummary() {
        return this.request('/reports/executive-summary');
    }

    async getRiskTrends(months?: number) {
        const query = months ? `?months=${months}` : '';
        return this.request(`/reports/risk-trends${query}`);
    }

    async getControlHeatmap() {
        return this.request('/reports/control-heatmap');
    }

    // Risk Entries (Excel-like grid)
    async getRiskEntries(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request(`/risk-entries${query}`);
    }

    async getRiskEntry(id: string) {
        return this.request(`/risk-entries/${id}`);
    }

    async createRiskEntry(data: unknown) {
        return this.request('/risk-entries', { method: 'POST', body: data });
    }

    async updateRiskEntry(id: string, data: unknown) {
        return this.request(`/risk-entries/${id}`, { method: 'PUT', body: data });
    }

    async deleteRiskEntry(id: string) {
        return this.request(`/risk-entries/${id}`, { method: 'DELETE' });
    }

    async bulkCreateRiskEntries(entries: unknown[]) {
        return this.request('/risk-entries/bulk', { method: 'POST', body: { entries } });
    }

    async syncRiskEntriesToInventory(ids: string[]) {
        return this.request('/risk-entries/sync-to-inventory', { method: 'POST', body: { ids } });
    }

    // Risk Management Controls (RYK)
    async getRiskManagementControls(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
        return this.request(`/risk-management-controls${query}`);
    }

    async getRiskManagementControl(id: string) {
        return this.request(`/risk-management-controls/${id}`);
    }

    async createRiskManagementControl(data: unknown) {
        return this.request('/risk-management-controls', { method: 'POST', body: data });
    }

    async updateRiskManagementControl(id: string, data: unknown) {
        return this.request(`/risk-management-controls/${id}`, { method: 'PUT', body: data });
    }

    async deleteRiskManagementControl(id: string) {
        return this.request(`/risk-management-controls/${id}`, { method: 'DELETE' });
    }

    async mapRYKControlToRiskEntry(controlId: string, riskEntryId: string, applicabilityScore?: number) {
        return this.request(`/risk-management-controls/${controlId}/map-risk/${riskEntryId}`, {
            method: 'POST',
            body: { applicabilityScore }
        });
    }

    async unmapRYKControlFromRiskEntry(controlId: string, riskEntryId: string) {
        return this.request(`/risk-management-controls/${controlId}/map-risk/${riskEntryId}`, {
            method: 'DELETE'
        });
    }

    async updateRYKApplicabilityScore(controlId: string, riskEntryId: string, applicabilityScore: number) {
        return this.request(`/risk-management-controls/${controlId}/map-risk/${riskEntryId}/applicability`, {
            method: 'PUT',
            body: { applicabilityScore }
        });
    }

    async getRYKControlTests(controlId: string) {
        return this.request(`/risk-management-controls/${controlId}/tests`);
    }

    async createRYKControlTest(controlId: string, data: unknown) {
        return this.request(`/risk-management-controls/${controlId}/tests`, {
            method: 'POST',
            body: data
        });
    }

    async getRYKControlTest(controlId: string, testId: string) {
        return this.request(`/risk-management-controls/${controlId}/tests/${testId}`);
    }

    // ── Finding Risk Linking ──────────────────────────────────────────────────

    async linkRiskToFinding(findingId: string, riskId: string) {
        return this.request(`/findings/${findingId}/link-risk`, {
            method: 'POST',
            body: { riskId }
        });
    }

    async unlinkRiskFromFinding(findingId: string, riskId: string) {
        return this.request(`/findings/${findingId}/unlink-risk/${riskId}`, {
            method: 'DELETE'
        });
    }

    // ─── Risk Öneri Talepleri ─────────────────────────────────────────────────
    async createRiskProposal(dto: { findingId?: string; directorateId?: string; riskTanimi: string }) {
        return this.request<any>('/risk-proposals', { method: 'POST', body: dto });
    }

    async getRiskProposals(status?: string) {
        return this.request<any[]>(`/risk-proposals${status ? `?status=${status}` : ''}`);
    }

    async approveRiskProposal(id: string) {
        return this.request<any>(`/risk-proposals/${id}/approve`, { method: 'PATCH' });
    }

    async rejectRiskProposal(id: string, reviewNote: string) {
        return this.request<any>(`/risk-proposals/${id}/reject`, { method: 'PATCH', body: { reviewNote } });
    }

    // ── Finding Follow-Ups ───────────────────────────────────────────────────

    async getFollowUps(findingId: string) {
        return this.request(`/findings/${findingId}/follow-ups`);
    }

    async createFollowUp(findingId: string, data: unknown) {
        return this.request(`/findings/${findingId}/follow-ups`, {
            method: 'POST',
            body: data
        });
    }

    async updateFollowUp(findingId: string, followUpId: string, data: unknown) {
        return this.request(`/findings/${findingId}/follow-ups/${followUpId}`, {
            method: 'PUT',
            body: data
        });
    }

    async deleteFollowUp(findingId: string, followUpId: string) {
        return this.request(`/findings/${findingId}/follow-ups/${followUpId}`, { method: 'DELETE' });
    }

    // Actions (Finding-Scoped)
    async getFindingActions(findingId: string) {
        return this.request(`/findings/${findingId}/actions`);
    }

    async createFindingAction(findingId: string, data: unknown) {
        return this.request(`/findings/${findingId}/actions`, {
            method: 'POST',
            body: data
        });
    }

    async updateFindingAction(findingId: string, actionId: string, data: unknown) {
        return this.request(`/findings/${findingId}/actions/${actionId}`, {
            method: 'PUT',
            body: data
        });
    }

    async deleteFindingAction(findingId: string, actionId: string) {
        return this.request(`/findings/${findingId}/actions/${actionId}`, {
            method: 'DELETE'
        });
    }

    // Action-Scoped Follow-Up
    async createFollowUpForAction(findingId: string, actionId: string, data: unknown) {
        return this.request(`/findings/${findingId}/actions/${actionId}/follow-ups`, {
            method: 'POST',
            body: data
        });
    }

    // Finding Status History
    async getFindingStatusHistory(findingId: string) {
        return this.request(`/findings/${findingId}/status-history`);
    }

    async appendFindingStatusHistory(findingId: string, data: unknown) {
        return this.request(`/findings/${findingId}/status-history`, {
            method: 'POST',
            body: data
        });
    }

    // Scheduler manual trigger
    async generateDueFollowUps() {
        return this.request('/findings/generate-due-followups', {
            method: 'POST'
        });
    }

    // ── Status Logs (Append-only Güncel Durum) ───────────────────────────────

    async getStatusLogs(findingId: string) {
        return this.request(`/findings/${findingId}/status-logs`);
    }

    async appendStatusLog(findingId: string, data: { text: string; authorName?: string }) {
        return this.request(`/findings/${findingId}/status-logs`, { method: 'POST', body: data });
    }

    // ── Finding Attachments ───────────────────────────────────────────────────

    async addFindingAttachment(findingId: string, meta: { uploadId: string; fileName: string; originalName: string; mimeType: string; sizeBytes: number }) {
        return this.request(`/findings/${findingId}/attachments`, { method: 'POST', body: meta });
    }

    async removeFindingAttachment(findingId: string, attachmentId: string) {
        return this.request(`/findings/${findingId}/attachments/${attachmentId}`, { method: 'DELETE' });
    }

    async updateFindingAttachment(findingId: string, attachmentId: string, body: { displayName?: string; description?: string }) {
        return this.request(`/findings/${findingId}/attachments/${attachmentId}`, { method: 'PATCH', body });
    }

    // ── Action Attachments ────────────────────────────────────────────────────

    async addActionAttachment(findingId: string, actionId: string, meta: { uploadId: string; fileName: string; originalName: string; mimeType: string; sizeBytes: number }) {
        return this.request(`/findings/${findingId}/actions/${actionId}/attachments`, { method: 'POST', body: meta });
    }

    async removeActionAttachment(findingId: string, actionId: string, attachmentId: string) {
        return this.request(`/findings/${findingId}/actions/${actionId}/attachments/${attachmentId}`, { method: 'DELETE' });
    }

    async updateActionAttachment(findingId: string, actionId: string, attachmentId: string, body: { displayName?: string; description?: string }) {
        return this.request(`/findings/${findingId}/actions/${actionId}/attachments/${attachmentId}`, { method: 'PATCH', body });
    }

    // ── FollowUp Attachments ──────────────────────────────────────────────────

    async addFollowUpAttachment(findingId: string, followUpId: string, meta: { uploadId: string; fileName: string; originalName: string; mimeType: string; sizeBytes: number }) {
        return this.request(`/findings/${findingId}/follow-ups/${followUpId}/attachments`, { method: 'POST', body: meta });
    }

    async removeFollowUpAttachment(findingId: string, followUpId: string, attachmentId: string) {
        return this.request(`/findings/${findingId}/follow-ups/${followUpId}/attachments/${attachmentId}`, { method: 'DELETE' });
    }

    async updateFollowUpAttachment(findingId: string, followUpId: string, attachmentId: string, body: { displayName?: string; description?: string }) {
        return this.request(`/findings/${findingId}/follow-ups/${followUpId}/attachments/${attachmentId}`, { method: 'PATCH', body });
    }

    // ── Bağımsız Follow-Ups Listesi ───────────────────────────────────────────

    async getAllFollowUps(params?: Record<string, string | number>) {
        const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
        return this.request(`/follow-ups${query}`);
    }

    // ── Mutabakat Workflow Geçişleri ─────────────────────────────────────────

    async mutabakataGonder(findingId: string) {
        return this.request(`/findings/${findingId}/workflow/mutabakata-gonder`, { method: 'POST' });
    }

    async icKontrolOnayinaGonder(findingId: string, data: { birimCevabi: string; targetResolutionDate?: string }) {
        return this.request(`/findings/${findingId}/workflow/ic-kontrol-onayina-gonder`, { method: 'POST', body: data });
    }

    async mutabakatOnayla(findingId: string, data: { internalControlAssessment?: string; resolutionStatus?: string }) {
        return this.request(`/findings/${findingId}/workflow/mutabakat-onayla`, { method: 'POST', body: data });
    }

    async mutabakatGeriGonder(findingId: string, reason: string) {
        return this.request(`/findings/${findingId}/workflow/mutabakat-geri-gonder`, { method: 'POST', body: { reason } });
    }

    async iptalEt(findingId: string, reason: string) {
        return this.request(`/findings/${findingId}/workflow/iptal-et`, { method: 'POST', body: { reason } });
    }

    // Onaylı kapanış — tüm aksiyonlar KAPATILDI + gerekçe (Madde 3).
    async closeFinding(findingId: string, reason: string) {
        return this.request(`/findings/${findingId}/workflow/kapat`, { method: 'POST', body: { reason } });
    }

    // İkinci kontrolcü ataması — genel takip güncellemesinden ayrı, gerekçeli (Madde 4).
    async assignSecondController(findingId: string, followUpId: string, body: { secondControllerId: string; reason: string }) {
        return this.request(`/findings/${findingId}/follow-ups/${followUpId}/second-controller`, { method: 'POST', body });
    }

    async reopenFinding(findingId: string, reason: string) {
        return this.request(`/findings/${findingId}/workflow/yeniden-ac`, { method: 'POST', body: { reason } });
    }

    // ── Risks (for selectors) — already defined as getRisks() above ──────────

    // ── Yapay Zeka — Kontrol Testi Asistanı ─────────────────────────────────

    async getAiStatus() {
        return this.request<AiStatus>('/ai/status');
    }

    async getAiModels() {
        return this.request<{ models: string[] }>('/ai/models');
    }

    async getAiUsage() {
        return this.request<AiUsage>('/ai/usage');
    }

    async getAiCockpit() {
        return this.request<AiCockpit>('/ai/cockpit');
    }

    async getTestAssessments(testId: string) {
        return this.request<AiAssessment[]>(`/ai/control-tests/${testId}/assessments`);
    }

    async runAiStage(
        testId: string,
        stage: 'prep' | 'evidence-read' | 'assess' | 'result-draft' | 'finding-draft' | 'reviewer-check',
        force = false,
    ) {
        return this.request<AiAssessment>(`/ai/control-tests/${testId}/${stage}`, {
            method: 'POST',
            body: { force },
        });
    }

    async askAi(question: string) {
        return this.request<AiQueryResult>('/ai/query', { method: 'POST', body: { question } });
    }

    async reviewAiAssessment(id: string, action: 'accept' | 'edit' | 'reject', editedOutput?: unknown) {
        return this.request<AiAssessment>(`/ai/assessments/${id}/review`, {
            method: 'POST',
            body: { action, editedOutput },
        });
    }

    // ── Kontrol & Kanıt Değerlendirme ──────────────────────────────────────
    async searchRegulationArticles(q: string) {
        return this.request<Array<{
            id: string; articleCode: string; title: string;
            regulation: { id: string; code: string; name: string };
        }>>(`/articles/search?q=${encodeURIComponent(q)}`);
    }

    // ── Kurumsal Kaynak Kütüphanesi ────────────────────────────────────────
    async searchKnowledgeDocs(q: string, kind?: KnowledgeDocKind) {
        const qs = new URLSearchParams();
        if (q) qs.set('q', q);
        if (kind) qs.set('kind', kind);
        return this.request<KnowledgeDoc[]>(`/knowledge-docs?${qs.toString()}`);
    }

    async getKnowledgeDoc(id: string) {
        return this.request<KnowledgeDoc>(`/knowledge-docs/${id}`);
    }

    async createKnowledgeDoc(body: {
        kind: KnowledgeDocKind; code: string; title: string; body: string;
        category?: string; tags?: string[]; sourceRef?: string; effectiveDate?: string;
    }) {
        return this.request<KnowledgeDoc>('/knowledge-docs', { method: 'POST', body });
    }

    async updateKnowledgeDoc(id: string, body: Partial<{
        kind: KnowledgeDocKind; code: string; title: string; body: string;
        category: string; tags: string[]; sourceRef: string; effectiveDate: string; isActive: boolean;
    }>) {
        return this.request<KnowledgeDoc>(`/knowledge-docs/${id}`, { method: 'PATCH', body });
    }

    async deleteKnowledgeDoc(id: string) {
        return this.request<{ ok: boolean }>(`/knowledge-docs/${id}`, { method: 'DELETE' });
    }

    async listAiEvalSessions(params: AiEvalListParams = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
        });
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return this.request<AiEvalListResponse>(`/ai/eval-sessions${suffix}`);
    }

    async createAiEvalSession(body: {
        title?: string; period?: string | null;
        controlRefId?: string | null; controlText?: string | null;
        controlManualNote?: string | null; evidenceText?: string | null;
        regulationArticleIds?: string[]; knowledgeDocIds?: string[]; sourceUnitIds?: string[];
    }) {
        return this.request<AiEvalSession>('/ai/eval-sessions', { method: 'POST', body });
    }

    async getAiEvalSession(id: string) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}`);
    }

    async updateAiEvalSession(id: string, body: {
        title?: string; period?: string | null;
        controlRefId?: string | null; controlText?: string | null;
        controlManualNote?: string | null; evidenceText?: string | null;
        regulationArticleIds?: string[]; knowledgeDocIds?: string[]; sourceUnitIds?: string[];
        contentVersion?: number;
    }) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}`, { method: 'PATCH', body });
    }

    async renameAiEvalSession(id: string, title: string) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}/rename`, { method: 'POST', body: { title } });
    }

    async completeAiEvalSession(id: string, outcome: AiEvalOutcome) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}/complete`, { method: 'POST', body: { outcome } });
    }

    async reopenAiEvalSession(id: string) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}/reopen`, { method: 'POST' });
    }

    async cloneAiEvalSession(id: string, period: string) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}/clone`, { method: 'POST', body: { period } });
    }

    /** Varsayılan silme = çöp kutusuna taşı (geri alınabilir). */
    async trashAiEvalSession(id: string) {
        return this.request<{ ok: boolean }>(`/ai/eval-sessions/${id}`, { method: 'DELETE' });
    }

    async restoreAiEvalSession(id: string) {
        return this.request<{ ok: boolean }>(`/ai/eval-sessions/${id}/restore`, { method: 'POST' });
    }

    async archiveAiEvalSession(id: string) {
        return this.request<{ ok: boolean }>(`/ai/eval-sessions/${id}/archive`, { method: 'POST' });
    }

    async unarchiveAiEvalSession(id: string) {
        return this.request<{ ok: boolean }>(`/ai/eval-sessions/${id}/unarchive`, { method: 'POST' });
    }

    async bulkArchiveAiEvalSessions(ids: string[]) {
        return this.request<BulkEvalResult>('/ai/eval-sessions/bulk/archive', { method: 'POST', body: { ids } });
    }

    async bulkTrashAiEvalSessions(ids: string[]) {
        return this.request<BulkEvalResult>('/ai/eval-sessions/bulk/trash', { method: 'POST', body: { ids } });
    }

    async addAiEvalAttachment(id: string, meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number }) {
        return this.request(`/ai/eval-sessions/${id}/attachments`, { method: 'POST', body: meta });
    }

    async updateAiEvalAttachmentMeta(id: string, attId: string, meta: {
        docDate?: string | null; relatedSystem?: string | null; relatedSample?: string | null;
        relatedTestStep?: string | null; note?: string | null;
    }) {
        return this.request(`/ai/eval-sessions/${id}/attachments/${attId}`, { method: 'PATCH', body: meta });
    }

    async replaceAiEvalAttachment(id: string, attId: string, meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number }) {
        return this.request(`/ai/eval-sessions/${id}/attachments/${attId}/version`, { method: 'POST', body: meta });
    }

    async removeAiEvalAttachment(id: string, attId: string) {
        return this.request(`/ai/eval-sessions/${id}/attachments/${attId}`, { method: 'DELETE' });
    }

    /**
     * "Değerlendir / Yeniden Değerlendir" — EKRANDAKİ tüm girdi gövdede.
     * Sunucu önce kaydeder (contentVersion çakışırsa 409), sonra değerlendirir.
     */
    async evaluateAiEvalSession(
        id: string,
        body: {
            title?: string; period?: string | null;
            controlRefId?: string | null; controlText?: string | null; controlManualNote?: string | null;
            evidenceText?: string | null;
            regulationArticleIds?: string[]; knowledgeDocIds?: string[]; sourceUnitIds?: string[];
            additionalNote?: string | null; contentVersion?: number;
        },
    ) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}/evaluate`, { method: 'POST', body });
    }

    /** "Ek soru sor" — 6 başlıklı raporu yeniden üretmez, soruya yanıt verir. */
    async askAiEvalSession(id: string, question: string, contentVersion?: number) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}/ask`, {
            method: 'POST', body: { question, contentVersion },
        });
    }

    /** @deprecated `evaluateAiEvalSession` kullanın. */
    async sendAiEvalMessage(id: string, text: string) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}/messages`, { method: 'POST', body: { text } });
    }

    async cancelAiEvalRun(id: string) {
        return this.request<{ ok: boolean }>(`/ai/eval-sessions/${id}/cancel`, { method: 'POST' });
    }

    async reviewAiEvalFinding(id: string, body: {
        group: 'uyumsuzAlanlar' | 'bulguAdaylari' | 'uyumluAlanlar' | 'findingAssessment' | 'requirementAssessments' | 'finding';
        index: number;
        status: 'ACCEPTED' | 'EDITED' | 'REJECTED';
        reason?: string;
        edited?: unknown;
    }) {
        return this.request<AiEvalSession>(`/ai/eval-sessions/${id}/findings/review`, { method: 'POST', body });
    }

    async getAiEvalOutputs(id: string) {
        return this.request<EvalOutputBundle>(`/ai/eval-sessions/${id}/outputs`);
    }

    // ── Kaynak Kataloğu (Genişletilmiş Kütüphane) ─────────────────────────
    async listLibrarySources(params: { q?: string; kind?: string; confidentiality?: string } = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v && qs.set(k, String(v)));
        return this.request<LibSource[]>(`/library/sources${qs.toString() ? `?${qs}` : ''}`);
    }
    async getLibrarySource(id: string) {
        return this.request<LibSource>(`/library/sources/${id}`);
    }
    async createLibrarySource(body: Record<string, unknown>) {
        return this.request<LibSource>('/library/sources', { method: 'POST', body });
    }
    async updateLibrarySource(id: string, body: Record<string, unknown>) {
        return this.request<LibSource>(`/library/sources/${id}`, { method: 'PATCH', body });
    }
    async addLibraryVersion(sourceId: string, body: Record<string, unknown>) {
        return this.request(`/library/sources/${sourceId}/versions`, { method: 'POST', body });
    }
    async getLibraryVersion(id: string) {
        return this.request<LibVersionDetail>(`/library/versions/${id}`);
    }
    async updateLibraryVersion(id: string, body: Record<string, unknown>) {
        return this.request(`/library/versions/${id}`, { method: 'PATCH', body });
    }
    async diffLibraryVersions(a: string, b: string) {
        return this.request<{
            source: { id: string; title: string };
            from: { id: string; label: string };
            to: { id: string; label: string };
            addedKeys: string[];
            removedKeys: string[];
            changed: { stableKey: string; from: string; to: string; title: string }[];
            affectedMappingKeys: string[];
        }>(`/library/versions/${a}/diff/${b}`);
    }
    async flagLibraryReReview(versionId: string, changedUnitKeys: string[]) {
        return this.request<{ flagged: number }>(`/library/versions/${versionId}/flag-re-review`, {
            method: 'POST',
            body: { changedUnitKeys },
        });
    }
    async addLibraryUnit(versionId: string, body: Record<string, unknown>) {
        return this.request<LibUnit>(`/library/versions/${versionId}/units`, { method: 'POST', body });
    }
    async updateLibraryUnit(id: string, body: Record<string, unknown>) {
        return this.request<LibUnit>(`/library/units/${id}`, { method: 'PATCH', body });
    }
    async removeLibraryUnit(id: string) {
        return this.request<{ ok: boolean }>(`/library/units/${id}`, { method: 'DELETE' });
    }
    async buildLibraryChunks(versionId: string) {
        return this.request<{ jobId: string; status: string; chunks: number }>(`/library/versions/${versionId}/build-index`, { method: 'POST' });
    }
    async retryLibraryIndex(versionId: string) {
        return this.request<{ jobId: string; status: string; chunks: number }>(`/library/versions/${versionId}/retry-index`, { method: 'POST' });
    }
    async libraryVersionReadiness(versionId: string) {
        return this.request<LibVersionReadiness>(`/library/versions/${versionId}/readiness`);
    }
    async libraryIndexJobs(versionId: string) {
        return this.request<LibIndexJob[]>(`/library/versions/${versionId}/index-jobs`);
    }
    async libraryReviewContent(versionId: string) {
        return this.request(`/library/versions/${versionId}/review-content`, { method: 'POST' });
    }
    async libraryVerifyRights(sourceId: string, body: { basis: string; rightRag?: string; rightFullText?: string; rightRefLink?: string; rightFineTune?: string; rightExport?: string }) {
        return this.request(`/library/sources/${sourceId}/verify-rights`, { method: 'POST', body });
    }
    async libraryRevokeRights(sourceId: string, reason: string) {
        return this.request(`/library/sources/${sourceId}/revoke-rights`, { method: 'POST', body: { reason } });
    }
    async libraryUnitLookup(params: { code?: string; q?: string; versionId?: string }) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v && qs.set(k, String(v)));
        return this.request<LibUnitLookupResult[]>(`/library/unit-lookup${qs.toString() ? `?${qs}` : ''}`);
    }
    async suggestEvalSources(sessionId: string) {
        return this.request<LibSuggestSourcesResponse>(`/ai/eval-sessions/${sessionId}/suggest-sources`, { method: 'POST' });
    }
    async libraryRetrievalSearch(body: Record<string, unknown>) {
        return this.request<LibRetrievalResponse>('/library/retrieval/search', { method: 'POST', body });
    }
    async libraryVerifyCitations(citations: { unitCode?: string; versionId?: string; quote?: string }[]) {
        return this.request<{ citations: { input: unknown; verified: boolean; reason: string }[]; allVerified: boolean }>(
            '/library/retrieval/verify-citations',
            { method: 'POST', body: { citations } },
        );
    }
    async listLibraryMappings(params: { controlId?: string; testCardId?: string; processCardId?: string; status?: string }) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v && qs.set(k, String(v)));
        return this.request<LibMapping[]>(`/library/mappings${qs.toString() ? `?${qs}` : ''}`);
    }
    async listLibraryVersionMappings(versionId: string) {
        return this.request<LibMapping[]>(`/library/versions/${versionId}/mappings`);
    }
    async libraryUsedInEvaluations(versionId: string) {
        return this.request<Array<{ id: string; title: string; period: string | null; runStatus: string; outcome: string | null; updatedAt: string }>>(
            `/library/versions/${versionId}/used-in-evaluations`,
        );
    }
    async createLibraryMapping(body: Record<string, unknown>, asAiDraft = false) {
        return this.request<LibMapping>(`/library/mappings${asAiDraft ? '/ai-draft' : ''}`, { method: 'POST', body });
    }
    async reviewLibraryMapping(id: string, body: { status: string; rationale?: string }) {
        return this.request<LibMapping>(`/library/mappings/${id}/review`, { method: 'PATCH', body });
    }
    async removeLibraryMapping(id: string) {
        return this.request<{ ok: boolean }>(`/library/mappings/${id}`, { method: 'DELETE' });
    }
    async listLibraryTestCards(params: { status?: string; topicNo?: number } = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v != null && qs.set(k, String(v)));
        return this.request<LibTestCard[]>(`/library/test-cards${qs.toString() ? `?${qs}` : ''}`);
    }
    async getLibraryTestCard(id: string) {
        return this.request<LibTestCard>(`/library/test-cards/${id}`);
    }
    async upsertLibraryTestCard(body: Record<string, unknown>) {
        return this.request<LibTestCard>('/library/test-cards', { method: 'POST', body });
    }
    async setLibraryTestCardStatus(id: string, status: string) {
        return this.request<LibTestCard>(`/library/test-cards/${id}/status`, { method: 'PATCH', body: { status } });
    }
    async listLibraryProcessCards(area?: string) {
        return this.request<LibProcessCard[]>(`/library/process-cards${area ? `?area=${area}` : ''}`);
    }
    async getLibraryProcessCard(id: string) {
        return this.request<LibProcessCard>(`/library/process-cards/${id}`);
    }
    async upsertLibraryProcessCard(body: Record<string, unknown>) {
        return this.request<LibProcessCard>('/library/process-cards', { method: 'POST', body });
    }
    async listLibraryEvidenceRules(category?: string) {
        return this.request<LibEvidenceRule[]>(`/library/evidence-rules${category ? `?category=${category}` : ''}`);
    }
    async listLibraryDatasets() {
        return this.request<LibDataset[]>('/library/datasets');
    }
    async listLibraryScenarios(params: { datasetId?: string; status?: string; testCardId?: string; kind?: string } = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v && qs.set(k, String(v)));
        return this.request<LibScenario[]>(`/library/scenarios${qs.toString() ? `?${qs}` : ''}`);
    }
    async getLibraryScenario(id: string) {
        return this.request<LibScenario>(`/library/scenarios/${id}`);
    }
    async reviewLibraryScenario(id: string, body: { status: string; note?: string }) {
        return this.request<LibScenario>(`/library/scenarios/${id}/review`, { method: 'PATCH', body });
    }
    async exportLibraryJsonl(datasetId: string, onlyApproved = false) {
        return this.request<{ dataset: { code: string; purpose: string }; count: number; jsonl: string; note: string }>(
            `/library/datasets/${datasetId}/export.jsonl${onlyApproved ? '?onlyApproved=true' : ''}`,
        );
    }
    async listLibraryQualityRuns(datasetId?: string) {
        return this.request<LibQualityRun[]>(`/library/quality-runs${datasetId ? `?datasetId=${datasetId}` : ''}`);
    }
    async getLibraryQualityRun(id: string) {
        return this.request<LibQualityRun & { items: unknown[] }>(`/library/quality-runs/${id}`);
    }

    // ── Risk Simülasyonu ─────────────────────────────────────────────────────
    async getRiskSimulations(params: { status?: string; search?: string } = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v && qs.set(k, String(v)));
        return this.request<unknown[]>(`/risk-simulations${qs.toString() ? `?${qs}` : ''}`);
    }
    async getRiskSimulation(id: string) {
        return this.request<unknown>(`/risk-simulations/${id}`);
    }
    async createRiskSimulation(data: { name: string; description?: string }) {
        return this.request<unknown>('/risk-simulations', { method: 'POST', body: data });
    }
    async updateRiskSimulation(id: string, data: unknown) {
        return this.request<unknown>(`/risk-simulations/${id}`, { method: 'PATCH', body: data });
    }
    async createSimScenario(simulationId: string, data: unknown) {
        return this.request<unknown>(`/risk-simulations/${simulationId}/scenarios`, { method: 'POST', body: data });
    }
    async getSimScenario(scenarioId: string) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}`);
    }
    async updateSimScenario(scenarioId: string, data: unknown) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}`, { method: 'PATCH', body: data });
    }
    async resetSimScenario(scenarioId: string) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/reset`, { method: 'POST' });
    }
    async previewSimRefresh(scenarioId: string) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/refresh-preview`);
    }
    async applySimRefresh(scenarioId: string, acceptFields: string[]) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/refresh-apply`, { method: 'POST', body: { acceptFields } });
    }
    async calculateSimScenario(scenarioId: string) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/calculate`, { method: 'POST' });
    }
    async compareSimScenarios(a: string, b: string) {
        return this.request<any>(`/risk-simulations/scenarios/compare?a=${a}&b=${b}`);
    }
    async addSimControl(scenarioId: string, data: unknown) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/controls`, { method: 'POST', body: data });
    }
    async updateSimControl(scenarioId: string, controlId: string, data: unknown) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/controls/${controlId}`, { method: 'PATCH', body: data });
    }
    async removeSimControl(scenarioId: string, controlId: string) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/controls/${controlId}`, { method: 'DELETE' });
    }
    async redistributeSimWeights(scenarioId: string, weights: Record<string, number>) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/controls/redistribute-weights`, { method: 'POST', body: { weights } });
    }
    async addSimAction(scenarioId: string, data: unknown) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/actions`, { method: 'POST', body: data });
    }
    async updateSimAction(scenarioId: string, actionId: string, data: unknown) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/actions/${actionId}`, { method: 'PATCH', body: data });
    }
    async toggleSimAction(scenarioId: string, actionId: string, isApplied: boolean) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/actions/${actionId}/toggle`, { method: 'PATCH', body: { isApplied } });
    }
    async removeSimAction(scenarioId: string, actionId: string) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/actions/${actionId}`, { method: 'DELETE' });
    }
    async previewSimTransfer(scenarioId: string) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/transfer/preview`, { method: 'POST' });
    }
    async applySimTransfer(scenarioId: string, data: unknown) {
        return this.request<any>(`/risk-simulations/scenarios/${scenarioId}/transfer`, { method: 'POST', body: data });
    }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
