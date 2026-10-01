import { parsePipeline, destinationLabel, targetsOf, reaches, restyle } from './parser.js';
import { portUsage, pipeActivity, commands, ships } from './usage.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const names = ['stdin', 'stdout', 'stderr'];
// Examples are written in the explicit redirect style; the Explicit/Common switch restyles them.
const examples = {
  simple: 'cat access.log | grep "404" | sort',
  file: 'sort 0< names.txt | uniq -c 1> counts.txt',
  order: 'curl https://example.com 2>&1 1> response.html | grep "error"',
  discard: 'find . -name "*.js" 2> /dev/null | wc -l',
  timing: 'sleep 2 | echo "hello, world"',
  timingReverse: 'echo "hello, world" | sleep 2',
  procsub: 'ls missing.txt . 2> >(sed "s/^/error: /") | wc -l',
  lists: 'sort names.txt 1> sorted.txt && wc -l 0< sorted.txt || echo "sort failed" 1>&2',
  wikiWeek: String.raw`parallel "zcat {} \
          | grep -E '^en |^en\.m ' \
          | mawk '{total+=\$3} END {print total}'" ::: pageviews-*.gz \
| awk '{n+=$1} END {print n}' \
| xargs printf "\n%'d <-- total Wiki page views in 1 week\n"`,
  // Each job writes its own counts file, so output from concurrent jobs never mixes; the second
  // pipeline merges them.
  topPages: String.raw`parallel 'zcat {} | grep -E "^en |^en\.m " | awk "{pages[\$2]+=\$3} END {for (p in pages) print p, pages[p]}" 1> {}.counts' ::: *.gz &&
cat *.gz.counts | LC_ALL=C sort -k1,1 | awk '
    $1 == prev { sum += $2; next }
    NR > 1 { print sum, prev }
    { prev=$1; sum=$2 }
    END { if (NR) print sum, prev }
' | sort -rn | head -50 1> top-50-pages`,
  weekDownload: String.raw`parallel -j2 --bar wget -q -c https://dumps.wikimedia.org/other/pageviews/2026/2026-09/pageviews-202609{1}-{2}0000.gz \
::: {14..20} ::: {00..23}`,
  zcatSpeed: 'parallel --ungroup "zcat {}" ::: *.gz | pv -b 1>/dev/null',
};
// Stock macOS has no parallel, wget, pv or mawk, and its zcat wants .Z files, so these examples
// use xargs -P, curl, dd, awk and gzcat there. The rest run as written on both systems.
const macExamples = {
  weekDownload: String.raw`curl -Z --parallel-max 2 -C - --remote-name-all \
  'https://dumps.wikimedia.org/other/pageviews/2026/2026-09/pageviews-202609[14-20]-[00-23]0000.gz'`,
  zcatSpeed: String.raw`printf '%s\0' *.gz | xargs -0 -n 1 -P 8 gzcat | dd of=/dev/null bs=1m status=progress`,
  wikiWeek: String.raw`printf '%s\0' pageviews-*.gz \
| xargs -0 -n 1 -P 8 sh -c 'gzcat "$1" | grep -E "^en |^en\.m " | awk "{total+=\$3} END {print total}"' _ \
| awk '{n+=$1} END {print n}' \
| xargs printf "\n%'d <-- total Wiki page views in 1 week\n"`,
  topPages: String.raw`printf '%s\0' *.gz | xargs -0 -n 1 -P 8 sh -c 'gzcat "$1" | grep -E "^en |^en\.m " | awk "{pages[\$2]+=\$3} END {for (p in pages) print p, pages[p]}" 1> "$1.counts"' _ &&
cat *.gz.counts | LC_ALL=C sort -k1,1 | awk '
    $1 == prev { sum += $2; next }
    NR > 1 { print sum, prev }
    { prev=$1; sum=$2 }
    END { if (NR) print sum, prev }
' | sort -rn | head -50 1> top-50-pages`,
};
// Examples with several equivalent spellings, shown as toggles once one of them is loaded.
const variations = {
  palindromes: [
    { label: 'Pipe into paste -', source: "rev /usr/share/dict/words | paste /usr/share/dict/words - | awk '$1==$2 {print $1}' | grep -E '.{5,}'" },
    { label: 'One substitution', source: "paste /usr/share/dict/words <(rev /usr/share/dict/words) | awk '$1==$2 {print $1}' | grep -E '.{5,}'" },
    { label: 'Two substitutions', source: "paste <(cat /usr/share/dict/words) <(rev /usr/share/dict/words) | awk '$1==$2 {print $1}' | grep -E '.{5,}'" },
    { label: 'Descriptors 3 and 4', source: "paste /dev/fd/3 /dev/fd/4 \\\n  3< <(cat /usr/share/dict/words) \\\n  4< <(rev /usr/share/dict/words) | awk '$1==$2 {print $1}' | grep -E '.{5,}'" },
  ],
  procsubIn: [
    { label: 'Plain', source: 'cat <(head /etc/hosts) <(head /etc/shells) <(echo hello, world)' },
    { label: 'Labelled lines', source: "cat <(head /etc/hosts | sed 's:^:/etc/hosts --> :') \\\n    <(head /etc/shells | sed 's:^:/etc/shells --> :') \\\n    <(echo hello, world)" },
    // Explicit redirects choose the descriptor numbers instead of Bash.
    { label: 'Descriptors 7, 8 and 9', source: "cat /dev/fd/7 /dev/fd/8 /dev/fd/9 \\\n    7< <(head /etc/hosts | sed 's:^:/etc/hosts --> :') \\\n    8< <(head /etc/shells | sed 's:^:/etc/shells --> :') \\\n    9< <(echo hello, world)" },
  ],
};
// Two ways to send both output streams to one file.
variations.merge = [
  { label: '&>', source: 'grep 0<access.log "404" &> errors.log' },
  { label: '2>&1', source: 'grep 0<access.log "404" 1>errors.log 2>&1' },
];
variations.timingReverse = [
  { label: 'Plain pipe', source: 'echo "hello, world" | sleep 2' },
  { label: 'Swap stdout and stderr', source: 'echo "hello, world" 3>&1 1>&2 2>&3 | sleep 2' },
];
for (const [key, list] of Object.entries(variations)) examples[key] = list[0].source;
// Explicit writes the implied descriptors (0< file, 1> file); common leaves them out.
let redirectStyle = 'explicit';
try { if (localStorage.getItem('pipeviewer-redirects') === 'common') redirectStyle = 'common'; } catch {}
const styled = source => restyle(source, redirectStyle, { platform });
// Every spelling of an example as it reads on a platform, in the current redirect style.
const exampleSources = (key, on = platform) => (variations[key]?.map(variation => variation.source) ?? [on === 'macos' ? macExamples[key] ?? examples[key] : examples[key]])
  .map(source => restyle(source, redirectStyle, { platform: on }));

function showVariations() {
  const key = Object.keys(variations).find(name => exampleSources(name).includes(currentSource));
  $('#variations').hidden = !key;
  if (!key) return;
  $('#variation-buttons').innerHTML = variations[key].map((variation, i) => {
    const active = styled(variation.source) === currentSource;
    return `<button type="button" data-variation="${key}:${i}" aria-pressed="${active}"${active ? ' class="active"' : ''} title="${escape(styled(variation.source))}">${escape(variation.label)}</button>`;
  }).join('');
}
let currentModel;
let currentSource = '';
// Linux maps GNU tools under Bash; macOS maps the BSD and Apple tools under zsh.
let platform = 'linux';
try { if (localStorage.getItem('pipeviewer-platform') === 'macos') platform = 'macos'; } catch {}

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

