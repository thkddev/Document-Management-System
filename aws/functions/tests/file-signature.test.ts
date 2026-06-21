import { describe, expect, it } from 'vitest';
import { validateFileSignature } from '../src/domain/file-signature.js';

const cases = [
  ['report.pdf', 'application/pdf', 'pdf', 'application/pdf'],
  [
    'report.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  [
    'report.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  ['image.png', 'image/png', 'png', 'image/png'],
  ['photo.jpeg', 'image/jpeg', 'jpg', 'image/jpeg'],
] as const;

describe('validateFileSignature', () => {
  it('nhận diện PDF thật bằng detector mặc định', async () => {
    await expect(
      validateFileSignature({
        fileName: 'report.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('%PDF-1.7\n%%'),
      }),
    ).resolves.toBeNull();
  });

  it.each(cases)('accepts valid %s content', async (fileName, contentType, ext, mime) => {
    await expect(
      validateFileSignature(
        { fileName, contentType, body: new Uint8Array([1, 2, 3]) },
        async () => ({ ext, mime }),
      ),
    ).resolves.toBeNull();
  });

  it('rejects a generic ZIP renamed to DOCX', async () => {
    await expect(
      validateFileSignature(
        {
          fileName: 'fake.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          body: new Uint8Array([0x50, 0x4b]),
        },
        async () => ({ ext: 'zip', mime: 'application/zip' }),
      ),
    ).resolves.toBe('Định dạng thực của file không khớp phần mở rộng và MIME type.');
  });

  it('rejects an extension that does not match the declared MIME', async () => {
    await expect(
      validateFileSignature(
        { fileName: 'fake.png', contentType: 'application/pdf', body: new Uint8Array() },
        async () => ({ ext: 'pdf', mime: 'application/pdf' }),
      ),
    ).resolves.toBe('Phần mở rộng file không khớp MIME type đã khai báo.');
  });

  it('rejects a corrupt file when detection throws', async () => {
    await expect(
      validateFileSignature(
        { fileName: 'broken.pdf', contentType: 'application/pdf', body: new Uint8Array() },
        async () => {
          throw new Error('corrupt');
        },
      ),
    ).resolves.toBe('File bị hỏng hoặc không thể nhận diện cấu trúc.');
  });
});
