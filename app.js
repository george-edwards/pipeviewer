import { parsePipeline, destinationLabel } from './parser.js';
import { portUsage, pipeActivity } from './usage.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const names = ['stdin', 'stdout', 'stderr'];
const examples = {
  simple: 'cat access.log | grep "404" | sort',
  file: 'sort < names.txt | uniq -c > counts.txt',
  merge: 'cat access.log | grep "404" > errors.log 2>&1',
  order: 'curl https://example.com 2>&1 > response.html | grep "error"',
  discard: 'find . -name "*.js" 2> /dev/null | wc -l',
  timing: 'sleep 2 | echo "hello, world"',
};
let currentModel;
let currentSource = '';

function destinationMarkup(dest, fd, commands) {
  if (dest.type === 'pipe') {
    const command = commands[fd === 0 ? dest.from : dest.to].command;
    return `Pipe ${fd === 0 ? 'from' : 'to'} <code>${escape(command)}</code>`;
  }
  return escape(destinationLabel(dest, fd, commands));
}

function usageMarkup(command, fd) {
  const usage = portUsage(command, fd);
  return `<span class="usage-note usage-${usage.state}" title="${escape(usage.reason)}"><i aria-hidden="true"></i>${usage.label}<span class="sr-only">: ${escape(usage.reason)}</span></span>`;
}

function usageInsights(model) {
  return model.pipes.map(pipe => {
    const source = model.commands[pipe.from], target = model.commands[pipe.to];
    const activity = pipeActivity(model.commands, pipe);
    const sourceName = `<code>${escape(source.usage.name)}</code>`;
    const targetName = `<code>${escape(target.usage.name)}</code>`;
    if (activity.notRead && portUsage(target, 1).state === 'possible') {
      const noWrites = activity.noWrites ? `${sourceName} writes no data to this pipe. ` : '';
      const possibleBrokenPipe = activity.noWrites ? '' : ' The producer may still write; writes can fail once the pipe has no readers.';
      return `<p class="usage-insight">${noWrites}${targetName} ignores stdin, so it can produce output without waiting for data from ${sourceName}. The foreground shell still waits for all pipeline commands to finish.${possibleBrokenPipe}</p>`;
    }
    if (source.usage.name === 'sleep' && activity.noWrites && target.fds[0] === pipe && portUsage(target, 0).state === 'possible') {
      return `<p class="usage-insight">${sourceName} writes no data, but keeps the pipe open during its delay. ${targetName} reads stdin and can wait for end-of-file until ${sourceName} exits.</p>`;
    }
    return '';
  }).join('');
}