function jobInsight(job) {
  const owner = `<code>${escape(job.owner.usage.name)}</code>`, text = `<code>${escape(job.text)}</code>`;
  if (job.tool === 'xargs') {
    const items = job.perJob === '1' ? 'item' : job.perJob ? `${escape(job.perJob)} items` : 'batch of items';
    const slots = Number(job.slots) > 1 ? `up to ${escape(job.slots)} at a time` : job.slots === '0' ? 'as many at a time as it can' : 'one at a time';
    const input = { null: 'Each job’s stdin is /dev/null.', terminal: 'With -o, each job reads the terminal.', inherit: 'With -a, jobs inherit xargs’s stdin.' }[job.input];
    const output = slots === 'one at a time' ? `Jobs write straight to ${owner}’s stdout and stderr.` : `Jobs write straight to ${owner}’s stdout and stderr, and nothing collects them, so output from concurrent jobs can mix mid-line; give each job its own file when its output is long.`;
    const zeroth = job.zeroth ? '' : ` With no word after the script, the first item becomes <code>$0</code> rather than <code>$1</code>; add one, such as <code>_</code>.`;
    return `<p class="usage-insight">${owner} runs ${text} through <code>${escape(job.shellName)}</code> once per ${items}, ${slots}.${zeroth} ${input} ${output}</p>`;
  }
  const slots = job.slots ? `up to ${escape(job.slots)} jobs at a time` : 'by default one job per CPU core at a time';
  const appended = job.appended ? ` The command has no replacement string, so ${owner} appends each argument as <code>{}</code>.` : '';
  const input = {
    null: 'Each job’s stdin is /dev/null; a job reads only what its arguments name.',
    blocks: `${owner} splits its input into blocks and feeds each block to one job’s stdin.`,
    terminal: 'With --tty, each job reads the terminal.',
    inherit: `${owner} reads arguments from a file. Its manual says the first job gets ${owner}’s stdin and later jobs get /dev/null.`,
  }[job.input];
  const output = job.ungroup
    ? `With -u, jobs write straight to ${owner}’s stdout and stderr, so lines from concurrent jobs can mix.`
    : `${owner} collects each job’s stdout and stderr and writes them out one whole job at a time, so output from concurrent jobs never interleaves.`;
  return `<p class="usage-insight">${owner} runs ${text} through a shell once per argument, ${slots}.${appended} ${input} ${output}</p>`;
}

function substitutionInsights(model) {
  return model.substitutions.map(sub => {
    if (sub.kind === 'job') return jobInsight(sub);
    const owner = `<code>${escape(sub.owner.usage.name)}</code>`, text = `<code>${escape(sub.text)}</code>`;
    const redirected = Object.keys(sub.owner.fds).map(Number).filter(fd => fd !== sub.fd && reaches(sub.owner.fds[fd], sub.endpoint));
    const via = redirected.length ? `${owner}’s ${redirected.map(fd => names[fd] || `fd ${fd}`).join(' and ')}` : `${owner} (through the argument /dev/fd/${sub.fd})`;
    if (sub.direction === '<') {
      return `<p class="usage-insight">${shellName()} runs ${text} alongside ${owner} and connects its stdout to ${via}.</p>`;
    }
    const last = sub.commands.at(-1), out = last.fds[1], inner = `<code>${escape(last.usage.name)}</code>`;
    if (out.type === 'pipe' && out.commands !== sub.commands) {
      const reader = out.commands[out.to], readerName = `<code>${escape(reader.usage.name)}</code>`;
      const shared = reaches(sub.owner.fds[1], out) ? `, the same pipe as ${owner}’s stdout` : '';
      const reads = reaches(reader.fds[0], out) && portUsage(reader, 0).state !== 'unused'
        ? ` ${readerName} can read data from both, and it only gets end-of-file after every writer closes the pipe.` : '';
      return `<p class="usage-insight">${text} receives ${via}. ${inner} inherited stdout when ${shellName()} expanded the substitution, so it writes to pipe ${out.from + 1}${shared}.${reads}</p>`;
    }
    return `<p class="usage-insight">${text} receives ${via}. ${shellName()} does not wait for process substitutions, so output from ${inner} can appear after the rest of the pipeline has finished.</p>`;
  }).join('');
}

const shellName = () => platform === 'macos' ? 'zsh' : 'Bash';

// zsh's MULTIOS sends one descriptor to several targets, where Bash keeps only the last.
function multioInsights(model) {
  return model.all.flatMap(cmd => Object.entries(cmd.fds).filter(([, dest]) => dest.type === 'multio').map(([fd, dest]) => {
    const stream = names[fd] || `fd ${fd}`, owner = `<code>${escape(cmd.usage.name)}</code>`;
    const list = dest.targets.map(target => `<code>${escape(destinationLabel(target, Number(fd), model.commands, cmd))}</code>`).join(', ');
    return dest.direction === 'in'
      ? `<p class="usage-insight">${owner}’s ${stream} reads ${dest.targets.length} inputs in turn: ${list}. zsh’s MULTIOS option, on by default, joins them through a pipe, like cat. In Bash only the last input would be read.</p>`
      : `<p class="usage-insight">${owner}’s ${stream} goes to ${dest.targets.length} places: ${list}. zsh’s MULTIOS option, on by default, makes a later redirect add a destination instead of replacing the pipe or the earlier one. ${owner} writes into a pipe, and zsh copies the data to each, like tee. In Bash only the last redirect would get it.</p>`;
  })).join('');
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
    if (source.usage.name === 'sleep' && activity.noWrites && reaches(target.fds[0], pipe) && portUsage(target, 0).state === 'possible') {
      return `<p class="usage-insight">${sourceName} writes no data, but keeps the pipe open during its delay. ${targetName} reads stdin and can wait for end-of-file until ${sourceName} exits.</p>`;
    }
    // For example echo | sleep 2: the reader neither reads the pipe nor writes stdout.
    if (activity.notRead && !activity.noWrites && portUsage(target, 1).state === 'unused') {
      // When the producer's stdout was redirected away from the pipe, its output still goes there.
      const stdout = reaches(source.fds[1], pipe)
        ? `so data from ${sourceName} is discarded and the pipeline produces no output.`
        : `so anything ${sourceName} writes to the pipe is discarded. ${sourceName}’s stdout goes to ${escape(destinationLabel(source.fds[1], 1, model.commands, source))} instead of the pipe, so that output is not lost.`;
      return `<p class="usage-insight">${targetName} never reads the pipe and writes nothing to stdout, ${stdout} Writes that fit in the pipe buffer (typically 64 KiB on Linux) finish at once; a larger write waits until ${targetName} exits and then fails with SIGPIPE. The shell still waits for ${targetName} before the next prompt.</p>`;
    }
    return '';
  }).join('');
}

// A list runs its pipelines one after another. The useful consequence: a file an earlier pipeline
// writes is complete before a later one reads it.
function listInsights(model) {
  if (model.pipelines.length < 2) return '';
  const written = new Map(), handoffs = [];
  model.pipelines.forEach((pipeline, n) => {
    const files = pipeline.all.flatMap(cmd => Object.values(cmd.fds)).filter(dest => dest.type === 'file');
    for (const dest of files) {
      if (dest.mode === 'read' && written.has(dest.label) && !handoffs.some(h => h.label === dest.label)) handoffs.push({ label: dest.label, from: written.get(dest.label), to: n });
    }
    for (const dest of files) if (dest.mode !== 'read' && !written.has(dest.label)) written.set(dest.label, n);
  });
  const handoff = handoffs.map(({ label, from, to }) => ` <code>${escape(label)}</code> is written by pipeline ${from + 1} and read by pipeline ${to + 1}, which starts only after pipeline ${from + 1} has finished, so it reads the complete file.`).join('');
  return `<p class="usage-insight">The shell runs these ${model.pipelines.length} pipelines one after another, not at the same time, and each starts with the shell’s own stdin, stdout and stderr.${handoff}</p>`;
}

// Main commands fill row 0. Substitutions go below their owner: >(…) to the right, <(…) to the left.
// A parallel job template starts directly below parallel.
function layout(model) {
  const place = new Map(), taken = new Set();
  model.commands.forEach((cmd, i) => { place.set(cmd, { col: i, row: 0 }); taken.add(`${i},0`); });
  for (const sub of model.substitutions) {
    const owner = place.get(sub.owner), k = sub.commands.length;
    const cols = Array.from({ length: k }, (_, j) => (sub.kind === 'job' ? owner.col : sub.direction === '>' ? owner.col + 1 : owner.col - k) + j);
    let row = owner.row + 1;
    while (cols.some(col => taken.has(`${col},${row}`))) row++;
    sub.commands.forEach((cmd, j) => { place.set(cmd, { col: cols[j], row }); taken.add(`${cols[j]},${row}`); });
  }
  const spots = [...place.values()];
  const shift = -Math.min(0, ...spots.map(p => p.col));
  return { place, shift, cols: Math.max(...spots.map(p => p.col)) + shift + 1, rows: Math.max(...spots.map(p => p.row)) };
}

// When each pipeline in a list runs, after the one above it.
const listJoins = {
  '&&': 'runs only if the last pipeline that ran succeeded',
  '||': 'runs only if the last pipeline that ran failed',
  ';': 'runs after the one above finishes, whatever its exit status',
};

