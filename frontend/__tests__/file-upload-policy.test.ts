import { FILE_UPLOAD_MAX_BYTES, validateUploadFile } from '@/lib/file-upload-policy';

const file = (name: string, type: string, size = 10) => ({ name, type, size });

describe('dosya yükleme politikası', () => {
    it.each([
        ['a.pdf', 'application/pdf'],
        ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ['a.png', 'image/png'],
        ['a.jpeg', 'image/jpeg'],
    ])('%s dosyasını doğru MIME ile kabul eder', (name, type) => {
        expect(validateUploadFile(file(name, type))).toBeNull();
    });

    it('boş dosyayı reddeder', () => {
        expect(validateUploadFile(file('a.pdf', 'application/pdf', 0))).toContain('Boş');
    });

    it('15 MB üstünü reddeder', () => {
        expect(validateUploadFile(file('a.pdf', 'application/pdf', FILE_UPLOAD_MAX_BYTES + 1))).toContain('15 MB');
    });

    it('uzantı ve MIME uyuşmazlığını reddeder', () => {
        expect(validateUploadFile(file('a.pdf', 'image/png'))).toContain('eşleşmiyor');
    });

    it('izin verilmeyen uzantıyı reddeder', () => {
        expect(validateUploadFile(file('a.zip', 'application/zip'))).toContain('Yalnız');
    });
});
