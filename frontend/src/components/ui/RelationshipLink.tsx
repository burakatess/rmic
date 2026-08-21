'use client';

import React from 'react';
import Link from 'next/link';

/* ============================================
   RELATIONSHIP LINK — Design System v2
   İlişkili kayıt navigasyonu tek standart:
   Risk ↔ Kontrol ↔ Test ↔ Bulgu ↔ Aksiyon ↔ Takip
   ID'ler monospace mavi link olarak render edilir.
   ============================================ */

export type RelatedEntityType =
  | 'risk'
  | 'control'
  | 'test'
  | 'finding'
  | 'action'
  | 'followUp'
  | 'audit';

/** entity tipi → route üretici (id = veritabanı id'si) */
const routeMap: Record<RelatedEntityType, (id: string) => string> = {
  risk: (id) => `/risks/${id}`,
  control: (id) => `/controls/${id}`,
  // Test detayı ayrı route değil; testing workspace'te panel açılır
  test: (id) => `/controls/testing?test=${id}`,
  finding: (id) => `/findings/${id}`,
  action: (id) => `/actions/${id}`,
  // Follow-up'ın kendi detay sayfası yok; bulgu detayındaki takip tab'ına gider
  followUp: (id) => `/findings/${id}?tab=takip`,
  audit: (id) => `/audits/plans/${id}`,
};

interface RelationshipLinkProps {
  type: RelatedEntityType;
  /** Route için kullanılacak id (genelde cuid) */
  id: string;
  /** Görünen etiket (örn. "C-2025-0012"); verilmezse id gösterilir */
  label?: string;
  /** ID görünümü yerine normal metin linki */
  plain?: boolean;
  className?: string;
}

export function RelationshipLink({ type, id, label, plain = false, className = '' }: RelationshipLinkProps) {
  const href = routeMap[type](id);
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className={
        plain
          ? `text-blue-600 hover:text-blue-800 hover:underline transition-colors ${className}`
          : `font-mono text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors ${className}`
      }
    >
      {label ?? id}
    </Link>
  );
}

export default RelationshipLink;
