import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  Upload,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Database,
  RefreshCw,
  Layers,
  X,
} from "lucide-react";
import api, { errMsg } from "../lib/api";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

export default function UploadDatabaseModal({ open, onOpenChange, onSuccess }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [mode, setMode] = useState("merge"); // "merge" | "replace"
  const [loading, setLoading] = useState(false);
  const [readingFile, setReadingFile] = useState(false);

  const resetState = () => {
    setFile(null);
    setParsedData(null);
    setAnalysis(null);
    setMode("merge");
    setLoading(false);
    setReadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (loading) return;
    resetState();
    onOpenChange(false);
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.endsWith(".json")) {
      toast.error("File harus berformat JSON (.json) hasil ekspor database Mahameru DMS.");
      return;
    }

    setFile(selected);
    setReadingFile(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        const json = JSON.parse(text);

        if (typeof json !== "object" || json === null) {
          throw new Error("Struktur JSON tidak valid.");
        }

        // Analyze contents
        let totalItems = 0;
        const colBreakdown = [];

        for (const [key, val] of Object.entries(json)) {
          if (Array.isArray(val) && val.length > 0) {
            colBreakdown.push({ key, count: val.length });
            totalItems += val.length;
          } else if (key === "company_profile" || key === "settings") {
            colBreakdown.push({ key, count: 1 });
            totalItems += 1;
          }
        }

        if (totalItems === 0) {
          throw new Error("File JSON tidak berisi data koleksi database Mahameru DMS yang dapat dipulihkan.");
        }

        setParsedData(json);
        setAnalysis({ totalItems, collections: colBreakdown });
        toast.success(`File valid: terdeteksi ${totalItems} rekor data.`);
      } catch (err) {
        toast.error("Gagal membaca file JSON: " + (err?.message || "Format tidak sesuai"));
        setFile(null);
        setParsedData(null);
        setAnalysis(null);
      } finally {
        setReadingFile(false);
      }
    };

    reader.onerror = () => {
      toast.error("Gagal membaca file dari disk.");
      setReadingFile(false);
      setFile(null);
    };

    reader.readAsText(selected);
  };

  const handleUpload = async () => {
    if (!parsedData) {
      toast.error("Silakan pilih file database terlebih dahulu.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/system/import-db", {
        database: parsedData,
        mode,
      });

      const totalImp = res.data?.data?.totalImported || analysis?.totalItems || 0;
      toast.success(`Database berhasil dipulihkan! ${totalImp} data telah disinkronkan ke Google Cloud Firestore.`);
      
      resetState();
      onOpenChange(false);
      if (onSuccess) onSuccess(res.data);
    } catch (err) {
      toast.error("Gagal mengunggah database: " + errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl">
        <DialogHeader className="p-6 pb-4 bg-slate-50/80 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-navy/10 text-navy rounded-xl">
              <Database size={22} />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold font-heading text-navy">
                Upload & Pulihkan Database
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Impor file backup JSON dan sinkronkan langsung ke Google Cloud Firestore.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {/* File Picker Zone */}
          <div
            onClick={() => !loading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              file
                ? "border-emerald-400 bg-emerald-50/30"
                : "border-slate-300 hover:border-navy/50 hover:bg-slate-50/60 bg-slate-50/30"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              className="hidden"
              disabled={loading}
            />

            {readingFile ? (
              <div className="flex flex-col items-center gap-2 py-4 text-slate-500">
                <Loader2 size={32} className="animate-spin text-navy" />
                <span className="text-xs font-semibold">Menganalisis integritas file JSON...</span>
              </div>
            ) : file ? (
              <div className="space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  <FileJson size={24} />
                </div>
                <div className="font-bold text-sm text-slate-800">{file.name}</div>
                <div className="text-xs text-slate-500">
                  Ukuran: {(file.size / 1024).toFixed(1)} KB | Terdeteksi: <strong>{analysis?.totalItems || 0} entitas</strong>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetState();
                  }}
                  className="text-xs text-rose-600 hover:underline font-semibold mt-2 inline-block"
                >
                  Ganti File
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-navy/5 text-navy flex items-center justify-center">
                  <Upload size={22} />
                </div>
                <div className="font-bold text-sm text-slate-800">
                  Klik untuk Memilih File Database JSON
                </div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Pilih file snapshot backup database Mahameru DMS (.json) yang telah diunduh sebelumnya.
                </p>
              </div>
            )}
          </div>

          {/* Collection breakdown preview if parsed */}
          {analysis && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 pb-2 border-b border-slate-200">
                <span className="flex items-center gap-1.5">
                  <Layers size={14} className="text-navy" /> Ringkasan Koleksi dalam File:
                </span>
                <span className="text-emerald-700 font-bold">{analysis.collections.length} Koleksi Tabel</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                {analysis.collections.map((col) => (
                  <span
                    key={col.key}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-700 font-medium shadow-2xs"
                  >
                    <span className="font-semibold text-navy">{col.key}:</span>
                    <span className="text-slate-500">{col.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Mode Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-700">Metode Pemulihan Data:</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  mode === "merge"
                    ? "border-navy bg-navy/5 text-navy"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="uploadMode"
                  value="merge"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                  className="mt-0.5 text-navy"
                  disabled={loading}
                />
                <div>
                  <div className="text-xs font-bold">Gabungkan Data (Merge)</div>
                  <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    Memperbarui data yang cocok dan menyisipkan data baru tanpa menghapus data lain.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  mode === "replace"
                    ? "border-rose-600 bg-rose-50/50 text-rose-900"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="uploadMode"
                  value="replace"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                  className="mt-0.5 text-rose-600"
                  disabled={loading}
                />
                <div>
                  <div className="text-xs font-bold text-rose-700">Timpa Penuh (Replace)</div>
                  <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    Mengganti seluruh koleksi yang ada dengan data persis dari file JSON.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              Data yang diunggah akan langsung disinkronkan secara permanen ke <strong>Google Cloud Firestore</strong>.
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={loading}
            className="text-xs"
          >
            Batal
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleUpload}
            disabled={!parsedData || loading}
            className="bg-navy hover:bg-navy/90 text-white font-semibold text-xs shadow-xs"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                Memulihkan ke Firestore...
              </>
            ) : (
              <>
                <Upload size={14} className="mr-1.5" />
                Upload & Pulihkan Database
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
