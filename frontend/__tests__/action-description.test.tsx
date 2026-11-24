import { fireEvent, render, screen } from '@testing-library/react';
import { ActionDescription } from '@/components/actions/ActionDescription';

describe('ActionDescription', () => {
    it('etiketle açıklamayı gösterir; uzun metinde Devamını göster ile açılır', () => {
        const long = 'Erişim listeleri gözden geçirilecek. '.repeat(12);
        render(<ActionDescription text={long} />);
        expect(screen.getByText('Aksiyon açıklaması')).toBeInTheDocument();
        const p = screen.getByText(long.trim());
        expect(p.className).toContain('line-clamp-3');
        fireEvent.click(screen.getByRole('button', { name: 'Devamını göster' }));
        expect(p.className).not.toContain('line-clamp-3');
        expect(screen.getByRole('button', { name: 'Daha az göster' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('kısa metinde düğme yok; boşsa bilgi metni', () => {
        const { rerender } = render(<ActionDescription text="Kısa açıklama" />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        rerender(<ActionDescription text="" />);
        expect(screen.getByText('Açıklama girilmemiş.')).toBeInTheDocument();
    });
});
