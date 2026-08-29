# DOKUMENTASI PENYELESAIAN PROYEK & PANDUAN PENGGUNAAN APLIKASI
## DMS MAHAMERU (DISTRIBUTION MANAGEMENT SYSTEM)
**PT Mahameru Insan Mandiri / PT Mahameru Distribusi Indonesia**

---

## BAGIAN 1: LAPORAN PENYELESAIAN PROYEK (PROJECT COMPLETION REPORT)

### 1.1 Ringkasan Eksekutif
Aplikasi **DMS Mahameru (Distribution Management System)** telah selesai dibangun dan dinyatakan siap digunakan untuk kegiatan operasional distribusi lapangan dan administrasi terpusat. Sistem ini mengintegrasikan seluruh rantai proses distribusi FMCG/Consumer Goods mulai dari presensi berbasis GPS, rencana kunjungan salesman (*Call Plan*), pencatatan transaksi toko dengan kontrol stok langsung, serah terima & retur barang gudang, hingga audit trail dan dasbor analitik eksekutif.

### 1.2 Cakupan Modul & Fitur yang Telah Selesai

| Modul | Status | Deskripsi Fungsional |
|---|:---:|---|
| **Autentikasi & Keamanan (RBAC)** | **Selesai** | JWT token dengan role: `OWNER`, `ADMIN`, `SUPERVISOR`, `SALES`, `WAREHOUSE`. Dilengkapi enkripsi bcrypt dan pemulihan akun. |
| **Presensi GPS & Selfie (WIB)** | **Selesai** | Validasi radius geofence kantor (formula Haversine), validasi jam kerja (WIB / GMT+7), deteksi keterlambatan, dan riwayat presensi harian. |
| **Call Plan & Kunjungan Outlet** | **Selesai** | Penjadwalan rencana kunjungan harian/mingguan, check-in radius toko, outlet call tak terjadwal, foto kunjungan, dan pencatatan alasan batal kunjungan. |
| **Transaksi & Penjualan (SFA)** | **Selesai** | Pembuatan nota/invoice, pemotongan kuota stok bawaan salesman secara instan, diskon & pajak, cetak struk termal/PDF, dan pembatalan transaksi aman. |
| **Manajemen Stok Gudang & Mobil** | **Selesai** | Serah terima stok pagi (*Handover*), retur sisa stok sore (*Return*), penyesuaian stok opname (*Adjustment*), kartu stok & riwayat mutasi per SKU. |
| **Monitoring Lapangan Supervisor** | **Selesai** | Peta lokasi *live* salesman, status rute kunjungan real-time, persetujuan outlet baru (*NOO Verification*), serta evaluasi target volume penjualan. |
| **Master Data Wilayah & Produk** | **Selesai** | Hirarki wilayah standar BPS (Provinsi, Kab/Kota, Kecamatan, Kelurahan), Master Outlet, Saluran Toko, Rute, Kategori Produk, dan SKU. |
| **Laporan & Dasbor Eksekutif** | **Selesai** | Monitoring omzet harian/bulanan, tren volume penjualan per SKU, rekapitulasi efektivitas kunjungan (Call vs Effective Call), dan ekspor data CSV/Excel. |
| **Audit Trail & Keamanan Data** | **Selesai** | Pencatatan rekam jejak aktivitas kritis pengguna (siapa, kapan, aksi apa, IP/perangkat) yang tidak dapat dimanipulasi. |

### 1.3 Standarisasi Waktu & Geofencing
- **Timezone**: Seluruh sistem frontend dan backend telah dikunci pada **GMT+7 (Asia/Jakarta / Waktu Indonesia Barat)**.
- **Validasi Jarak**: Menggunakan kalkulasi presisi rumus *Haversine (Great-circle distance)* untuk membandingkan koordinat GPS perangkat dengan titik pusat kantor atau outlet (toleransi default kantor 200m, outlet 150m).

---

## BAGIAN 2: PANDUAN PENGGUNAAN APLIKASI (USER MANUAL)

### 2.1 Daftar Akun Default & Kredensial Akses

