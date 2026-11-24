import { render, screen } from '@testing-library/react';
import { KpiCard } from '@/components/ui';

describe('KpiCard', () => {
    it('bilinmeyen variant sayfayı çökertmez, varsayılan stile düşer', () => {
        render(<KpiCard title="Artık Risk" value={9} variant={'medium' as any} />);
        expect(screen.getByText('9')).toHaveClass('text-slate-800');
    });
});