function diagram(model) {
  // Resolve theme colours to concrete values so exported SVGs remain standalone.
  const styles = getComputedStyle(document.documentElement);
  const palette = Object.fromEntries(['surface', 'inset', 'text', 'muted', 'border', 'purple', 'green', 'amber', 'purple-bg', 'green-bg', 'amber-bg']
    .map(name => [name, styles.getPropertyValue(`--${name}`).trim()]));
  // Index 3 is for substitution descriptors passed as /dev/fd arguments.
  const colors = [palette.green, palette.purple, palette.amber, palette.text];
  const markers = [...colors.map((color, fd) => [fd, color]), ['unused', palette.muted]];
  const defs = `<defs>${markers.map(([id, color]) => `<marker id="arrow-${id}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 1 1 L 7 4 L 1 7" fill="none" stroke="${color}" stroke-width="1.5"/></marker>`).join('')}</defs>`;
  const describe = pipeline => pipeline.all.map(cmd => `${cmd.command}: ${[0, 1, 2].map(fd => `${names[fd]} ${destinationLabel(cmd.fds[fd], fd, pipeline.commands, cmd)} (${portUsage(cmd, fd).label})`).join(', ')}`).join('. ');
  const open = (viewBox, desc) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="svg-title svg-desc" font-family="'DM Sans',Arial,sans-serif"><title id="svg-title">Pipeline descriptor map</title><desc id="svg-desc">Usage is inferred for standard commands, not observed. ${escape(desc)}</desc>${defs}`;
  const parts = model.pipelines.map(pipeline => drawPipeline(pipeline, palette, colors));
  if (parts.length === 1) {
    const [{ minX, width, height, body }] = parts;
    return `${open(`${minX} 55 ${width - minX} ${height}`, describe(model))}<rect x="${minX}" y="55" width="${width - minX}" height="${height}" fill="${palette.surface}"/>${body}</svg>`;
  }
  // A list stacks its pipelines top to bottom, because each runs after the one before. Each keeps
  // its own drawing in a nested svg, under a label saying when it runs.
  const total = Math.max(...parts.map(part => part.width - part.minX));
  let y = 0;
  const blocks = parts.map((part, n) => {
    const pipeline = model.pipelines[n], w = part.width - part.minX, top = y;
    y += part.height + 6;
    const join = pipeline.operator ? ` · <tspan font-family="'IBM Plex Mono',monospace" font-weight="600" fill="${palette.purple}">${pipeline.newline ? 'newline' : escape(pipeline.operator)}</tspan> · ${listJoins[pipeline.operator]}` : '';
    const rule = n ? `<path d="M 20 ${top} H ${total - 20}" stroke="${palette.border}" stroke-dasharray="4 4"/>` : '';
    return `<g data-pipeline="${n}">${rule}<svg x="0" y="${top}" width="${w}" height="${part.height}" viewBox="${part.minX} 55 ${w} ${part.height}" overflow="visible">${part.body}</svg><text x="20" y="${top + 26}" fill="${palette.muted}" font-size="10" letter-spacing="1.2">PIPELINE ${n + 1}<tspan letter-spacing="0">${join}</tspan></text></g>`;
  });
  return `${open(`0 0 ${total} ${y - 6}`, model.pipelines.map((pipeline, n) => `Pipeline ${n + 1}${pipeline.operator ? ` (${listJoins[pipeline.operator]})` : ''}: ${describe(pipeline)}`).join(' '))}<rect width="${total}" height="${y - 6}" fill="${palette.surface}"/>${blocks.join('')}</svg>`;
}

// Draws one pipeline, with its substitutions and destinations, in its own coordinates.
function drawPipeline(model, palette, colors) {
  const grid = layout(model);
  const extra = grid.rows * 200;
  const geometry = cmd => { const p = grid.place.get(cmd); return { x: 220 + (p.col + grid.shift) * 360, y: 101 + p.row * 200 }; };
  const used = new Map();
  model.all.forEach(cmd => Object.entries(cmd.fds).forEach(([fd, value]) => targetsOf(value).forEach(dest => {
    if (Number(fd) > 2 || ['pipe', 'procsub', 'job'].includes(dest.type) || dest.job) return;
    // Substitutions show inherited terminal input as a short labelled stub.
    if (cmd.substitution && dest.id === 'terminal-in') return;
    // stderr left on the terminal ends in a tag beside its port, so it needs no box.
    if (Number(fd) === 2 && dest.id === 'terminal-err') return;
    used.set(dest.id, dest);
  })));
  const bottom = [...used.values()].filter(d => !['terminal-in', 'terminal-out'].includes(d.id));
  // Space for the terminal boxes is only kept when a stream uses them.
  const minX = used.has('terminal-in') ? 0 : 140;
  const width = Math.max(850, used.has('terminal-out') ? 240 + grid.cols * 360 + 175 : 180 + grid.cols * 360, 350 + bottom.length * 190);
  const positions = new Map();
  positions.set('terminal-in', { x: 20 + grid.shift * 360, y: 149, w: 155, h: 59 });
  positions.set('terminal-out', { x: width - 174, y: 149, w: 155, h: 59 });
  bottom.forEach((d, i) => positions.set(d.id, { x: 180 + i * (width - 350) / Math.max(1, bottom.length), y: 353 + extra, w: 168, h: 61 }));
  const paths = [];
  const short = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  // Tags name a link's ends (command key:fd) and destination, so the caret inspector can find it.
  const tag = (ends, dest) => ` data-ends="${ends.join(' ')}" data-dest="${escape(dest.id)}"`;
  const path = (d, fd, dashed = false, inactive = false, reason = '', tagged = '') => `<g class="stream-link${inactive ? ' unused-link' : ''}"${tagged}><title>${escape(reason)}</title><path class="link-hit" d="${d}" fill="none" stroke="transparent" stroke-width="12"/><path d="${d}" fill="none" stroke="${inactive ? palette.muted : colors[fd]}" stroke-width="2" ${dashed || inactive ? 'stroke-dasharray="5 5"' : ''} marker-end="url(#arrow-${inactive ? 'unused' : fd})"/></g>`;
  const stub = (p, fd, label, inactive, reason, tagged) => {
    const endX = p.x + (fd === 0 ? -43 : 43);
    paths.push(path(`M ${fd === 0 ? endX : p.x} ${p.y} L ${fd === 0 ? p.x - 4 : endX} ${p.y}`, fd, true, inactive, reason, tagged));
    paths.push(`<text${tagged} x="${endX}" y="${p.y - 12}" text-anchor="middle" fill="${palette.muted}" font-size="9">${escape(label)}</text>`);
  };
  // stderr that stays on the terminal, the default, is drawn as a short line to a “terminal” tag
  // rather than a route across the page to a shared box, much as circuit diagrams mark ground.
  const ground = (p, inactive, reason, tagged) => {
    const color = inactive ? palette.muted : colors[2], x = p.x + 36;
    paths.push(`<g class="stream-link${inactive ? ' unused-link' : ''}"${tagged}><title>${escape(`stderr goes to the terminal. ${reason}`)}</title><path class="link-hit" d="M ${p.x} ${p.y} H ${x + 44}" fill="none" stroke="transparent" stroke-width="12"/><path d="M ${p.x} ${p.y} H ${x}" fill="none" stroke="${color}" stroke-width="2" ${inactive ? 'stroke-dasharray="5 5"' : ''}/><rect x="${x}" y="${p.y - 7}" width="44" height="14" rx="7" fill="${inactive ? palette.inset : palette['amber-bg']}" stroke="${color}"/><text x="${x + 22}" y="${p.y + 3}" text-anchor="middle" fill="${color}" font-size="8.5">terminal</text></g>`);
  };
  const port = (cmd, fd) => { const g = geometry(cmd); return { x: g.x + (fd === 0 ? 0 : 220), y: g.y + (fd === 2 ? 125 : 78) }; };
  // Substitutions not on 0–2 attach to the bottom edge: <(…) on the left, >(…) on the right.
  // A redirect such as 3< <(…) keeps its own number; arguments use Bash's /dev/fd number.
  const bottomFd = sub => {
    const { owner: cmd, endpoint } = sub;
    if ([0, 1, 2].some(f => reaches(cmd.fds[f], endpoint))) return null;
    if (typeof sub.place === 'number' && reaches(cmd.fds[sub.place], endpoint)) return sub.place;
    return cmd.fds[sub.fd] === endpoint ? sub.fd : null;
  };
  const bottomSubs = cmd => cmd.substitutions.filter(sub => sub.kind !== 'job' && bottomFd(sub) !== null);
  const argumentPort = (cmd, sub) => {
    const g = geometry(cmd), same = bottomSubs(cmd).filter(s => s.direction === sub.direction), k = same.indexOf(sub);
    return { x: g.x + (sub.direction === '<' ? 30 + k * 34 : 110 - k * 34), y: g.y + 156 };
  };
  // Parallel's bottom edge: blocks it feeds to jobs (--pipe) and the output it collects from them.
  const jobPort = (job, direction) => { const g = geometry(job.owner); return { x: g.x + (direction === '>' ? 80 : 140), y: g.y + 156 }; };
  const jobLink = (cmd, fd, dest) => {
    const p = port(cmd, fd), q = jobPort(dest.job, dest.direction), usage = portUsage(cmd, fd);
    const inactive = inactiveState(usage.state), gapY = geometry(dest.job.owner).y + (dest.direction === '>' ? 186 : 178);
    const tagged = tag([`${cmd.key}:${fd}`], dest);
    if (dest.direction === '>') {
      const reason = `${dest.job.owner.usage.name} feeds a block of its input to each job. ${usage.reason}`;
      paths.push(path(`M ${q.x} ${q.y} V ${gapY - 8} Q ${q.x} ${gapY} ${q.x - 8} ${gapY} H ${p.x - 22} Q ${p.x - 30} ${gapY} ${p.x - 30} ${gapY + 8} V ${p.y - 8} Q ${p.x - 30} ${p.y} ${p.x - 22} ${p.y} H ${p.x - 4}`, 0, false, inactive, reason, tagged));
    } else {
      const reason = `${dest.job.owner.usage.name} collects each job’s output and writes it to its own stdout. ${usage.reason}`;
      paths.push(path(`M ${p.x} ${p.y} H ${p.x + 4} Q ${p.x + 12} ${p.y} ${p.x + 12} ${p.y - 8} V ${gapY + 8} Q ${p.x + 12} ${gapY} ${p.x + 4} ${gapY} H ${q.x + 8} Q ${q.x} ${gapY} ${q.x} ${gapY - 8} V ${q.y + 5}`, 1, false, inactive, reason, tagged));
    }
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
    const tagged = tag([`${cmd.key}:${fd}`, `${inner.key}:${sub.direction === '>' ? 0 : 1}`], sub.endpoint);
    if (sub.direction === '>') {
      const start = fd <= 2 ? `C ${s.x + 60} ${s.y}` : `C ${s.x} ${s.y + 60}`;
      paths.push(path(`M ${s.x} ${s.y} ${start}, ${q.x - 60} ${q.y}, ${q.x - 5} ${q.y}`, fd <= 2 ? fd : 3, false, inactive, reason, tagged));
    } else {
      const end = fd <= 2 ? `${s.x - 60} ${s.y}, ${s.x - 5} ${s.y}` : `${s.x} ${s.y + 60}, ${s.x} ${s.y + 5}`;
      paths.push(path(`M ${q.x} ${q.y} C ${q.x + 60} ${q.y}, ${end}`, 1, false, inactive, reason, tagged));
    }
  };
  const laneLinks = [];
  model.all.forEach(cmd => {
    const row = Math.min(3, grid.place.get(cmd).row);
    const fdsToDraw = [0, 1, 2, ...bottomSubs(cmd).map(bottomFd)];
    for (const fd of fdsToDraw) {
      const p = port(cmd, fd), here = `${cmd.key}:${fd}`;
      const usage = portUsage(cmd, fd);
      const inactive = inactiveState(usage.state);
      // Under zsh's MULTIOS a port can feed several targets; each gets its own line.
      if (cmd.fds[fd]?.type === 'multio') {
        const count = cmd.fds[fd].targets.length;
        paths.push(`<text x="${p.x + (fd === 0 ? -10 : 10)}" y="${p.y - 7}" text-anchor="${fd === 0 ? 'end' : 'start'}" fill="${palette.muted}" font-size="8"><title>${escape(destinationLabel(cmd.fds[fd], fd, model.commands, cmd))}</title>zsh ×${count}</text>`);
      }
      for (const dest of targetsOf(cmd.fds[fd])) {
      if (dest.type === 'procsub') {
        // The owner draws each link once, from a redirected port when there is one.
        const sub = dest.substitution;
        if (dest.owner === cmd) {
          if (fd <= 2 || bottomFd(sub) === fd) substitutionLink(cmd, fd, sub);
        } else if (fd <= 2 && !(fd === 0 && cmd === sub.commands[0] && sub.direction === '>') && !(fd === 1 && cmd === sub.commands.at(-1) && sub.direction === '<')) {
          // An inherited copy of another substitution's pipe, such as stderr from a later >(…).
          stub(p, fd, short(dest.label, 14), inactive, usage.reason, tag([here], dest));
        }
        continue;
      }
      if (fd > 2) continue;
      if (dest.type === 'job') {
        const { commands } = dest.job;
        if ((dest.direction === '>' && fd === 0 && cmd === commands[0]) || (dest.direction === '<' && fd === 1 && cmd === commands.at(-1))) jobLink(cmd, fd, dest);
        else stub(p, fd, dest.job.owner.usage.name, inactive, usage.reason, tag([here], dest));
        continue;
      }
      if (dest.job) { stub(p, fd, '/dev/null', inactive, usage.reason, tag([here], dest)); continue; }
      if (dest.type === 'pipe') {
        const activity = pipeActivity(dest.commands, dest);
        const producer = dest.commands[dest.from], next = dest.commands[dest.to];
        if (fd === 0 && cmd === next && [1, 2].some(f => reaches(producer.fds[f], dest))) continue;
        const tagged = tag([here, `${next.key}:0`], dest);
        if (fd !== 0 && cmd === producer && reaches(next.fds[0], dest)) {
          const q = port(next, 0);
          paths.push(path(`M ${p.x} ${p.y} C ${p.x + 50} ${p.y}, ${q.x - 50} ${q.y}, ${q.x - 5} ${q.y}`, fd, false, inactive || activity.notRead, `${usage.reason} ${activity.reason}`, tagged));
          if (fd === 1 || !reaches(cmd.fds[1], dest)) paths.push(`<text class="pipe-label"${tagged} x="${(p.x + q.x) / 2}" y="${Math.min(p.y, q.y) - 12}" text-anchor="middle" fill="${palette.muted}" font-size="10"><title>${escape(activity.reason)}</title>${escape(activity.label)}</text>`);
        } else if (cmd.substitution && fd !== 0 && reaches(next.fds[0], dest) && geometry(next).y < geometry(cmd).y) {
          // An inherited pipe: run below the reader's card, then into its stdin.
          const q = port(next, 0), gapY = geometry(next).y + 178;
          paths.push(path(`M ${p.x} ${p.y} H ${p.x + 4} Q ${p.x + 12} ${p.y} ${p.x + 12} ${p.y - 8} V ${gapY + 8} Q ${p.x + 12} ${gapY} ${p.x + 4} ${gapY} H ${q.x - 22} Q ${q.x - 30} ${gapY} ${q.x - 30} ${gapY - 8} V ${q.y + 8} Q ${q.x - 30} ${q.y} ${q.x - 22} ${q.y} H ${q.x - 4}`, fd, false, inactive || activity.notRead, `${usage.reason} ${activity.reason}`, tagged));
        } else stub(p, fd, `pipe ${dest.from + 1}`, inactive, usage.reason, tag([here], dest));
        continue;
      }
      if (cmd.substitution && dest.id === 'terminal-in') { stub(p, fd, 'terminal', inactive, usage.reason, tag([here], dest)); continue; }
      if (fd === 2 && dest.id === 'terminal-err') { ground(p, inactive, usage.reason, tag([here], dest)); continue; }
      const box = positions.get(dest.id), tagged = tag([here], dest);
      if (fd === 0) {
        if (dest.id === 'terminal-in' && cmd.index > 0) {
          // A later command reading the terminal (< /dev/tty): pass above the earlier cards.
          const topX = box.x + box.w / 2;
          paths.push(path(`M ${topX} ${box.y} V 92 Q ${topX} 80 ${topX + 12} 80 H ${p.x - 57} Q ${p.x - 45} 80 ${p.x - 45} 92 V ${p.y - 12} Q ${p.x - 45} ${p.y} ${p.x - 33} ${p.y} H ${p.x - 4}`, fd, false, inactive, usage.reason, tagged));
        } else if (dest.id === 'terminal-in') paths.push(path(`M ${box.x + box.w} ${box.y + 30} C ${p.x - 25} ${box.y + 30}, ${p.x - 25} ${p.y}, ${p.x - 4} ${p.y}`, fd, false, inactive, usage.reason, tagged));
        else laneLinks.push({ input: true, fd, box, p, upper: p.x - 45 - row * 10, lower: box.x + box.w / 2, down: true, dashed: false, inactive, reason: usage.reason, tagged });
      } else if (dest.id === 'terminal-out' && !cmd.substitution && cmd.index === model.commands.length - 1 && fd === 1) {
        paths.push(path(`M ${p.x} ${p.y} H ${box.x - 4}`, fd, false, inactive, usage.reason, tagged));
      } else {
        // Terminal boxes sit above the lanes, so routes to them rise; the rest drop to the bottom row.
        laneLinks.push({ input: false, fd, box, p, upper: p.x + 20 + fd * 7 + row * 16, lower: box.x + box.w / 2 + (fd === 2 ? 18 : -18),
          down: !['terminal-in', 'terminal-out'].includes(dest.id), dashed: dest.type === 'closed', inactive, reason: usage.reason, tagged });
      }
      }
    }
  });
  // Each bottom route gets its own lane. A route must sit above another when that one's horizontal
  // would cross its vertical from the card, or its rise to a terminal; and below one it drops through.
  const spans = (link, x) => Math.min(link.upper, link.lower) + 1 < x && x < Math.max(link.upper, link.lower) - 1;
  const mustBeAbove = (a, b) => spans(b, a.upper) || (!a.down && spans(b, a.lower)) || (b.down && spans(a, b.lower));
  const lanes = [], remaining = [...laneLinks];
  while (remaining.length) {
    const blockers = link => remaining.filter(other => other !== link && mustBeAbove(other, link)).length;
    const next = remaining.reduce((best, link) => blockers(link) < blockers(best) ? link : best);
    lanes.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  const laneY = k => 283 + extra + k * 11;
  const bottomY = Math.max(353, 283 + (lanes.length - 1) * 11 + 36) + extra;
  bottom.forEach(d => { positions.get(d.id).y = bottomY; });
  lanes.forEach((link, k) => {
    const { p, box, upper, lower } = link, y = laneY(k);
    const r = Math.min(10, Math.abs(lower - upper) / 2);
    if (link.input) {
      const s = Math.sign(upper - lower) || 1;
      paths.push(path(`M ${lower} ${box.y} V ${y + 10} Q ${lower} ${y} ${lower + s * r} ${y} H ${upper - s * r} Q ${upper} ${y} ${upper} ${y - 10} V ${p.y + 12} Q ${upper} ${p.y} ${upper + 12} ${p.y} H ${p.x - 4}`, link.fd, false, link.inactive, link.reason, link.tagged));
    } else {
      const s = Math.sign(lower - upper) || 1;
      const end = link.down ? `Q ${lower} ${y} ${lower} ${y + 10} V ${box.y - 4}` : `Q ${lower} ${y} ${lower} ${y - 10} V ${box.y + box.h + 4}`;
      paths.push(path(`M ${p.x} ${p.y} H ${upper - 10} Q ${upper} ${p.y} ${upper} ${p.y + 10} V ${y - 10} Q ${upper} ${y} ${upper + s * r} ${y} H ${lower - s * r} ${end}`, link.fd, link.dashed, link.inactive, link.reason, link.tagged));
    }
  });
  const nodes = [...used.values()].map(dest => {
    const p = positions.get(dest.id);
    const icon = dest.type === 'file' ? '▤' : dest.type === 'null' ? '∅' : dest.type === 'closed' ? '×' : '▣';
    const subtitle = dest.type === 'file' ? dest.mode === 'read' ? 'INPUT FILE' : dest.mode === 'append' ? 'APPEND TO FILE' : 'OUTPUT FILE' : dest.type === 'null' ? dest.mode === 'read' ? 'END-OF-FILE' : 'DISCARDED' : dest.type === 'closed' ? 'DESCRIPTOR CLOSED' : 'TERMINAL';
    return `<g data-dest="${escape(dest.id)}"><title>${escape(dest.label)}</title><rect class="node-body" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="${palette.inset}" stroke="${palette.border}"/><text x="${p.x + 15}" y="${p.y + 26}" fill="${palette.muted}" font-size="17">${icon}</text><text x="${p.x + 39}" y="${p.y + 25}" fill="${palette.text}" font-family="'IBM Plex Mono',monospace" font-size="10">${escape(short(dest.label, 18))}</text><text x="${p.x + 39}" y="${p.y + 43}" fill="${palette.muted}" font-size="9" letter-spacing="1">${subtitle}</text></g>`;
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
        <rect class="port-badge" x="${badgeX}" y="${p.y - 10}" width="19" height="18" rx="4" fill="${inactive ? palette.inset : tint}"/>
        <text x="${badgeX + 9.5}" y="${p.y + 3}" text-anchor="middle" fill="${inactive ? palette.muted : colors[fd]}" font-size="10">${fd}</text>
        <text x="${labelX}" y="${p.y + 3}" text-anchor="${fd === 0 ? 'start' : 'end'}" fill="${palette.text}" font-size="10">${names[fd]}</text>
        <text x="${annotationX}" y="${p.y + 21}" text-anchor="${fd === 0 ? 'start' : 'end'}" fill="${palette.muted}" font-size="10">${usage.label}</text>
        <circle class="port-dot" cx="${p.x}" cy="${p.y}" r="4" fill="${usage.state === 'possible' ? colors[fd] : palette.surface}" stroke="${inactive ? palette.muted : colors[fd]}" stroke-width="1.8" ${usage.state === 'unknown' ? 'stroke-dasharray="2 2"' : ''}/>
      </g>`;
    }).join('');
    const argumentPorts = bottomSubs(cmd).map(sub => {
      const fd = bottomFd(sub), p = argumentPort(cmd, sub), usage = portUsage(cmd, fd);
      return `<g data-command="${cmd.key}" data-fd="${fd}" data-usage="${usage.state}"><title>${escape(usage.reason)}</title>
        <text x="${p.x}" y="${p.y - 9}" text-anchor="middle" fill="${palette.muted}" font-size="9">fd ${fd}</text>
        <circle class="port-dot" cx="${p.x}" cy="${p.y}" r="4" fill="${palette.text}" stroke="${palette.text}" stroke-width="1.8"/></g>`;
    }).join('');
    const jobPorts = cmd.substitutions.filter(sub => sub.kind === 'job').flatMap(job => [
      ...(job.input === 'blocks' ? [['>', 'blocks', palette.green]] : []), ...(job.ungroup ? [] : [['<', 'jobs', palette.purple]]),
    ].map(([direction, label, color]) => {
      const p = jobPort(job, direction);
      return `<g><title>${escape(direction === '>' ? `${job.owner.usage.name} feeds a block of its input to each job.` : `${job.owner.usage.name} collects each job’s output here.`)}</title>
        <text x="${p.x - 8}" y="${p.y + 14}" text-anchor="end" fill="${palette.muted}" font-size="9">${label}</text>
        <circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}" stroke="${color}" stroke-width="1.8"/></g>`;
    })).join('');
    const job = cmd.substitution?.kind === 'job';
    const title = job ? `IN EACH JOB · ${cmd.index + 1}` : cmd.substitution ? `SUBSTITUTION ${cmd.key}` : `COMMAND ${cmd.key}`;
    // A job template runs many times, so its cards are drawn as a stack.
    const stack = job ? [8, 4].map(d => `<rect x="${x + d}" y="${y + d}" width="220" height="156" rx="10" fill="${palette.inset}" stroke="${palette.border}"/>`).join('') : '';
    return `<g data-card="${cmd.key}"><title>${escape(job ? `${cmd.command} · runs in each job started by ${cmd.substitution.owner.usage.name}` : cmd.substitution ? `${cmd.command} · in ${cmd.substitution.text}` : cmd.command)}</title>
      ${stack}<rect class="card-body" x="${x}" y="${y}" width="220" height="156" rx="10" fill="${palette.surface}" stroke="${palette.border}" ${cmd.substitution ? 'stroke-dasharray="5 3"' : ''}/>
      <path d="M ${x} ${y + 57} H ${x + 220}" stroke="${palette.border}"/>
      <text x="${x + 16}" y="${y + 22}" fill="${palette.muted}" font-size="9" letter-spacing="1.3">${title}</text>
      <text x="${x + 16}" y="${y + 43}" fill="${palette.text}" font-size="16" font-weight="500" font-family="'IBM Plex Mono',monospace">${escape(short(cmd.command, 19))}</text>
      ${ports}${argumentPorts}${jobPorts}</g>`;
  });
  // With stderr tagged in place, a pipeline often has nothing below its cards; end the drawing there.
  const cardsBottom = 101 + grid.rows * 200 + 156 + 34;
  const height = bottom.length || lanes.length ? 390 + (bottomY - 353) : cardsBottom - 55;
  return { minX, width, height, body: `${paths.join('')}${nodes.join('')}${cards.join('')}` };
}