| Peran (Role) | Nama Pengguna | Alamat Email | Kata Sandi | Tujuan Penggunaan |
|---|---|---|---|---|
| **Owner / Direksi** | Andis Moch Solihin | `andismochsolihin@gmail.com` | `owner123` | Monitoring performa bisnis, omzet, dan laporan menyeluruh. |
| **Administrator** | Super Administrator | `admin@mahameru.id` | `admin123` | Konfigurasi sistem, master data wilayah & produk, audit log. |
| **Supervisor** | Slamet Supervisor | `spv@mahameru.id` | `spv123` | Monitoring salesman, approval NOO, target & call plan. |
| **Salesman** | Budi Salesman | `budi@mahameru.id` | `sales123` | Presensi harian, kunjungan outlet, order & transaksi nota. |
| **Gudang (Warehouse)**| Gunawan Gudang | `gudang@mahameru.id` | `gudang123` | Serah terima stok mobil salesman, retur, kartu stok. |

---

### 2.2 Panduan Operasional Salesman (Mobile Flow)

#### Langkah 1: Presensi Masuk (Check-In)
1. Masuk (*Login*) menggunakan akun salesman (`budi@mahameru.id`).
2. Pada layar utama, tekan tombol **"Presensi Masuk"**.
3. Sistem akan meminta izin akses lokasi (GPS) dan kamera. Pastikan posisi Anda berada di dalam radius area kantor yang ditentukan.
4. Ambil foto selfie presensi, lalu tekan **"Kirim Presensi"**. Status jam masuk akan tercatat otomatis dalam WIB.

#### Langkah 2: Mengambil Stok Bawaan dari Gudang
1. Petugas gudang akan melakukan serah terima (*Handover*) stok mobil harian ke akun Anda.
2. Periksa menu **Stok Saya** untuk memastikan jumlah kuantiti tiap SKU yang Anda bawa di mobil sudah sesuai sebelum berangkat ke rute.

#### Langkah 3: Melakukan Kunjungan Outlet (Call Plan)
1. Buka menu **Call Plan / Rute Hari Ini**.
2. Pilih nama toko/outlet yang akan dikunjungi.
3. Saat tiba di lokasi toko, tekan tombol **"Mulai Kunjungan (Check-In Outlet)"**.
4. Sistem memverifikasi jarak koordinat GPS Anda dengan titik toko.
5. Ambil foto outlet/kondisi pajangan toko sebagai bukti kunjungan.

#### Langkah 4: Membuat Transaksi Penjualan / Nota
1. Pada menu detail kunjungan, tekan **"Buat Transaksi / Order"**.
2. Pilih produk dan SKU yang dipesan oleh pemilik toko. Masukkan kuantiti barang.
3. Sistem otomatis menghitung total harga, diskon, dan subtotal serta memverifikasi ketersediaan stok mobil Anda.
4. Pilih metode pembayaran (*Tunai / Kredit / Transfer*), lalu tekan **"Simpan & Cetak Invoice"**.
5. Invoice digital terbentuk, dan stok barang di akun salesman berkurang secara real-time.

#### Langkah 5: Mengakhiri Hari Kunjungan & Absensi Pulang
1. Selesaikan kunjungan toko terakhir.
2. Kembali ke kantor / gudang untuk melakukan retur sisa stok fisik kepada petugas gudang.
3. Pada halaman utama aplikasi, tekan **"Presensi Pulang (Check-Out)"**.

---

### 2.3 Panduan Operasional Supervisor

#### 1. Live Monitoring Lapangan
- Buka menu **Monitoring**.
- Tinjau status seluruh salesman: status absensi, jam check-in, baterai perangkat, lokasi koordinat terkini pada peta interaktif, serta jumlah toko yang telah dikunjungi.

#### 2. Verifikasi Outlet Baru (New Open Outlet / NOO)
- Masuk ke sub-menu **Verifikasi Outlet**.
- Tinjau permohonan pendaftaran toko baru yang didaftarkan oleh salesman dari lapangan (foto toko, KTP pemilik, koordinat GPS).
- Klik **"Setujui (Approve)"** untuk mengaktifkan outlet agar bisa langsung ditransaksikan, atau **"Tolak"** jika data tidak valid.

