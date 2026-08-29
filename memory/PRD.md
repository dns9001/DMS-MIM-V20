# PRD — DMS Mahameru

## Problem Statement (ringkasan)
Enterprise Distribution Management System (DMS Mahameru) untuk PT Mahameru Insan Mandiri. Mobile-first field ops (absensi GPS, kunjungan outlet, hybrid call plan, transaksi lapangan, effective/outlet call), monitoring supervisor + peta, master data admin, dashboard owner + report center, inventory gudang, offline mode + sync, audit trail. Bahasa Indonesia. Branding navy #0A2540 + gold #C5A059, font Outfit/Manrope.

## Arsitektur (SETELAH migrasi ke pod Emergent — 2026-06)
Aplikasi asli adalah **monolith Node/TypeScript** (Express API + Vite React + database file JSON). Untuk berjalan di pod Emergent (supervisor mengharapkan backend Python di 8001 + frontend di 3000), dilakukan adaptasi **Opsi A** (pertahankan kode Node, bungkus agar kompatibel):

- **Backend gateway**: `/app/backend/server.py` — FastAPI (uvicorn di port 8001, sesuai supervisor). Saat startup men-spawn Node Express API (`/app/server/api-server.ts`) di port internal 8811, lalu **reverse-proxy** semua request `/api/*` ke Node. Meneruskan method/headers/body/query + Set-Cookie.
- **Node API**: `/app/server/*.ts` (routes.ts 8000+ baris, 117 endpoint, logika bisnis lengkap: KPI, lifecycle outlet, ledger stok, 16 laporan). Data di `/app/data/db.json` (file-backed store).
- **Frontend**: React + Vite di `/app/src`, disajikan di port 3000 via `/app/frontend/package.json` (`start` menjalankan `vite --root /app`). Firebase DIHAPUS dari frontend; auth kini **pure JWT** (token di localStorage `mhm_token`, header `Authorization: Bearer`). Context di-refactor: `AuthContext.jsx`, `CompanyContext.jsx`, `lib/api.js`.
- Routing ingress: browser memanggil `/api` relatif (same-origin) → ingress arahkan ke port 8001 → gateway → Node.

## Kredensial (lihat /app/memory/test_credentials.md)
- OWNER andismochsolihin@gmail.com / owner123
- ADMIN admin@mahameru.id / admin123
- (SUPERVISOR/SALES/WAREHOUSE + master data lain dibuat via layar Admin; DB awal hanya OWNER+ADMIN)

## Kredensial (lihat /app/memory/test_credentials.md)
- OWNER andismochsolihin@gmail.com / owner123 → /owner
- ADMIN admin@mahameru.id / admin123 → /admin/masters
- SUPERVISOR spv@mahameru.id / spv123 → /monitoring
- SALES budi@mahameru.id / sales123 → /home (mobile)
- WAREHOUSE gudang@mahameru.id / gudang123 → /warehouse

## Demo Data (seed, 2026-06)
Office Jakarta (geofence 200m @ -6.2146,106.8451), Area Jakarta Pusat, salesman Budi (assigned ke 3 outlet Tebet), produk Kopi/Teh + 3 SKU + harga, stok lapangan Budi (100/80/90), call plan hari ini (3 outlet), 1 target volume. `allow_fake_gps=true` untuk demo. Reset seed: `rm /app/data/db.json && sudo supervisorctl restart backend`.

## Perbaikan Alur Lapangan (2026-06)
- Ditambah halaman **OutletDetail** (`/app/src/pages/sales/OutletDetail.jsx`, route `/outlets/:id`) untuk **Check-in kunjungan** (GPS + foto opsional) → POST `/api/visits/check-in` → ke halaman Visit.
- Backend diselaraskan dgn frontend: `GET /visits/active` bungkus `{visit}`; `POST /visits/:id/check-out` derive call_result (EFFECTIVE bila ada transaksi) + guard durasi min (409); `GET /transactions/sku-list` bungkus `{items}` + field `sku_id`/`name`; `GET /dashboard/sales` attendance status derivasi `ON_DUTY`/`OFF_DUTY`; masters open-call-reasons tambah alias `reason`.
- Frontend VisitPage: baca body `postQueued` yang benar (`r.transaction`/`r.visit`).
- Testing agent iteration_7: alur SALES penuh (absen masuk → kunjungan → transaksi Rp90.000 → checkout EFFECTIVE → absen pulang + ringkasan) **100% pass**; 5 role login OK.

## Alur NOO / Outlet Baru (2026-06)
- Sales daftar outlet baru (tab "+ Tambah Baru") → backend set status **PENDING** (kecuali `auto_approve_outlets`). Foto disimpan (`photo_url`).
- Supervisor: tab **Approval Outlet** di /monitoring menampilkan outlet PENDING (enrich created_by_name/area/channel/foto) → **Setujui** (`/outlets/:id/approve`) → ACTIVE → bisa dikunjungi sales.
- OutletDetail menampilkan banner "menunggu approval" + tombol check-in di-disable saat PENDING.
- Testing agent iteration_8: alur NOO end-to-end (sales buat → PENDING → muncul di approval supervisor → approve → ACTIVE) **100% pass**.

## Status (2026-06)
- ✅ Aplikasi BERJALAN di preview. Login OWNER & ADMIN, dashboard owner (KPI+chart), master data admin, monitoring, report center, audit — semua render tanpa crash.
- ✅ Backend gateway diverifikasi via curl (login + /api/dashboard/owner 200 melalui ingress).
- ✅ Frontend smoke test (testing agent iteration_4): 100% pass. Hanya warning kosmetik React Router v7 future flag.
- ✅ Robustness: interceptor clear `mhm_token` saat 401.
- Dependencies di-install via `yarn install --ignore-engines` (firebase-admin butuh node>=22, tapi tidak dipakai lagi).

## Keterbatasan Terdokumentasi
- Backend logika = kode Node lama (file JSON store), belum di-port ke Python/MongoDB (sesuai pilihan user: Opsi A). Migrasi ke Python+Mongo = backlog besar bila diperlukan.
- Firebase (auth/firestore/storage) dihapus dari frontend; upload logo perusahaan pakai base64 (bukan cloud storage).
- Data master awal kosong (perlu setup oleh admin: office, area, salesman, outlet, produk/SKU) sebelum flow lapangan bisa diuji penuh.

## Backlog Prioritas
- P1: Seed data demo (office, area, sales, outlet, produk/SKU, call plan) agar flow lapangan bisa langsung dicoba.
- P1: Enable React Router v7 future flags (silence warnings).
- P2: (Opsional) Port backend ke Python FastAPI + MongoDB untuk kepatuhan penuh standar Emergent & kemudahan deploy jangka panjang.
- P2: Verifikasi flow SALES mobile (absensi GPS, check-in kunjungan + foto, transaksi) setelah master data terisi.
