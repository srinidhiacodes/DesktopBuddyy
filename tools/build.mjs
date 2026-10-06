// Builds the ready-to-run app into dist/.
//
//   npm run dist                       Windows 64-bit -> dist/DeskBuddy/DeskBuddy.exe
//   npm run dist -- darwin universal   Mac (Intel + Apple Silicon) -> dist/DeskBuddy-mac/Desk Buddy.app
//   npm run dist -- linux              a Linux build, only used for testing
//
// Windows builds work from any computer. A universal Mac build needs a Mac
// (GitHub builds it on one); a single-architecture Mac build (x64 or arm64)
// can be made anywhere but must be signed on a Mac before it will open.
// Only app/ and package.json go in; the source clips, tools and notes stay out.

import { packager } from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const platform = process.argv[2] || 'win32';
const arch = process.argv[3] || 'x64';
const mac = platform === 'darwin';
const OUT = path.join(ROOT, 'dist');
const FINAL = path.join(OUT, { win32: 'DeskBuddy', darwin: 'DeskBuddy-mac' }[platform] || `DeskBuddy-${platform}`);

const [appPath] = await packager({
  dir: ROOT,
  out: OUT,
  overwrite: true,
  platform,
  arch,
  // Mac users see the app's file name, so it gets her real name there.
  name: mac ? 'Desk Buddy' : 'DeskBuddy',
  executableName: mac ? 'Desk Buddy' : 'DeskBuddy',
  appVersion: pkg.version,
  appCopyright: 'Desk Buddy',
  icon: path.join(ROOT, 'app', 'icons', mac ? 'app.icns' : 'app.ico'),
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
  appBundleId: 'com.deskbuddy.app',
  appCategoryType: 'public.app-category.productivity',
  darwinDarkModeSupport: true,
  // A menu-bar app: no Dock icon and no menu bar of its own.
  extendInfo: { LSUIElement: true },
});

// Keep only the English language pack: the app has no other text, and this
// saves about 40 MB. (Mac builds keep theirs inside the app bundle.)
const locales = path.join(appPath, 'locales');
if (fs.existsSync(locales)) {
  for (const f of fs.readdirSync(locales)) {
    if (f !== 'en-US.pak') fs.rmSync(path.join(locales, f));
  }
}

fs.rmSync(FINAL, { recursive: true, force: true });
fs.renameSync(appPath, FINAL);

let bytes = 0;
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.isFile()) bytes += fs.statSync(p).size;
  }
};
walk(FINAL);
console.log(`Built ${path.relative(ROOT, FINAL)} (${Math.round(bytes / 1e6)} MB)`);
