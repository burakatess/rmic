import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseResizableColumnsOptions {
    storageKey?: string;
    defaultWidths: Record<string, number>;
    minWidth?: number;
    maxWidth?: number;
}

export function useResizableColumns({
    storageKey,
    defaultWidths,
    minWidth = 50,
    maxWidth = 500,
}: UseResizableColumnsOptions) {
    // Always initialize with defaultWidths to avoid SSR hydration mismatch
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultWidths);
    const [resizingCol, setResizingCol] = useState<string | null>(null);
    const [isClient, setIsClient] = useState(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    // Load from localStorage on client side only (after hydration)
    useEffect(() => {
        setIsClient(true);
        if (storageKey && typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem(`col-widths-${storageKey}`);
                if (saved) {
                    setColumnWidths(JSON.parse(saved));
                }
            } catch {
                // Ignore
            }
        }
    }, [storageKey]);

    // Save to localStorage
    useEffect(() => {
        if (isClient && storageKey && typeof window !== 'undefined') {
            localStorage.setItem(`col-widths-${storageKey}`, JSON.stringify(columnWidths));
        }
    }, [columnWidths, storageKey, isClient]);

    const handleMouseDown = useCallback((e: React.MouseEvent, colKey: string) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingCol(colKey);
        startX.current = e.clientX;
        startWidth.current = columnWidths[colKey] || defaultWidths[colKey] || 100;
    }, [columnWidths, defaultWidths]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingCol) return;
        const delta = e.clientX - startX.current;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
        setColumnWidths(prev => ({ ...prev, [resizingCol]: newWidth }));
    }, [resizingCol, minWidth, maxWidth]);

    const handleMouseUp = useCallback(() => {
        setResizingCol(null);
    }, []);

    useEffect(() => {
        if (resizingCol) {
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
    }, [resizingCol, handleMouseMove, handleMouseUp]);

    // Get width for a column
    const getWidth = (colKey: string) => columnWidths[colKey] || defaultWidths[colKey] || 100;

    // Get style object for header
    const getHeaderStyle = (colKey: string) => ({
        width: getWidth(colKey),
        minWidth,
    });

    // Get resize handle props
    const getResizeHandleProps = (colKey: string) => ({
        onMouseDown: (e: React.MouseEvent) => handleMouseDown(e, colKey),
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        className: `absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-10 ${resizingCol === colKey ? 'bg-blue-400' : 'hover:bg-blue-300'}`,
    });

    const resetWidths = () => setColumnWidths(defaultWidths);

    return {
        columnWidths,
        getWidth,
        getHeaderStyle,
        getResizeHandleProps,
        isResizing: !!resizingCol,
        resizingCol,
        resetWidths,
    };
}
