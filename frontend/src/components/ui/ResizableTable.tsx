'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface ColumnDef<T> {
    key: string;
    header: string;
    minWidth?: number;
    defaultWidth?: number;
    maxWidth?: number;
    render: (item: T, index: number) => React.ReactNode;
    headerClassName?: string;
    cellClassName?: string;
}

interface ResizableTableProps<T> {
    columns: ColumnDef<T>[];
    data: T[];
    rowKey: (item: T) => string;
    onRowClick?: (item: T) => void;
    selectedRows?: Set<string>;
    onRowSelect?: (id: string) => void;
    onSelectAll?: () => void;
    showCheckbox?: boolean;
    emptyMessage?: string;
    className?: string;
    stickyHeader?: boolean;
    storageKey?: string; // For persisting column widths
}

export function ResizableTable<T>({
    columns,
    data,
    rowKey,
    onRowClick,
    selectedRows,
    onRowSelect,
    onSelectAll,
    showCheckbox = false,
    emptyMessage = 'Veri bulunamadı',
    className = '',
    stickyHeader = false,
    storageKey,
}: ResizableTableProps<T>) {
    // Initialize column widths from localStorage or defaults
    const getInitialWidths = useCallback(() => {
        if (storageKey && typeof window !== 'undefined') {
            const saved = localStorage.getItem(`table-widths-${storageKey}`);
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch {
                    // Ignore parse errors
                }
            }
        }
        return columns.reduce((acc, col) => {
            acc[col.key] = col.defaultWidth || 150;
            return acc;
        }, {} as Record<string, number>);
    }, [columns, storageKey]);

    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(getInitialWidths);
    const [resizing, setResizing] = useState<string | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // Save widths to localStorage
    useEffect(() => {
        if (storageKey && typeof window !== 'undefined') {
            localStorage.setItem(`table-widths-${storageKey}`, JSON.stringify(columnWidths));
        }
    }, [columnWidths, storageKey]);

    const handleMouseDown = useCallback((e: React.MouseEvent, colKey: string) => {
        e.preventDefault();
        setResizing(colKey);
        startX.current = e.clientX;
        startWidth.current = columnWidths[colKey] || 150;
    }, [columnWidths]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!resizing) return;

        const delta = e.clientX - startX.current;
        const col = columns.find(c => c.key === resizing);
        const minWidth = col?.minWidth || 50;
        const maxWidth = col?.maxWidth || 500;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));

        setColumnWidths(prev => ({
            ...prev,
            [resizing]: newWidth,
        }));
    }, [resizing, columns]);

    const handleMouseUp = useCallback(() => {
        setResizing(null);
    }, []);

    useEffect(() => {
        if (resizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [resizing, handleMouseMove, handleMouseUp]);

    const isAllSelected = data.length > 0 && selectedRows?.size === data.length;

    return (
        <div className={`overflow-x-auto ${className}`}>
            <table className="w-full text-sm border-collapse">
                <thead className={`bg-gray-50 border-b border-gray-200 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
                    <tr>
                        {showCheckbox && (
                            <th className="px-3 py-3 text-center w-10 bg-gray-50">
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={onSelectAll}
                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                            </th>
                        )}
                        {columns.map((col, idx) => (
                            <th
                                key={col.key}
                                className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase relative select-none bg-gray-50 ${col.headerClassName || ''}`}
                                style={{ width: columnWidths[col.key], minWidth: col.minWidth || 50 }}
                            >
                                <div className="flex items-center justify-between pr-2">
                                    <span className="truncate">{col.header}</span>
                                </div>
                                {/* Resize handle */}
                                {idx < columns.length - 1 && (
                                    <div
                                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group"
                                        onMouseDown={(e) => handleMouseDown(e, col.key)}
                                    >
                                        <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-gray-300 group-hover:bg-blue-500 ${resizing === col.key ? 'bg-blue-500' : ''}`} />
                                    </div>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                    {data.length === 0 ? (
                        <tr>
                            <td
                                colSpan={columns.length + (showCheckbox ? 1 : 0)}
                                className="px-4 py-12 text-center text-gray-500"
                            >
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : (
                        data.map((item, idx) => {
                            const key = rowKey(item);
                            const isSelected = selectedRows?.has(key);
                            return (
                                <tr
                                    key={key}
                                    className={`hover:bg-gray-50 group ${isSelected ? 'bg-blue-50' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}
                                    onClick={() => onRowClick?.(item)}
                                >
                                    {showCheckbox && (
                                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => onRowSelect?.(key)}
                                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                            />
                                        </td>
                                    )}
                                    {columns.map((col) => (
                                        <td
                                            key={col.key}
                                            className={`px-3 py-3 ${col.cellClassName || ''}`}
                                            style={{ width: columnWidths[col.key], maxWidth: columnWidths[col.key] }}
                                        >
                                            <div className="truncate">
                                                {col.render(item, idx)}
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}

export default ResizableTable;
