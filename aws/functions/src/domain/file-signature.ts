import { fileTypeFromBuffer, type FileTypeResult } from 'file-type';

interface FileSignatureInput {
  fileName: string;
  contentType: string;
  body: Uint8Array;
}

type FileDetector = (body: Uint8Array) => Promise<FileTypeResult | undefined>;

interface FilePolicy {
  extensions: string[];
  detectedExtension: string;
  detectedMime: string;
}

const filePolicies: Record<string, FilePolicy> = {
  'application/pdf': {
    extensions: ['pdf'],
    detectedExtension: 'pdf',
    detectedMime: 'application/pdf',
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extensions: ['docx'],
    detectedExtension: 'docx',
    detectedMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    extensions: ['xlsx'],
    detectedExtension: 'xlsx',
    detectedMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  'image/png': {
    extensions: ['png'],
    detectedExtension: 'png',
    detectedMime: 'image/png',
  },
  'image/jpeg': {
    extensions: ['jpg', 'jpeg'],
    detectedExtension: 'jpg',
    detectedMime: 'image/jpeg',
  },
};

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : '';
}

export async function validateFileSignature(
  input: FileSignatureInput,
  detect: FileDetector = fileTypeFromBuffer,
): Promise<string | null> {
  const policy = filePolicies[input.contentType];
  if (!policy) {
    return 'MIME type không nằm trong danh sách định dạng được hỗ trợ.';
  }

  const extension = extensionOf(input.fileName);
  if (!policy.extensions.includes(extension)) {
    return 'Phần mở rộng file không khớp MIME type đã khai báo.';
  }

  let detected: FileTypeResult | undefined;
  try {
    detected = await detect(input.body);
  } catch {
    return 'File bị hỏng hoặc không thể nhận diện cấu trúc.';
  }

  if (!detected) {
    return 'Không thể nhận diện định dạng thực của file.';
  }
  if (
    detected.ext !== policy.detectedExtension ||
    detected.mime !== policy.detectedMime
  ) {
    return 'Định dạng thực của file không khớp phần mở rộng và MIME type.';
  }
  return null;
}
