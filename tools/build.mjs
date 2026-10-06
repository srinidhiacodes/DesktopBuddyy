// Builds the ready-to-run app into dist/DeskBuddy (DeskBuddy.exe on Windows).
//
//   npm run dist               Windows 64-bit (works from Windows, Linux or macOS)
//   npm run dist -- linux      a Linux build, only used for testing
//
// The .exe gets her icon and name. Only app/ and package.json go in; the
// source clips, tools and notes stay out.

import { packager } from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const platform = process.argv[2] || 'win32';
const OUT = path.join(ROOT, 'dist');
const FINAL = path.join(OUT, platform === 'win32' ? 'DeskBuddy' : `DeskBuddy-${platform}`);

const [appPath] = await packager({
  dir: ROOT,
  out: OUT,
  overwrite: true,
  platform,
  arch: 'x64',
  name: 'DeskBuddy',
  executableName: 'DeskBuddy',
  appVersion: pkg.version,
  appCopyright: 'Desk Buddy',
  icon: path.join(ROOT, 'app', 'icons', 'app.ico'),
  asar: true,
  prune: false,
  ignore: [
    /^\/(source|tools|dist|\.git|\.github|\.claude)(\/|$)/,
    /^\/(README|TODO)\.md$/,
    /^\/package-lock\.json$/,
    /^\/node_modules(\/|$)/,   // the app has no runtime dependencies
  ],
  win32metadata: {
    CompanyName: 'Desk Buddy',
    FileDescription: 'Desk Buddy',
    ProductName: 'Desk Buddy',
    InternalName: 'DeskBuddy',
    OriginalFilename: 'DeskBuddy.exe',
  },
});

// Keep only the English language pack: the app has no other text, and this
// saves about 40 MB.
const locales = path.join(appPath, 'locales');
for (const f of fs.readdirSync(locales)) {
  if (f !== 'en-US.pak') fs.rmSync(path.join(locales, f));
}

fs.rmSync(FINAL, { recursive: true, force: true });
fs.renameSync(appPath, FINAL);

let bytes = 0;
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size;
  }
};
walk(FINAL);
console.log(`Built ${path.relative(ROOT, FINAL)} (${Math.round(bytes / 1e6)} MB)`);
