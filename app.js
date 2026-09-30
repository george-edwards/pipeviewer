import { parsePipeline, destinationLabel } from './parser.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const colors = ['#359b91', '#7562d4', '#cc9449'];
const names = ['stdin', 'stdout', 'stderr'];
const examples = {
  simple: 'cat access.log | grep "404" | sort',
  file: 'sort < names.txt | uniq -c > counts.txt',
  merge: 'cat access.log | grep "404" > errors.log 2>&1',
  order: 'curl https://example.com 2>&1 > response.html | grep "error"',
  discard: 'find . -name "*.js" 2> /dev/null | wc -l',
};
let currentModel;
let currentSource = '';

function diagram(model) {
  const count = model.commands.length;
  const xFor = i => 220 + i * 300;
  const used = new Map();
  model.commands.forEach(cmd => Object.entries(cmd.fds).forEach(([fd, dest]) => {
    if (Number(fd) <= 2 && dest.type !== 'pipe') used.set(dest.id, dest);
  }));
  const bottom = [...used.values()].filter(d => !['terminal-in', 'terminal-out'].includes(d.id));
  const width = Math.max(850, 240 + count * 300 + 175, 350 + bottom.length * 190);
  const positions = new Map();
  positions.set('terminal-in', { x: 20, y: 149, w: 155, h: 59 });
  positions.set('terminal-out', { x: width - 174, y: 149, w: 155, h: 59 });
  bottom.forEach((d, i) => positions.set(d.id, { x: 180 + i * (width - 350) / Math.max(1, bottom.length), y: 353, w: 168, h: 61 }));
  const paths = [];
  const short = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const path = (d, fd, dashed = false) => `<path d="${d}" fill="none" stroke="${colors[fd]}" stroke-width="1.7" ${dashed ? 'stroke-dasharray="5 5"' : ''} marker-end="url(#arrow-${fd})" opacity=".8"/>`;
  const port = (cmd, fd) => ({ x: xFor(cmd.index) + (fd === 0 ? 0 : 220), y: fd === 2 ? 226 : 179 });
  for (const cmd of model.commands) {
    for (const fd of [0, 1, 2]) {
      const dest = cmd.fds[fd], p = port(cmd, fd);
      if (dest.type === 'pipe') {
        if (fd === 0 && cmd.index === dest.to) {
          const producer = model.commands[dest.from];
          if ([1, 2].some(f => producer.fds[f] === dest)) continue;
        }
        const next = model.commands[dest.to];
        if (fd !== 0 && cmd.index === dest.from && next.fds[0] === dest) {
          const q = port(next, 0);
          paths.push(path(`M ${p.x} ${p.y} C ${p.x + 40} ${p.y}, ${q.x - 40} ${q.y}, ${q.x - 4} ${q.y}`, fd));
          if (fd === 1) paths.push(`<text x="${p.x + 38}" y="${p.y - 12}" text-anchor="middle" fill="#a5a0b3" font-size="9">pipe</text>`);
        } else {
          const endX = p.x + (fd === 0 ? -43 : 43);
          paths.push(path(`M ${fd === 0 ? endX : p.x} ${p.y} L ${fd === 0 ? p.x - 4 : endX} ${p.y}`, fd, true));
          paths.push(`<text x="${endX}" y="${p.y - 12}" text-anchor="middle" fill="#9a94a5" font-size="9">pipe ${dest.from + 1}</text>`);
        }
        continue;
      }
      const box = positions.get(dest.id);
      if (fd === 0) {
        if (dest.id === 'terminal-in') paths.push(path(`M ${box.x + box.w} ${box.y + 30} C ${p.x - 25} ${box.y + 30}, ${p.x - 25} ${p.y}, ${p.x - 4} ${p.y}`, fd));
        else paths.push(path(`M ${box.x + box.w / 2} ${box.y} V 302 Q ${box.x + box.w / 2} 290 ${box.x + box.w / 2 - 12} 290 H ${p.x - 35} Q ${p.x - 45} 290 ${p.x - 45} 278 V ${p.y + 12} Q ${p.x - 45} ${p.y} ${p.x - 30} ${p.y} H ${p.x - 4}`, fd));
      } else if (dest.id === 'terminal-out' && cmd.index === count - 1 && fd === 1) {
        paths.push(path(`M ${p.x} ${p.y} H ${box.x - 4}`, fd));
      } else {
        const targetX = box.x + box.w / 2 + (fd === 2 ? 18 : -18);
        const laneY = 283 + fd * 15 + cmd.index * 2;
        const turnX = p.x + 20 + fd * 7;
        paths.push(path(`M ${p.x} ${p.y} H ${turnX - 10} Q ${turnX} ${p.y} ${turnX} ${p.y + 10} V ${laneY - 12} Q ${turnX} ${laneY} ${turnX - 12} ${laneY} H ${targetX} Q ${targetX} ${laneY} ${targetX} ${laneY + 12} V ${box.y - 4}`, fd, dest.type === 'closed'));
      }
    }
  }
  const nodes = [...used.values()].map(dest => {
    const p = positions.get(dest.id);
    const icon = dest.type === 'file' ? '▤' : dest.type === 'null' ? '∅' : dest.type === 'closed' ? '×' : '▣';
    const subtitle = dest.type === 'file' ? dest.mode === 'read' ? 'INPUT FILE' : dest.mode === 'append' ? 'APPEND TO FILE' : 'OUTPUT FILE' : dest.type === 'null' ? dest.mode === 'read' ? 'END-OF-FILE' : 'DISCARDED' : dest.type === 'closed' ? 'DESCRIPTOR CLOSED' : 'TERMINAL';
    return `<g><title>${escape(dest.label)}</title><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="#fcfcfe" stroke="#e3e5ee"/><text x="${p.x + 15}" y="${p.y + 26}" fill="#a39ab5" font-size="17">${icon}</text><text x="${p.x + 39}" y="${p.y + 25}" fill="#6f6a7e" font-family="'IBM Plex Mono',monospace" font-size="10">${escape(short(dest.label, 18))}</text><text x="${p.x + 39}" y="${p.y + 43}" fill="#aaa6b5" font-size="7.5" letter-spacing="1">${subtitle}</text></g>`;
  });
  const cards = model.commands.map(cmd => {
    const x = xFor(cmd.index);
    return `<g><title>${escape(cmd.command)}</title><rect x="${x}" y="101" width="220" height="156" rx="10" fill="white" stroke="#dad6e8"/><path d="M ${x} 158 H ${x + 220}" stroke="#efedf5"/><text x="${x + 16}" y="123" fill="#b0a7c2" font-size="8" letter-spacing="1.3">COMMAND ${cmd.index + 1}</text><text x="${x + 16}" y="144" fill="#595167" font-size="12" font-weight="500" font-family="'IBM Plex Mono',monospace">${escape(short(cmd.command, 24))}</text><rect x="${x + 13}" y="169" width="17" height="18" rx="4" fill="#edf7f5"/><text x="${x + 21.5}" y="181.5" text-anchor="middle" fill="${colors[0]}" font-size="10">0</text><text x="${x + 38}" y="182" fill="#8e949f" font-size="10">stdin</text>${[1,2].map(fd => `<rect x="${x + 186}" y="${fd === 1 ? 169 : 216}" width="19" height="18" rx="4" fill="${fd === 1 ? '#f0edf9' : '#fbf3e8'}"/><text x="${x + 195.5}" y="${fd === 1 ? 182 : 229}" text-anchor="middle" fill="${colors[fd]}" font-size="10">${fd}</text><text x="${x + 178}" y="${fd === 1 ? 182 : 229}" text-anchor="end" fill="#8e949f" font-size="10">${names[fd]}</text>`).join('')}${[0,1,2].map(fd => { const p = port(cmd, fd); return `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="white" stroke="${colors[fd]}" stroke-width="1.5"/>`; }).join('')}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 55 ${width} 390" role="img" aria-labelledby="svg-title svg-desc" font-family="'DM Sans',Arial,sans-serif"><title id="svg-title">Pipeline descriptor map</title><desc id="svg-desc">${escape(model.commands.map(cmd => `${cmd.command}: ${[0,1,2].map(fd => `${names[fd]} ${destinationLabel(cmd.fds[fd], fd)}`).join(', ')}`).join('. '))}</desc><defs>${colors.map((color, fd) => `<marker id="arrow-${fd}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 1 1 L 7 4 L 1 7" fill="none" stroke="${color}" stroke-width="1.5"/></marker>`).join('')}</defs>${paths.join('')}${nodes.join('')}${cards.join('')}</svg>`;
}

function render() {
  try {
    currentModel = parsePipeline($('#pipeline').value);
    currentSource = $('#pipeline').value;
    $('#error').hidden = true;
    $('#results').hidden = false;
    $('#command-count').textContent = `${currentModel.commands.length} command${currentModel.commands.length === 1 ? '' : 's'}`;
    $('#flow-caption').hidden = true;
    $('#diagram').innerHTML = diagram(currentModel);
    $('#diagram').style.minWidth = `${Math.max(720, $('#diagram svg').viewBox.baseVal.width * .85)}px`;
    const redirects = currentModel.commands.reduce((total, cmd) => total + cmd.steps.length, 0);
    $('#redirect-count').textContent = `${redirects} redirect${redirects === 1 ? '' : 's'} applied`;
    $('#details').innerHTML = currentModel.commands.map(cmd => `<article class="detail-card"><div class="detail-title"><span class="number">${cmd.index + 1}</span><code title="${escape(cmd.command)}">${escape(cmd.command)}</code></div>${Object.entries(cmd.fds).map(([fd, dest]) => `<div class="fd-row fd-${fd}"><span class="fd-badge">${fd}</span><span>${names[fd] || 'fd ' + fd}</span><span class="right-arrow">→</span><span class="destination">${escape(destinationLabel(dest, Number(fd)))}</span></div>`).join('')}${cmd.steps.length ? `<details class="steps"><summary>${cmd.steps.length} redirect${cmd.steps.length === 1 ? '' : 's'}, applied left to right</summary><ol>${cmd.steps.map(step => `<li><code>${escape(step.text)}</code><br>${escape(step.description)}</li>`).join('')}</ol></details>` : ''}</article>`).join('');
    const extra = currentModel.commands.some(cmd => Object.keys(cmd.fds).some(fd => Number(fd) > 2));
    $('#notes').innerHTML = [...currentModel.notes, ...(extra ? ['The diagram shows descriptors 0, 1, and 2. Additional descriptors are listed below.'] : [])].map(note => `<div class="note">${escape(note)}</div>`).join('');
    document.querySelectorAll('[data-example]').forEach(button => button.classList.toggle('active', examples[button.dataset.example] === currentSource));
    try { localStorage.setItem('pipeviewer-pipeline', currentSource); } catch { /* Storage is optional. */ }
  } catch (error) {
    $('#error').textContent = error.message;
    $('#error').hidden = false;
    $('#results').hidden = true;
  }
}

$('#pipeline-form').addEventListener('submit', event => { event.preventDefault(); render(); });
$('#pipeline').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); render(); } });
$('#pipeline').addEventListener('input', () => {
  $('#flow-caption').hidden = $('#pipeline').value === currentSource;
});
function loadExample(key) { $('#pipeline').value = examples[key]; render(); }
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => loadExample(button.dataset.example)));
$('#reference-button').addEventListener('click', () => $('#reference').showModal());
$('#close-reference').addEventListener('click', () => $('#reference').close());
$('#reference').addEventListener('click', event => { if (event.target === $('#reference')) { const box = event.target.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.target.close(); } });
$('#download').addEventListener('click', () => {
  const svg = $('#diagram svg').outerHTML;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'pipeline.svg'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try { const saved = localStorage.getItem('pipeviewer-pipeline'); if (saved) $('#pipeline').value = saved; } catch { /* Storage is optional. */ }
render();
