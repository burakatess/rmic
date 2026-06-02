const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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
            const error = await response.json().catch(() => ({ message: 'An error occurred' }));
            throw new Error(error.message || 'Request failed');
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

    async getUsers() {
        return this.request<any[]>('/admin/users');
    }

    // Dashboard
    async getDashboard() {
        return this.request('/reports/dashboard');
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

    async deleteControl(id: string) {
        return this.request(`/controls/${id}`, { method: 'DELETE' });
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

    // Control Tests
    async generateTests() {
        return this.request('/tests/generate', { method: 'POST' });
    }

    async createControlTest(controlId: string, data: unknown) {
        return this.request(`/controls/${controlId}/test`, {
            method: 'POST',
            body: data
        });
    }

    async getControlTests(controlId: string) {
        return this.request(`/controls/${controlId}/tests`);
    }

    async submitTestForApproval(testId: string) {
        return this.request(`/controls/tests/${testId}/submit`, {
            method: 'PUT'
        });
    }

    async approveTest(testId: string) {
        return this.request(`/controls/tests/${testId}/approve`, {
            method: 'PUT'
        });
    }

    async rejectTest(testId: string, reason: string) {
        return this.request(`/controls/tests/${testId}/reject`, {
            method: 'PUT',
            body: { reason }
        });
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

    async createAction(data: unknown) {
        return this.request('/actions', { method: 'POST', body: data });
    }

    async completeAction(id: string) {
        return this.request(`/actions/${id}/complete`, { method: 'POST' });
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

    async addFindingAttachment(findingId: string, meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number }) {
        return this.request(`/findings/${findingId}/attachments`, { method: 'POST', body: meta });
    }

    async removeFindingAttachment(findingId: string, attachmentId: string) {
        return this.request(`/findings/${findingId}/attachments/${attachmentId}`, { method: 'DELETE' });
    }

    // ── Action Attachments ────────────────────────────────────────────────────

    async addActionAttachment(findingId: string, actionId: string, meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number }) {
        return this.request(`/findings/${findingId}/actions/${actionId}/attachments`, { method: 'POST', body: meta });
    }

    async removeActionAttachment(findingId: string, actionId: string, attachmentId: string) {
        return this.request(`/findings/${findingId}/actions/${actionId}/attachments/${attachmentId}`, { method: 'DELETE' });
    }

    // ── FollowUp Attachments ──────────────────────────────────────────────────

    async addFollowUpAttachment(findingId: string, followUpId: string, meta: { fileName: string; originalName: string; mimeType: string; sizeBytes: number }) {
        return this.request(`/findings/${findingId}/follow-ups/${followUpId}/attachments`, { method: 'POST', body: meta });
    }

    async removeFollowUpAttachment(findingId: string, followUpId: string, attachmentId: string) {
        return this.request(`/findings/${findingId}/follow-ups/${followUpId}/attachments/${attachmentId}`, { method: 'DELETE' });
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

    // ── Risks (for selectors) — already defined as getRisks() above ──────────
}

export const api = new ApiClient(API_BASE_URL);
export default api;



