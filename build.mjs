import { mkdir, copyFile, cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const modules = ['app.js', 'parser.js', 'usage.js', 'training.js', 'lessons.js', 'intro.js', 'reference.js', 'sandbox.js', 'cases.js', 'toolbox.js', 'why.js', 'whyscenes.js', 'tape.js', 'welcome.js'];
await mkdir('dist', { recursive: true });
await Promise.all([...modules, 'index.html', 'style.css', 'toolbox.html', 'favicon.svg', 'apple-touch-icon.png'].map(file => copyFile(file, `dist/${file}`)));
await cp('commands', 'dist/commands', { recursive: true });
// app.js reaches the command rules three imports deep, so the browser would find them one level at a
// time. Listing every module up front lets it fetch them all at once.
const commands = (await readdir('commands')).filter(file => file.endsWith('.js')).sort().map(file => `commands/${file}`);
const preloads = [...modules, ...commands].map(file => `  <link rel="modulepreload" href="${file}">`).join('\n');
const html = await readFile('index.html', 'utf8');
const stylesheet = '  <link rel="stylesheet" href="style.css">\n';
if (!html.includes(stylesheet)) throw new Error('index.html has no style.css link to put the module preloads after.');
await writeFile('dist/index.html', html.replace(stylesheet, `${stylesheet}${preloads}\n`));
// The talk video is not in git, so copy it only when it is present.
if (existsSync('video')) await cp('video', 'dist/video', { recursive: true });
console.log('Built static app in dist/');
