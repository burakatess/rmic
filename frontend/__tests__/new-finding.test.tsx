import { render, screen } from '@testing-library/react';
import NewFindingPage from '@/app/(dashboard)/findings/new/page';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
    __esModule: true,
    default: {
        getControls: jest.fn().mockResolvedValue([]),
        getDirectorates: jest.fn().mockResolvedValue([]),
        getUsers: jest.fn().mockResolvedValue([]),
        createFinding: jest.fn(),
    },
}));

describe('Yeni bulgu önem derecesi', () => {
    it('yalnız KZ ve KD seçeneklerini yeni kayıt için gösterir', async () => {
        render(<NewFindingPage />);

        expect(await screen.findByRole('button', { name: 'KZ' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'KD' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Orta' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Düşük' })).not.toBeInTheDocument();
    });
});
