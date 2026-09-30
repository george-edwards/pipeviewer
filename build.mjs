import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await Promise.all(['index.html', 'style.css', 'app.js', 'parser.js', 'usage.js'].map(file => copyFile(file, `dist/${file}`)));
console.log('Built static app in dist/');
