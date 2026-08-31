const fs = require('fs');
let code = fs.readFileSync('server/inventory.service.ts', 'utf8');

if (!code.includes('isCloudSqlConnected')) {
  code = code.replace(
    'import { db } from "./data.js";',
    'import { db } from "./data.js";\nimport { isCloudSqlConnected } from "./cloudsqlSync.js";'
  );
}

// Replace all occurrences of `return await sqlDb.transaction(async (tx) => {`
// Wait, we need to find the matching closing bracket.
// Instead of that, we can wrap the sqlDb.transaction part.
// But it's easier to just do: `const runner = isCloudSqlConnected ? (cb) => sqlDb.transaction(cb) : (cb) => cb(null); return await runner(async (tx) => {`
code = code.replace(/return await sqlDb\.transaction\(async \(tx\) => {/g, 'const runner = isCloudSqlConnected ? (cb: any) => sqlDb.transaction(cb) : (cb: any) => cb(null); return await runner(async (tx: any) => {');

fs.writeFileSync('server/inventory.service.ts', code);
