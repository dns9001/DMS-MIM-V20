/**
 * DMS MAHAMERU — Universal Photo Compressor & Optimizer
 * 
 * Standar Kompresi Foto:
 * - Batas Maksimal File Akhir: 500 KB (512,000 Bytes)
 * - Target Aman Internal: 450 - 480 KB
 * - Format Output: image/jpeg (Konversi otomatis dari PNG, WEBP, HEIC, dll)
 * - Algoritma: Adaptive Multi-Pass Resize & Quality Iteration
 * - Proteksi: Validasi tipe file & Hard Assertion Final <= 512,000 Bytes
 */

export const MAX_PHOTO_BYTES = 512000; // 500 KB = 512,000 bytes
export const SAFE_TARGET_BYTES = 470000; // 460-475 KB safe internal target

/**
 * Format bytes into human readable string (e.g. 428 KB, 3.8 MB)
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Calculate accurate binary byte size from a base64 Data URL
 */
export function calculateBase64Bytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return 0;
  if (!dataUrl.startsWith("data:")) {
    return dataUrl.length;
  }
  const base64Index = dataUrl.indexOf(";base64,");
  if (base64Index === -1) {
    return new Blob([dataUrl]).size;
  }
  const base64Str = dataUrl.substring(base64Index + 8);
  const padding = base64Str.endsWith("==") ? 2 : base64Str.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64Str.length * 3) / 4) - padding);
}

/**
 * Validates that file is an image
 */
export function validateImageFile(file) {
  if (!file) {
    throw new Error("File foto tidak ditemukan.");
  }

  // If string data URL
  if (typeof file === "string") {
    if (!file.startsWith("data:image/") && !file.startsWith("blob:") && !file.startsWith("http")) {
      throw new Error("File harus berupa foto/gambar yang valid.");
    }
    return true;
  }

  // If File or Blob
  if (file instanceof Blob || file instanceof File) {
    const validPrefixes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "image/bmp", "image/gif"];
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();

    const isImage = validPrefixes.some((p) => type.startsWith("image/") || type === p) ||
      /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(name);

    if (!isImage) {
      throw new Error("File harus berupa foto/gambar.");
    }
    return true;
  }

  throw new Error("File harus berupa foto/gambar.");
}

/**
 * Loads an image from File, Blob, or DataURL safely
 */
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal membaca file gambar. File mungkin rusak atau tidak didukung."));

    if (typeof source === "string") {
      img.src = source;
    } else if (source instanceof Blob || source instanceof File) {
      const url = URL.createObjectURL(source);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("File bukan gambar yang valid atau format tidak didukung."));
      };
      img.src = url;
    } else {
      reject(new Error("Sumber gambar tidak valid."));
    }
  });
}

/**
 * Draws image to canvas and converts to JPEG DataURL
 */
function canvasToJpegDataUrl(img, targetWidth, targetHeight, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context tidak tersedia pada browser.");
  }

  // White background for transparent PNG/WebP conversions to clean JPEG
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Draw image smoothly
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Converts DataURL to Blob
 */
export function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Core Adaptive Photo Compressor
 * Guaranteed output size <= 512,000 Bytes (500 KB)
 * 
 * @param {File|Blob|string} input - File, Blob or DataURL
 * @param {Object} options - Custom options
 * @param {Function} [options.onProgress] - Callback with stage status
 * @param {number} [options.maxBytes=512000] - Hard cap in bytes
 * @returns {Promise<CompressedResult>}
 */
