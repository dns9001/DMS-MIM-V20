import { db, resetToCleanFreshDatabase, saveDatabaseToDisk } from "../server/data.js";
import { purgeAllFirestoreData, syncToFirestore, getSyncStats } from "../server/firestoreSync.js";

async function main() {
  console.log("=================================================");
  console.log("🚀 MEMULAI MIGRASI TOTAL DATABASE DMS MAHAMERU");
  console.log("   TUJUAN: DATABASE BARU YANG KOSONG DAN BERSIH");
  console.log("=================================================");

  // 1. Purge all data from Google Cloud Firestore
  console.log("\n[1/4] Membersihkan seluruh dokumen & koleksi di Google Cloud Firestore...");
  const purgeRes = await purgeAllFirestoreData();
  console.log(`✅ ${purgeRes.deletedCount} dokumen lama/dummy/mock berhasil dihapus dari Cloud Firestore.`);

  // 2. Reset in-memory database to pristine clean state
  console.log("\n[2/4] Mereset struktur database lokal & in-memory ke status bersih 100%...");
  resetToCleanFreshDatabase();
  console.log("✅ In-memory database berhasil direset ke state bersih.");

  // 3. Persist to data/db.json
  console.log("\n[3/4] Menyimpan database bersih ke data/db.json...");
  saveDatabaseToDisk(true);
  console.log("✅ Database bersih tersimpan di disk.");

  // 4. Sync clean state to Google Cloud Firestore
  console.log("\n[4/4] Sinkronisasi baseline database bersih ke Google Cloud Firestore...");
  await syncToFirestore(true, true);
  console.log("✅ Sinkronisasi database bersih ke Google Cloud Firestore selesai.");

  const stats = getSyncStats();
  console.log("\n=================================================");
  console.log("📊 STATUS DATABASE BERSIH SETELAH MIGRASI:");
  console.log("Total Koleksi:", stats.totalCollections);
  console.log("Total Rekor Keseluruhan:", stats.totalRecords);
  console.log("Rincian Koleksi:");
  for (const [col, count] of Object.entries(stats.collectionCounts)) {
    console.log(` - ${col.padEnd(25)}: ${count} rekor`);
  }
  console.log("=================================================");
  console.log("🎉 MIGRASI TOTAL DATABASE DMS MAHAMERU SELESAI DENGAN SUKSES!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Terjadi kesalahan saat migrasi:", err);
  process.exit(1);
});
