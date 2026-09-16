'use client';

import { useRef } from 'react';

/**
 * Bağımlılıksız "hafif zengin metin" alanı — düz textarea üzerine kurulu.
 * Desteklenen biçimlendirme: paragraf (boş satır), "- " madde işareti listesi
 * (Enter'da otomatik sürer), "1. " numaralı liste (Enter'da numarayı artırır),
 * Ctrl/Cmd+B → **kalın**, Ctrl/Cmd+I → _italik_. Kopyala/yapıştır native
 * textarea davranışı olduğu için sorunsuz çalışır; format kaybı olmaz çünkü
 * içerik her zaman düz metin (markdown-lite) olarak saklanır.
 */
interface RichTextAreaProps {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    minRows?: number;
    className?: string;
    id?: string;
}

export function RichTextArea({ value, onChange, placeholder, disabled, minRows = 10, className = '', id }: RichTextAreaProps) {
    const ref = useRef<HTMLTextAreaElement>(null);

    const wrapSelection = (before: string, after: string) => {
        const el = ref.current;
        if (!el) return;
        const { selectionStart, selectionEnd } = el;
        const selected = value.slice(selectionStart, selectionEnd);
        const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
        onChange(next);
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = selectionStart + before.length;
            el.selectionEnd = selectionEnd + before.length;
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapSelection('**', '**'); return; }
        if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapSelection('_', '_'); return; }

        if (e.key === 'Enter') {
            const el = ref.current;
            if (!el) return;
            const cursor = el.selectionStart;
            const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
            const currentLine = value.slice(lineStart, cursor);

            const bulletMatch = currentLine.match(/^(\s*)- (.*)$/);
            const numberedMatch = currentLine.match(/^(\s*)(\d+)\. (.*)$/);

            if (bulletMatch) {
                if (bulletMatch[2].trim() === '') {
                    // Boş madde üzerinde Enter → listeyi bitir
                    e.preventDefault();
                    const next = value.slice(0, lineStart) + value.slice(cursor);
                    onChange(next);
                    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = lineStart; });
                    return;
                }
                e.preventDefault();
                const prefix = `\n${bulletMatch[1]}- `;
                const next = value.slice(0, cursor) + prefix + value.slice(cursor);
                onChange(next);
                requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = cursor + prefix.length; });
                return;
            }
            if (numberedMatch) {
                if (numberedMatch[3].trim() === '') {
                    e.preventDefault();
                    const next = value.slice(0, lineStart) + value.slice(cursor);
                    onChange(next);
                    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = lineStart; });
                    return;
                }
                e.preventDefault();
                const n = parseInt(numberedMatch[2], 10) + 1;
                const prefix = `\n${numberedMatch[1]}${n}. `;
                const next = value.slice(0, cursor) + prefix + value.slice(cursor);
                onChange(next);
                requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = cursor + prefix.length; });
                return;
            }
        }
    };

    return (
        <div className={`flex flex-col ${className}`}>
            <div className="flex items-center gap-1 mb-1.5">
                <button type="button" disabled={disabled} onClick={() => wrapSelection('**', '**')}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-xs font-black text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                    title="Kalın (Ctrl+B)">B</button>
                <button type="button" disabled={disabled} onClick={() => wrapSelection('_', '_')}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-xs italic font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                    title="İtalik (Ctrl+I)">i</button>
                <button type="button" disabled={disabled} onClick={() => wrapSelection('\n- ', '')}
                    className="px-2 h-7 flex items-center justify-center rounded-md text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                    title="Madde işareti listesi">• Liste</button>
                <button type="button" disabled={disabled} onClick={() => wrapSelection('\n1. ', '')}
                    className="px-2 h-7 flex items-center justify-center rounded-md text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                    title="Numaralı liste">1. Liste</button>
            </div>
            <textarea
                ref={ref}
                id={id}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={minRows}
                className="w-full flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm leading-relaxed outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-y disabled:bg-slate-50 disabled:text-slate-500 font-[inherit]"
            />
        </div>
    );
}

/** Salt-okunur görünüm — aynı markdown-lite sözdizimini güvenli biçimde
 * (dangerouslySetInnerHTML KULLANILMAZ, satır satır React elemanına çevrilir). */
export function MarkdownLiteView({ text, className = '' }: { text: string; className?: string }) {
    if (!text || !text.trim()) return <p className={`text-sm text-slate-400 italic ${className}`}>—</p>;

    const renderInline = (line: string, key: number) => {
        const parts = line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
        return (
            <span key={key}>
                {parts.map((part, i) => {
                    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
                    if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
                    return <span key={i}>{part}</span>;
                })}
            </span>
        );
    };

    const lines = text.split('\n');
    const blocks: React.ReactNode[] = [];
    let i = 0;
    let key = 0;
    while (i < lines.length) {
        const line = lines[i];
        const bulletMatch = line.match(/^\s*- (.*)$/);
        const numberedMatch = line.match(/^\s*\d+\. (.*)$/);

        if (bulletMatch) {
            const items: string[] = [];
            while (i < lines.length && lines[i].match(/^\s*- (.*)$/)) {
                items.push(lines[i].replace(/^\s*- /, ''));
                i++;
            }
            blocks.push(
                <ul key={key++} className="list-disc pl-5 space-y-0.5 my-1.5">
                    {items.map((it, idx) => <li key={idx}>{renderInline(it, idx)}</li>)}
                </ul>
            );
            continue;
        }
        if (numberedMatch) {
            const items: string[] = [];
            while (i < lines.length && lines[i].match(/^\s*\d+\. (.*)$/)) {
                items.push(lines[i].replace(/^\s*\d+\. /, ''));
                i++;
            }
            blocks.push(
                <ol key={key++} className="list-decimal pl-5 space-y-0.5 my-1.5">
                    {items.map((it, idx) => <li key={idx}>{renderInline(it, idx)}</li>)}
                </ol>
            );
            continue;
        }
        if (line.trim() === '') { i++; continue; }
        blocks.push(<p key={key++} className="my-1">{renderInline(line, 0)}</p>);
        i++;
    }

    return <div className={`text-sm text-slate-700 leading-relaxed ${className}`}>{blocks}</div>;
}
