/**
 * DMS MAHAMERU — Backend Server-Side Photo Validator & Enforcer
 * 
 * Strict Requirement:
 * - Batas Maksimal File Foto Hasil Akhir: 500 KB (512,000 Bytes)
 * - Validasi MIME Type: image/jpeg, image/jpg, image/png, image/webp
 * - Tolak file non-gambar atau file yang melebihi 512,000 bytes
 */

export const MAX_SERVER_PHOTO_BYTES = 512000; // 500 KB

export interface PhotoValidationResult {
  valid: boolean;
  sizeBytes: number;
  sizeKb: number;
  mimeType: string;
  isBase64: boolean;
  cleanStoragePath?: string;
}

/**
 * Calculates byte size of a base64 Data URL or string
 */
export function getBase64ByteLength(dataUrl: string): number {
  if (!dataUrl || typeof dataUrl !== "string") return 0;
  if (!dataUrl.startsWith("data:")) {
    // If it's a URL or path, size is external
    return dataUrl.length;
  }
  const base64Index = dataUrl.indexOf(";base64,");
  if (base64Index === -1) {
    return Buffer.byteLength(dataUrl, "utf8");
  }
  const base64Str = dataUrl.substring(base64Index + 8);
  const padding = base64Str.endsWith("==") ? 2 : base64Str.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64Str.length * 3) / 4) - padding);
}

/**
 * Server-side validation for any uploaded photo or image payload
 * Rejects if > 512,000 bytes or invalid format
 */
export function validatePhotoPayload(
  photoInput: unknown,
  fieldName: string = "Foto",
  options: { required?: boolean; maxBytes?: number; entityType?: string; entityId?: string } = {}
): PhotoValidationResult {
  const maxBytes = options.maxBytes || MAX_SERVER_PHOTO_BYTES;
  const isRequired = options.required || false;

  if (!photoInput) {
    if (isRequired) {
      const err: any = new Error(`${fieldName} wajib disertakan.`);
      err.statusCode = 400;
      err.code = "PHOTO_REQUIRED";
      throw err;
    }
    return {
      valid: true,
      sizeBytes: 0,
      sizeKb: 0,
      mimeType: "",
      isBase64: false,
    };
  }

  if (typeof photoInput !== "string") {
    const err: any = new Error(`Format data ${fieldName} tidak valid.`);
    err.statusCode = 400;
    err.code = "INVALID_PHOTO_FORMAT";
    throw err;
  }

  const trimmed = photoInput.trim();

  // If it's already a regular URL / cloud storage reference
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/uploads/")) {
    return {
      valid: true,
      sizeBytes: trimmed.length,
      sizeKb: Math.round(trimmed.length / 1024),
      mimeType: "image/jpeg",
      isBase64: false,
    };
  }

  // If Data URL
  if (trimmed.startsWith("data:")) {
    // Check MIME type
    const mimeMatch = trimmed.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    if (!mimeMatch) {
      const err: any = new Error(`Data ${fieldName} harus berupa base64 foto/gambar yang valid.`);
      err.statusCode = 400;
      err.code = "INVALID_MIME_TYPE";
      throw err;
    }

    const mime = mimeMatch[1].toLowerCase();
    const validMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!validMimes.includes(mime)) {
      const err: any = new Error(`Format file ${fieldName} (${mime}) tidak didukung. Gunakan format JPG/JPEG/PNG/WEBP.`);
      err.statusCode = 400;
      err.code = "UNSUPPORTED_PHOTO_TYPE";
      throw err;
    }

    const byteLength = getBase64ByteLength(trimmed);
    const sizeKb = parseFloat((byteLength / 1024).toFixed(1));

    // STRICT 500 KB (512,000 BYTES) CHECK
    if (byteLength > maxBytes) {
      const err: any = new Error(
        `Ukuran ${fieldName} (${sizeKb} KB) melebihi batas maksimal 500 KB (512,000 bytes). Harap gunakan foto yang telah dikompres.`
      );
      err.statusCode = 400;
      err.code = "PHOTO_EXCEEDS_500KB";
      err.actualBytes = byteLength;
      err.maxBytes = maxBytes;
      throw err;
    }

    const entityType = options.entityType || "photos";
    const entityId = options.entityId || "main";
    const cleanStoragePath = `${entityType}/${entityId}/photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;

    return {
      valid: true,
      sizeBytes: byteLength,
      sizeKb,
      mimeType: mime,
      isBase64: true,
      cleanStoragePath,
    };
  }

  // If unrecognized format
  const err: any = new Error(`Data ${fieldName} tidak valid.`);
  err.statusCode = 400;
  err.code = "INVALID_PHOTO_DATA";
  throw err;
}