// The caret inspector lights up the part of the diagram under the editor's caret, as a browser's
// element inspector does for the page. Each target is a span of the editor's text and what it lights:
// strong cards are outlined, context cards stay visible, and links light when an end or their
// destination is listed. Ports name command key:fd.
// It also runs the other way: hovering part of the diagram marks its text in the editor, and a
// click selects that text. Hover lights the diagram as the caret would, and wins while it lasts.
let targets = [], inspected = null, hovered = null, marked = null;
// The Highlight switch turns the linking off in both directions.
let highlighting = true;
try { highlighting = localStorage.getItem('pipeviewer-highlight') !== 'off'; } catch {}
function inspectTargets(model) {
  const portsOf = cmd => Object.keys(cmd.fds).map(fd => `${cmd.key}:${fd}`);
  const list = [];
  for (const cmd of model.all) {
    list.push({ kind: 'command', ref: cmd, span: cmd.span, strong: [cmd.key], context: [], ends: portsOf(cmd), ports: [], dests: [] });
    for (const step of cmd.steps) {
      const ports = step.fds.map(fd => `${cmd.key}:${fd}`);
      list.push({ kind: 'step', ref: step, span: step.span, strong: [], context: [cmd.key], ends: ports, ports, dests: [step.destination.id] });
    }
  }
  // A pipe's target also covers the spaces either side of |, so moving the caret along never goes dark.
  for (const { commands, pipes } of [...model.pipelines, ...model.substitutions]) {
    for (const pipe of pipes) {
      const before = commands[pipe.from], after = commands[pipe.to];
      const ports = [...Object.keys(before.fds).filter(fd => reaches(before.fds[fd], pipe)).map(fd => `${before.key}:${fd}`), `${after.key}:0`];
      list.push({ kind: 'pipe', ref: pipe, span: [Math.min(pipe.span[0], before.span[1] + 1), Math.max(pipe.span[1], after.span[0] - 1)], strong: [], context: [before.key, after.key], ends: [], ports, dests: [pipe.id] });
    }
  }
  for (const sub of model.substitutions) {
    if (!sub.span) continue;
    const inner = sub.commands.map(cmd => cmd.key);
    const dests = sub.kind === 'job' ? [`${sub.id}-in`, `${sub.id}-out`] : [sub.endpoint.id];
    list.push({ kind: 'substitution', ref: sub, span: sub.span, strong: inner, context: [sub.owner.key], ends: sub.commands.flatMap(portsOf), ports: [], dests });
  }
  // &&, || or ; lights the pipelines on either side of it.
  model.pipelines.forEach((pipeline, n) => {
    if (!pipeline.operatorSpan) return;
    const sides = [...model.pipelines[n - 1].all, ...pipeline.all];
    list.push({ kind: 'join', ref: pipeline, span: pipeline.operatorSpan, strong: [], context: sides.map(cmd => cmd.key), ends: sides.flatMap(portsOf), ports: [], dests: [] });
  });
  return list;
}
// The target for a hovered diagram element: a card is its command; a port is the last redirect
// that set it, else the pipe or substitution it joins, else its command; a line is its pipe or
// substitution, else its starting port; a destination box is the last redirect to it.
function targetFor(element) {
  const find = (kind, ref) => targets.find(t => t.kind === kind && t.ref === ref);
  const byKey = key => currentModel.all.find(cmd => cmd.key === key);
  const joined = dest => dest?.type === 'pipe' ? find('pipe', dest) : dest?.type === 'procsub' ? find('substitution', dest.substitution) : dest?.type === 'job' ? find('substitution', dest.job) : null;
  const portTarget = (key, fd) => {
    const cmd = byKey(key);
    if (!cmd) return null;
    const step = cmd.steps.findLast(s => s.fds.includes(fd));
    return step ? find('step', step) : joined(cmd.fds[fd]) ?? find('command', cmd);
  };
  const { card, command, fd, ends, dest: id } = element.dataset;
  if (card) return find('command', byKey(card));
  if (command) return portTarget(command, Number(fd));
  const dest = currentModel.endpoints.find(d => d.id === id);
  if (ends) { const [key, n] = ends.split(' ')[0].split(':'); return joined(dest) ?? portTarget(key, Number(n)); }
  return targets.findLast(t => t.kind === 'step' && t.ref.destination === dest) ?? null;
}
const hoverable = '[data-card], [data-command], [data-dest]';
// The editor cannot colour its own text, so a mirror behind it, with the same font and wrapping,
// draws the mark. The textarea's background is transparent.
function markSource(span) {
  if (span === marked) return;
  marked = span;
  const editor = $('#pipeline'), mirror = $('#editor-mirror'), text = editor.value;
  if (!span) { mirror.textContent = ''; return; }
  mirror.style.width = `${editor.clientWidth}px`;
  mirror.style.height = `${editor.clientHeight}px`;
  mirror.innerHTML = `${escape(text.slice(0, span[0]))}<mark>${escape(text.slice(...span))}</mark>${escape(text.slice(span[1]))}​`;
  mirror.scrollTop = editor.scrollTop;
}
function inspect(redrawn = false) {
  const editor = $('#pipeline'), svg = $('#diagram svg');
  // While a keystroke waits for its frame the old diagram stays lit, so typing does not flicker.
  if (editor.value !== currentSource && renderQueued) return;
  const caret = editor.selectionDirection === 'backward' ? editor.selectionStart : editor.selectionEnd;
  const live = highlighting && svg && editor.value === currentSource;
  // The smallest span holding the caret wins; on a tie the later target, such as a pipe over |&.
  const atCaret = () => document.activeElement === editor ? targets.reduce((best, t) => t.span[0] <= caret && caret <= t.span[1] && (!best || t.span[1] - t.span[0] <= best.span[1] - best.span[0]) ? t : best, null) : null;
  const target = live ? hovered ?? atCaret() : null;
  markSource(live && hovered ? hovered.span : null);
  if (target === inspected && !redrawn) return;
  const moved = target !== inspected;
  inspected = target;
  if (!svg) return;
  svg.classList.toggle('inspecting', !!target);
  svg.querySelectorAll('.lit').forEach(el => el.classList.remove('lit', 'lit-card', 'lit-port', 'lit-node'));
  if (!target) return;
  const ends = new Set(target.ends), dests = new Set(target.dests), ports = new Set(target.ports);
  const cards = [...target.strong, ...target.context].map(key => svg.querySelector(`[data-card="${key}"]`)).filter(Boolean);
  cards.forEach(card => card.classList.add('lit', ...(target.strong.includes(card.dataset.card) ? ['lit-card'] : [])));
  // Pipelines in a list share the terminal boxes' ids, so only the target's own pipelines light up.
  const scopes = new Set(cards.map(card => card.closest('svg')));
  const inScope = el => scopes.has(el.closest('svg'));
  svg.querySelectorAll('[data-command]').forEach(el => { if (ports.has(`${el.dataset.command}:${el.dataset.fd}`)) el.classList.add('lit', 'lit-port'); });
  svg.querySelectorAll('[data-ends]').forEach(el => {
    if (inScope(el) && (dests.has(el.dataset.dest) || el.dataset.ends.split(' ').some(end => ends.has(end)))) { el.classList.add('lit'); dests.add(el.dataset.dest); }
  });
  // Only a redirect's own destination is outlined; others reached by lit links just stay visible.
  svg.querySelectorAll('[data-dest]:not([data-ends])').forEach(el => { if (inScope(el) && dests.has(el.dataset.dest)) el.classList.add('lit', ...(target.dests.includes(el.dataset.dest) ? ['lit-node'] : [])); });
  // Bring a lit card into view when the caret moves to it in a diagram wider than the window.
  // Not on hover: the pointer is already on it.
  const card = moved && !hovered && svg.querySelector('.lit-card, [data-card].lit');
  if (card) {
    const scroll = $('#diagram-scroll'), box = card.getBoundingClientRect(), view = scroll.getBoundingClientRect();
    if (box.left < view.left || box.right > view.right) scroll.scrollBy({ left: box.left + box.width / 2 - (view.left + view.width / 2), behavior: 'smooth' });
  }
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
  // Sizes are in rem so the drawing, and its text, grows with the viewer's font size.
  host.style.minWidth = `${Math.max(45, viewBox.width * .85 / 16)}rem`;
  // Substitution rows add height; grow the cap with them so the drawing is not shrunk to fit.
  svg.style.maxHeight = `${30 * viewBox.height / 390}rem`;
  svg.style.minHeight = `${17.8125 * viewBox.height / 390}rem`;
  const box = zoom !== 1 && svg.getBoundingClientRect();
  if (box?.width) {
    const fitted = Math.min(box.width / viewBox.width, box.height / viewBox.height);
    host.style.width = host.style.minWidth = `${viewBox.width * fitted * zoom}px`;
    svg.style.maxHeight = 'none';
    svg.style.minHeight = '0';
    scroll.scrollLeft = centre * scroll.scrollWidth - scroll.clientWidth / 2;
  }
  inspect(true);
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
    currentModel = parsePipeline($('#pipeline').value, { platform });
    currentSource = $('#pipeline').value;
    targets = inspectTargets(currentModel);
    hovered = null;
    $('#error').hidden = true;
    $('#results').classList.remove('stale', 'empty');
    const jobCount = currentModel.all.filter(cmd => cmd.substitution?.kind === 'job').length;
    const subCount = currentModel.all.length - currentModel.commands.length - jobCount;
    const lists = currentModel.pipelines.length;
    $('#command-count').textContent = `${lists > 1 ? `${lists} pipelines · ` : ''}${currentModel.commands.length} command${currentModel.commands.length === 1 ? '' : 's'}${subCount ? ` + ${subCount} in substitutions` : ''}${jobCount ? ` + ${jobCount} in jobs` : ''}`;
    showDiagram();
    const redirects = currentModel.all.reduce((total, cmd) => total + cmd.steps.length, 0);
    $('#redirect-count').textContent = `${redirects} redirect${redirects === 1 ? '' : 's'} applied`;
    $('#details').innerHTML = detailOrder(currentModel).map(cmd => `<article class="detail-card${cmd.substitution ? ' substitution-card' : ''}"><div class="detail-title"><span class="detail-label">${cmd.substitution?.kind === 'job' ? `IN EACH JOB · ${cmd.index + 1}` : `${cmd.substitution ? 'SUBSTITUTION' : 'COMMAND'} ${cmd.key}`}</span><code title="${escape(cmd.command)}">${escape(cmd.command)}</code></div>${cmd.substitution?.kind === 'job' ? `<p class="detail-context">In <code>${escape(cmd.substitution.text)}</code>, run by <code>${escape(cmd.substitution.owner.usage.name)}</code> once per ${cmd.substitution.tool === 'xargs' ? 'item' : 'argument'}</p>` : cmd.substitution ? `<p class="detail-context">In <code>${escape(cmd.substitution.text)}</code>, started by <code>${escape(cmd.substitution.owner.command)}</code></p>` : ''}${Object.entries(cmd.fds).map(([fd, dest]) => `<div class="fd-row fd-${fd}"><span class="fd-badge">${fd}</span><span>${names[fd] || 'fd ' + fd}</span><span class="right-arrow">→</span><span class="destination">${destinationMarkup(dest, Number(fd), currentModel.commands, cmd)}${usageMarkup(cmd, Number(fd))}</span></div>`).join('')}${cmd.steps.length ? `<details class="steps"><summary>${cmd.steps.length} redirect${cmd.steps.length === 1 ? '' : 's'}, applied left to right</summary><ol>${cmd.steps.map(step => `<li><code>${escape(step.text)}</code><br>${escape(step.description)}</li>`).join('')}</ol></details>` : ''}</article>`).join('');
    $('#details-count').textContent = `${currentModel.all.length} card${currentModel.all.length === 1 ? '' : 's'}`;
    const extra = currentModel.all.some(cmd => Object.entries(cmd.fds).some(([fd, dest]) => Number(fd) > 2 && dest.type !== 'procsub'));
    $('#insights').innerHTML = multioInsights(currentModel) + listInsights(currentModel) + currentModel.pipelines.map(usageInsights).join('') + substitutionInsights(currentModel);
    $('#notes').innerHTML = [...currentModel.notes, ...(extra ? ['The diagram shows descriptors 0, 1, and 2. Open Descriptor details below to see the others.'] : [])].map(note => `<div class="note">${escape(note)}</div>`).join('');
    document.querySelectorAll('[data-example]').forEach(button => button.classList.toggle('active', exampleSources(button.dataset.example).includes(currentSource)));
    // Keep the chosen example visible in the scrolling strip.
    const chosen = $('#example-strip .active');
    if (chosen) { const strip = $('#example-strip'); if (chosen.offsetLeft < strip.scrollLeft || chosen.offsetLeft + chosen.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = chosen.offsetLeft - strip.clientWidth / 2 + chosen.offsetWidth / 2; }
    showVariations();
    try { localStorage.setItem('pipeviewer-pipeline', currentSource); } catch { /* Storage is optional. */ }
  } catch (error) {
    // Half-typed pipelines rarely parse, so keep the last diagram and say what is missing.
    $('#error').textContent = error.message;
    $('#error').classList.toggle('hint', !$('#pipeline').value.trim());
    $('#error').hidden = false;
    $('#results').classList.add('stale');
    $('#results').classList.toggle('empty', !currentModel);
  }
}
// Parsing and drawing take well under a frame, so the diagram follows every keystroke.
let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
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

