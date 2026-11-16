'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Eski bağımsız "Yeni Risk" sayfası sahte sabit verilerle (örnek kategori/kullanıcı) çalışıyordu
// ve geçersiz kayıt üretebiliyordu. Risk oluşturma Risk Envanteri ekranındaki forma taşındı.
export default function NewRiskPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/risks?new=1'); }, [router]);
    return null;
}
