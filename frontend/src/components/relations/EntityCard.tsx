'use client';

import React from 'react';
import Link from 'next/link';

export type EntityType = 'risk' | 'control' | 'finding' | 'action';

export interface EntityCardData {
    id: string;
    code: string;
    title: string;
    linkedCount?: number;
    status?: string;
    score?: number;
}

interface EntityCardProps {
    entity: EntityCardData;
    type: EntityType;
    isSelected: boolean;
    onSelect: (id: string) => void;
    style?: React.CSSProperties;
}

const typeConfig: Record<EntityType, { color: string; hoverColor: string; link: string; icon: string }> = {
    risk: { color: 'bg-blue-50 border-blue-200', hoverColor: 'hover:bg-blue-100', link: '/risks', icon: '⚠️' },
    control: { color: 'bg-green-50 border-green-200', hoverColor: 'hover:bg-green-100', link: '/controls', icon: '🛡️' },
    finding: { color: 'bg-orange-50 border-orange-200', hoverColor: 'hover:bg-orange-100', link: '/findings', icon: '🔍' },
    action: { color: 'bg-purple-50 border-purple-200', hoverColor: 'hover:bg-purple-100', link: '/actions', icon: '📋' },
};

const statusColors: Record<string, string> = {
    // Risk statuses
    'IDENTIFIED': 'bg-gray-100 text-gray-600',
    'ASSESSED': 'bg-blue-100 text-blue-600',
    'TREATED': 'bg-green-100 text-green-600',
    'MONITORED': 'bg-purple-100 text-purple-600',
    // Control statuses
    'EFFECTIVE': 'bg-green-100 text-green-600',
    'PARTIALLY_EFFECTIVE': 'bg-yellow-100 text-yellow-600',
    'INEFFECTIVE': 'bg-red-100 text-red-600',
    'NOT_TESTED': 'bg-gray-100 text-gray-500',
    // Finding statuses
    'OPEN': 'bg-red-100 text-red-600',
    'IN_PROGRESS': 'bg-yellow-100 text-yellow-600',
    'RESOLVED': 'bg-green-100 text-green-600',
    'CLOSED': 'bg-gray-100 text-gray-600',
    // Action statuses
    'PENDING': 'bg-gray-100 text-gray-600',
    'COMPLETED': 'bg-green-100 text-green-600',
    'OVERDUE': 'bg-red-100 text-red-600',
};

export function EntityCard({ entity, type, isSelected, onSelect, style }: EntityCardProps) {
    const config = typeConfig[type];

    return (
        <div
            style={style}
            className={`mx-2 mb-1 p-3 rounded-lg border transition-all cursor-pointer
                ${isSelected
                    ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-300'
                    : `${config.color} ${config.hoverColor}`
                }`}
            onClick={() => onSelect(entity.id)}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    {/* Code - Clickable to detail page */}
                    <Link
                        href={`${config.link}/${entity.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-xs text-gray-500 hover:text-blue-600 hover:underline"
                    >
                        {entity.code}
                    </Link>

                    {/* Title */}
                    <p className="text-sm font-medium text-gray-900 truncate mt-0.5" title={entity.title}>
                        {entity.title}
                    </p>

                    {/* Metadata row */}
                    <div className="flex items-center gap-2 mt-1.5">
                        {entity.status && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[entity.status] || 'bg-gray-100 text-gray-500'}`}>
                                {entity.status}
                            </span>
                        )}
                        {entity.score !== undefined && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${entity.score >= 15 ? 'bg-red-100 text-red-600' :
                                    entity.score >= 10 ? 'bg-yellow-100 text-yellow-600' :
                                        'bg-green-100 text-green-600'
                                }`}>
                                {entity.score}
                            </span>
                        )}
                        {entity.linkedCount !== undefined && entity.linkedCount > 0 && (
                            <span className="text-xs text-gray-400">
                                🔗 {entity.linkedCount}
                            </span>
                        )}
                    </div>
                </div>

                {/* Type icon */}
                <span className="text-lg opacity-50">{config.icon}</span>
            </div>
        </div>
    );
}

export default EntityCard;
