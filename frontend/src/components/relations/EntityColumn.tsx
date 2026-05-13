'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { EntityCard, EntityCardData, EntityType } from './EntityCard';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FixedSizeList } = require('react-window');

interface EntityColumnProps {
    title: string;
    icon: string;
    type: EntityType;
    entities: EntityCardData[];
    selectedId: string | null;
    onSelect: (type: EntityType, id: string) => void;
    totalCount?: number;
    height?: number;
}

const ITEM_HEIGHT = 90;
const INITIAL_VISIBLE = 15;

export function EntityColumn({
    title,
    icon,
    type,
    entities,
    selectedId,
    onSelect,
    totalCount,
    height = 600,
}: EntityColumnProps) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<string>('all');
    const [showAll, setShowAll] = useState(false);

    // Filter entities based on search and filter
    const filteredEntities = useMemo(() => {
        let result = entities;

        // Search filter
        if (search) {
            const searchLower = search.toLowerCase();
            result = result.filter(e =>
                e.code.toLowerCase().includes(searchLower) ||
                e.title.toLowerCase().includes(searchLower)
            );
        }

        // Quick filter
        if (filter === 'with_links') {
            result = result.filter(e => (e.linkedCount || 0) > 0);
        } else if (filter === 'active') {
            result = result.filter(e => !['CLOSED', 'COMPLETED', 'RESOLVED'].includes(e.status || ''));
        }

        return result;
    }, [entities, search, filter]);

    // Limit display when not showing all
    const displayEntities = showAll ? filteredEntities : filteredEntities.slice(0, INITIAL_VISIBLE);

    const handleSelect = useCallback((id: string) => {
        onSelect(type, id);
    }, [type, onSelect]);

    // Row renderer for virtual list
    const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
        const entity = displayEntities[index];
        if (!entity) return null;

        return (
            <EntityCard
                key={entity.id}
                entity={entity}
                type={type}
                isSelected={selectedId === entity.id}
                onSelect={handleSelect}
                style={style}
            />
        );
    }, [displayEntities, type, selectedId, handleSelect]);

    const actualTotal = totalCount ?? entities.length;
    const showingCount = displayEntities.length;
    const hasMore = !showAll && filteredEntities.length > INITIAL_VISIBLE;

    return (
        <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 p-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">{icon}</span>
                        <h3 className="font-semibold text-gray-900">{title}</h3>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="font-medium">{showingCount}</span>
                        <span>/</span>
                        <span>{actualTotal}</span>
                    </div>
                </div>

                {/* Search */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Ara..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                        <option value="all">Tümü</option>
                        <option value="with_links">Bağlantılı</option>
                        <option value="active">Aktif</option>
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-hidden">
                {displayEntities.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                        {search || filter !== 'all' ? 'Sonuç bulunamadı' : 'Kayıt yok'}
                    </div>
                ) : showAll && displayEntities.length > 20 ? (
                    // Use virtual scrolling for large lists
                    <FixedSizeList
                        height={height - 120}
                        itemCount={displayEntities.length}
                        itemSize={ITEM_HEIGHT}
                        width="100%"
                    >
                        {Row}
                    </FixedSizeList>
                ) : (
                    // Regular rendering for small lists
                    <div className="overflow-y-auto p-1" style={{ maxHeight: height - 120 }}>
                        {displayEntities.map((entity) => (
                            <EntityCard
                                key={entity.id}
                                entity={entity}
                                type={type}
                                isSelected={selectedId === entity.id}
                                onSelect={handleSelect}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Show All / Collapse */}
            {(hasMore || showAll) && (
                <div className="flex-shrink-0 p-2 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="w-full px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                        {showAll ? 'Daralt' : `Tümünü Göster (${filteredEntities.length})`}
                    </button>
                </div>
            )}
        </div>
    );
}

export default EntityColumn;
