// Gera src/app/shared/version.ts a partir do package.json (+ data do build e git short SHA).
// Rodado automaticamente antes de `ng build` / `ng serve` (ver package.json).
// Fonte única da versão = o campo "version" do package.json.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkg = require(path.join(__dirname, '..', 'package.json'));

// Prioridade: env GIT_SHA (injetada no build do Docker via --build-arg) → git local → 'local'.
let sha = process.env.GIT_SHA && process.env.GIT_SHA !== 'local' ? process.env.GIT_SHA.trim() : 'local';
if (sha === 'local') {
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'local';
  } catch {
    // sem git e sem env — mantém 'local'
  }
}

const buildDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// `: string` evita o erro NG7 do Angular (tipo literal x comparação) no template do rodapé.
const content = `// GERADO AUTOMATICAMENTE por scripts/gen-version.js — não edite à mão.
export const APP_VERSION: string = '${pkg.version}';
export const BUILD_DATE: string = '${buildDate}';
export const BUILD_SHA: string = '${sha}';
`;

const out = path.join(__dirname, '..', 'src', 'app', 'shared', 'version.ts');
fs.writeFileSync(out, content);
console.log('✓ version.ts', pkg.version, buildDate, sha);