export async function compressPhoto(input, options = {}) {
  const maxBytes = options.maxBytes || MAX_PHOTO_BYTES;
  const safeTarget = Math.min(SAFE_TARGET_BYTES, maxBytes - 15000);
  const onProgress = options.onProgress || (() => {});

  if (!input) {
    throw new Error("File foto tidak ditemukan.");
  }

  onProgress({ stage: "validating", message: "Memeriksa format file foto..." });
  validateImageFile(input);

  // Determine original size
  let originalSize = 0;
  if (typeof input === "string") {
    originalSize = calculateBase64Bytes(input);
  } else if (input instanceof Blob || input instanceof File) {
    originalSize = input.size;
  }

  onProgress({ stage: "loading", message: "Membaca foto..." });
  const img = await loadImage(input);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  if (!srcWidth || !srcHeight) {
    throw new Error("Dimensi gambar tidak valid atau 0px.");
  }

  onProgress({ stage: "compressing", message: "Mengoptimalkan foto..." });

  // Adaptive dimension thresholds (never enlarge if source is smaller)
  const dimensionTiers = [1600, 1400, 1200, 1000, 800, 640];
  const qualityTiers = [0.85, 0.78, 0.70, 0.62, 0.55, 0.45, 0.35];

  let bestDataUrl = null;
  let bestSize = Infinity;
  let bestWidth = srcWidth;
  let bestHeight = srcHeight;

  // Filter dimension tiers to avoid upscaling
  const maxSrcDim = Math.max(srcWidth, srcHeight);
  const applicableDimensions = dimensionTiers.filter((d) => d <= maxSrcDim);
  if (applicableDimensions.length === 0 || applicableDimensions[0] < maxSrcDim) {
    applicableDimensions.unshift(maxSrcDim);
  }

  // Compression loop: Dimensions x Qualities
  for (const maxDim of applicableDimensions) {
    let targetWidth = srcWidth;
    let targetHeight = srcHeight;

    if (srcWidth >= srcHeight) {
      if (srcWidth > maxDim) {
        targetHeight = Math.round((srcHeight * maxDim) / srcWidth);
        targetWidth = maxDim;
      }
    } else {
      if (srcHeight > maxDim) {
        targetWidth = Math.round((srcWidth * maxDim) / srcHeight);
        targetHeight = maxDim;
      }
    }

    for (const quality of qualityTiers) {
      const dataUrl = canvasToJpegDataUrl(img, targetWidth, targetHeight, quality);
      const currentSize = calculateBase64Bytes(dataUrl);

      if (currentSize < bestSize) {
        bestDataUrl = dataUrl;
        bestSize = currentSize;
        bestWidth = targetWidth;
        bestHeight = targetHeight;
      }

      // If we met the safe target, we stop immediately with crisp high quality!
      if (currentSize <= safeTarget) {
        break;
      }
    }

    if (bestSize <= safeTarget) {
      break;
    }
  }

  // Emergency rescue fallback if still over 500 KB
  if (bestSize > maxBytes) {
    const emergencyDims = [600, 480, 400];
    const emergencyQualities = [0.4, 0.3, 0.2];

    for (const dim of emergencyDims) {
      const targetWidth = srcWidth >= srcHeight ? dim : Math.round((srcWidth * dim) / srcHeight);
      const targetHeight = srcHeight > srcWidth ? dim : Math.round((srcHeight * dim) / srcWidth);

      for (const q of emergencyQualities) {
        const rescueDataUrl = canvasToJpegDataUrl(img, targetWidth, targetHeight, q);
        const rescueSize = calculateBase64Bytes(rescueDataUrl);
        if (rescueSize <= maxBytes) {
          bestDataUrl = rescueDataUrl;
          bestSize = rescueSize;
          bestWidth = targetWidth;
          bestHeight = targetHeight;
          break;
        }
      }
      if (bestSize <= maxBytes) break;
    }
  }

  // FINAL HARD VALIDATION ASSERTION
  if (!bestDataUrl || bestSize > maxBytes) {
    throw new Error(
      `Foto terlalu besar untuk diproses (${formatBytes(bestSize)} melebihi batas ${formatBytes(maxBytes)}). Silakan gunakan foto dengan resolusi lebih rendah.`
    );
  }

  const finalBlob = dataUrlToBlob(bestDataUrl);
  const reductionPercent = originalSize > 0 ? Math.max(0, Math.round(((originalSize - bestSize) / originalSize) * 100)) : 0;

  onProgress({
    stage: "done",
    message: `Foto berhasil dikompres (${formatBytes(bestSize)}).`,
    size: bestSize,
  });

  return {
    dataUrl: bestDataUrl,
    blob: finalBlob,
    originalSize,
    compressedSize: bestSize,
    width: bestWidth,
    height: bestHeight,
    mimeType: "image/jpeg",
    reductionPercent,
    formattedOriginalSize: formatBytes(originalSize),
    formattedCompressedSize: formatBytes(bestSize),
  };
}
