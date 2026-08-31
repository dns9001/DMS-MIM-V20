import { useState, useRef } from "react";
import { Camera, Image as ImageIcon, Loader2, Check, RefreshCw, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { compressPhoto, formatBytes, MAX_PHOTO_BYTES } from "../lib/imageCompressor";
import { Button } from "./ui/button";

/**
 * Universal Photo Upload & Auto-Compression Component
 * Enforces strict <= 500 KB client-side compression before saving/uploading.
 */
export default function PhotoUploadField({
  id = "photo-upload",
  value = null,
  onChange = () => {},
  label = "Foto",
  required = false,
  captureMode = "environment", // "environment", "user", or null
  disabled = false,
  helperText = "Foto akan otomatis dikompres maksimal 500 KB.",
  className = "",
}) {
  const [compressing, setCompressing] = useState(false);
  const [stats, setStats] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous error
    setErrorMsg(null);
    setCompressing(true);

    const originalSizeFormatted = formatBytes(file.size);

    try {
      // Execute adaptive compression to <= 500 KB
      const result = await compressPhoto(file);

      // Verify hard constraint <= 512,000 bytes
      if (result.compressedSize > MAX_PHOTO_BYTES) {
        throw new Error(
          `Foto terlalu besar (${result.formattedCompressedSize}). Batas maksimal adalah 500 KB.`
        );
      }

      setStats({
        original: result.formattedOriginalSize,
        compressed: result.formattedCompressedSize,
        percent: result.reductionPercent,
      });

      onChange(result.dataUrl, result);
      toast.success(
        `Foto berhasil dikompres: ${originalSizeFormatted} → ${result.formattedCompressedSize} (-${result.reductionPercent}%)`
      );
    } catch (err) {
      const msg = err.message || "Gagal memproses dan mengompres foto.";
      setErrorMsg(msg);
      toast.error(msg);
      onChange(null, null);
    } finally {
      setCompressing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleClear = () => {
    setErrorMsg(null);
    setStats(null);
    onChange(null, null);
  };

  return (
    <div className={`space-y-2 ${className}`} id={id}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
          <Camera size={14} className="text-navy" />
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <span className="text-[10px] text-slate-500 font-medium">Maks. 500 KB</span>
      </div>

      {/* Input controls */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg,image/heic"
        capture={captureMode || undefined}
        disabled={disabled || compressing}
        onChange={handleFileChange}
        className="hidden"
        id={`${id}-input`}
      />

      {!value && (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || compressing}
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-11 border-dashed border-2 border-slate-300 hover:border-navy hover:bg-slate-50 text-slate-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            {compressing ? (
              <>
                <Loader2 size={16} className="animate-spin text-navy" />
                <span className="text-xs text-navy font-bold">Mengoptimalkan foto...</span>
              </>
            ) : (
              <>
                <Camera size={16} className="text-navy" />
                <span className="text-xs">Ambil Foto / Pilih dari Galeri</span>
              </>
            )}
          </Button>
          <p className="text-[10px] text-slate-400 leading-tight text-center">
            {helperText}
          </p>
        </div>
      )}

      {/* Error notification */}
      {errorMsg && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Preview Card (Compressed Output) */}
      {value && (
        <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-900 shadow-sm group">
          <img
            src={value}
            alt="Preview foto terkompresi"
            className="w-full h-44 object-cover"
          />

          {/* Top action overlay */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || compressing}
              className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm transition-all"
              title="Ganti foto"
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleClear()}
              disabled={disabled || compressing}
              className="p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg backdrop-blur-sm transition-all"
              title="Hapus foto"
            >
              <X size={14} />
            </button>
          </div>

          {/* Bottom badge overlay showing size */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 flex items-center justify-between text-[11px] text-white font-medium">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <Check size={13} /> Terkompresi &le; 500 KB
            </span>
            {stats && (
              <span className="bg-white/20 px-2 py-0.5 rounded-md backdrop-blur-xs text-[10px]">
                {stats.original} &rarr; <b>{stats.compressed}</b>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