function diagram(model) {
  // Resolve theme colours to concrete values so exported SVGs remain standalone.
  const styles = getComputedStyle(document.documentElement);
  const palette = Object.fromEntries(['surface', 'inset', 'text', 'muted', 'border', 'purple', 'green', 'amber', 'purple-bg', 'green-bg', 'amber-bg']
    .map(name => [name, styles.getPropertyValue(`--${name}`).trim()]));
  const colors = [palette.green, palette.purple, palette.amber];
  const count = model.commands.length;
  const xFor = i => 220 + i * 360;
  const used = new Map();
  model.commands.forEach(cmd => Object.entries(cmd.fds).forEach(([fd, dest]) => {
    if (Number(fd) <= 2 && dest.type !== 'pipe') used.set(dest.id, dest);
  }));
  const bottom = [...used.values()].filter(d => !['terminal-in', 'terminal-out'].includes(d.id));
  const width = Math.max(850, 240 + count * 360 + 175, 350 + bottom.length * 190);
  const positions = new Map();
  positions.set('terminal-in', { x: 20, y: 149, w: 155, h: 59 });
  positions.set('terminal-out', { x: width - 174, y: 149, w: 155, h: 59 });
  bottom.forEach((d, i) => positions.set(d.id, { x: 180 + i * (width - 350) / Math.max(1, bottom.length), y: 353, w: 168, h: 61 }));
  const paths = [];
  const short = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const path = (d, fd, dashed = false, inactive = false, reason = '') => `<g class="stream-link${inactive ? ' unused-link' : ''}"><title>${escape(reason)}</title><path d="${d}" fill="none" stroke="${inactive ? palette.muted : colors[fd]}" stroke-width="2" ${dashed || inactive ? 'stroke-dasharray="5 5"' : ''} marker-end="url(#arrow-${inactive ? 'unused' : fd})"/></g>`;
  const port = (cmd, fd) => ({ x: xFor(cmd.index) + (fd === 0 ? 0 : 220), y: fd === 2 ? 226 : 179 });
  for (const cmd of model.commands) {
    for (const fd of [0, 1, 2]) {
      const dest = cmd.fds[fd], p = port(cmd, fd);
      const usage = portUsage(cmd, fd);
      const inactive = ['unused', 'closed'].includes(usage.state);
      if (dest.type === 'pipe') {
        const activity = pipeActivity(model.commands, dest);
        if (fd === 0 && cmd.index === dest.to) {
          const producer = model.commands[dest.from];
          if ([1, 2].some(f => producer.fds[f] === dest)) continue;
        }
        const next = model.commands[dest.to];
        if (fd !== 0 && cmd.index === dest.from && next.fds[0] === dest) {
          const q = port(next, 0);
          paths.push(path(`M ${p.x} ${p.y} C ${p.x + 50} ${p.y}, ${q.x - 50} ${q.y}, ${q.x - 5} ${q.y}`, fd, false, inactive || activity.notRead, `${usage.reason} ${activity.reason}`));
          if (fd === 1 || cmd.fds[1] !== dest) paths.push(`<text class="pipe-label" x="${(p.x + q.x) / 2}" y="${p.y - 12}" text-anchor="middle" fill="${palette.muted}" font-size="10"><title>${escape(activity.reason)}</title>${escape(activity.label)}</text>`);
        } else {
          const endX = p.x + (fd === 0 ? -43 : 43);
          paths.push(path(`M ${fd === 0 ? endX : p.x} ${p.y} L ${fd === 0 ? p.x - 4 : endX} ${p.y}`, fd, true, inactive, usage.reason));
          paths.push(`<text x="${endX}" y="${p.y - 12}" text-anchor="middle" fill="${palette.muted}" font-size="9">pipe ${dest.from + 1}</text>`);
        }
        continue;
      }
      const box = positions.get(dest.id);
      if (fd === 0) {
        if (dest.id === 'terminal-in') paths.push(path(`M ${box.x + box.w} ${box.y + 30} C ${p.x - 25} ${box.y + 30}, ${p.x - 25} ${p.y}, ${p.x - 4} ${p.y}`, fd, false, inactive, usage.reason));
        else paths.push(path(`M ${box.x + box.w / 2} ${box.y} V 302 Q ${box.x + box.w / 2} 290 ${box.x + box.w / 2 - 12} 290 H ${p.x - 35} Q ${p.x - 45} 290 ${p.x - 45} 278 V ${p.y + 12} Q ${p.x - 45} ${p.y} ${p.x - 30} ${p.y} H ${p.x - 4}`, fd, false, inactive, usage.reason));
      } else if (dest.id === 'terminal-out' && cmd.index === count - 1 && fd === 1) {
        paths.push(path(`M ${p.x} ${p.y} H ${box.x - 4}`, fd, false, inactive, usage.reason));
      } else {
        const targetX = box.x + box.w / 2 + (fd === 2 ? 18 : -18);
        const laneY = 283 + fd * 15 + cmd.index * 2;
        const turnX = p.x + 20 + fd * 7;
        paths.push(path(`M ${p.x} ${p.y} H ${turnX - 10} Q ${turnX} ${p.y} ${turnX} ${p.y + 10} V ${laneY - 12} Q ${turnX} ${laneY} ${turnX - 12} ${laneY} H ${targetX} Q ${targetX} ${laneY} ${targetX} ${laneY + 12} V ${box.y - 4}`, fd, dest.type === 'closed', inactive, usage.reason));
      }
    }
  }
  const nodes = [...used.values()].map(dest => {
    const p = positions.get(dest.id);
    const icon = dest.type === 'file' ? '▤' : dest.type === 'null' ? '∅' : dest.type === 'closed' ? '×' : '▣';
    const subtitle = dest.type === 'file' ? dest.mode === 'read' ? 'INPUT FILE' : dest.mode === 'append' ? 'APPEND TO FILE' : 'OUTPUT FILE' : dest.type === 'null' ? dest.mode === 'read' ? 'END-OF-FILE' : 'DISCARDED' : dest.type === 'closed' ? 'DESCRIPTOR CLOSED' : 'TERMINAL';
    return `<g><title>${escape(dest.label)}</title><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="${palette.inset}" stroke="${palette.border}"/><text x="${p.x + 15}" y="${p.y + 26}" fill="${palette.muted}" font-size="17">${icon}</text><text x="${p.x + 39}" y="${p.y + 25}" fill="${palette.text}" font-family="'IBM Plex Mono',monospace" font-size="10">${escape(short(dest.label, 18))}</text><text x="${p.x + 39}" y="${p.y + 43}" fill="${palette.muted}" font-size="9" letter-spacing="1">${subtitle}</text></g>`;
  });
  const cards = model.commands.map(cmd => {
    const x = xFor(cmd.index);
    const ports = [0, 1, 2].map(fd => {
      const p = port(cmd, fd), usage = portUsage(cmd, fd);
      const inactive = ['unused', 'closed'].includes(usage.state);
      const badgeX = fd === 0 ? x + 13 : x + 186;
      const labelX = fd === 0 ? x + 38 : x + 178;
      const annotationX = fd === 0 ? x + 14 : x + 205;
      const tint = [palette['green-bg'], palette['purple-bg'], palette['amber-bg']][fd];
      return `<g data-command="${cmd.index}" data-fd="${fd}" data-usage="${usage.state}">
        <title>${escape(usage.reason)}</title>
        <rect x="${badgeX}" y="${p.y - 10}" width="19" height="18" rx="4" fill="${inactive ? palette.inset : tint}"/>
        <text x="${badgeX + 9.5}" y="${p.y + 3}" text-anchor="middle" fill="${inactive ? palette.muted : colors[fd]}" font-size="10">${fd}</text>
        <text x="${labelX}" y="${p.y + 3}" text-anchor="${fd === 0 ? 'start' : 'end'}" fill="${palette.text}" font-size="10">${names[fd]}</text>
        <text x="${annotationX}" y="${p.y + 21}" text-anchor="${fd === 0 ? 'start' : 'end'}" fill="${palette.muted}" font-size="10">${usage.label}</text>
        <circle cx="${p.x}" cy="${p.y}" r="4" fill="${usage.state === 'possible' ? colors[fd] : palette.surface}" stroke="${inactive ? palette.muted : colors[fd]}" stroke-width="1.8" ${usage.state === 'unknown' ? 'stroke-dasharray="2 2"' : ''}/>
      </g>`;
    }).join('');
    return `<g><title>${escape(cmd.command)}</title>
      <rect x="${x}" y="101" width="220" height="156" rx="10" fill="${palette.surface}" stroke="${palette.border}"/>
      <path d="M ${x} 158 H ${x + 220}" stroke="${palette.border}"/>
      <text x="${x + 16}" y="123" fill="${palette.muted}" font-size="9" letter-spacing="1.3">COMMAND ${cmd.index + 1}</text>
      <text x="${x + 16}" y="144" fill="${palette.text}" font-size="12" font-weight="500" font-family="'IBM Plex Mono',monospace">${escape(short(cmd.command, 24))}</text>
      ${ports}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 55 ${width} 390" role="img" aria-labelledby="svg-title svg-desc" font-family="'DM Sans',Arial,sans-serif"><title id="svg-title">Pipeline descriptor map</title><desc id="svg-desc">Usage is inferred for standard commands, not observed. ${escape(model.commands.map(cmd => `${cmd.command}: ${[0,1,2].map(fd => `${names[fd]} ${destinationLabel(cmd.fds[fd], fd, model.commands)} (${portUsage(cmd, fd).label})`).join(', ')}`).join('. '))}</desc><defs>${[...colors, palette.muted].map((color, fd) => `<marker id="arrow-${fd === 3 ? 'unused' : fd}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 1 1 L 7 4 L 1 7" fill="none" stroke="${color}" stroke-width="1.5"/></marker>`).join('')}</defs><rect x="0" y="55" width="${width}" height="390" fill="${palette.surface}"/>${paths.join('')}${nodes.join('')}${cards.join('')}</svg>`;
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
    $('#details').innerHTML = currentModel.commands.map(cmd => `<article class="detail-card"><div class="detail-title"><span class="number">${cmd.index + 1}</span><code title="${escape(cmd.command)}">${escape(cmd.command)}</code></div>${Object.entries(cmd.fds).map(([fd, dest]) => `<div class="fd-row fd-${fd}"><span class="fd-badge">${fd}</span><span>${names[fd] || 'fd ' + fd}</span><span class="right-arrow">→</span><span class="destination">${destinationMarkup(dest, Number(fd), currentModel.commands)}${usageMarkup(cmd, Number(fd))}</span></div>`).join('')}${cmd.steps.length ? `<details class="steps"><summary>${cmd.steps.length} redirect${cmd.steps.length === 1 ? '' : 's'}, applied left to right</summary><ol>${cmd.steps.map(step => `<li><code>${escape(step.text)}</code><br>${escape(step.description)}</li>`).join('')}</ol></details>` : ''}</article>`).join('');
    const extra = currentModel.commands.some(cmd => Object.keys(cmd.fds).some(fd => Number(fd) > 2));
    $('#insights').innerHTML = usageInsights(currentModel);
    $('#notes').innerHTML = [...currentModel.notes, ...(extra ? ['The diagram shows descriptors 0, 1, and 2. Additional descriptors are listed below.'] : [])].map(note => `<div class="note">${escape(note)}</div>`).join('');
    document.querySelectorAll('[data-example]').forEach(button => button.classList.toggle('active', examples[button.dataset.example] === currentSource));
    try { localStorage.setItem('pipeviewer-pipeline', currentSource); } catch { /* Storage is optional. */ }
  } catch (error) {
    $('#error').textContent = error.message;
    $('#error').hidden = false;
    $('#results').hidden = true;
  }
}

const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let followsSystemTheme = true;
try { followsSystemTheme = !['light', 'dark'].includes(localStorage.getItem('pipeviewer-theme')); } catch {}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const action = theme === 'dark' ? 'Light mode' : 'Dark mode';
  $('#theme-label').textContent = action;
  $('#theme-toggle').setAttribute('aria-label', `Switch to ${action.toLowerCase()}`);
  $('#theme-toggle').title = `Switch to ${action.toLowerCase()}`;
  $('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--page').trim();
  // Recolour the existing diagram without submitting edits or closing details.
  if (currentModel) $('#diagram').innerHTML = diagram(currentModel);
}

$('#theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  followsSystemTheme = false;
  try { localStorage.setItem('pipeviewer-theme', theme); } catch {}
  applyTheme(theme);
});
systemTheme.addEventListener('change', event => {
  if (followsSystemTheme) applyTheme(event.matches ? 'dark' : 'light');
});
applyTheme(document.documentElement.dataset.theme);

const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform);
$('#shortcut-hint').textContent = isMac ? '⌘ Enter' : 'Ctrl+Enter';
$('#shortcut-hint').setAttribute('aria-label', `${isMac ? 'Command' : 'Control'} plus Enter`);
$('#pipeline').setAttribute('aria-keyshortcuts', isMac ? 'Meta+Enter' : 'Control+Enter');
$('.primary-button').setAttribute('aria-keyshortcuts', isMac ? 'Meta+Enter' : 'Control+Enter');
$('#pipeline-form').addEventListener('submit', event => { event.preventDefault(); render(); });
$('#pipeline-form').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); render(); } });
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