#### 3. Manajemen Call Plan & Target Penjualan
- Tetapkan alokasi rute toko per salesman per hari kerja pada menu **Kelola Call Plan**.
- Tetapkan target volume (jumlah botol/karton per SKU) bulanan pada menu **Target Penjualan** untuk memantau pencapaian KPI sales.

---

### 2.4 Panduan Operasional Petugas Gudang (Warehouse)

#### 1. Serah Terima Stok Pagi (Stock Handover)
1. Masuk dengan akun gudang (`gudang@mahameru.id`).
2. Buka menu **Gudang & Inventori** > Tab **Serah Terima Stok**.
3. Pilih nama salesman dan tanggal keberangkatan.
4. Masukkan daftar SKU beserta kuantiti yang diserahkan ke armada salesman.
5. Simpan transaksi serah terima. Stok gudang utama akan otomatis berkurang dan dialokasikan ke stok mobil salesman.

#### 2. Retur Sisa Stok Sore (Stock Return)
1. Buka Tab **Retur Stok**.
2. Pilih nama salesman yang kembali dari rute.
3. Hitung fisik sisa barang dan barang retur rusak/kadaluarsa. Masukkan kuantiti yang diterima kembali.
4. Konfirmasi retur. Saldo stok salesman akan di-nolkan/disesuaikan kembali ke gudang pusat.

#### 3. Penyesuaian Stok (Stock Adjustment / Opname)
- Jika terdapat selisih fisik saat audit periodik, gunakan fitur **Penyesuaian Stok** dengan mencantumkan alasan resmi untuk pencatatan buku besar mutasi.

---

### 2.5 Panduan Operasional Administrator

#### 1. Pengelolaan Master Data Wilayah & Geografis
- Buka menu **Master Data**.
- Kelola data hierarki wilayah: **Provinsi**, **Kabupaten/Kota**, **Kecamatan**, hingga **Kelurahan/Desa**.
- Kelola master titik kantor cabang (*Office Geofence*) beserta batas radius toleransi meter.

#### 2. Master Produk & Harga
- Tambah dan ubah master kategori produk, nama SKU, satuan karton/pcs, harga dasar, dan program diskon promosi.

#### 3. Manajemen Akun Pengguna & Log Audit
- Tambah pengguna baru (Salesman, Supervisor, Warehouse).
- Pantau seluruh jejak aktivitas pengguna di menu **Audit Trail** untuk keperluan investigasi keamanan dan audit kepatuhan SOP.

---

### 2.6 Panduan Operasional Owner / Direksi

#### 1. Executive Dashboard
- Tinjau indikator utama bisnis: Total Omzet Penjualan, Total Kunjungan Selesai, Effective Call (EC) Rate, dan Volume SKU Terlaris.
- Gunakan filter rentang tanggal (Hari Ini, 7 Hari Terakhir, Bulan Ini, atau Kustom) untuk melihat perbandingan tren penjualan.

#### 2. Laporan Penjualan & Ekspor
- Masuk ke menu **Laporan**.
- Tinjau rekapitulasi penjualan per cabang, per area, per salesman, maupun per kategori produk.
- Ekspor berkas laporan ke format spreadsheet (CSV/Excel) untuk kebutuhan analisis lanjutan atau pembukuan keuangan.

---

## BAGIAN 3: CATATAN TEKNIS & PEMELIHARAAN SISTEM

1. **Penyimpanan Data**: Sistem dilengkapi dengan modul persistensi basis data otomatis yang mencatat perubahan ke penyimpanan lokal/cloud secara berkala.
2. **Kamera & Lokasi**: Perangkat wajib mengaktifkan izin GPS *High Accuracy* dan mengizinkan akses kamera browser saat melakukan presensi dan kunjungan toko.
3. **Penyelarasan Jam**: Pastikan perangkat pengguna terhubung dengan sinkronisasi waktu jaringan otomatis (*Automatic Date & Time*) agar pencatatan log tidak mengalami selisih detik/menit.

---
*Dokumen ini diterbitkan secara resmi sebagai acuan operasional dan serah terima sistem DMS Mahameru.*
