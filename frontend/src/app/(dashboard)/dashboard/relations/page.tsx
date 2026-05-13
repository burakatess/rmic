'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '@/lib/api';
import { EntityColumn } from '@/components/relations/EntityColumn';
import { EntityCardData, EntityType } from '@/components/relations/EntityCard';

interface RawRisk {
    id: string;
    riskId: string;
    name: string;
    status: string;
    residualRiskScore: number;
    controls?: Array<{ control?: { id: string; controlId: string } }>;
    _count?: { controls: number };
}

interface RawControl {
    id: string;
    controlId: string;
    name: string;
    effectivenessStatus: string;
    risks?: Array<{ risk?: { id: string; riskId: string } }>;
    findings?: Array<{ id: string }>;
    _count?: { risks: number; findings: number };
}

interface RawFinding {
    id: string;
    findingId: string;
    description: string;
    status: string;
    controlId?: string;
    control?: { id: string; risks?: Array<{ risk?: { id: string } }> };
    actions?: Array<{ id: string }>;
    _count?: { actions: number };
}

interface RawAction {
    id: string;
    actionId: string;
    description: string;
    status: string;
    findingId?: string;
    finding?: { id: string; controlId?: string; control?: { id: string } };
}

interface Selection {
    type: EntityType;
    id: string;
    code: string;
}

