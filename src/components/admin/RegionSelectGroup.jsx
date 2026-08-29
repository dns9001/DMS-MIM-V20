import { useState, useEffect, useCallback, useId } from "react";
import { MapPin, Navigation, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import api, { errMsg } from "../../lib/api";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";

/**
 * RegionSelectGroup
 * Cascading administrative regions dropdown for DMS Mahameru Master Outlet.
 * Strict hierarchy: Province -> Regency -> District -> Village
 * With Reset Logic and Detail Address input.
 * Supports both object `value` prop and individual props (provinceId, regencyId, etc.).
 */
export default function RegionSelectGroup({
  value,
  provinceId: propProvinceId,
  province_id: propProvince_id,
  regencyId: propRegencyId,
  regency_id: propRegency_id,
  districtId: propDistrictId,
  district_id: propDistrict_id,
  villageId: propVillageId,
  village_id: propVillage_id,
  postalCode: propPostalCode,
  postal_code: propPostal_code,
  streetAddress: propStreetAddress,
  street_address: propStreet_address,
  address_line: propAddress_line,
  address: propAddress,
  onChange = () => {},
  required = true,
  disabled = false,
  showStreetInput = true,
  showPostalCode = true,
  showPreview = true,
  className = "",
}) {
  const uid = useId();

  // Normalized values supporting both value object and direct props
  const provinceId = (value?.province_id ?? value?.provinceId ?? propProvince_id ?? propProvinceId ?? "") || "";
  const regencyId = (value?.regency_id ?? value?.regencyId ?? propRegency_id ?? propRegencyId ?? "") || "";
  const districtId = (value?.district_id ?? value?.districtId ?? propDistrict_id ?? propDistrictId ?? "") || "";
  const villageId = (value?.village_id ?? value?.villageId ?? propVillage_id ?? propVillageId ?? "") || "";
  const postalCode = (value?.postal_code ?? value?.postalCode ?? propPostal_code ?? propPostalCode ?? "") || "";
  const streetAddress = (
    value?.street_address ??
    value?.streetAddress ??
    value?.address_line ??
    value?.address ??
    propStreet_address ??
    propStreetAddress ??
    propAddress_line ??
    propAddress ??
    ""
  ) || "";

  // Lists
  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);

  // Loading states
  const [loadingProv, setLoadingProv] = useState(false);
  const [loadingReg, setLoadingReg] = useState(false);
  const [loadingDist, setLoadingDist] = useState(false);
  const [loadingVil, setLoadingVil] = useState(false);

  // 1. Load All Provinces on Mount
  useEffect(() => {
    let mounted = true;
    const fetchProvinces = async () => {
      setLoadingProv(true);
      try {
        const { data } = await api.get("/regions/provinces");
        if (mounted) {
          setProvinces(data.items || data || []);
        }
      } catch (err) {
        console.error("Gagal memuat master provinsi:", err);
      } finally {
        if (mounted) setLoadingProv(false);
      }
    };
    fetchProvinces();
    return () => { mounted = false; };
  }, []);

  // 2. Load Regencies when Province changes
  useEffect(() => {
    let mounted = true;
    if (!provinceId) {
      setRegencies([]);
      return;
    }
    const fetchRegencies = async () => {
      setLoadingReg(true);
      try {
        const { data } = await api.get("/regions/regencies", {
          params: { province_id: provinceId },
        });
        if (mounted) {
          setRegencies(data.items || data || []);
        }
      } catch (err) {
        console.error("Gagal memuat master kabupaten/kota:", err);
      } finally {
        if (mounted) setLoadingReg(false);
      }
    };
    fetchRegencies();
    return () => { mounted = false; };
  }, [provinceId]);

  // 3. Load Districts when Regency changes
  useEffect(() => {
    let mounted = true;
    if (!regencyId) {
      setDistricts([]);
      return;
    }
    const fetchDistricts = async () => {
      setLoadingDist(true);
      try {
        const { data } = await api.get("/regions/districts", {
          params: { regency_id: regencyId },
        });
        if (mounted) {
          setDistricts(data.items || data || []);
        }
      } catch (err) {
        console.error("Gagal memuat master kecamatan:", err);
      } finally {
        if (mounted) setLoadingDist(false);
      }
    };
    fetchDistricts();
    return () => { mounted = false; };
  }, [regencyId]);

  // 4. Load Villages when District changes
  useEffect(() => {
    let mounted = true;
    if (!districtId) {
      setVillages([]);
      return;
    }
    const fetchVillages = async () => {
      setLoadingVil(true);
      try {
        const { data } = await api.get("/regions/villages", {
          params: { district_id: districtId },
        });
        if (mounted) {
          setVillages(data.items || data || []);
        }
      } catch (err) {
        console.error("Gagal memuat master kelurahan/desa:", err);
      } finally {
        if (mounted) setLoadingVil(false);
      }
    };
    fetchVillages();
    return () => { mounted = false; };
  }, [districtId]);

  // Selected names for live snapshot & breadcrumb
  const currentProv = provinces.find((p) => p._id === provinceId);
  const currentReg = regencies.find((r) => r._id === regencyId);
  const currentDist = districts.find((d) => d._id === districtId);
  const currentVil = villages.find((v) => v._id === villageId);

  // Helper to emit consistent payload
  const emitChange = (updates) => {
    const nextState = {
      province_id: updates.province_id !== undefined ? updates.province_id : provinceId,
      provinceId: updates.province_id !== undefined ? updates.province_id : provinceId,
      province_name: updates.province_name !== undefined ? updates.province_name : (currentProv?.name || value?.province_name || ""),
      provinceName: updates.province_name !== undefined ? updates.province_name : (currentProv?.name || value?.province_name || ""),
      
      regency_id: updates.regency_id !== undefined ? updates.regency_id : regencyId,
      regencyId: updates.regency_id !== undefined ? updates.regency_id : regencyId,
      regency_name: updates.regency_name !== undefined ? updates.regency_name : (currentReg?.name || value?.regency_name || ""),
      regencyName: updates.regency_name !== undefined ? updates.regency_name : (currentReg?.name || value?.regency_name || ""),
      
      district_id: updates.district_id !== undefined ? updates.district_id : districtId,
      districtId: updates.district_id !== undefined ? updates.district_id : districtId,
      district_name: updates.district_name !== undefined ? updates.district_name : (currentDist?.name || value?.district_name || ""),
      districtName: updates.district_name !== undefined ? updates.district_name : (currentDist?.name || value?.district_name || ""),
      
      village_id: updates.village_id !== undefined ? updates.village_id : villageId,
      villageId: updates.village_id !== undefined ? updates.village_id : villageId,
      village_name: updates.village_name !== undefined ? updates.village_name : (currentVil?.name || value?.village_name || ""),
      villageName: updates.village_name !== undefined ? updates.village_name : (currentVil?.name || value?.village_name || ""),
      
      postal_code: updates.postal_code !== undefined ? updates.postal_code : postalCode,
      postalCode: updates.postal_code !== undefined ? updates.postal_code : postalCode,
      
      street_address: updates.street_address !== undefined ? updates.street_address : streetAddress,
      streetAddress: updates.street_address !== undefined ? updates.street_address : streetAddress,
      address_line: updates.street_address !== undefined ? updates.street_address : streetAddress,
      address: updates.street_address !== undefined ? updates.street_address : streetAddress,
    };

    const parts = [
      nextState.street_address ? nextState.street_address.trim() : null,
      nextState.village_name ? `Kel. ${nextState.village_name}` : null,
      nextState.district_name ? `Kec. ${nextState.district_name}` : null,
      nextState.regency_name ? nextState.regency_name : null,
      nextState.province_name ? nextState.province_name : null,
      nextState.postal_code ? nextState.postal_code.trim() : null,
    ].filter(Boolean);

    nextState.full_address = parts.join(", ");
    nextState.formatted_address = nextState.full_address;

    onChange(nextState);
  };

  // Handlers with strict RESET LOGIC
  const handleProvinceChange = (newProvId) => {
    if (newProvId === provinceId) return;
    const provObj = provinces.find((p) => p._id === newProvId);
    emitChange({
      province_id: newProvId,
      province_name: provObj?.name || "",
      regency_id: "",
      regency_name: "",
      district_id: "",
      district_name: "",
      village_id: "",
      village_name: "",
      postal_code: "",
      street_address: streetAddress,
    });
  };

  const handleRegencyChange = (newRegId) => {
    if (newRegId === regencyId) return;
    const regObj = regencies.find((r) => r._id === newRegId);
    emitChange({
      province_id: provinceId,
      province_name: currentProv?.name || value?.province_name || "",
      regency_id: newRegId,
      regency_name: regObj?.name || "",
      district_id: "",
      district_name: "",
      village_id: "",
      village_name: "",
      postal_code: "",
      street_address: streetAddress,
    });
  };

  const handleDistrictChange = (newDistId) => {
    if (newDistId === districtId) return;
    const distObj = districts.find((d) => d._id === newDistId);
    emitChange({
      province_id: provinceId,
      province_name: currentProv?.name || value?.province_name || "",
      regency_id: regencyId,
      regency_name: currentReg?.name || value?.regency_name || "",
      district_id: newDistId,
      district_name: distObj?.name || "",
      village_id: "",
      village_name: "",
      postal_code: "",
      street_address: streetAddress,
    });
  };

  const handleVillageChange = (newVilId) => {
    if (newVilId === villageId) return;
    const vilObj = villages.find((v) => v._id === newVilId);
    const newPostal = vilObj?.postal_code || postalCode || "";
    emitChange({
      province_id: provinceId,
      province_name: currentProv?.name || value?.province_name || "",
      regency_id: regencyId,
      regency_name: currentReg?.name || value?.regency_name || "",
      district_id: districtId,
      district_name: currentDist?.name || value?.district_name || "",
      village_id: newVilId,
      village_name: vilObj?.name || "",
      postal_code: newPostal,
      street_address: streetAddress,
    });
  };

  const handleStreetChange = (e) => {
    const val = e.target.value;
    emitChange({
      street_address: val,
    });
  };

  const handlePostalChange = (e) => {
    const val = e.target.value;
    emitChange({
      postal_code: val,
    });
  };

  // Formatted Full Address
  const formattedAddressPreview = [
    streetAddress ? streetAddress.trim() : null,
    currentVil ? `Kel. ${currentVil.name}` : (value?.village_name ? `Kel. ${value.village_name}` : null),
    currentDist ? `Kec. ${currentDist.name}` : (value?.district_name ? `Kec. ${value.district_name}` : null),
    currentReg ? currentReg.name : (value?.regency_name || null),
    currentProv ? currentProv.name : (value?.province_name || null),
    postalCode ? postalCode.trim() : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      id={`region-select-group-${uid}`}
      className={`space-y-3.5 bg-slate-50/90 p-4 rounded-2xl border border-slate-200 ${className}`}
      data-testid="region-select-group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-navy text-gold flex items-center justify-center font-bold text-xs">
            <MapPin size={13} />
          </div>
          <div>
            <Label className="text-xs font-bold text-navy">
              Master Wilayah Administratif {required && "*"}
            </Label>
            <p className="text-[10px] text-slate-500">
              Pilih wilayah resmi bertingkat (Bukan teks bebas)
            </p>
          </div>
        </div>
        {(currentVil || value?.village_id) && (
          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 size={11} /> Wilayah Lengkap
          </span>
        )}
      </div>

      {/* Grid of 4 Cascading Dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. PROVINSI */}
        <div className="space-y-1">
          <Label htmlFor={`select-prov-${uid}`} className="text-[11px] font-semibold text-slate-700">
            Provinsi {required && "*"}
          </Label>
          <Select
            value={provinceId || ""}
            onValueChange={handleProvinceChange}
            disabled={disabled || loadingProv}
          >
            <SelectTrigger
              id={`select-prov-${uid}`}
              data-testid="select-province"
              className="h-11 rounded-xl text-xs bg-white border-slate-200 cursor-pointer pointer-events-auto"
            >
              <SelectValue placeholder={loadingProv ? "Memuat Provinsi..." : "Pilih Provinsi"} />
            </SelectTrigger>
            <SelectContent className="max-h-60 z-50">
              {provinces.map((p) => (
                <SelectItem key={p._id} value={p._id} className="text-xs font-medium">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 2. KABUPATEN / KOTA */}
        <div className="space-y-1">
          <Label htmlFor={`select-reg-${uid}`} className="text-[11px] font-semibold text-slate-700">
            Kabupaten / Kota {required && "*"}
          </Label>
          <Select
            value={regencyId || ""}
            onValueChange={handleRegencyChange}
            disabled={disabled || !provinceId || loadingReg}
          >
            <SelectTrigger
              id={`select-reg-${uid}`}
              data-testid="select-regency"
              className="h-11 rounded-xl text-xs bg-white border-slate-200 cursor-pointer pointer-events-auto"
            >
              <SelectValue
                placeholder={
                  !provinceId
                    ? "Pilih Provinsi Dahulu"
                    : loadingReg
                    ? "Memuat Kab/Kota..."
                    : "Pilih Kab / Kota"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-60 z-50">
              {regencies.map((r) => (
                <SelectItem key={r._id} value={r._id} className="text-xs font-medium">
                  {r.type ? `${r.type} ` : ""}{r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. KECAMATAN */}
        <div className="space-y-1">
          <Label htmlFor={`select-dist-${uid}`} className="text-[11px] font-semibold text-slate-700">
            Kecamatan {required && "*"}
          </Label>
          <Select
            value={districtId || ""}
            onValueChange={handleDistrictChange}
            disabled={disabled || !regencyId || loadingDist}
          >
            <SelectTrigger
              id={`select-dist-${uid}`}
              data-testid="select-district"
              className="h-11 rounded-xl text-xs bg-white border-slate-200 cursor-pointer pointer-events-auto"
            >
              <SelectValue
                placeholder={
                  !regencyId
                    ? "Pilih Kab/Kota Dahulu"
                    : loadingDist
                    ? "Memuat Kecamatan..."
                    : "Pilih Kecamatan"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-60 z-50">
              {districts.map((d) => (
                <SelectItem key={d._id} value={d._id} className="text-xs font-medium">
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 4. KELURAHAN / DESA */}
        <div className="space-y-1">
          <Label htmlFor={`select-vil-${uid}`} className="text-[11px] font-semibold text-slate-700">
            Kelurahan / Desa {required && "*"}
          </Label>
          <Select
            value={villageId || ""}
            onValueChange={handleVillageChange}
            disabled={disabled || !districtId || loadingVil}
          >
            <SelectTrigger
              id={`select-vil-${uid}`}
              data-testid="select-village"
              className="h-11 rounded-xl text-xs bg-white border-slate-200 cursor-pointer pointer-events-auto"
            >
              <SelectValue
                placeholder={
                  !districtId
                    ? "Pilih Kecamatan Dahulu"
                    : loadingVil
                    ? "Memuat Kel/Desa..."
                    : "Pilih Kelurahan / Desa"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-60 z-50">
              {villages.map((v) => (
                <SelectItem key={v._id} value={v._id} className="text-xs font-medium">
                  {v.name} {v.postal_code ? `(${v.postal_code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Street Address & Postal Code Row */}
      {(showStreetInput || showPostalCode) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {showStreetInput && (
            <div className={`space-y-1 ${showPostalCode ? "sm:col-span-2" : "sm:col-span-3"}`}>
              <Label htmlFor={`input-street-address-${uid}`} className="text-[11px] font-semibold text-slate-700">
                Nama Jalan, Gedung, No, RT/RW {required && "*"}
              </Label>
              <Input
                id={`input-street-address-${uid}`}
                data-testid="input-street-address"
                disabled={disabled}
                placeholder="Contoh: Jl. Raya Puncak No. 45 RT 02/03"
                value={streetAddress}
                onChange={handleStreetChange}
                onClick={(e) => e.stopPropagation()}
                className="h-11 rounded-xl text-xs bg-white border-slate-200 cursor-text focus-visible:ring-2 focus-visible:ring-navy pointer-events-auto"
              />
            </div>
          )}

          {showPostalCode && (
            <div className="space-y-1">
              <Label htmlFor={`input-postal-code-${uid}`} className="text-[11px] font-semibold text-slate-700">
                Kode Pos
              </Label>
              <Input
                id={`input-postal-code-${uid}`}
                data-testid="input-postal-code"
                disabled={disabled}
                placeholder="43211"
                maxLength={6}
                value={postalCode}
                onChange={handlePostalChange}
                onClick={(e) => e.stopPropagation()}
                className="h-11 rounded-xl text-xs font-mono bg-white border-slate-200 cursor-text focus-visible:ring-2 focus-visible:ring-navy pointer-events-auto"
              />
            </div>
          )}
        </div>
      )}

      {/* Live Formatted Address & Hierarchy Badge */}
      {showPreview && formattedAddressPreview && (
        <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1 mt-2 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Format Alamat Lengkap Terbentuk:
          </div>
          <div className="font-semibold text-slate-800 text-xs leading-relaxed">
            {formattedAddressPreview}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex-wrap">
            <span className="font-medium text-navy">{currentProv?.name || value?.province_name || "Provinsi"}</span>
            <span>&rarr;</span>
            <span className="font-medium text-navy">{currentReg?.name || value?.regency_name || "Kab/Kota"}</span>
            <span>&rarr;</span>
            <span className="font-medium text-navy">{currentDist?.name || value?.district_name || "Kecamatan"}</span>
            <span>&rarr;</span>
            <span className="font-medium text-navy">{currentVil?.name || value?.village_name || "Kelurahan/Desa"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
