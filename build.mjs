import { mkdir, copyFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
await mkdir('dist', { recursive: true });
await Promise.all(['index.html', 'style.css', 'app.js', 'parser.js', 'usage.js', 'training.js', 'lessons.js', 'intro.js', 'reference.js', 'favicon.svg', 'apple-touch-icon.png'].map(file => copyFile(file, `dist/${file}`)));
await cp('commands', 'dist/commands', { recursive: true });
// The talk video is not in git, so copy it only when it is present.
if (existsSync('video')) await cp('video', 'dist/video', { recursive: true });
console.log('Built static app in dist/');
