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
  procsub: 'ls missing.txt . 2> >(sed "s/^/error: /") | wc -l',
  procsubIn: 'paste <(cut -f 1 names.tsv) <(cut -f 3 scores.tsv)',
};
let currentModel;
let currentSource = '';

function destinationMarkup(dest, fd, commands, cmd) {
  if (dest.type === 'pipe') {
    const command = dest.commands[fd === 0 ? dest.from : dest.to].command;
    return `Pipe ${fd === 0 ? 'from' : 'to'} <code>${escape(command)}</code>`;
  }
  if (dest.type === 'procsub' && dest.owner !== cmd) {
    return `Substitution ${dest.direction === '>' ? 'input from' : 'output to'} <code>${escape(dest.owner.command)}</code>`;
  }
  if (dest.type === 'procsub') return `<code>${escape(dest.label)}</code> · /dev/fd/${dest.fd}`;
  return escape(destinationLabel(dest, fd, commands, cmd));
}

// Details list each command, followed by the substitutions it starts.
function detailOrder(model) {
  const order = [];
  const visit = cmd => { order.push(cmd); cmd.substitutions.forEach(sub => sub.commands.forEach(visit)); };
  model.commands.forEach(visit);
  return order;
}

function substitutionInsights(model) {
  return model.substitutions.map(sub => {
    const owner = `<code>${escape(sub.owner.usage.name)}</code>`, text = `<code>${escape(sub.text)}</code>`;
    const redirected = Object.keys(sub.owner.fds).map(Number).filter(fd => fd !== sub.fd && sub.owner.fds[fd] === sub.endpoint);
    const via = redirected.length ? `${owner}’s ${redirected.map(fd => names[fd] || `fd ${fd}`).join(' and ')}` : `${owner} (through the argument /dev/fd/${sub.fd})`;
    if (sub.direction === '<') {
      return `<p class="usage-insight">Bash runs ${text} alongside ${owner} and connects its stdout to ${via}.</p>`;
    }
    const last = sub.commands.at(-1), out = last.fds[1], inner = `<code>${escape(last.usage.name)}</code>`;
    if (out.type === 'pipe' && out.commands !== sub.commands) {
      const reader = out.commands[out.to], readerName = `<code>${escape(reader.usage.name)}</code>`;
      const shared = sub.owner.fds[1] === out ? `, the same pipe as ${owner}’s stdout` : '';
      const reads = reader.fds[0] === out && portUsage(reader, 0).state !== 'unused'
        ? ` ${readerName} can read data from both, and it only gets end-of-file after every writer closes the pipe.` : '';
      return `<p class="usage-insight">${text} receives ${via}. ${inner} inherited stdout when Bash expanded the substitution, so it writes to pipe ${out.from + 1}${shared}.${reads}</p>`;
    }
    return `<p class="usage-insight">${text} receives ${via}. Bash does not wait for process substitutions, so output from ${inner} can appear after the rest of the pipeline has finished.</p>`;
  }).join('');
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

// Main commands fill row 0. Substitutions go below their owner: >(…) to the right, <(…) to the left.
function layout(model) {
  const place = new Map(), taken = new Set();
  model.commands.forEach((cmd, i) => { place.set(cmd, { col: i, row: 0 }); taken.add(`${i},0`); });
  for (const sub of model.substitutions) {
    const owner = place.get(sub.owner), k = sub.commands.length;
    const cols = Array.from({ length: k }, (_, j) => (sub.direction === '>' ? owner.col + 1 : owner.col - k) + j);
    let row = owner.row + 1;
    while (cols.some(col => taken.has(`${col},${row}`))) row++;
    sub.commands.forEach((cmd, j) => { place.set(cmd, { col: cols[j], row }); taken.add(`${cols[j]},${row}`); });
  }
  const spots = [...place.values()];
  const shift = -Math.min(0, ...spots.map(p => p.col));
  return { place, shift, cols: Math.max(...spots.map(p => p.col)) + shift + 1, rows: Math.max(...spots.map(p => p.row)) };
}

function diagram(model) {
  // Resolve theme colours to concrete values so exported SVGs remain standalone.
  const styles = getComputedStyle(document.documentElement);
  const palette = Object.fromEntries(['surface', 'inset', 'text', 'muted', 'border', 'purple', 'green', 'amber', 'purple-bg', 'green-bg', 'amber-bg']
    .map(name => [name, styles.getPropertyValue(`--${name}`).trim()]));
  // Index 3 is for substitution descriptors passed as /dev/fd arguments.
  const colors = [palette.green, palette.purple, palette.amber, palette.text];
  const grid = layout(model);
  const extra = grid.rows * 200;
  const geometry = cmd => { const p = grid.place.get(cmd); return { x: 220 + (p.col + grid.shift) * 360, y: 101 + p.row * 200 }; };
  const used = new Map();
  model.all.forEach(cmd => Object.entries(cmd.fds).forEach(([fd, dest]) => {
    if (Number(fd) > 2 || ['pipe', 'procsub'].includes(dest.type)) return;
    // Substitutions show inherited terminal input as a short labelled stub.
    if (cmd.substitution && dest.id === 'terminal-in') return;
    used.set(dest.id, dest);
  }));
  const bottom = [...used.values()].filter(d => !['terminal-in', 'terminal-out'].includes(d.id));
  const width = Math.max(850, 240 + grid.cols * 360 + 175, 350 + bottom.length * 190);
  const positions = new Map();
  positions.set('terminal-in', { x: 20 + grid.shift * 360, y: 149, w: 155, h: 59 });
  positions.set('terminal-out', { x: width - 174, y: 149, w: 155, h: 59 });
  bottom.forEach((d, i) => positions.set(d.id, { x: 180 + i * (width - 350) / Math.max(1, bottom.length), y: 353 + extra, w: 168, h: 61 }));
  const paths = [];
  const short = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const path = (d, fd, dashed = false, inactive = false, reason = '') => `<g class="stream-link${inactive ? ' unused-link' : ''}"><title>${escape(reason)}</title><path d="${d}" fill="none" stroke="${inactive ? palette.muted : colors[fd]}" stroke-width="2" ${dashed || inactive ? 'stroke-dasharray="5 5"' : ''} marker-end="url(#arrow-${inactive ? 'unused' : fd})"/></g>`;
  const stub = (p, fd, label, inactive, reason) => {
    const endX = p.x + (fd === 0 ? -43 : 43);
    paths.push(path(`M ${fd === 0 ? endX : p.x} ${p.y} L ${fd === 0 ? p.x - 4 : endX} ${p.y}`, fd, true, inactive, reason));
    paths.push(`<text x="${endX}" y="${p.y - 12}" text-anchor="middle" fill="${palette.muted}" font-size="9">${escape(label)}</text>`);
  };
  const port = (cmd, fd) => { const g = geometry(cmd); return { x: g.x + (fd === 0 ? 0 : 220), y: g.y + (fd === 2 ? 125 : 78) }; };
  // Substitutions not on 0–2 attach to the bottom edge: <(…) on the left, >(…) on the right.
  // A redirect such as 3< <(…) keeps its own number; arguments use Bash's /dev/fd number.
  const bottomFd = sub => {
    const { owner: cmd, endpoint } = sub;
    if ([0, 1, 2].some(f => cmd.fds[f] === endpoint)) return null;
    if (typeof sub.place === 'number' && cmd.fds[sub.place] === endpoint) return sub.place;
    return cmd.fds[sub.fd] === endpoint ? sub.fd : null;
  };
  const bottomSubs = cmd => cmd.substitutions.filter(sub => bottomFd(sub) !== null);
  const argumentPort = (cmd, sub) => {
    const g = geometry(cmd), same = bottomSubs(cmd).filter(s => s.direction === sub.direction), k = same.indexOf(sub);
    return { x: g.x + (sub.direction === '<' ? 30 + k * 34 : 110 - k * 34), y: g.y + 156 };
  };
  const inactiveState = state => ['unused', 'closed'].includes(state);
  const substitutionLink = (cmd, fd, sub) => {
    const inner = sub.direction === '>' ? sub.commands[0] : sub.commands.at(-1);
    const q = port(inner, sub.direction === '>' ? 0 : 1);
    const s = fd <= 2 ? port(cmd, fd) : argumentPort(cmd, sub);
    const [writer, reader] = sub.direction === '>' ? [portUsage(cmd, fd), portUsage(inner, 0)] : [portUsage(inner, 1), portUsage(cmd, fd)];
    const inactive = inactiveState(writer.state) || inactiveState(reader.state);
    const connection = fd === sub.fd ? `through /dev/fd/${sub.fd}` : `to ${names[fd] || `fd ${fd}`}, opened from /dev/fd/${sub.fd}`;
    const reason = `${sub.text} is connected ${connection}. ${writer.reason} ${reader.reason}`;
    if (sub.direction === '>') {
      const start = fd <= 2 ? `C ${s.x + 60} ${s.y}` : `C ${s.x} ${s.y + 60}`;
      paths.push(path(`M ${s.x} ${s.y} ${start}, ${q.x - 60} ${q.y}, ${q.x - 5} ${q.y}`, fd <= 2 ? fd : 3, false, inactive, reason));
    } else {
      const end = fd <= 2 ? `${s.x - 60} ${s.y}, ${s.x - 5} ${s.y}` : `${s.x} ${s.y + 60}, ${s.x} ${s.y + 5}`;
      paths.push(path(`M ${q.x} ${q.y} C ${q.x + 60} ${q.y}, ${end}`, 1, false, inactive, reason));
    }
  };
  model.all.forEach((cmd, lane) => {
    const fdsToDraw = [0, 1, 2, ...bottomSubs(cmd).map(bottomFd)];
    for (const fd of fdsToDraw) {
      const dest = cmd.fds[fd], p = port(cmd, fd);
      const usage = portUsage(cmd, fd);
      const inactive = inactiveState(usage.state);
      if (dest.type === 'procsub') {
        // The owner draws each link once, from a redirected port when there is one.
        const sub = dest.substitution;
        if (dest.owner === cmd) {
          if (fd <= 2 || bottomFd(sub) === fd) substitutionLink(cmd, fd, sub);
        } else if (fd <= 2 && !(fd === 0 && cmd === sub.commands[0] && sub.direction === '>') && !(fd === 1 && cmd === sub.commands.at(-1) && sub.direction === '<')) {
          // An inherited copy of another substitution's pipe, such as stderr from a later >(…).
          stub(p, fd, short(dest.label, 14), inactive, usage.reason);
        }
        continue;
      }
      if (fd > 2) continue;
      if (dest.type === 'pipe') {
        const activity = pipeActivity(dest.commands, dest);
        const producer = dest.commands[dest.from], next = dest.commands[dest.to];
        if (fd === 0 && cmd === next && [1, 2].some(f => producer.fds[f] === dest)) continue;
        if (fd !== 0 && cmd === producer && next.fds[0] === dest) {
          const q = port(next, 0);
          paths.push(path(`M ${p.x} ${p.y} C ${p.x + 50} ${p.y}, ${q.x - 50} ${q.y}, ${q.x - 5} ${q.y}`, fd, false, inactive || activity.notRead, `${usage.reason} ${activity.reason}`));
          if (fd === 1 || cmd.fds[1] !== dest) paths.push(`<text class="pipe-label" x="${(p.x + q.x) / 2}" y="${p.y - 12}" text-anchor="middle" fill="${palette.muted}" font-size="10"><title>${escape(activity.reason)}</title>${escape(activity.label)}</text>`);
        } else if (cmd.substitution && fd !== 0 && next.fds[0] === dest && geometry(next).y < geometry(cmd).y) {
          // An inherited pipe: run below the reader's card, then into its stdin.
          const q = port(next, 0), gapY = geometry(next).y + 178;
          paths.push(path(`M ${p.x} ${p.y} H ${p.x + 4} Q ${p.x + 12} ${p.y} ${p.x + 12} ${p.y - 8} V ${gapY + 8} Q ${p.x + 12} ${gapY} ${p.x + 4} ${gapY} H ${q.x - 22} Q ${q.x - 30} ${gapY} ${q.x - 30} ${gapY - 8} V ${q.y + 8} Q ${q.x - 30} ${q.y} ${q.x - 22} ${q.y} H ${q.x - 4}`, fd, false, inactive || activity.notRead, `${usage.reason} ${activity.reason}`));
        } else stub(p, fd, `pipe ${dest.from + 1}`, inactive, usage.reason);
        continue;
      }
      if (cmd.substitution && dest.id === 'terminal-in') { stub(p, fd, 'terminal', inactive, usage.reason); continue; }
      const box = positions.get(dest.id);
      if (fd === 0) {
        if (dest.id === 'terminal-in' && cmd.index > 0) {
          // A later command reading the terminal (< /dev/tty): pass above the earlier cards.
          const topX = box.x + box.w / 2;
          paths.push(path(`M ${topX} ${box.y} V 92 Q ${topX} 80 ${topX + 12} 80 H ${p.x - 57} Q ${p.x - 45} 80 ${p.x - 45} 92 V ${p.y - 12} Q ${p.x - 45} ${p.y} ${p.x - 33} ${p.y} H ${p.x - 4}`, fd, false, inactive, usage.reason));
        } else if (dest.id === 'terminal-in') paths.push(path(`M ${box.x + box.w} ${box.y + 30} C ${p.x - 25} ${box.y + 30}, ${p.x - 25} ${p.y}, ${p.x - 4} ${p.y}`, fd, false, inactive, usage.reason));
        else paths.push(path(`M ${box.x + box.w / 2} ${box.y} V ${302 + extra} Q ${box.x + box.w / 2} ${290 + extra} ${box.x + box.w / 2 - 12} ${290 + extra} H ${p.x - 35} Q ${p.x - 45} ${290 + extra} ${p.x - 45} ${278 + extra} V ${p.y + 12} Q ${p.x - 45} ${p.y} ${p.x - 30} ${p.y} H ${p.x - 4}`, fd, false, inactive, usage.reason));
      } else if (dest.id === 'terminal-out' && !cmd.substitution && cmd.index === model.commands.length - 1 && fd === 1) {
        paths.push(path(`M ${p.x} ${p.y} H ${box.x - 4}`, fd, false, inactive, usage.reason));
      } else {
        const targetX = box.x + box.w / 2 + (fd === 2 ? 18 : -18);
        const laneY = 283 + extra + fd * 15 + lane * 2;
        const turnX = p.x + 20 + fd * 7;
        paths.push(path(`M ${p.x} ${p.y} H ${turnX - 10} Q ${turnX} ${p.y} ${turnX} ${p.y + 10} V ${laneY - 12} Q ${turnX} ${laneY} ${turnX - 12} ${laneY} ${box.y < laneY
          // Terminal output sits above the lanes: rise into its bottom edge.
          ? `H ${targetX} Q ${targetX} ${laneY} ${targetX} ${laneY - 12} V ${box.y + box.h + 4}`
          : `H ${targetX} Q ${targetX} ${laneY} ${targetX} ${laneY + 12} V ${box.y - 4}`}`, fd, dest.type === 'closed', inactive, usage.reason));
      }
    }
  });
  const nodes = [...used.values()].map(dest => {
    const p = positions.get(dest.id);
    const icon = dest.type === 'file' ? '▤' : dest.type === 'null' ? '∅' : dest.type === 'closed' ? '×' : '▣';
    const subtitle = dest.type === 'file' ? dest.mode === 'read' ? 'INPUT FILE' : dest.mode === 'append' ? 'APPEND TO FILE' : 'OUTPUT FILE' : dest.type === 'null' ? dest.mode === 'read' ? 'END-OF-FILE' : 'DISCARDED' : dest.type === 'closed' ? 'DESCRIPTOR CLOSED' : 'TERMINAL';
    return `<g><title>${escape(dest.label)}</title><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="${palette.inset}" stroke="${palette.border}"/><text x="${p.x + 15}" y="${p.y + 26}" fill="${palette.muted}" font-size="17">${icon}</text><text x="${p.x + 39}" y="${p.y + 25}" fill="${palette.text}" font-family="'IBM Plex Mono',monospace" font-size="10">${escape(short(dest.label, 18))}</text><text x="${p.x + 39}" y="${p.y + 43}" fill="${palette.muted}" font-size="9" letter-spacing="1">${subtitle}</text></g>`;
  });
  const cards = model.all.map(cmd => {
    const { x, y } = geometry(cmd);
    const ports = [0, 1, 2].map(fd => {
      const p = port(cmd, fd), usage = portUsage(cmd, fd);
      const inactive = inactiveState(usage.state);
      const badgeX = fd === 0 ? x + 13 : x + 186;
      const labelX = fd === 0 ? x + 38 : x + 178;
      const annotationX = fd === 0 ? x + 14 : x + 205;
      const tint = [palette['green-bg'], palette['purple-bg'], palette['amber-bg']][fd];
      return `<g data-command="${cmd.key}" data-fd="${fd}" data-usage="${usage.state}">
        <title>${escape(usage.reason)}</title>
        <rect x="${badgeX}" y="${p.y - 10}" width="19" height="18" rx="4" fill="${inactive ? palette.inset : tint}"/>
        <text x="${badgeX + 9.5}" y="${p.y + 3}" text-anchor="middle" fill="${inactive ? palette.muted : colors[fd]}" font-size="10">${fd}</text>
        <text x="${labelX}" y="${p.y + 3}" text-anchor="${fd === 0 ? 'start' : 'end'}" fill="${palette.text}" font-size="10">${names[fd]}</text>
        <text x="${annotationX}" y="${p.y + 21}" text-anchor="${fd === 0 ? 'start' : 'end'}" fill="${palette.muted}" font-size="10">${usage.label}</text>
        <circle cx="${p.x}" cy="${p.y}" r="4" fill="${usage.state === 'possible' ? colors[fd] : palette.surface}" stroke="${inactive ? palette.muted : colors[fd]}" stroke-width="1.8" ${usage.state === 'unknown' ? 'stroke-dasharray="2 2"' : ''}/>
      </g>`;
    }).join('');
    const argumentPorts = bottomSubs(cmd).map(sub => {
      const fd = bottomFd(sub), p = argumentPort(cmd, sub), usage = portUsage(cmd, fd);
      return `<g data-command="${cmd.key}" data-fd="${fd}" data-usage="${usage.state}"><title>${escape(usage.reason)}</title>
        <text x="${p.x}" y="${p.y - 9}" text-anchor="middle" fill="${palette.muted}" font-size="9">fd ${fd}</text>
        <circle cx="${p.x}" cy="${p.y}" r="4" fill="${palette.text}" stroke="${palette.text}" stroke-width="1.8"/></g>`;
    }).join('');
    const title = cmd.substitution ? `SUBSTITUTION ${cmd.key}` : `COMMAND ${cmd.key}`;
    return `<g><title>${escape(cmd.substitution ? `${cmd.command} · in ${cmd.substitution.text}` : cmd.command)}</title>
      <rect x="${x}" y="${y}" width="220" height="156" rx="10" fill="${palette.surface}" stroke="${palette.border}" ${cmd.substitution ? 'stroke-dasharray="5 3"' : ''}/>
      <path d="M ${x} ${y + 57} H ${x + 220}" stroke="${palette.border}"/>
      <text x="${x + 16}" y="${y + 22}" fill="${palette.muted}" font-size="9" letter-spacing="1.3">${title}</text>
      <text x="${x + 16}" y="${y + 43}" fill="${palette.text}" font-size="12" font-weight="500" font-family="'IBM Plex Mono',monospace">${escape(short(cmd.command, 24))}</text>
      ${ports}${argumentPorts}</g>`;
  });
  const markers = [...colors.map((color, fd) => [fd, color]), ['unused', palette.muted]];
  const height = 390 + extra;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 55 ${width} ${height}" role="img" aria-labelledby="svg-title svg-desc" font-family="'DM Sans',Arial,sans-serif"><title id="svg-title">Pipeline descriptor map</title><desc id="svg-desc">Usage is inferred for standard commands, not observed. ${escape(model.all.map(cmd => `${cmd.command}: ${[0,1,2].map(fd => `${names[fd]} ${destinationLabel(cmd.fds[fd], fd, model.commands, cmd)} (${portUsage(cmd, fd).label})`).join(', ')}`).join('. '))}</desc><defs>${markers.map(([id, color]) => `<marker id="arrow-${id}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 1 1 L 7 4 L 1 7" fill="none" stroke="${color}" stroke-width="1.5"/></marker>`).join('')}</defs><rect x="0" y="55" width="${width}" height="${height}" fill="${palette.surface}"/>${paths.join('')}${nodes.join('')}${cards.join('')}</svg>`;
}

const zoomSteps = [.5, .67, .8, 1, 1.25, 1.5, 2, 2.5, 3];
let zoom = 1;

// Draws the diagram at the current zoom. 100% is the fitted size; other levels scale from it.
function showDiagram() {
  const scroll = $('#diagram-scroll'), host = $('#diagram');
  const centre = scroll.scrollWidth ? (scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth : 0;
  host.innerHTML = diagram(currentModel);
  const svg = $('#diagram svg'), viewBox = svg.viewBox.baseVal;
  host.style.width = '';
  host.style.minWidth = `${Math.max(720, viewBox.width * .85)}px`;
  // Substitution rows add height; grow the cap with them so the drawing is not shrunk to fit.
  svg.style.maxHeight = `${480 * viewBox.height / 390}px`;
  const box = zoom !== 1 && svg.getBoundingClientRect();
  if (box?.width) {
    const fitted = Math.min(box.width / viewBox.width, box.height / viewBox.height);
    host.style.width = host.style.minWidth = `${viewBox.width * fitted * zoom}px`;
    svg.style.maxHeight = 'none';
    svg.style.minHeight = '0';
    scroll.scrollLeft = centre * scroll.scrollWidth - scroll.clientWidth / 2;
  }
  $('#zoom-reset').textContent = `${Math.round(zoom * 100)}%`;
  $('#zoom-out').disabled = zoom === zoomSteps[0];
  $('#zoom-in').disabled = zoom === zoomSteps.at(-1);
}

function setZoom(level) {
  zoom = level;
  if (currentModel) showDiagram();
}

function render() {
  try {
    currentModel = parsePipeline($('#pipeline').value);
    currentSource = $('#pipeline').value;
    $('#error').hidden = true;
    $('#results').hidden = false;
    const subCount = currentModel.all.length - currentModel.commands.length;
    $('#command-count').textContent = `${currentModel.commands.length} command${currentModel.commands.length === 1 ? '' : 's'}${subCount ? ` + ${subCount} in substitutions` : ''}`;
    $('#flow-caption').hidden = true;
    showDiagram();
    const redirects = currentModel.all.reduce((total, cmd) => total + cmd.steps.length, 0);
    $('#redirect-count').textContent = `${redirects} redirect${redirects === 1 ? '' : 's'} applied`;
    $('#details').innerHTML = detailOrder(currentModel).map(cmd => `<article class="detail-card${cmd.substitution ? ' substitution-card' : ''}"><div class="detail-title"><span class="number">${cmd.key}</span><code title="${escape(cmd.command)}">${escape(cmd.command)}</code></div>${cmd.substitution ? `<p class="detail-context">In <code>${escape(cmd.substitution.text)}</code>, started by <code>${escape(cmd.substitution.owner.command)}</code></p>` : ''}${Object.entries(cmd.fds).map(([fd, dest]) => `<div class="fd-row fd-${fd}"><span class="fd-badge">${fd}</span><span>${names[fd] || 'fd ' + fd}</span><span class="right-arrow">→</span><span class="destination">${destinationMarkup(dest, Number(fd), currentModel.commands, cmd)}${usageMarkup(cmd, Number(fd))}</span></div>`).join('')}${cmd.steps.length ? `<details class="steps"><summary>${cmd.steps.length} redirect${cmd.steps.length === 1 ? '' : 's'}, applied left to right</summary><ol>${cmd.steps.map(step => `<li><code>${escape(step.text)}</code><br>${escape(step.description)}</li>`).join('')}</ol></details>` : ''}</article>`).join('');
    const extra = currentModel.all.some(cmd => Object.entries(cmd.fds).some(([fd, dest]) => Number(fd) > 2 && dest.type !== 'procsub'));
    $('#insights').innerHTML = usageInsights(currentModel) + substitutionInsights(currentModel);
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
  if (currentModel) showDiagram();
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
$('#zoom-in').addEventListener('click', () => setZoom(zoomSteps.find(step => step > zoom) ?? zoom));
$('#zoom-out').addEventListener('click', () => setZoom(zoomSteps.findLast(step => step < zoom) ?? zoom));
$('#zoom-reset').addEventListener('click', () => setZoom(1));
$('#download').addEventListener('click', () => {
  // Export without on-page sizing so the file scales to wherever it is opened.
  const copy = $('#diagram svg').cloneNode(true);
  copy.removeAttribute('style');
  const svg = copy.outerHTML;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'pipeline.svg'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try { const saved = localStorage.getItem('pipeviewer-pipeline'); if (saved) $('#pipeline').value = saved; } catch { /* Storage is optional. */ }
render();