$('#pipeline').addEventListener('input', () => { fitEditor(); queueRender(); });
function showPlatform() {
  $('#platform').querySelectorAll('button').forEach(button => {
    const active = button.dataset.platform === platform;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  // zsh's default prompt ends in %, Bash's in $.
  $('.prompt').textContent = platform === 'macos' ? '%' : '$';
  document.querySelectorAll('[data-platform-text]').forEach(element => { element.hidden = element.dataset.platformText !== platform; });
}
$('#platform').addEventListener('click', event => {
  const button = event.target.closest('[data-platform]');
  if (!button || button.dataset.platform === platform) return;
  // An example in the editor switches to its spelling for the other system.
  const loaded = Object.keys(examples).map(key => [key, exampleSources(key).indexOf($('#pipeline').value)]).find(([, i]) => i !== -1);
  platform = button.dataset.platform;
  if (loaded) { $('#pipeline').value = exampleSources(loaded[0])[loaded[1]]; fitEditor(); }
  try { localStorage.setItem('pipeviewer-platform', platform); } catch {}
  showPlatform();
  showKnown();
  render();
});
showPlatform();
function showRedirectStyle() {
  $('#redirect-style').querySelectorAll('button').forEach(button => {
    const active = button.dataset.style === redirectStyle;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
}
// The switch restyles whatever is in the editor, an example or the viewer's own pipeline.
$('#redirect-style').addEventListener('click', event => {
  const button = event.target.closest('[data-style]');
  if (!button || button.dataset.style === redirectStyle) return;
  redirectStyle = button.dataset.style;
  try { localStorage.setItem('pipeviewer-redirects', redirectStyle); } catch {}
  showRedirectStyle();
  $('#pipeline').value = styled($('#pipeline').value);
  fitEditor();
  render();
});
showRedirectStyle();
document.addEventListener('selectionchange', () => inspect());
for (const type of ['select', 'keyup', 'pointerup', 'focus', 'blur']) $('#pipeline').addEventListener(type, () => inspect());
$('#pipeline').addEventListener('scroll', () => { $('#editor-mirror').scrollTop = $('#pipeline').scrollTop; });
$('#diagram').addEventListener('pointerover', event => {
  if (!highlighting) return;
  const element = event.target.closest(hoverable);
  const target = element && currentSource === $('#pipeline').value ? targetFor(element) : null;
  if (target === hovered) return;
  hovered = target;
  inspect();
});
$('#diagram').addEventListener('pointerleave', () => { hovered = null; inspect(); });
// A click selects the text, so the caret inspector carries on from there.
$('#diagram').addEventListener('click', event => {
  if (!highlighting) return;
  const element = event.target.closest(hoverable), target = element && hovered;
  if (!target) return;
  const editor = $('#pipeline');
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(...target.span);
});
// The editor grows with its content up to ten lines, then scrolls. A height the viewer drags
// to acts as a minimum; CSS caps both.
let chosenHeight = 0;
function fitEditor() {
  const editor = $('#pipeline');
  const lines = parseFloat(getComputedStyle(editor).lineHeight) * 10 + 8;
  editor.style.height = 'auto';
  editor.style.height = `${Math.max(Math.min(editor.scrollHeight, lines), chosenHeight)}px`;
  $('#resize-handle').setAttribute('aria-valuenow', Math.round(editor.offsetHeight));
}
function resizeEditor(height) {
  $('#pipeline').style.height = `${height}px`;
  chosenHeight = $('#pipeline').offsetHeight;
  $('#resize-handle').setAttribute('aria-valuenow', Math.round(chosenHeight));
}
$('#resize-handle').addEventListener('pointerdown', event => {
  event.preventDefault();
  const handle = event.currentTarget, startY = event.clientY, startHeight = $('#pipeline').offsetHeight;
  handle.setPointerCapture(event.pointerId);
  handle.classList.add('dragging');
  const move = moved => resizeEditor(startHeight + moved.clientY - startY);
  const stop = () => { handle.classList.remove('dragging'); handle.removeEventListener('pointermove', move); };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', stop, { once: true });
  handle.addEventListener('pointercancel', stop, { once: true });
});
$('#resize-handle').addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const step = parseFloat(getComputedStyle($('#pipeline')).lineHeight);
  resizeEditor($('#pipeline').offsetHeight + (event.key === 'ArrowDown' ? step : -step));
});
$('#resize-handle').addEventListener('dblclick', () => { chosenHeight = 0; fitEditor(); });
function loadExample(key) { $('#pipeline').value = exampleSources(key)[0]; fitEditor(); render(); }
$('#variations').addEventListener('click', event => {
  const button = event.target.closest('[data-variation]');
  if (!button) return;
  const [key, i] = button.dataset.variation.split(':');
  $('#pipeline').value = styled(variations[key][Number(i)].source);
  fitEditor();
  render();
});
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => loadExample(button.dataset.example)));
// The reference lists every modelled command alphabetically, so it never falls behind commands/.
function showKnown() {
  const known = commands.flatMap(rule => rule.names.filter(name => ships(rule, name, platform))).sort((a, b) => a.replace(/^\W+/, '').localeCompare(b.replace(/^\W+/, '')));
  $('#known-count').textContent = known.length;
  $('#known-commands').innerHTML = known.map(name => `<li><code>${escape(name)}</code></li>`).join('');
}
showKnown();
$('#known-toggle').addEventListener('click', event => {
  const open = $('#known-commands').hidden;
  $('#known-commands').hidden = !open;
  event.currentTarget.setAttribute('aria-expanded', open);
});
$('#reference-button').addEventListener('click', () => $('#reference').showModal());
$('#close-reference').addEventListener('click', () => $('#reference').close());
// Chapter starts in seconds, marked by hand when the talk was first published.
const chapters = [
  [0, 'columns'], [28, '{} magic'], [128, '-x debugging'], [209, 'strace'], [261, 'signals'], [406, 'reset'],
  [466, 'fg, bg'], [648, 'disown'], [724, 'bropages'], [865, 'Navigating directories'], [1035, 'Emergency space'],
  [1184, 'alt+.'], [1236, 'history'], [1440, 'caret ^'], [1477, 'GNU-isms'], [1911, 'tmpfs'], [2080, 'free'],
  [2116, 'Drop cache'], [2225, 'time / benchmarking'], [2288, '/dev/shm'], [2365, 'systemd?'],
  [2441, 'Ramdisk benchmark'], [2562, '/dev/[u]random'],
];
// The talk is slow-paced, so it starts a little faster. The switch also follows changes made in the browser's own player menu.
function showSpeed() {
  const rate = $('#talk-video').playbackRate;
  $('#talk-speed').querySelectorAll('button').forEach(button => {
    const active = Number(button.dataset.rate) === rate;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
}
$('#talk-video').defaultPlaybackRate = $('#talk-video').playbackRate = 1.25;
showSpeed();
$('#talk-video').addEventListener('ratechange', showSpeed);
$('#talk-speed').addEventListener('click', event => {
  const button = event.target.closest('[data-rate]');
  if (button) $('#talk-video').defaultPlaybackRate = $('#talk-video').playbackRate = Number(button.dataset.rate);
});
const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
$('#talk-chapters').innerHTML = chapters.map(([time, label]) => `<li><button type="button" data-time="${time}"><span class="chapter-time">${clock(time)}</span><span>${escape(label)}</span></button></li>`).join('');
$('#talk-chapters').addEventListener('click', event => {
  const button = event.target.closest('[data-time]');
  if (!button) return;
  const video = $('#talk-video');
  video.currentTime = Number(button.dataset.time);
  video.play().catch(() => {});
});
let currentChapter = -1;
$('#talk-video').addEventListener('timeupdate', () => {
  const index = chapters.findLastIndex(([time]) => time <= $('#talk-video').currentTime);
  if (index === currentChapter) return;
  currentChapter = index;
  $('#talk-chapters').querySelectorAll('button').forEach((button, i) => {
    button.classList.toggle('active', i === index);
    if (i === index) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
  });
  // Keep the current chapter in view by scrolling only the list, never the dialog around it.
  const list = $('#talk-chapters'), item = list.children[index];
  if (!item) return;
  if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
  else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
});
$('#talk-button').addEventListener('click', () => { $('#talk').showModal(); $('#talk-video').play().catch(() => {}); });
$('#close-talk').addEventListener('click', () => $('#talk').close());
// Closing pauses the talk; reopening carries on from the same point.
$('#talk').addEventListener('close', () => $('#talk-video').pause());
// A click on the backdrop lands on the dialog itself, outside its box.
for (const dialog of [$('#reference'), $('#talk')]) dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
// The details start collapsed; remember when a viewer opens them.
try { $('#details-section').open = localStorage.getItem('pipeviewer-details') === 'open'; } catch {}
$('#details-section').addEventListener('toggle', () => {
  try { localStorage.setItem('pipeviewer-details', $('#details-section').open ? 'open' : 'closed'); } catch {}
});
// Middle-click and drag pans the diagram sideways and the page up and down, for mice
// without a horizontal scroll gesture. Blocking mousedown stops the browser's autoscroll.
$('#diagram-scroll').addEventListener('mousedown', event => { if (event.button === 1) event.preventDefault(); });
$('#diagram-scroll').addEventListener('pointerdown', event => {
  if (event.button !== 1) return;
  event.preventDefault();
  const scroll = event.currentTarget;
  let x = event.clientX, y = event.clientY;
  scroll.setPointerCapture(event.pointerId);
  scroll.classList.add('panning');
  const move = moved => {
    scroll.scrollLeft -= moved.clientX - x;
    scrollBy(0, y - moved.clientY);
    x = moved.clientX; y = moved.clientY;
  };
  const stop = () => { scroll.classList.remove('panning'); scroll.removeEventListener('pointermove', move); };
  scroll.addEventListener('pointermove', move);
  scroll.addEventListener('pointerup', stop, { once: true });
  scroll.addEventListener('pointercancel', stop, { once: true });
});
function showHighlighting() {
  $('#highlight-toggle').setAttribute('aria-checked', highlighting);
  $('#diagram-scroll').classList.toggle('no-highlight', !highlighting);
}
// Restarting a CSS animation needs the class removed and the element reflowed first.
const replay = (element, className) => { element.classList.remove(className); void element.offsetWidth; element.classList.add(className); };
$('#highlight-toggle').addEventListener('click', event => {
  highlighting = !highlighting;
  hovered = null;
  try { localStorage.setItem('pipeviewer-highlight', highlighting ? 'on' : 'off'); } catch {}
  showHighlighting();
  replay(event.currentTarget, 'just-toggled');
  $('.diagram-panel').classList.remove('linking-on', 'linking-off');
  replay($('.diagram-panel'), highlighting ? 'linking-on' : 'linking-off');
  $('#highlight-status').textContent = `Highlighting ${highlighting ? 'on' : 'off'}`;
  inspect(true);
});
showHighlighting();
// The examples strip fades an edge while it can scroll that way, and a vertical wheel scrolls it
// sideways until it reaches an end, after which the page scrolls as usual.
function showStripEdges() {
  const strip = $('#example-strip');
  strip.classList.toggle('more-left', strip.scrollLeft > 1);
  strip.classList.toggle('more-right', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
}
$('#example-strip').addEventListener('scroll', showStripEdges, { passive: true });
$('#example-strip').addEventListener('wheel', event => {
  const strip = event.currentTarget;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const room = event.deltaY > 0 ? strip.scrollWidth - strip.clientWidth - strip.scrollLeft : strip.scrollLeft;
  if (room <= 1) return;
  event.preventDefault();
  strip.scrollLeft += event.deltaY;
}, { passive: false });
addEventListener('resize', showStripEdges);
showStripEdges();
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
fitEditor();
// Wrapping changes once the web font loads or the window resizes.
document.fonts?.ready.then(fitEditor);
addEventListener('resize', fitEditor);
render();
