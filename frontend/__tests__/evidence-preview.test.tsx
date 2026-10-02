import { render, screen, waitFor } from '@testing-library/react';
import { EvidencePreview } from '@/components/controls/EvidencePreview';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { getAttachmentBlobUrl: jest.fn(), downloadAttachment: jest.fn() } }));

describe('EvidencePreview', () => {
  it('PDF kanıtını kayıt kimliği üzerinden blob iframe içinde açar', async () => {
    (api.getAttachmentBlobUrl as jest.Mock).mockResolvedValue('blob:test-pdf');
    render(<EvidencePreview kind="action" attachment={{ id: 'ev-1', fileName: 'opaque.pdf', originalName: 'original.pdf', displayName: 'Kontrol Kanıtı', mimeType: 'application/pdf', sizeBytes: 10 }} />);
    await waitFor(() => expect(api.getAttachmentBlobUrl).toHaveBeenCalledWith('action', 'ev-1'));
    expect(await screen.findByTitle('Kontrol Kanıtı')).toHaveAttribute('src', expect.stringContaining('blob:test-pdf'));
    expect(screen.getByText('original.pdf')).toBeInTheDocument();
  });
});
