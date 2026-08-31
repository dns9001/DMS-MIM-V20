const fs = require('fs');
let content = fs.readFileSync('server/routes.ts', 'utf8');

const polyfill = `
import { createRequire } from "module";
const _require = typeof require !== "undefined" ? require : createRequire(import.meta.url);
`;

content = content.replace(/import \{ Router \} from "express";/, `import { Router } from "express";` + polyfill);
content = content.replace(/require\(/g, '_require(');

fs.writeFileSync('server/routes.ts', content);