export default function RelationsPage() {
    const [risks, setRisks] = useState<EntityCardData[]>([]);
    const [controls, setControls] = useState<EntityCardData[]>([]);
    const [findings, setFindings] = useState<EntityCardData[]>([]);
    const [actions, setActions] = useState<EntityCardData[]>([]);

    const [rawRisks, setRawRisks] = useState<RawRisk[]>([]);
    const [rawControls, setRawControls] = useState<RawControl[]>([]);
    const [rawFindings, setRawFindings] = useState<RawFinding[]>([]);
    const [rawActions, setRawActions] = useState<RawAction[]>([]);

    const [selection, setSelection] = useState<Selection | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch all data
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [risksRes, controlsRes, findingsRes, actionsRes] = await Promise.all([
                    api.getRisks(),
                    api.getControls(),
                    api.getFindings(),
                    api.getActions(),
                ]);

                // Store raw data for relationship filtering
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const riskData = ((risksRes as any).data || risksRes || []) as RawRisk[];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const controlData = ((controlsRes as any).data || controlsRes || []) as RawControl[];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const findingData = ((findingsRes as any).data || findingsRes || []) as RawFinding[];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const actionData = ((actionsRes as any).data || actionsRes || []) as RawAction[];

                setRawRisks(riskData);
                setRawControls(controlData);
                setRawFindings(findingData);
                setRawActions(actionData);

                // Transform to display format
                setRisks(riskData.map(r => ({
                    id: r.id,
                    code: r.riskId,
                    title: r.name,
                    status: r.status,
                    score: r.residualRiskScore,
                    linkedCount: r._count?.controls || r.controls?.length || 0,
                })));

                setControls(controlData.map(c => ({
                    id: c.id,
                    code: c.controlId,
                    title: c.name,
                    status: c.effectivenessStatus,
                    linkedCount: (c._count?.risks || c.risks?.length || 0) + (c._count?.findings || c.findings?.length || 0),
                })));

                setFindings(findingData.map(f => ({
                    id: f.id,
                    code: f.findingId,
                    title: f.description?.substring(0, 100) || 'Bulgu',
                    status: f.status,
                    linkedCount: f._count?.actions || f.actions?.length || 0,
                })));

                setActions(actionData.map(a => ({
                    id: a.id,
                    code: a.actionId,
                    title: a.description?.substring(0, 100) || 'Aksiyon',
                    status: a.status,
                })));
            } catch (err) {
                console.error('Failed to fetch relations data:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Handle selection
    const handleSelect = useCallback((type: EntityType, id: string) => {
        // If same item is clicked, deselect
        if (selection?.type === type && selection?.id === id) {
            setSelection(null);
            return;
        }

        // Find the code for the selected item
        let code = '';
        switch (type) {
            case 'risk':
                code = rawRisks.find(r => r.id === id)?.riskId || id;
                break;
            case 'control':
                code = rawControls.find(c => c.id === id)?.controlId || id;
                break;
            case 'finding':
                code = rawFindings.find(f => f.id === id)?.findingId || id;
                break;
            case 'action':
                code = rawActions.find(a => a.id === id)?.actionId || id;
                break;
        }

        setSelection({ type, id, code });
    }, [selection, rawRisks, rawControls, rawFindings, rawActions]);

    // Clear selection
    const clearSelection = useCallback(() => {
        setSelection(null);
    }, []);

    // Filter entities based on selection (relationship logic)
    const filteredData = useMemo(() => {
        if (!selection) {
            return { risks, controls, findings, actions };
        }

        const { type, id } = selection;

        let filteredRisks = risks;
        let filteredControls = controls;
        let filteredFindings = findings;
        let filteredActions = actions;

        if (type === 'risk') {
            // Risk selected: show linked controls, their findings, and those findings' actions
            const selectedRisk = rawRisks.find(r => r.id === id);
            const linkedControlIds = new Set(
                (selectedRisk?.controls || []).map(c => c.control?.id).filter(Boolean)
            );

            filteredControls = controls.filter(c => linkedControlIds.has(c.id));

            const linkedFindingControlIds = linkedControlIds;
            const linkedFindingIds = new Set(
                rawFindings.filter(f => linkedFindingControlIds.has(f.controlId || f.control?.id || '')).map(f => f.id)
            );
            filteredFindings = findings.filter(f => linkedFindingIds.has(f.id));

            const linkedActionFindingIds = linkedFindingIds;
            filteredActions = actions.filter(a => {
                const action = rawActions.find(ra => ra.id === a.id);
                return linkedActionFindingIds.has(action?.findingId || action?.finding?.id || '');
            });
        } else if (type === 'control') {
            // Control selected: show linked risks, findings, and those findings' actions
            const selectedControl = rawControls.find(c => c.id === id);
            const linkedRiskIds = new Set(
                (selectedControl?.risks || []).map(r => r.risk?.id).filter(Boolean)
            );

            filteredRisks = risks.filter(r => linkedRiskIds.has(r.id));

            const linkedFindingIds = new Set(
                rawFindings.filter(f => f.controlId === id || f.control?.id === id).map(f => f.id)
            );
            filteredFindings = findings.filter(f => linkedFindingIds.has(f.id));

            filteredActions = actions.filter(a => {
                const action = rawActions.find(ra => ra.id === a.id);
                return linkedFindingIds.has(action?.findingId || action?.finding?.id || '');
            });
        } else if (type === 'finding') {
            // Finding selected: show linked control, its risks, and linked actions
            const selectedFinding = rawFindings.find(f => f.id === id);
            const controlId = selectedFinding?.controlId || selectedFinding?.control?.id;

            filteredControls = controls.filter(c => c.id === controlId);

            const selectedControl = rawControls.find(c => c.id === controlId);
            const linkedRiskIds = new Set(
                (selectedControl?.risks || []).map(r => r.risk?.id).filter(Boolean)
            );
            filteredRisks = risks.filter(r => linkedRiskIds.has(r.id));

            filteredActions = actions.filter(a => {
                const action = rawActions.find(ra => ra.id === a.id);
                return action?.findingId === id || action?.finding?.id === id;
            });
        } else if (type === 'action') {
            // Action selected: show the chain back to risks
            const selectedAction = rawActions.find(a => a.id === id);
            const findingId = selectedAction?.findingId || selectedAction?.finding?.id;

            filteredFindings = findings.filter(f => f.id === findingId);

            const selectedFinding = rawFindings.find(f => f.id === findingId);
            const controlId = selectedFinding?.controlId || selectedFinding?.control?.id;

            filteredControls = controls.filter(c => c.id === controlId);

            const selectedControl = rawControls.find(c => c.id === controlId);
            const linkedRiskIds = new Set(
                (selectedControl?.risks || []).map(r => r.risk?.id).filter(Boolean)
            );
            filteredRisks = risks.filter(r => linkedRiskIds.has(r.id));
        }

        return {
            risks: filteredRisks,
            controls: filteredControls,
            findings: filteredFindings,
            actions: filteredActions,
        };
    }, [selection, risks, controls, findings, actions, rawRisks, rawControls, rawFindings, rawActions]);

    const typeLabels: Record<EntityType, string> = {
        risk: 'Risk',
        control: 'Kontrol',
        finding: 'Bulgu',
        action: 'Aksiyon',
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-gray-500">Yükleniyor...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1800px] mx-auto px-4 py-6">
                {/* Header Area with Inline Focus Bar */}
                <div className="mb-6 flex flex-col xl:flex-row xl:items-end justify-between gap-4 min-h-[60px]">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Risk, Kontrol, Bulgu ve Aksiyon İlişkisi</h1>
                        <p className="text-gray-500 mt-1">GRC varlıkları arasındaki ilişkileri keşfedin</p>
                    </div>

                    {/* Focus Bar - Inline to prevent layout shift */}
                    <div className={`transition-all duration-300 transform ${selection ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                        {selection && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-4 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-blue-600 font-medium text-sm">Odaklanılan:</span>
                                    <span className="bg-white/50 text-blue-700 px-2 py-0.5 rounded text-sm font-bold border border-blue-100">
                                        {typeLabels[selection.type]}
                                    </span>
                                    <span className="font-mono text-sm text-blue-600 font-medium">{selection.code}</span>
                                </div>
                                <div className="h-4 w-px bg-blue-200" />
                                <button
                                    onClick={clearSelection}
                                    className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                >
                                    Temizle
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 4-Column Layout */}
                <div className="grid grid-cols-4 gap-4" style={{ height: 'calc(100vh - 220px)' }}>
                    <EntityColumn
                        title="Riskler"
                        icon="⚠️"
                        type="risk"
                        entities={filteredData.risks}
                        selectedId={selection?.type === 'risk' ? selection.id : null}
                        onSelect={handleSelect}
                        totalCount={risks.length}
                    />
                    <EntityColumn
                        title="Kontroller"
                        icon="🛡️"
                        type="control"
                        entities={filteredData.controls}
                        selectedId={selection?.type === 'control' ? selection.id : null}
                        onSelect={handleSelect}
                        totalCount={controls.length}
                    />
                    <EntityColumn
                        title="Bulgular"
                        icon="🔍"
                        type="finding"
                        entities={filteredData.findings}
                        selectedId={selection?.type === 'finding' ? selection.id : null}
                        onSelect={handleSelect}
                        totalCount={findings.length}
                    />
                    <EntityColumn
                        title="Aksiyonlar"
                        icon="📋"
                        type="action"
                        entities={filteredData.actions}
                        selectedId={selection?.type === 'action' ? selection.id : null}
                        onSelect={handleSelect}
                        totalCount={actions.length}
                    />
                </div>

                {/* Footer Stats */}
                <div className="mt-4 flex justify-center gap-8 text-sm text-gray-500">
                    <span>Toplam: {risks.length} Risk</span>
                    <span>•</span>
                    <span>{controls.length} Kontrol</span>
                    <span>•</span>
                    <span>{findings.length} Bulgu</span>
                    <span>•</span>
                    <span>{actions.length} Aksiyon</span>
                </div>
            </div>
        </div>
    );
}
