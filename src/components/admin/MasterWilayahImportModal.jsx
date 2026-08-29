import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Globe, Upload, CheckCircle2, AlertTriangle, FileText, Download,
  Layers, MapPin, Search, RefreshCw, Loader2, Database, ShieldCheck
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";

export default function MasterWilayahImportModal({ open, onOpenChange, onImportSuccess }) {
  const [activeTab, setActiveTab] = useState("browse");
  const [stats, setStats] = useState({
    total_provinces: 0,
    total_regencies: 0,
    total_districts: 0,
    total_villages: 0,
  });
  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Filters for browse
  const [selectedProv, setSelectedProv] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchWilayahData = async () => {
    setLoading(true);
    try {
      const [resProv, resReg, resDist, resVil] = await Promise.all([
        api.get("/regions/provinces"),
        api.get("/regions/regencies"),
        api.get("/regions/districts"),
        api.get("/regions/villages"),
      ]);

      const provList = resProv.data.items || resProv.data || [];
      const regList = resReg.data.items || resReg.data || [];
      const distList = resDist.data.items || resDist.data || [];
      const vilList = resVil.data.items || resVil.data || [];

      setProvinces(provList);
      setRegencies(regList);
      setDistricts(distList);
      setVillages(vilList);
      setStats({
        total_provinces: provList.length,
        total_regencies: regList.length,
        total_districts: distList.length,
        total_villages: vilList.length,
      });
      if (provList.length > 0 && !selectedProv) {
        setSelectedProv(provList[0]._id);
      }
    } catch (e) {
      console.error("Gagal memuat master wilayah:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchWilayahData();
    }
  }, [open]);

  // Handle File Upload for CSV Import
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      setCsvText(text || "");
      toast.success(`File CSV "${file.name}" berhasil dibaca!`);
    };
    reader.readAsText(file);
  };

  // Parse and Submit CSV Import
  const handleProcessImport = async () => {
    if (!csvText.trim()) {
      toast.error("Silakan unggah file CSV atau tempelkan data wilayah.");
      return;
    }

    setImporting(true);
    try {
      // Parse CSV
      const lines = csvText.trim().split("\n");
      if (lines.length < 2) {
        throw new Error("Format CSV tidak valid atau data kosong.");
      }

      const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, "").toLowerCase());
      
      const newProvinces = [];
      const newRegencies = [];
      const newDistricts = [];
      const newVillages = [];

      const provMap = new Map();
      const regMap = new Map();
      const distMap = new Map();

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
        
        // Expected columns:
        // province_id, province_name, regency_id, regency_name, regency_type, district_id, district_name, village_id, village_name, postal_code
        let pId = cols[0] || `prov-${i}`;
        let pName = cols[1] || "";
        let rId = cols[2] || `reg-${i}`;
        let rName = cols[3] || "";
        let rType = cols[4] || (rName.toLowerCase().includes("kota") ? "Kota" : "Kabupaten");
        let dId = cols[5] || `dist-${i}`;
        let dName = cols[6] || "";
        let vId = cols[7] || `vil-${i}`;
        let vName = cols[8] || "";
        let post = cols[9] || "";

        if (pName && !provMap.has(pId)) {
          provMap.set(pId, { _id: pId, name: pName });
          newProvinces.push({ _id: pId, name: pName });
        }

        if (rName && !regMap.has(rId)) {
          regMap.set(rId, { _id: rId, province_id: pId, name: rName, type: rType });
          newRegencies.push({ _id: rId, province_id: pId, name: rName, type: rType });
        }

        if (dName && !distMap.has(dId)) {
          distMap.set(dId, { _id: dId, regency_id: rId, name: dName });
          newDistricts.push({ _id: dId, regency_id: rId, name: dName });
        }

        if (vName) {
          newVillages.push({ _id: vId, district_id: dId, name: vName, postal_code: post });
        }
      }

      const payload = {
        provinces: newProvinces,
        regencies: newRegencies,
        districts: newDistricts,
        villages: newVillages,
        replace_existing: replaceExisting,
      };

      const { data } = await api.post("/regions/import", payload);
      toast.success(data.detail || "Master data wilayah administratif berhasil diimport!");
      await fetchWilayahData();
      if (onImportSuccess) onImportSuccess();
      setActiveTab("browse");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setImporting(false);
    }
  };

  // Download Sample Template CSV
  const handleDownloadSampleCSV = () => {
    const sampleCsv = `province_id,province_name,regency_id,regency_name,regency_type,district_id,district_name,village_id,village_name,postal_code
prov-32,JAWA BARAT,reg-3203,KABUPATEN CIANJUR,Kabupaten,dist-320301,CIANJUR,vil-32030101,PAMOYANAN,43211
prov-32,JAWA BARAT,reg-3203,KABUPATEN CIANJUR,Kabupaten,dist-320301,CIANJUR,vil-32030102,SAYANG,43213
prov-32,JAWA BARAT,reg-3203,KABUPATEN CIANJUR,Kabupaten,dist-320302,CIPANAS,vil-32030201,CIPANAS,43253
prov-32,JAWA BARAT,reg-3203,KABUPATEN CIANJUR,Kabupaten,dist-320303,PACET,vil-32030301,CIPENDEY,43254
prov-32,JAWA BARAT,reg-3204,KABUPATEN BANDUNG,Kabupaten,dist-320401,SOREANG,vil-32040101,PAMEKARSARI,40911
prov-31,DKI JAKARTA,reg-3171,KOTA JAKARTA SELATAN,Kota,dist-317101,TEBET,vil-31710101,TEBET BARAT,12810`;

    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Template_Master_Wilayah_Mahameru.csv";
    link.click();
    toast.success("Template CSV Master Wilayah diunduh!");
  };

  // Filtered villages for display
  const displayVillages = villages.filter((v) => {
    const dist = districts.find((d) => d._id === v.district_id);
    const reg = regencies.find((r) => r._id === dist?.regency_id);
    if (selectedProv && reg?.province_id !== selectedProv) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchVil = v.name.toLowerCase().includes(q);
      const matchDist = dist?.name.toLowerCase().includes(q);
      const matchReg = reg?.name.toLowerCase().includes(q);
      const matchPost = (v.postal_code || "").includes(q);
      if (!matchVil && !matchDist && !matchReg && !matchPost) return false;
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-heading font-bold text-navy flex items-center gap-2">
            <Globe className="text-gold" size={22} />
            Master Data Wilayah Administratif Outlet
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Kelola dan sinkronisasi struktur wilayah resmi bertingkat (Provinsi, Kabupaten/Kota, Kecamatan, Kelurahan/Desa).
          </DialogDescription>
        </DialogHeader>

        {/* Aggregate KPI Stats Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">Provinsi</div>
            <div className="text-lg font-heading font-bold text-navy mt-0.5">{stats.total_provinces}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">Kabupaten / Kota</div>
            <div className="text-lg font-heading font-bold text-navy mt-0.5">{stats.total_regencies}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">Kecamatan</div>
            <div className="text-lg font-heading font-bold text-navy mt-0.5">{stats.total_districts}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[10px] font-semibold text-slate-500 uppercase">Kelurahan / Desa</div>
            <div className="text-lg font-heading font-bold text-navy mt-0.5">{stats.total_villages}</div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-2">
          <TabsList className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl">
            <TabsTrigger value="browse" className="rounded-lg text-xs font-bold">
              <Database size={14} className="mr-1.5" />
              Daftar Master Wilayah
            </TabsTrigger>
            <TabsTrigger value="import" className="rounded-lg text-xs font-bold">
              <Upload size={14} className="mr-1.5" />
              Import Data Wilayah (CSV)
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: BROWSE HIERARCHY */}
          <TabsContent value="browse" className="space-y-3 pt-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={selectedProv}
                  onChange={(e) => setSelectedProv(e.target.value)}
                  className="h-9 text-xs rounded-xl border border-slate-200 bg-white px-2.5 font-medium"
                >
                  <option value="">Semua Provinsi</option>
                  {provinces.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
                <div className="relative flex-1 sm:w-64">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Cari kelurahan, kecamatan, kab..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-8 text-xs rounded-xl"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchWilayahData}
                disabled={loading}
                className="h-9 text-xs rounded-xl gap-1.5 shrink-0"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                Segarkan
              </Button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-xs font-bold py-2">Kelurahan / Desa</TableHead>
                    <TableHead className="text-xs font-bold py-2">Kecamatan</TableHead>
                    <TableHead className="text-xs font-bold py-2">Kabupaten / Kota</TableHead>
                    <TableHead className="text-xs font-bold py-2">Provinsi</TableHead>
                    <TableHead className="text-xs font-bold py-2 text-center">Kode Pos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-xs text-slate-400">
                        <Loader2 className="animate-spin inline mr-2 text-navy" size={16} />
                        Memuat data wilayah...
                      </TableCell>
                    </TableRow>
                  ) : displayVillages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-xs text-slate-400">
                        Tidak ada data wilayah yang sesuai.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayVillages.slice(0, 100).map((v) => {
                      const dist = districts.find((d) => d._id === v.district_id);
                      const reg = regencies.find((r) => r._id === dist?.regency_id);
                      const prov = provinces.find((p) => p._id === reg?.province_id);
                      return (
                        <TableRow key={v._id} className="text-xs hover:bg-slate-50/80">
                          <TableCell className="font-semibold text-navy py-2">
                            {v.name}
                            <span className="block text-[10px] text-slate-400 font-mono font-normal">{v._id}</span>
                          </TableCell>
                          <TableCell className="text-slate-700 py-2">{dist?.name || "-"}</TableCell>
                          <TableCell className="text-slate-700 py-2">{reg?.name || "-"}</TableCell>
                          <TableCell className="text-slate-600 py-2">{prov?.name || "-"}</TableCell>
                          <TableCell className="text-center font-mono font-bold text-navy py-2">
                            {v.postal_code || "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {displayVillages.length > 100 && (
              <div className="text-[11px] text-slate-400 text-center">
                Menampilkan 100 dari {displayVillages.length} kelurahan/desa terfilter.
              </div>
            )}
          </TabsContent>

          {/* TAB 2: IMPORT CSV */}
          <TabsContent value="import" className="space-y-4 pt-3">
            <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 text-xs text-blue-900 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-blue-700" />
                Format Standar CSV Master Wilayah:
              </div>
              <p className="text-slate-600">
                Kolom wajib: <code>province_id, province_name, regency_id, regency_name, regency_type, district_id, district_name, village_id, village_name, postal_code</code>
              </p>
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadSampleCSV}
                  className="h-8 text-xs bg-white border-blue-300 text-blue-800 font-semibold gap-1.5"
                >
                  <Download size={13} />
                  Unduh Template CSV Contoh
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-navy">Unggah File CSV</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-navy">Atau Tempel / Pratinjau Teks CSV:</Label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="province_id,province_name,regency_id,regency_name,regency_type,district_id,district_name,village_id,village_name,postal_code..."
                rows={6}
                className="w-full text-xs font-mono p-3 rounded-xl border border-slate-200 focus:outline-navy bg-slate-50"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="replace-existing"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="rounded border-slate-300 text-navy"
              />
              <Label htmlFor="replace-existing" className="text-xs text-slate-700 cursor-pointer">
                Gantikan data wilayah yang sudah ada (Replace Existing)
              </Label>
            </div>

            <Button
              disabled={importing || !csvText.trim()}
              onClick={handleProcessImport}
              className="w-full h-11 bg-navy hover:bg-navy-light text-white font-bold rounded-xl gap-2"
            >
              {importing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              {importing ? "Memproses Import..." : "Proses & Simpan Master Wilayah"}
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t border-slate-100 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs">
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
