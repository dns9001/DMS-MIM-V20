const fs = require('fs');

function fixFile(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  if (!code.includes('isCloudSqlConnected')) {
    code = 'import { isCloudSqlConnected } from "./cloudsqlSync.js";\n' + code;
  }
  code = code.replace(
    /return sqlDb\.transaction\(async \(tx\) => {/g,
    'const runner = isCloudSqlConnected ? (cb: any) => sqlDb.transaction(cb) : (cb: any) => cb(null); return runner(async (tx: any) => {'
  );
  code = code.replace(
    /return await sqlDb\.transaction\(async \(tx\) => {/g,
    'const runner = isCloudSqlConnected ? (cb: any) => sqlDb.transaction(cb) : (cb: any) => cb(null); return await runner(async (tx: any) => {'
  );
  fs.writeFileSync(filePath, code);
}

fixFile('server/outletLifecycle.sync.ts');
fixFile('server/transaction.service.ts');
fixFile('server/stockAtomic.service.ts');
