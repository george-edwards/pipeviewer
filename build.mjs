import { mkdir, copyFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
await mkdir('dist', { recursive: true });
await Promise.all(['index.html', 'style.css', 'app.js', 'parser.js', 'usage.js', 'favicon.svg', 'apple-touch-icon.png'].map(file => copyFile(file, `dist/${file}`)));
// The talk video is not in git, so copy it only when it is present.
if (existsSync('video')) await cp('video', 'dist/video', { recursive: true });
console.log('Built static app in dist/');
