import { parsePipeline, destinationLabel, targetsOf, reaches, restyle } from './parser.js';
import { portUsage, pipeActivity, commands, ships } from './usage.js';
import { compare, starsFor } from './training.js';
import { lessons } from './lessons.js';
import { slides } from './intro.js';
import { reference } from './reference.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Lesson and reference text sets `backticks` as code.
const prose = text => escape(text).replace(/`([^`]+)`/g, '<code>$1</code>');
const names = ['stdin', 'stdout', 'stderr'];
// Examples are written in the explicit redirect style; the Explicit/Common switch restyles them.
const examples = {
  file: 'sort 0< names.txt | uniq -c 1> counts.txt',
  discard: 'find . -name "*.js" 2> /dev/null | wc -l',
  // macOS has no apt; Homebrew takes its place, and refuses to run under sudo.
  lists: { source: 'sudo apt update && sudo apt upgrade -y || echo "uh oh, something went wrong when trying to update software"', mac: 'brew update && brew upgrade || echo "uh oh, something went wrong when trying to update software"' },
};
// Examples without variations are a source, or a source and its mac spelling.
// Examples with several equivalent or related spellings, shown as toggles once one of them is loaded.
// A mac spelling replaces the source in macOS mode.
const variations = {
  // macOS keeps no auth.log (authentication goes to the unified log), so it reads install.log.
  simple: [
    { label: 'cat into grep', source: 'cat /var/log/auth.log | grep "denied access"', mac: 'cat /var/log/install.log | grep "Installed"' },
    { label: 'Redirect stdin', source: 'grep "denied access" 0</var/log/auth.log', mac: 'grep "Installed" 0</var/log/install.log' },
    { label: 'File argument', source: 'grep "denied access" /var/log/auth.log', mac: 'grep "Installed" /var/log/install.log' },
  ],
  merge: [
    { label: 'short-form', source: 'make &> build.log' },
    { label: 'long-form', source: 'make 1> build.log 2>&1' },
  ],
  procsub: [
    { label: 'Plain', source: 'cat <(head /etc/hosts) <(head /etc/shells) <(echo hello, world)' },
    { label: 'Labelled lines', source: "cat <(head /etc/hosts | sed 's:^:/etc/hosts --> :') \\\n    <(head /etc/shells | sed 's:^:/etc/shells --> :') \\\n    <(echo hello, world)" },
    // Explicit redirects choose the descriptor numbers instead of Bash.
    { label: 'Descriptors 7, 8 and 9', source: "cat /dev/fd/7 /dev/fd/8 /dev/fd/9 \\\n    7< <(head /etc/hosts | sed 's:^:/etc/hosts --> :') \\\n    8< <(head /etc/shells | sed 's:^:/etc/shells --> :') \\\n    9< <(echo hello, world)" },
  ],
  palindromes: [
    { label: 'Pipe into paste -', source: "rev 0</usr/share/dict/words | paste - /usr/share/dict/words | awk '$1==$2 {print $1}' | grep -E '.{5,}'" },
    { label: 'One substitution', source: "paste /usr/share/dict/words <(rev /usr/share/dict/words) | awk '$1==$2 {print $1}' | grep -E '.{5,}'" },
    { label: 'Two substitutions', source: "paste <(cat /usr/share/dict/words) <(rev /usr/share/dict/words) | awk '$1==$2 {print $1}' | grep -E '.{5,}'" },
    { label: 'Descriptors 3 and 4', source: "paste /dev/fd/3 /dev/fd/4 \\\n  3< <(cat /usr/share/dict/words) \\\n  4< <(rev /usr/share/dict/words) | awk '$1==$2 {print $1}' | grep -E '.{5,}'" },
  ],
  timing: [
    { label: 'sleep 2 | echo', source: 'sleep 2 | echo "hello, world"' },
    { label: 'echo | sleep 2', source: 'echo "hello, world" | sleep 2' },
    { label: 'Swap stdout and stderr', source: 'echo "hello, world" 3>&1 1>&2 2>&3 3>&- | sleep 2' },
  ],
  // Stock macOS has no parallel, wget, pv or mawk, and its zcat wants .Z files, so the Wiki examples
  // use xargs -P, curl, dd, awk and gzcat there. The download fetches the week of hourly files that
  // Wiki pageviews counts.
  wikiDownload: [
    { label: 'Fetch', source: String.raw`parallel -j2 --bar wget -q -c https://dumps.wikimedia.org/other/pageviews/2026/2026-09/pageviews-202609{1}-{2}0000.gz \
::: {14..20} ::: {00..23}`,
      mac: String.raw`curl -Z --parallel-max 2 -C - --remote-name-all \
  'https://dumps.wikimedia.org/other/pageviews/2026/2026-09/pageviews-202609[14-20]-[00-23]0000.gz'` },
    { label: 'Unpacked size', source: 'parallel --ungroup "zcat {}" ::: *.gz | pv -b 1>/dev/null',
      mac: String.raw`printf '%s\0' *.gz | xargs -0 -n 1 -P 8 gzcat | dd of=/dev/null bs=1m status=progress` },
  ],
  // Each job counts one file and a single awk outside parallel adds up their totals.
  wiki: [
    { label: 'Total en views', source: String.raw`parallel "zcat {} \
          | grep -E '^en |^en\.m ' \
          | mawk '{total+=\$3} END {print total}'" ::: pageviews-*.gz \
| awk '{n+=$1} END {print n}' \
| xargs printf "\n%'d <-- total Wiki page views in 1 week\n"`,
      mac: String.raw`printf '%s\0' pageviews-*.gz \
| xargs -0 -n 1 -P 8 sh -c 'gzcat "$1" | grep -E "^en |^en\.m " | awk "{total+=\$3} END {print total}"' _ \
| awk '{n+=$1} END {print n}' \
| xargs printf "\n%'d <-- total Wiki page views in 1 week\n"` },
    // In Top 50 pages each job writes its own counts file, so output from concurrent jobs never
    // mixes; the second pipeline merges them.
    { label: 'Top 50 pages', source: String.raw`parallel 'zcat {} | grep -E "^en |^en\.m " | awk "{pages[\$2]+=\$3} END {for (p in pages) print p, pages[p]}" 1> {}.counts' ::: *.gz &&
cat *.gz.counts | LC_ALL=C sort -k1,1 | awk '
    $1 == prev { sum += $2; next }
    NR > 1 { print sum, prev }
    { prev=$1; sum=$2 }
    END { if (NR) print sum, prev }
' | sort -rn | head -50 1> top-50-pages`,
      mac: String.raw`printf '%s\0' *.gz | xargs -0 -n 1 -P 8 sh -c 'gzcat "$1" | grep -E "^en |^en\.m " | awk "{pages[\$2]+=\$3} END {for (p in pages) print p, pages[p]}" 1> "$1.counts"' _ &&
cat *.gz.counts | LC_ALL=C sort -k1,1 | awk '
    $1 == prev { sum += $2; next }
    NR > 1 { print sum, prev }
    { prev=$1; sum=$2 }
    END { if (NR) print sum, prev }
' | sort -rn | head -50 1> top-50-pages` },
  ],
};
for (const [key, list] of Object.entries(variations)) examples[key] = list[0].source;
// Explicit writes the implied descriptors (0< file, 1> file); common leaves them out.
let redirectStyle = 'common';
try { if (localStorage.getItem('pipeviewer-redirects') === 'explicit') redirectStyle = 'explicit'; } catch {}
const styled = source => restyle(source, redirectStyle, { platform });
// Every spelling of an example as it reads on a platform, in the current redirect style.
const spelling = (variation, on = platform) => on === 'macos' ? variation.mac ?? variation.source : variation.source;
const exampleSources = (key, on = platform) => (variations[key]?.map(variation => spelling(variation, on)) ?? [typeof examples[key] === 'string' ? examples[key] : spelling(examples[key], on)])
  .map(source => restyle(source, redirectStyle, { platform: on }));

// In the variations, redirect style and examples rows, the chosen button sits on a raised thumb that
// slides from button to button, as the shell switch's does. Buttons differ in width, so the thumb
// is measured from the chosen one. It fades in where it lands when nothing was chosen, and out when
// nothing is.
function slide(group) {
  let thumb = group.querySelector(':scope > .thumb');
  if (!thumb) {
    thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.setAttribute('aria-hidden', 'true');
    group.prepend(thumb);
  }
  const active = group.querySelector(':scope > button.active'), shown = !!active?.offsetParent;
  if (shown) {
    const placed = thumb.classList.contains('shown');
    if (!placed) thumb.classList.add('instant');
    thumb.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.height = `${active.offsetHeight}px`;
    if (!placed) { void thumb.offsetWidth; thumb.classList.remove('instant'); }
  }
  thumb.classList.toggle('shown', shown);
}
const slideAll = () => ['#variation-buttons', '#redirect-style', '#example-strip'].forEach(id => slide($(id)));

function showExamples() {
  document.querySelectorAll('[data-example]').forEach(button => {
    const active = exampleSources(button.dataset.example).includes(currentSource);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  slide($('#example-strip'));
}
function showVariations() {
  const key = Object.keys(variations).find(name => exampleSources(name).includes(currentSource)), group = $('#variation-buttons');
  // The row and its label stay put; only the buttons come and go. The same example's buttons stay,
  // and the thumb stays through a change of example, so it can slide to the new one.
  if (group.dataset.variationsOf !== (key ?? '')) {
    group.dataset.variationsOf = key ?? '';
    group.querySelectorAll(':scope > button').forEach(button => button.remove());
    if (key) group.insertAdjacentHTML('beforeend', variations[key].map((variation, i) => `<button type="button" data-variation="${key}:${i}">${escape(variation.label)}</button>`).join(''));
  }
  group.querySelectorAll(':scope > button').forEach((button, i) => {
    const source = styled(spelling(variations[key][i])), active = source === currentSource;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
    button.title = source;
  });
  slide(group);
}
let currentModel;
let currentSource = '';
// Training mode: the level being played, the target's model, how the student's picture differs from
// it (null while there is nothing to compare), and the hints taken. Viewer is what the editor held
// before training started, put back on the way out.
const training = { active: false, level: 0, model: null, differences: null, matched: false, hints: [], earned: 0, burst: false, coach: '', viewer: '', slide: -1, nudge: false };
// Linux maps GNU tools under Bash; macOS maps the BSD and Apple tools under zsh.
// Until the viewer picks one, the switch matches their own system: macOS on Apple devices, and
// Linux elsewhere, since Windows users mostly reach Bash through WSL or Git Bash.
const appleDevice = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
let platform = appleDevice ? 'macos' : 'linux';
try { const saved = localStorage.getItem('pipeviewer-platform'); if (['linux', 'macos'].includes(saved)) platform = saved; } catch {}

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
  // The terminal theme draws in monospace, like the rest of its page.
  const mono = document.documentElement.dataset.theme === 'terminal';
  const font = mono ? "'IBM Plex Mono',monospace" : "'DM Sans',Arial,sans-serif";
  const open = (viewBox, desc) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="svg-title svg-desc" font-family="${font}"><title id="svg-title">Pipeline descriptor map</title><desc id="svg-desc">Usage is inferred for standard commands, not observed. ${escape(desc)}</desc>${defs}`;
  const parts = model.pipelines.map(pipeline => drawPipeline(pipeline, palette, colors, mono));
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

// Devices that behave the same on every system get their own glyph and a word on what they do,
// for a read and for a write. macOS has no /dev/full.
const devices = {
  '/dev/null': { icon: 'hole', read: 'empty', write: 'discarded', about: 'reads as empty and swallows everything written to it' },
  '/dev/zero': { icon: 'zero', read: 'endless zeros', write: 'discarded', about: 'reads as an endless run of zero bytes and discards writes' },
  '/dev/full': { icon: 'full', read: 'endless zeros', write: 'always full', about: 'reads as zero bytes, and every write to it fails with “No space left on device”', linux: true },
  '/dev/random': { icon: 'die', read: 'random bytes', write: 'entropy pool', about: 'reads as an endless stream of random bytes; writes are mixed into the kernel’s entropy pool' },
};
devices['/dev/urandom'] = devices['/dev/random'];
const deviceOf = dest => { const device = devices[dest.label]; return device && !(device.linux && platform === 'macos') ? device : null; };
// 12-unit glyphs for files and devices, drawn in the colour of their group.
const glyphs = {
  file: '<path d="M2.5 .5h5L10 3v8.5H2.5z M7.5 .5V3H10 M4.5 6h3.5 M4.5 8.5h3.5"/>',
  hole: '<ellipse cx="6" cy="6" rx="5.6" ry="2.1" transform="rotate(-24 6 6)"/><circle cx="6" cy="6" r="2.7" fill="currentColor" stroke="none"/>',
  zero: '<ellipse cx="6" cy="6" rx="3.3" ry="5.2"/><path d="M3.9 9.6 8.1 2.4"/>',
  die: '<rect x="1" y="1" width="10" height="10" rx="2.5"/><g fill="currentColor" stroke="none"><circle cx="3.8" cy="3.8" r="1.05"/><circle cx="6" cy="6" r="1.05"/><circle cx="8.2" cy="8.2" r="1.05"/></g>',
  full: '<path d="M1 1.2h10 M2.2 1.2v8.6a1.7 1.7 0 0 0 1.7 1.7h4.2a1.7 1.7 0 0 0 1.7-1.7V1.2"/><rect x="3.6" y="2.6" width="4.8" height="7.6" rx=".7" fill="currentColor" stroke="none"/>',
};
const glyph = (kind, x, y, color, scale = 1) => `<g class="glyph" transform="translate(${x} ${y}) scale(${scale})" color="${color}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${glyphs[kind]}</g>`;

// Draws one pipeline, with its substitutions and destinations, in its own coordinates.
function drawPipeline(model, palette, colors, mono) {
  const grid = layout(model);
  const extra = grid.rows * 200;
  const geometry = cmd => { const p = grid.place.get(cmd); return { x: 220 + (p.col + grid.shift) * 360, y: 101 + p.row * 200 }; };
  const port = (cmd, fd) => { const g = geometry(cmd); return { x: g.x + (fd === 0 ? 0 : 220), y: g.y + (fd === 2 ? 125 : 78) }; };
  const short = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  // With tags on, a file or device that only one port uses ends in a small tag beside that port,
  // as the terminal does. stderr's fits in the gap before the next card. Where a card sits beside
  // stdin or stdout, their tag rises into the empty space above the pipe between the two cards,
  // which one tag can use. stdout and stderr sent to one file, as by &>
  // or 1> file 2>&1, share one tag between their ports. A file shared any other way keeps its box,
  // so the drawing still shows the streams reaching one place.
  const fileTags = new Map();
  // With tags on, a stream that ends at the terminal ends in a terminal tag. The terminal's input,
  // output and errors are told apart by which of stdin, stdout and stderr the tag is coloured as.
  const terminalStreams = ['terminal-in', 'terminal-out', 'terminal-err'];
  const grounded = dest => terminalTags && terminalStreams.includes(dest.id);
  const plan = (dest, room) => {
    const device = deviceOf(dest), label = short(dest.label, Math.floor((room - 24) / 5.4));
    const caption = device ? device[dest.mode === 'read' ? 'read' : 'write'] : dest.mode === 'append' ? 'append' : '';
    return { dest, device, label, caption, w: Math.ceil(24 + label.length * 5.4) };
  };
  if (terminalTags) {
    const occupied = new Set([...grid.place.values()].map(p => `${p.col},${p.row}`));
    const sharers = new Map();
    model.all.forEach(cmd => [0, 1, 2].forEach(fd => targetsOf(cmd.fds[fd]).forEach(dest => sharers.set(dest, (sharers.get(dest) ?? 0) + 1))));
    // The terminal input box, when a stream still needs it, sits left of the first card.
    const terminalBox = model.all.some(cmd => [1, 2].some(fd => targetsOf(cmd.fds[fd]).some(dest => dest.id === 'terminal-in')));
    const raised = new Set();
    model.all.forEach(cmd => [0, 1, 2].forEach(fd => {
      // Under zsh's MULTIOS a port can reach several places. A file sent alongside a pipe can take
      // the tag, as the pipe has its own line; beside another file it keeps its box, so the routes
      // to the boxes do not cross a tag's line.
      const value = cmd.fds[fd], { col, row } = grid.place.get(cmd);
      const files = value?.type === 'multio' ? value.targets.filter(t => t.type !== 'pipe') : [value];
      const dest = files.length === 1 ? files[0] : null;
      if (!['file', 'null'].includes(dest?.type) || fileTags.has(`${cmd.key}:${fd}`)) return;
      const crowded = occupied.has(`${col + (fd === 0 ? -1 : 1)},${row}`), p = port(cmd, fd);
      if (fd === 1 && cmd.fds[2] === dest && sharers.get(dest) === 2 && dest.mode !== 'read') {
        const merged = { ...plan(dest, crowded ? 92 : 170), merged: true, x: p.x + 36, y: (p.y + port(cmd, 2).y) / 2 };
        fileTags.set(`${cmd.key}:1`, merged).set(`${cmd.key}:2`, merged);
        return;
      }
      if (sharers.get(dest) > 1 && !deviceOf(dest)) return;
      if (crowded && fd !== 2) {
        const gap = `${col - (fd === 0 ? 1 : 0)},${row}`;
        if (raised.has(gap)) return;
        raised.add(gap);
        const planned = plan(dest, 116);
        fileTags.set(`${cmd.key}:${fd}`, { ...planned, raised: true, x: fd === 0 ? p.x - 26 - planned.w : p.x + 26, y: p.y - 48 });
        return;
      }
      if (fd === 0 && terminalBox && row === 0 && col + grid.shift === 0) return;
      const planned = plan(dest, crowded ? 92 : 170);
      fileTags.set(`${cmd.key}:${fd}`, { ...planned, x: fd === 0 ? p.x - 36 - planned.w : p.x + 36 });
    }));
    // A file the command opens itself, as tee does, ends in a tag just under its bottom-edge port.
    // Its x is known only once the ports are laid out, and it stays within the card's width.
    model.all.forEach(cmd => (cmd.opens ?? []).forEach((open, i) => fileTags.set(`${cmd.key}:o${i}`, { ...plan(open.endpoint, 110), below: true })));
  }
  const used = new Map();
  model.all.forEach(cmd => Object.entries(cmd.fds).forEach(([fd, value]) => targetsOf(value).forEach(dest => {
    if (Number(fd) > 2 || ['pipe', 'procsub', 'job'].includes(dest.type) || dest.job) return;
    if (fileTags.get(`${cmd.key}:${fd}`)?.dest === dest) return;
    // Substitutions show inherited terminal input as a short labelled stub.
    if (cmd.substitution && dest.id === 'terminal-in') return;
    // A grounded stream ends in a tag beside its port, with no box.
    if (grounded(dest) || (terminalTags && dest.type === 'closed')) return;
    used.set(dest.id, dest);
  })));
  model.all.forEach(cmd => (cmd.opens ?? []).forEach((open, i) => { if (!fileTags.has(`${cmd.key}:o${i}`)) used.set(open.endpoint.id, open.endpoint); }));
  const bottom = [...used.values()].filter(d => !['terminal-in', 'terminal-out'].includes(d.id));
  // Space for the terminal boxes is only kept when a stream uses them.
  // File tags can reach past the cards on either side, so the drawing widens to hold them.
  const tagged = [...fileTags.values()].filter(t => !t.below);
  const minX = Math.min(used.has('terminal-in') ? 0 : terminalTags ? 120 : 140, ...tagged.map(t => t.x - 16));
  const width = Math.max(850, used.has('terminal-out') ? 240 + grid.cols * 360 + 175 : 180 + grid.cols * 360, 350 + bottom.length * 190,
    ...tagged.map(t => t.x + t.w + (used.has('terminal-out') ? 195 : 20)));
  const positions = new Map();
  positions.set('terminal-in', { x: 20 + grid.shift * 360, y: 149, w: 155, h: 59 });
  positions.set('terminal-out', { x: width - 174, y: 149, w: 155, h: 59 });
  bottom.forEach((d, i) => positions.set(d.id, { x: 180 + i * (width - 350) / Math.max(1, bottom.length), y: 353 + extra, w: 168, h: 61 }));
  const paths = [];
  // Tags name a link's ends (command key:fd) and destination, so the caret inspector can find it.
  const tag = (ends, dest) => ` data-ends="${ends.join(' ')}" data-dest="${escape(dest.id)}"`;
  const path = (d, fd, dashed = false, inactive = false, reason = '', tagged = '') => `<g class="stream-link${inactive ? ' unused-link' : ''}"${tagged}><title>${escape(reason)}</title><path class="link-hit" d="${d}" fill="none" stroke="transparent" stroke-width="12"/><path d="${d}" fill="none" stroke="${inactive ? palette.muted : colors[fd]}" stroke-width="2" ${dashed || inactive ? 'stroke-dasharray="5 5"' : ''} marker-end="url(#arrow-${inactive ? 'unused' : fd})"/></g>`;
  const stub = (p, fd, label, inactive, reason, tagged) => {
    const endX = p.x + (fd === 0 ? -43 : 43);
    paths.push(path(`M ${fd === 0 ? endX : p.x} ${p.y} L ${fd === 0 ? p.x - 4 : endX} ${p.y}`, fd, true, inactive, reason, tagged));
    paths.push(`<text${tagged} x="${endX}" y="${p.y - 12}" text-anchor="middle" fill="${palette.muted}" font-size="9">${escape(label)}</text>`);
  };
  // With terminal tags, a stream to or from the terminal is drawn as a short line to a “terminal”
  // tag beside the port rather than a route to a shared box, much as circuit diagrams mark ground.
  // stdin's tag sits to the left of its port, the others' to the right. The line takes the port's
  // colour and the tag the terminal stream's, so stdout sent on with >&2 ends in stderr's colour,
  // under an "as stderr" caption.
  // A tag is a short line from the port to a pill beside it, to the left of stdin, otherwise right.
  // A caption above the pill names where it lands when that isn't the port's own stream.
  const pill = (p, fd, { line, color, fill, label, w, dashed, what, kind, caption }, reason, tagged) => {
    const [from, to, x] = fd === 0 ? [p.x - 36, p.x - 4, p.x - 36 - w] : [p.x, p.x + 36, p.x + 36];
    paths.push(`<g class="stream-link${dashed ? ' unused-link' : ''}" data-key="${kind}"${tagged}><title>${escape(`${what} ${reason}`)}</title><path class="link-hit" d="M ${Math.min(from, x)} ${p.y} H ${Math.max(to, x + w)}" fill="none" stroke="transparent" stroke-width="12"/><path d="M ${from} ${p.y} H ${to}" fill="none" stroke="${line}" stroke-width="2" ${dashed ? 'stroke-dasharray="5 5"' : ''}/><rect x="${x}" y="${p.y - 7}" width="${w}" height="14" rx="7" fill="${fill}" stroke="${color}"/><text x="${x + w / 2}" y="${p.y + 3}" text-anchor="middle" fill="${color}" font-size="8.5">${label}</text>${caption ? `<text x="${x + w / 2}" y="${p.y - 11}" text-anchor="middle" fill="${color}" font-size="9.5" font-weight="650">${caption}</text>` : ''}</g>`);
  };
  const ground = (p, fd, dest, inactive, reason, tagged) => {
    const stream = terminalStreams.indexOf(dest.id);
    const what = fd === stream ? (fd === 0 ? 'stdin comes from the terminal.' : `${names[fd]} goes to the terminal.`)
      : fd === 0 ? `stdin reads the terminal’s ${names[stream]}.` : `${names[fd]} goes to the terminal’s ${names[stream]}.`;
    // Monospace text, in the terminal theme, needs a wider tag.
    pill(p, fd, { line: inactive ? palette.muted : colors[fd], color: inactive ? palette.muted : colors[stream], fill: inactive ? palette.inset : palette[['green-bg', 'purple-bg', 'amber-bg'][stream]],
      label: 'terminal', w: mono ? 50 : 44, dashed: inactive, what, kind: dest.id, caption: fd && stream && fd !== stream ? `as ${names[stream]}` : '' }, reason, tagged);
  };
  // A closed descriptor ends in a grey “closed” tag, as nothing is at the other end to draw a box for.
  const closedTag = (p, fd, reason, tagged) => pill(p, fd, { line: palette.muted, color: palette.muted, fill: palette.inset,
    label: 'closed', w: mono ? 44 : 38, dashed: true, what: `${names[fd]} is closed.`, kind: 'closed' }, reason, tagged);
  // A file tag looks like a small destination box: the file's glyph and name, with an arrow the way
  // the data goes, and a word above it for appends and devices.
  const tagBody = ({ device, label, caption, w, x }, y, h = 16) => `<rect class="tag-body node-body" x="${x}" y="${y - h / 2}" width="${w}" height="${h}" rx="4" fill="${palette.inset}" stroke="${palette.border}"/>${glyph(device?.icon ?? 'file', x + 5, y - 5, palette.muted, 10 / 12)}<text x="${x + 19}" y="${y + 3.2}" fill="${palette.text}" font-family="'IBM Plex Mono',monospace" font-size="9">${escape(label)}</text>`
    + `${caption ? `<text x="${x + w / 2}" y="${y - h / 2 - 5}" text-anchor="middle" fill="${palette.muted}" font-size="8.5">${escape(caption)}</text>` : ''}`;
  const verb = dest => dest.mode === 'read' ? 'reads from' : dest.mode === 'append' ? 'appends to' : 'writes to';
  // A line through the given points, with rounded corners.
  const elbow = (points, r = 6) => points.map(([x, y], i) => {
    if (!i) return `M ${x} ${y}`;
    if (i === points.length - 1) return `L ${x} ${y}`;
    const toward = ([tx, ty]) => [x + Math.sign(tx - x) * r, y + Math.sign(ty - y) * r];
    const [before, after] = [toward(points[i - 1]), toward(points[i + 1])];
    return `L ${before[0]} ${before[1]} Q ${x} ${y} ${after[0]} ${after[1]}`;
  }).join(' ');
  const fileTag = (p, fd, planned, inactive, reason, tagged) => {
    const { dest, device, w, x } = planned, y = planned.raised ? planned.y : p.y;
    const color = inactive ? palette.muted : colors[fd], near = fd === 0 ? x + w : x, side = fd === 0 ? -1 : 1, bend = p.x + side * 14;
    // A raised tag is reached by a line that turns up beside the port.
    const points = planned.raised ? [[p.x, p.y], [bend, p.y], [bend, y], [near, y]] : [[p.x, p.y], [near, y]];
    const d = elbow(dest.mode === 'read' ? [...points.reverse().slice(0, -1), [p.x + side * 4, p.y]] : [...points.slice(0, -1), [near - side * 4, y]]);
    const what = `${names[fd]} ${verb(dest)} ${dest.label}.${device ? ` ${dest.label} ${device.about}.` : ''}`;
    paths.push(`<g class="stream-link file-tag${inactive ? ' unused-link' : ''}"${tagged}><title>${escape(`${what} ${reason}`)}</title><path class="link-hit" d="${d}" fill="none" stroke="transparent" stroke-width="16"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${inactive ? 'stroke-dasharray="5 5"' : ''} marker-end="url(#arrow-${inactive ? 'unused' : fd})"/>${tagBody(planned, y)}</g>`);
  };
  // The shared tag for stdout and stderr sits between their ports. Each stream bends towards it and
  // enters side by side, stdout above, so both colours reach the file. The tag is drawn once, after
  // stderr's line, as the destination of both.
  const mergedTag = (p, fd, planned, inactive, reason, tagged) => {
    const { dest, device, x, y } = planned, color = inactive ? palette.muted : colors[fd];
    const s = fd === 1 ? 1 : -1, end = y - s * 3.5, bend = p.x + 14;
    const d = `M ${p.x} ${p.y} H ${bend - 6} Q ${bend} ${p.y} ${bend} ${p.y + s * 6} V ${end - s * 6} Q ${bend} ${end} ${bend + 6} ${end} H ${x - 4}`;
    const what = `${names[fd]} ${verb(dest)} ${dest.label}, as ${names[fd === 1 ? 2 : 1]} does.${device ? ` ${dest.label} ${device.about}.` : ''}`;
    paths.push(`<g class="stream-link${inactive ? ' unused-link' : ''}"${tagged}><title>${escape(`${what} ${reason}`)}</title><path class="link-hit" d="${d}" fill="none" stroke="transparent" stroke-width="12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${inactive ? 'stroke-dasharray="5 5"' : ''} marker-end="url(#arrow-${inactive ? 'unused' : fd})"/></g>`);
    if (fd === 2) paths.push(`<g data-dest="${escape(dest.id)}"><title>${escape(device ? `${dest.label} ${device.about}` : `stdout and stderr both ${verb(dest)} ${dest.label}`)}</title>${tagBody(planned, y, 18)}</g>`);
  };
  // Substitutions not on 0–2 attach to the bottom edge: <(…) on the left, >(…) on the right.
  // A redirect such as 3< <(…) keeps its own number; arguments use Bash's /dev/fd number.
  const bottomFd = sub => {
    const { owner: cmd, endpoint } = sub;
    if ([0, 1, 2].some(f => reaches(cmd.fds[f], endpoint))) return null;
    if (typeof sub.place === 'number' && reaches(cmd.fds[sub.place], endpoint)) return sub.place;
    return cmd.fds[sub.fd] === endpoint ? sub.fd : null;
  };
  const bottomSubs = cmd => cmd.substitutions.filter(sub => sub.kind !== 'job' && bottomFd(sub) !== null);
  // Descriptors above 2 that stay open, other than substitutions, are drawn on their card.
  const extraFds = cmd => Object.keys(cmd.fds).map(Number).filter(fd => fd > 2 && !['procsub', 'closed'].includes(targetsOf(cmd.fds[fd])[0]?.type));
  const leaksPipe = (cmd, fd) => { const dest = targetsOf(cmd.fds[fd])[0]; return dest.type === 'pipe' && dest.commands[dest.from] === cmd; };
  const extraPort = (cmd, fd) => {
    const g = geometry(cmd), k = bottomSubs(cmd).filter(sub => sub.direction === '<').length + extraFds(cmd).filter(f => leaksPipe(cmd, f)).indexOf(fd);
    return { x: g.x + 30 + k * 34, y: g.y + 156 };
  };
  // Files a command opens itself take bottom-edge ports in argument order, left to right, spaced so
  // the tags under them, and any caption beside a line, do not touch. The group is centred on the
  // card, or ends left of the >(…) argument ports, whose curves leave to the right.
  const openSpots = new Map();
  const openPort = (cmd, i) => {
    if (!openSpots.has(cmd)) {
      const g = geometry(cmd), planned = cmd.opens.map((open, j) => fileTags.get(`${cmd.key}:o${j}`));
      const gaps = planned.slice(1).map((t, j) => Math.max(planned[j]?.caption ? 46 : 34, ((planned[j]?.w ?? 0) + (t?.w ?? 0)) / 2 + 10));
      const span = gaps.reduce((a, b) => a + b, 0), subs = bottomSubs(cmd).filter(sub => sub.direction === '>').length;
      let x = subs ? g.x + 110 - subs * 34 - span : g.x + 110 - span / 2;
      openSpots.set(cmd, planned.map((t, j) => ({ x: j ? (x += gaps[j - 1]) : x, y: g.y + 156 })));
    }
    return openSpots.get(cmd)[i];
  };
  const opensReason = (cmd, open) => `${cmd.usage.name} opens ${open.endpoint.label} itself, on a descriptor of its own, and ${open.endpoint.mode === 'append' ? 'appends' : 'writes'} a copy of its input there. This is not stdout, which goes to ${destinationLabel(cmd.fds[1], 1, model.commands, cmd)}.`;
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
        // A raised tag's line climbs just beside the port, so the count moves out past it.
        const count = cmd.fds[fd].targets.length, gap = fileTags.get(here)?.raised ? 20 : 10;
        paths.push(`<text x="${p.x + (fd === 0 ? -gap : gap)}" y="${p.y - 7}" text-anchor="${fd === 0 ? 'end' : 'start'}" fill="${palette.muted}" font-size="8"><title>${escape(destinationLabel(cmd.fds[fd], fd, model.commands, cmd))}</title>zsh ×${count}</text>`);
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
      const fileTagged = fileTags.get(here);
      if (fileTagged?.dest === dest) { (fileTagged.merged ? mergedTag : fileTag)(p, fd, fileTagged, inactive, usage.reason, tag([here], dest)); continue; }
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
          // A pipe from stderr alone is labelled under its curve, clear of whatever stdout ends in above.
          if (fd === 1 || !reaches(cmd.fds[1], dest)) paths.push(`<text class="pipe-label"${tagged} x="${(p.x + q.x) / 2}" y="${fd === 1 ? Math.min(p.y, q.y) - 12 : (p.y + q.y) / 2 + 34}" text-anchor="middle" fill="${palette.muted}" font-size="10"><title>${escape(activity.reason)}</title>${escape(activity.label)}</text>`);
        } else if (cmd.substitution && fd !== 0 && reaches(next.fds[0], dest) && geometry(next).y < geometry(cmd).y) {
          // An inherited pipe: run below the reader's card, then into its stdin.
          const q = port(next, 0), gapY = geometry(next).y + 178;
          paths.push(path(`M ${p.x} ${p.y} H ${p.x + 4} Q ${p.x + 12} ${p.y} ${p.x + 12} ${p.y - 8} V ${gapY + 8} Q ${p.x + 12} ${gapY} ${p.x + 4} ${gapY} H ${q.x - 22} Q ${q.x - 30} ${gapY} ${q.x - 30} ${gapY - 8} V ${q.y + 8} Q ${q.x - 30} ${q.y} ${q.x - 22} ${q.y} H ${q.x - 4}`, fd, false, inactive || activity.notRead, `${usage.reason} ${activity.reason}`, tagged));
        } else stub(p, fd, `pipe ${dest.from + 1}`, inactive, usage.reason, tag([here], dest));
        continue;
      }
      if (grounded(dest)) { ground(p, fd, dest, inactive, usage.reason, tag([here], dest)); continue; }
      if (terminalTags && dest.type === 'closed') { closedTag(p, fd, usage.reason, tag([here], dest)); continue; }
      if (cmd.substitution && dest.id === 'terminal-in') { stub(p, fd, 'terminal', inactive, usage.reason, tag([here], dest)); continue; }
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
  // A second write end of the pipe to the next command, as 3>&1 leaves, gets a port on the card's
  // bottom edge and runs into that command's stdin beside the pipe's own line.
  model.all.forEach(cmd => extraFds(cmd).filter(fd => leaksPipe(cmd, fd)).forEach(fd => {
    const dest = targetsOf(cmd.fds[fd])[0], p = extraPort(cmd, fd), next = dest.commands[dest.to], q = port(next, 0);
    const low = geometry(cmd).y + 170, turn = q.x - 20;
    const reason = `fd ${fd} also writes to the pipe to ${next.usage.name}, so the pipe stays open until ${cmd.usage.name} closes it too. ${portUsage(cmd, fd).reason}`;
    paths.push(path(`M ${p.x} ${p.y} V ${low - 8} Q ${p.x} ${low} ${p.x + 8} ${low} H ${turn - 8} Q ${turn} ${low} ${turn} ${low - 8} V ${q.y + 8} Q ${turn} ${q.y} ${turn + 8} ${q.y} H ${q.x - 4}`, 3, false, false, reason, tag([`${cmd.key}:${fd}`, `${next.key}:0`], dest)));
  }));
  model.all.forEach(cmd => (cmd.opens ?? []).forEach((open, i) => {
    const p = openPort(cmd, i), dest = open.endpoint, reason = opensReason(cmd, open), tagged = tag([`${cmd.key}:o${i}`], dest);
    const planned = fileTags.get(`${cmd.key}:o${i}`);
    if (!planned) {
      laneLinks.push({ input: false, bottom: true, fd: 3, box: positions.get(dest.id), p, upper: p.x, lower: positions.get(dest.id).x + positions.get(dest.id).w / 2, down: true, dashed: false, inactive: false, reason, tagged });
      return;
    }
    const top = p.y + 22, x = p.x - planned.w / 2, d = `M ${p.x} ${p.y} V ${top - 4}`;
    // An append is noted beside the line, as the line comes in from above.
    paths.push(`<g class="stream-link file-tag"${tagged}><title>${escape(reason)}</title><path class="link-hit" d="${d}" fill="none" stroke="transparent" stroke-width="12"/><path d="${d}" fill="none" stroke="${colors[3]}" stroke-width="2" marker-end="url(#arrow-3)"/>${tagBody({ ...planned, x, caption: '' }, top + 8)}${planned.caption ? `<text x="${p.x + 5}" y="${p.y + 14}" fill="${palette.muted}" font-size="8.5">${escape(planned.caption)}</text>` : ''}</g>`);
  }));
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
    if (link.bottom) {
      const s = Math.sign(lower - upper) || 1, turn = Math.abs(lower - upper) > 1;
      const across = turn ? `V ${y - 10} Q ${upper} ${y} ${upper + s * r} ${y} H ${lower - s * r} Q ${lower} ${y} ${lower} ${y + 10} ` : '';
      paths.push(path(`M ${p.x} ${p.y} ${across}V ${box.y - 4}`, link.fd, false, link.inactive, link.reason, link.tagged));
    } else if (link.input) {
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
    const device = ['file', 'null'].includes(dest.type) ? deviceOf(dest) : null;
    const icon = device || dest.type === 'file' ? glyph(device?.icon ?? 'file', p.x + 15, p.y + 12, palette.muted, 16 / 12)
      : `<text x="${p.x + 15}" y="${p.y + 26}" fill="${palette.muted}" font-size="17">${dest.type === 'closed' ? '×' : '▣'}</text>`;
    const subtitle = device ? device[dest.mode === 'read' ? 'read' : 'write'].toUpperCase() : dest.type === 'file' ? dest.mode === 'read' ? 'INPUT FILE' : dest.mode === 'append' ? 'APPEND TO FILE' : 'OUTPUT FILE' : dest.type === 'closed' ? 'DESCRIPTOR CLOSED' : 'TERMINAL';
    return `<g data-dest="${escape(dest.id)}"><title>${escape(device ? `${dest.label} ${device.about}` : dest.label)}</title><rect class="node-body" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="${palette.inset}" stroke="${palette.border}"/>${icon}<text x="${p.x + 39}" y="${p.y + 25}" fill="${palette.text}" font-family="'IBM Plex Mono',monospace" font-size="10">${escape(short(dest.label, 18))}</text><text x="${p.x + 39}" y="${p.y + 43}" fill="${palette.muted}" font-size="9" letter-spacing="1">${subtitle}</text></g>`;
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
    const openPorts = (cmd.opens ?? []).map((open, i) => {
      const p = openPort(cmd, i);
      return `<g data-command="${cmd.key}" data-fd="o${i}" data-usage="possible"><title>${escape(opensReason(cmd, open))}</title>
        <circle class="port-dot" cx="${p.x}" cy="${p.y}" r="4" fill="${palette.text}" stroke="${palette.text}" stroke-width="1.8"/></g>`;
    }).join('');
    const extraPorts = extraFds(cmd).filter(fd => leaksPipe(cmd, fd)).map(fd => {
      const p = extraPort(cmd, fd), usage = portUsage(cmd, fd);
      return `<g data-command="${cmd.key}" data-fd="${fd}" data-usage="${usage.state}"><title>${escape(usage.reason)}</title>
        <text x="${p.x}" y="${p.y - 9}" text-anchor="middle" fill="${palette.muted}" font-size="9">fd ${fd}</text>
        <circle class="port-dot" cx="${p.x}" cy="${p.y}" r="4" fill="${usage.state === 'possible' ? colors[3] : palette.surface}" stroke="${colors[3]}" stroke-width="1.8" ${usage.state === 'unknown' ? 'stroke-dasharray="2 2"' : ''}/></g>`;
    }).join('');
    // The rest are listed in the card's empty lower-left corner, one line each: the descriptor, which
    // way it goes, and where. One the command line used and then closed, as 3>&- does, is listed as
    // closed; one never mentioned is not. Two lines fit above bottom-edge ports and three without;
    // more are counted, and Descriptor details lists them all.
    const listed = Object.keys(cmd.fds).map(Number).filter(fd => fd > 2 && targetsOf(cmd.fds[fd])[0]?.type !== 'procsub' && !leaksPipe(cmd, fd)), room = extraPorts || bottomSubs(cmd).length ? 2 : 3;
    const shown = listed.length > room ? listed.slice(0, room - 1) : listed;
    const extraLines = shown.map((fd, i) => {
      const dest = targetsOf(cmd.fds[fd])[0], ly = y + 115 + i * 13, usage = portUsage(cmd, fd);
      const reads = dest.mode === 'read' || dest.id === 'terminal-in' || dest.type === 'pipe';
      const file = ['file', 'null'].includes(dest.type), icon = file ? deviceOf(dest)?.icon ?? 'file' : null;
      const where = dest.type === 'pipe' ? `pipe ${dest.from + 1}` : dest.type === 'job' ? dest.job.owner.usage.name : String(dest.id).startsWith('terminal') ? 'terminal' : short(dest.label, 13);
      const closed = dest.type === 'closed', lead = `fd ${fd} ${closed ? '×' : reads ? '←' : '→'}`, at = x + 16 + lead.length * 5.1 + 4;
      return `<g data-command="${cmd.key}" data-fd="${fd}" data-usage="${usage.state}"><title>${escape(`fd ${fd}: ${destinationLabel(cmd.fds[fd], fd, model.commands, cmd)}. ${usage.reason}`)}</title><text class="extra-fd" x="${x + 16}" y="${ly}" fill="${palette.muted}" font-family="'IBM Plex Mono',monospace" font-size="8.5">${escape(lead)}</text>${icon ? glyph(icon, at, ly - 7.5, palette.muted, 9 / 12) : ''}<text x="${at + (icon ? 12 : 0)}" y="${ly}" fill="${closed ? palette.muted : palette.text}" font-family="'IBM Plex Mono',monospace" font-size="8.5">${closed ? 'closed' : escape(where)}</text></g>`;
    }).join('') + (listed.length > shown.length ? `<text x="${x + 16}" y="${y + 115 + shown.length * 13}" fill="${palette.muted}" font-size="8.5"><title>Descriptor details lists every descriptor.</title>+${listed.length - shown.length} more</text>` : '');
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
      <text x="${x + 16}" y="${y + 43}" fill="${palette.text}" font-size="12" font-weight="500" font-family="'IBM Plex Mono',monospace">${escape(short(cmd.command, 24))}</text>
      ${ports}${argumentPorts}${openPorts}${extraPorts}${extraLines}${jobPorts}</g>`;
  });
  // With stderr tagged in place, a pipeline often has nothing below its cards; end the drawing there.
  const cardsBottom = 101 + grid.rows * 200 + 156 + 34 + (model.all.some(cmd => cmd.opens?.length && grid.place.get(cmd).row === grid.rows) ? 16 : 0);
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
// Training compares whole pictures, so it never fades parts of them.
const linking = () => highlighting && !training.active;
// The Tags switch draws terminal stdin and stderr, and files one port uses, as tags beside their ports,
// or as routes to shared boxes.
let terminalTags = true;
try { terminalTags = localStorage.getItem('pipeviewer-terminal-tags') !== 'off'; } catch {}
function inspectTargets(model) {
  const portsOf = cmd => Object.keys(cmd.fds).map(fd => `${cmd.key}:${fd}`);
  const list = [];
  for (const cmd of model.all) {
    list.push({ kind: 'command', ref: cmd, span: cmd.span, strong: [cmd.key], context: [], ends: portsOf(cmd), ports: [], dests: [] });
    for (const step of cmd.steps) {
      const ports = step.fds.map(fd => `${cmd.key}:${fd}`);
      list.push({ kind: 'step', ref: step, span: step.span, strong: [], context: [cmd.key], ends: ports, ports, dests: [step.destination.id] });
    }
    // A file the command opens itself lights its bottom-edge port and tag.
    (cmd.opens ?? []).forEach((open, i) => list.push({ kind: 'open', ref: open, span: open.span, strong: [], context: [cmd.key], ends: [`${cmd.key}:o${i}`], ports: [`${cmd.key}:o${i}`], dests: [open.endpoint.id] }));
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
  const live = linking() && svg && editor.value === currentSource;
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

// Sizes are in rem so the drawing, and its text, grows with the viewer's font size. Training crops
// its drawings to what they hold, so it drops the minimum width meant for a full pipeline.
function fit(host, svg) {
  const viewBox = svg.viewBox.baseVal;
  host.style.width = '';
  host.style.minWidth = `${training.active ? viewBox.width * .85 / 16 : Math.max(45, viewBox.width * .85 / 16)}rem`;
  // Substitution rows add height; grow the cap with them so the drawing is not shrunk to fit.
  svg.style.maxHeight = `${30 * viewBox.height / 390}rem`;
  svg.style.minHeight = `${17.8125 * viewBox.height / 390}rem`;
}
// Training crops the target's drawing and the student's to one frame around both, so the two sit
// side by side at one scale and a card in one lines up with the same card in the other.
function frame() {
  const drawings = [$('#diagram svg'), $('#target-diagram svg')].filter(Boolean);
  if (!training.active || !drawings.length) return;
  const boxes = drawings.flatMap(svg => [...svg.children].filter((el, i) => el instanceof SVGGraphicsElement && !(i && el === svg.querySelector(':scope > rect'))).map(el => el.getBBox())).filter(box => box.width);
  if (!boxes.length) return;
  const pad = 18, left = Math.min(...boxes.map(b => b.x)) - pad, top = Math.min(...boxes.map(b => b.y)) - pad;
  const right = Math.max(...boxes.map(b => b.x + b.width)) + pad, bottom = Math.max(...boxes.map(b => b.y + b.height)) + pad;
  for (const svg of drawings) {
    svg.setAttribute('viewBox', `${left} ${top} ${right - left} ${bottom - top}`);
    fit(svg.parentElement, svg);
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
  fit(host, svg);
  frame();
  // Training fits its drawings to their frame, and hides the zoom controls.
  const box = zoom !== 1 && !training.active && svg.getBoundingClientRect();
  if (box?.width) {
    const fitted = Math.min(box.width / viewBox.width, box.height / viewBox.height);
    host.style.width = host.style.minWidth = `${viewBox.width * fitted * zoom}px`;
    svg.style.maxHeight = 'none';
    svg.style.minHeight = '0';
    scroll.scrollLeft = centre * scroll.scrollWidth - scroll.clientWidth / 2;
  }
  markDifferences();
  showKey();
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
  // An empty editor is a blank prompt: no diagram, old or new, and no message.
  if (!$('#pipeline').value.trim()) {
    currentModel = undefined;
    currentSource = $('#pipeline').value;
    targets = [];
    hovered = null;
    for (const id of ['diagram', 'insights', 'notes', 'details', 'command-count', 'redirect-count', 'details-count']) $(`#${id}`).innerHTML = '';
    $('#error').hidden = true;
    $('#results').classList.remove('stale');
    $('#results').classList.add('empty');
    showExamples();
    showVariations();
    showRedirectStyle();
    training.differences = null;
    showTraining();
    return;
  }
  try {
    currentModel = parsePipeline($('#pipeline').value, { platform });
    currentSource = $('#pipeline').value;
    targets = inspectTargets(currentModel);
    hovered = null;
    training.differences = training.active && training.model ? compare(training.model, currentModel) : null;
    $('#error').hidden = true;
    $('#results').classList.remove('stale', 'empty');
    const jobCount = currentModel.all.filter(cmd => cmd.substitution?.kind === 'job').length;
    const subCount = currentModel.all.length - currentModel.commands.length - jobCount;
    const lists = currentModel.pipelines.length;
    $('#command-count').textContent = `${lists > 1 ? `${lists} pipelines · ` : ''}${currentModel.commands.length} command${currentModel.commands.length === 1 ? '' : 's'}${subCount ? ` + ${subCount} in substitutions` : ''}${jobCount ? ` + ${jobCount} in jobs` : ''}`;
    showDiagram();
    const redirects = currentModel.all.reduce((total, cmd) => total + cmd.steps.length, 0);
    $('#redirect-count').textContent = `${redirects} redirect${redirects === 1 ? '' : 's'} applied`;
    $('#details').innerHTML = detailOrder(currentModel).map(cmd => `<article class="detail-card${cmd.substitution ? ' substitution-card' : ''}"><div class="detail-title"><span class="detail-label">${cmd.substitution?.kind === 'job' ? `IN EACH JOB · ${cmd.index + 1}` : `${cmd.substitution ? 'SUBSTITUTION' : 'COMMAND'} ${cmd.key}`}</span><code title="${escape(cmd.command)}">${escape(cmd.command)}</code></div>${cmd.substitution?.kind === 'job' ? `<p class="detail-context">In <code>${escape(cmd.substitution.text)}</code>, run by <code>${escape(cmd.substitution.owner.usage.name)}</code> once per ${cmd.substitution.tool === 'xargs' ? 'item' : 'argument'}</p>` : cmd.substitution ? `<p class="detail-context">In <code>${escape(cmd.substitution.text)}</code>, started by <code>${escape(cmd.substitution.owner.command)}</code></p>` : ''}${Object.entries(cmd.fds).map(([fd, dest]) => `<div class="fd-row fd-${fd}"><span class="fd-badge">${fd}</span><span>${names[fd] || 'fd ' + fd}</span><span class="right-arrow">→</span><span class="destination">${destinationMarkup(dest, Number(fd), currentModel.commands, cmd)}${usageMarkup(cmd, Number(fd))}</span></div>`).join('')}${(cmd.opens ?? []).map(open => `<p class="detail-context">${escape(cmd.usage.name)} also ${open.endpoint.mode === 'append' ? 'appends' : 'writes'} to <code>${escape(open.endpoint.label)}</code>, which it opens itself.</p>`).join('')}${cmd.steps.length ? `<details class="steps"><summary>${cmd.steps.length} redirect${cmd.steps.length === 1 ? '' : 's'}, applied left to right</summary><ol>${cmd.steps.map(step => `<li><code>${escape(step.text)}</code><br>${escape(step.description)}</li>`).join('')}</ol></details>` : ''}</article>`).join('');
    $('#details-count').textContent = `${currentModel.all.length} card${currentModel.all.length === 1 ? '' : 's'}`;
    $('#insights').innerHTML = multioInsights(currentModel) + listInsights(currentModel) + currentModel.pipelines.map(usageInsights).join('') + substitutionInsights(currentModel);
    $('#notes').innerHTML = currentModel.notes.map(note => `<div class="note">${escape(note)}</div>`).join('');
    showExamples();
    // Keep the chosen example visible in the scrolling strip.
    const chosen = $('#example-strip .active');
    if (chosen) { const strip = $('#example-strip'); if (chosen.offsetLeft < strip.scrollLeft || chosen.offsetLeft + chosen.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = chosen.offsetLeft - strip.clientWidth / 2 + chosen.offsetWidth / 2; }
    showVariations();
    showRedirectStyle();
    showTraining();
  } catch (error) {
    // Half-typed pipelines rarely parse, so keep the last diagram and say what is missing.
    $('#error').textContent = error.message;
    $('#error').hidden = false;
    $('#results').classList.add('stale');
    $('#results').classList.toggle('empty', !currentModel);
    // A half-typed command matches nothing, even when the faded diagram above it did.
    training.differences = null;
    showTraining();
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
try { followsSystemTheme = !['light', 'dark', 'terminal'].includes(localStorage.getItem('pipeviewer-theme')); } catch {}
// The theme button shows the current theme and steps to the next in this order.
const nextTheme = { light: 'dark', dark: 'terminal', terminal: 'light' };
const themeNames = { light: 'Light', dark: 'Dark', terminal: 'Terminal' };

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const next = `Switch to ${themeNames[nextTheme[theme]].toLowerCase()} theme`;
  $('#theme-toggle').dataset.current = theme;
  $('#theme-label').textContent = themeNames[theme];
  $('#theme-toggle').setAttribute('aria-label', `${themeNames[theme]} theme. ${next}`);
  $('#theme-toggle').title = next;
  $('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--page').trim();
  // Recolour the existing diagram without submitting edits or closing details.
  if (currentModel) showDiagram();
  showTarget();
}

$('#theme-toggle').addEventListener('click', () => {
  const theme = nextTheme[document.documentElement.dataset.theme] ?? 'dark';
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
  $('#shell-name').textContent = platform === 'macos' ? 'zsh' : 'bash';
  document.documentElement.dataset.platform = platform;
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
  // Training compares against the target as the chosen shell runs it.
  showTarget();
  render();
});
showPlatform();
requestAnimationFrame(() => requestAnimationFrame(() => $('#platform').classList.add('ready')));
// The switch's buttons show only while the pipeline has a redirect they would rewrite.
function showRedirectStyle() {
  const source = $('#pipeline').value;
  $('#redirect-style').classList.toggle('idle', restyle(source, 'explicit', { platform }) === restyle(source, 'common', { platform }));
  $('#redirect-style').querySelectorAll('button').forEach(button => {
    const active = button.dataset.style === redirectStyle;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  slide($('#redirect-style'));
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
  if (!linking()) return;
  const element = event.target.closest(hoverable);
  const target = element && currentSource === $('#pipeline').value ? targetFor(element) : null;
  if (target === hovered) return;
  hovered = target;
  inspect();
});
$('#diagram').addEventListener('pointerleave', () => { hovered = null; inspect(); });
// A click selects the text, so the caret inspector carries on from there.
$('#diagram').addEventListener('click', event => {
  if (!linking()) return;
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
// Clicking the chosen example again turns it off, which clears the editor back to an empty prompt.
function loadExample(key) {
  const chosen = exampleSources(key).includes(currentSource);
  $('#pipeline').value = chosen ? '' : exampleSources(key)[0];
  fitEditor();
  render();
  if (chosen) $('#pipeline').focus();
}
$('#variations').addEventListener('click', event => {
  const button = event.target.closest('[data-variation]');
  if (!button) return;
  const [key, i] = button.dataset.variation.split(':');
  $('#pipeline').value = styled(spelling(variations[key][Number(i)]));
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
// Each reference entry opens, one at a time, to explain more. Its commands can be drawn in the
// viewer with a click, except in training, where the editor belongs to the level.
const moreMarkup = text => text.split(/\n{2,}/).map(block => {
  if (block.startsWith('```')) {
    const source = block.replace(/^```\n?|\n?```$/g, '');
    return `<div class="ref-code" data-source="${escape(source)}"><pre>${escape(source)}</pre><button type="button" class="ref-try" title="Draw this" aria-label="Draw this in the viewer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg></button></div>`;
  }
  return block.startsWith('# ') ? `<h3>${prose(block.slice(2))}</h3>` : `<p>${prose(block)}</p>`;
}).join('');
$('#ref-entries').innerHTML = reference.map(entry => `<details class="ref-entry" name="reference"><summary><code class="ref-syntax">${escape(entry.syntax)}</code><span>${prose(entry.summary)}</span></summary><div class="ref-more">${moreMarkup(entry.more)}</div></details>`).join('');
$('#ref-entries').addEventListener('click', event => {
  const block = event.target.closest('.ref-code');
  // A drag to select the text, to copy it, isn't a click to draw it.
  if (!block || training.active || (!event.target.closest('.ref-try') && getSelection().toString())) return;
  $('#reference').close();
  $('#pipeline').value = block.dataset.source;
  fitEditor();
  render();
  $('#pipeline').focus();
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
  $('#switch-status').textContent = `Highlighting ${highlighting ? 'on' : 'off'}`;
  inspect(true);
});
showHighlighting();
function showTerminalTags() {
  $('#tags-toggle').setAttribute('aria-checked', terminalTags);
  showKey();
}
// The key under the diagram lists only what the drawing holds: no closed tag without a closed
// descriptor, and only the terminal streams that end in a tag.
function showKey() {
  const svg = $('#diagram svg'), has = selector => !!svg?.querySelector(selector);
  $('#connected-key').hidden = !has('.stream-link:not(.unused-link)');
  $('#unused-key').hidden = !has('.unused-link');
  const streams = ['terminal-in', 'terminal-out', 'terminal-err'].map(id => terminalTags && has(`[data-key="${id}"]`));
  $('#tags-key').querySelectorAll('.ground-sample').forEach((sample, i) => { sample.hidden = !streams[i]; });
  const words = ['input', 'output', 'errors'].filter((_, i) => streams[i]);
  $('#tags-key-text').textContent = `the terminal’s ${words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]}`;
  $('#tags-key').hidden = !words.length;
  $('#closed-key').hidden = !terminalTags || !has('[data-key="closed"]');
  $('#file-key').hidden = !terminalTags || !has('.tag-body');
}
$('#tags-toggle').addEventListener('click', event => {
  terminalTags = !terminalTags;
  try { localStorage.setItem('pipeviewer-terminal-tags', terminalTags ? 'on' : 'off'); } catch {}
  showTerminalTags();
  replay(event.currentTarget, 'just-toggled');
  $('#switch-status').textContent = `Tags ${terminalTags ? 'on' : 'off'}`;
  if (currentModel) { showDiagram(); replay($('#diagram'), 'redrawn'); }
  if (training.active) { showTarget(); replay($('#target-diagram'), 'redrawn'); }
});
showTerminalTags();
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
  if (!$('#diagram svg')) return;
  // Export without on-page sizing so the file scales to wherever it is opened.
  const copy = $('#diagram svg').cloneNode(true);
  copy.removeAttribute('style');
  copy.querySelectorAll('.diff-ring').forEach(ring => ring.remove());
  copy.classList.remove('flowing');
  const svg = copy.outerHTML;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'pipeline.svg'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
// Training: each level shows the picture of a command the student cannot see, and they edit their
// own command until its picture matches. Their diagram is the usual one under the editor; the
// target's is drawn above the editor, or beside theirs on wide screens. Best stars per level are
// kept under the level's id.
let progress = {};
try { progress = JSON.parse(localStorage.getItem('pipeviewer-training')) ?? {}; } catch {}
const lessonStart = i => lessons[i].start ?? lessons[i - 1].target;
// Levels are numbered from 0, as descriptors are; a level's button can show a label instead.
const levelName = i => lessons[i].label ?? String(i);
const star = filled => `<svg class="star${filled ? ' filled' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17l-5.38 2.85 1.03-6L3.3 9.6l6-.9z"/></svg>`;
const stars = n => [0, 1, 2].map(i => star(i < n)).join('');
const cheers = ['Nailed it.', 'Spot on.', 'Clean pipes.', 'Exactly right.', 'Plumbing works.'];

// The target gets ids of its own, so arrowheads and titles in one drawing never resolve to the other.
function showTarget() {
  if (!training.active) return;
  const host = $('#target-diagram');
  try { training.model = parsePipeline(lessons[training.level].target, { platform }); } catch (error) { training.model = null; host.textContent = error.message; return; }
  host.innerHTML = diagram(training.model).replace(/\b(svg-title|svg-desc)\b/g, 'target-$1').replace(/(id="|url\(#)arrow-/g, '$1target-arrow-');
  fit(host, host.querySelector('svg'));
  frame();
  markDifferences();
}

// A ring marks each port whose stream goes somewhere else in the target, in both drawings, and a
// dashed outline each card whose words differ. Matching drawings set their streams flowing.
function markDifferences() {
  for (const svg of [$('#diagram svg'), $('#target-diagram svg')]) {
    if (!svg) continue;
    svg.querySelectorAll('.diff-ring').forEach(ring => ring.remove());
    svg.querySelectorAll('.diff-card').forEach(card => card.classList.remove('diff-card'));
    svg.classList.toggle('flowing', training.active && training.matched);
    if (!training.active) continue;
    for (const difference of training.differences ?? []) {
      if (difference.kind === 'stream') {
        const dot = svg.querySelector(`[data-command="${difference.key}"][data-fd="${difference.fd}"] .port-dot`);
        dot?.insertAdjacentHTML('afterend', `<circle class="diff-ring" cx="${dot.getAttribute('cx')}" cy="${dot.getAttribute('cy')}" r="10" fill="none"/>`);
      } else if (difference.kind !== 'shape') svg.querySelector(`[data-card="${difference.key}"]`)?.classList.add('diff-card');
    }
  }
}

// Level 0 is never opened for the student. Until they've solved it, its button is tinted stdin's
// green, and it pulses each time they look stuck: a hint taken, a level restarted, or a level
// left unmatched for a while. It then keeps a green outline until they solve a level unaided.
const n00bIndex = lessons.findIndex(lesson => lesson.intro);
const n00bDone = () => !!progress[lessons[n00bIndex].id];
let nudgeTimer = 0;
function nudge() {
  if (n00bDone() || !training.active || training.matched || training.level === n00bIndex || tourStep >= 0) return;
  training.nudge = true;
  showLevels();
  replay($(`#levels [data-level="${n00bIndex}"]`), 'pulse');
}
// The timer counts only while the student can see the level, not while the tour covers it.
function nudgeLater() {
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => tourStep >= 0 ? nudgeLater() : nudge(), 40000);
}

let levelsMarkup = '';
function showLevels() {
  const markup = lessons.map((lesson, i) => {
    const earned = progress[lesson.id] ?? 0, active = i === training.level;
    const classes = [active && 'active', lesson.intro && !n00bDone() && 'fresh', lesson.intro && training.nudge && 'nudge'].filter(Boolean).join(' ');
    return `<button type="button" data-level="${i}" aria-pressed="${active}"${classes ? ` class="${classes}"` : ''} title="Level ${i}: ${escape(lesson.title)}${earned ? ` · ${earned} of 3 stars` : ''}"><span class="level-number${lessons[i].label ? ' level-label' : ''}">${escape(levelName(i))}</span><span class="level-stars${earned ? '' : ' unearned'}">${stars(earned)}</span></button>`;
  }).join('');
  // The buttons are rebuilt only when they change, so a pulse isn't restarted on every keystroke,
  // and around the thumb, which stays so it can slide to the new level.
  if (markup !== levelsMarkup) {
    levelsMarkup = markup;
    $('#levels').querySelectorAll(':scope > button').forEach(button => button.remove());
    $('#levels').insertAdjacentHTML('beforeend', markup);
    slide($('#levels'));
  }
  const total = lessons.reduce((sum, lesson) => sum + (progress[lesson.id] ?? 0), 0);
  $('#star-total').innerHTML = `${star(true)}<span>${total}<span class="star-of"> / ${lessons.length * 3}</span></span><span class="sr-only"> stars</span>`;
}

// The stars still on offer, and which hints are showing.
function showHints() {
  $('#worth').innerHTML = `<span class="worth-label" aria-hidden="true">worth</span>${stars(starsFor(training.hints.length))}<span class="sr-only">Worth ${starsFor(training.hints.length)} star${starsFor(training.hints.length) === 1 ? '' : 's'}</span>`;
  $('#hint-buttons').querySelectorAll('[data-hint]').forEach(button => {
    const shown = training.hints.includes(Number(button.dataset.hint));
    button.classList.toggle('active', shown);
    button.setAttribute('aria-pressed', shown);
    button.disabled = training.matched;
  });
}

function differenceMarkup(difference) {
  if (difference.kind === 'shape') return `<li class="diff-shape">${escape(difference.text)}</li>`;
  if (difference.kind === 'command') return `<li><span class="fd-badge">card</span><span>Card ${escape(difference.key)}</span><span>Yours: <code>${escape(difference.yours)}</code></span><span>Target: <code>${escape(difference.target)}</code></span></li>`;
  if (difference.kind === 'opens') return `<li><span class="fd-badge">${escape(difference.command)}</span><span>opens</span><span>Yours: <strong>${escape(difference.yours)}</strong></span><span>Target: <strong>${escape(difference.target)}</strong></span></li>`;
  const arrow = difference.fd === 0 ? '←' : '→';
  return `<li class="fd-${difference.fd}"><span class="fd-badge">${difference.fd}</span><span>${escape(difference.name)} ${arrow}</span><span>Yours: <strong>${escape(difference.yours)}</strong></span><span>Target: <strong>${escape(difference.target)}</strong></span></li>`;
}

// The coach, under the brief, holds the hints taken so far, or the result once the pictures match.
// Its frame is rebuilt only when that changes, so its animations do not restart on every keystroke.
function showCoach() {
  const lesson = lessons[training.level], coach = $('#coach'), source = $('#pipeline').value.trim();
  const key = training.matched ? `solved:${training.level}` : `hints:${training.level}:${training.hints.join(',')}`;
  if (key !== training.coach) {
    training.coach = key;
    if (training.matched) {
      const last = training.level === lessons.length - 1, total = lessons.reduce((sum, l) => sum + (progress[l.id] ?? 0), 0);
      // Stream numbers burst out of the stars in their stream's colour, once, when the level is solved.
      const sparks = training.burst ? Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * 2 * Math.PI, reach = 46 + (i * 37 % 30);
        return `<span class="spark fd-${i % 3}" style="--dx: ${(Math.cos(angle) * reach * 1.6).toFixed(1)}px; --dy: ${(Math.sin(angle) * reach - 8).toFixed(1)}px; --delay: ${(i % 5) * 0.03}s" aria-hidden="true">${i % 3}</span>`;
      }).join('') : '';
      training.burst = false;
      const next = last
        ? `<p class="solved-finale">That’s every level so far: <strong>${total} of ${lessons.length * 3}</strong> stars.${total < lessons.length * 3 ? ' Replay a level to earn the rest.' : ' A perfect run!'}</p><div class="solved-actions"><button type="button" class="next-button" data-coach="viewer">Back to the viewer</button><button type="button" class="text-button" data-coach="replay">Start again from level 1</button></div>`
        : `<div class="solved-actions"><button type="button" class="next-button" data-coach="next">Level ${training.level + 1}: ${escape(lessons[training.level + 1].title)} <span aria-hidden="true">→</span></button><span class="key-hint">or press <kbd>Enter</kbd></span></div>`;
      coach.innerHTML = `<div class="solved"><div class="solved-stars" role="img" aria-label="${training.earned} of 3 stars">${stars(training.earned)}${sparks}</div><div class="solved-body"><p class="solved-title"><strong>${cheers[training.level % cheers.length]}</strong> Level ${training.level} solved.</p><p>${prose(lesson.learned)}</p><p class="solved-spelling" id="solved-spelling"></p>${next}</div></div>`;
    } else {
      const parts = [
        `<div class="hint"><span class="row-label">WHAT’S DIFFERENT</span><ul class="diff-list" id="diff-list"></ul></div>`,
        `<div class="hint"><span class="row-label">HOW</span><p>${prose(lesson.how)}</p></div>`,
        `<div class="hint"><span class="row-label">ANSWER</span><p><code class="answer">${escape(lesson.target)}</code> <span class="answer-note">Type it in to see the pictures match.</span></p></div>`,
      ];
      coach.innerHTML = training.hints.length ? `<div class="hints">${training.hints.map(n => parts[n - 1]).join('')}</div>` : '';
    }
  }
  // The parts that follow the editor update in place.
  const spelling = $('#solved-spelling');
  if (spelling) {
    const same = source.replace(/\s+/g, ' ') === lesson.target;
    spelling.innerHTML = same ? '' : `You wrote <code>${escape(source)}</code>. The target was written <code>${escape(lesson.target)}</code>, which draws the same picture.`;
  }
  const list = $('#diff-list');
  if (list) list.innerHTML = training.differences ? training.differences.map(differenceMarkup).join('') : `<li class="diff-shape">${source ? 'Finish the command to compare it with the target.' : 'Type a command to compare it with the target.'}</li>`;
}

// Called after each render: compare, mark the drawings, and celebrate a fresh match.
function showTraining() {
  if (!training.active) return;
  const differences = training.differences, matched = !!differences && !differences.length;
  if (matched && !training.matched) {
    const lesson = lessons[training.level];
    training.earned = starsFor(training.hints.length);
    if (!(progress[lesson.id] >= training.earned)) {
      progress[lesson.id] = training.earned;
      try { localStorage.setItem('pipeviewer-training', JSON.stringify(progress)); } catch {}
    }
    training.burst = true;
    if (!training.hints.length) training.nudge = false;
    replay($('.diagram-panel'), 'matched-glow');
  }
  training.matched = matched;
  // Once solved, the target's own command is shown with its picture.
  $('#target-panel .panel-hint').innerHTML = matched ? `<code>${escape(lessons[training.level].target)}</code>` : '';
  const status = $('#match-status');
  status.classList.toggle('matched', matched);
  status.classList.toggle('differs', !!differences?.length);
  status.textContent = matched ? '✓ Matches the target' : differences ? `${differences.length} difference${differences.length === 1 ? '' : 's'}` : $('#pipeline').value.trim() ? 'Keep typing…' : 'Type a command';
  markDifferences();
  showLevels();
  showHints();
  showCoach();
}

// A level with an intro opens on its explainer, unless the student is only starting it over.
function loadLesson(i, { keep = false, intro = true } = {}) {
  const lesson = lessons[i];
  Object.assign(training, { level: i, hints: [], matched: false, coach: '' });
  if (lesson.intro) training.nudge = false;
  clearTimeout(nudgeTimer);
  if (!n00bDone() && !lesson.intro) nudgeLater();
  const title = escape(lesson.title), label = lesson.label && escape(lesson.label);
  $('#lesson-title').innerHTML = `<span class="lesson-number">Level ${i}</span> <span>${label ? title.replace(label, `<span class="lesson-label">${label}</span>`) : title}</span>`;
  $('#lesson-brief').innerHTML = prose(lesson.brief);
  history.replaceState(null, '', `#training/${i}`);
  showTarget();
  // Moving on from a solved level keeps the student's own spelling, which the next level starts from.
  if (!(keep && lesson.start === undefined)) $('#pipeline').value = lessonStart(i);
  fitEditor();
  render();
  if (lesson.intro && intro) return showSlide(0);
  closeIntro();
  const editor = $('#pipeline');
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(editor.value.length, editor.value.length);
}

// The n00b explainer takes the place of the exercise: one idea per slide, each with an example and
// its moving picture, then the exercise.
const ideaProse = text => prose(text).replace(/\b(stdin|stdout|stderr)\b(?![^<]*<\/code>)/g, (word, name) => `<b class="stream-word fd-${['stdin', 'stdout', 'stderr'].indexOf(name)}">${word}</b>`);
function showSlide(n) {
  const slide = slides[n], last = n === slides.length - 1;
  training.slide = n;
  document.documentElement.classList.add('explaining');
  $('#intro').hidden = false;
  $('#intro-count').textContent = `${n + 1} of ${slides.length}`;
  $('#intro-slide').innerHTML = `<div class="intro-text"><h3>${escape(slide.title)}</h3><p>${ideaProse(slide.text)}</p>`
    + (slide.quote ? `<blockquote><p>“${escape(slide.quote)}”</p><footer>${escape(slide.by)}</footer></blockquote>` : '')
    + `<div class="intro-example"><code>$ ${escape(slide.example.command)}</code><p>${ideaProse(slide.example.note)}</p></div></div>`
    + `<div class="intro-figure">${slide.picture()}</div>`;
  $('#intro-dots').innerHTML = slides.map((_, i) => `<i${i === n ? ' class="on"' : ''}></i>`).join('');
  $('#intro-back').hidden = !n;
  $('#intro-next').innerHTML = last ? 'Your turn <span aria-hidden="true">→</span>' : 'Next';
  $('#intro-skip').hidden = last;
  $('#intro-next').focus({ preventScroll: true });
}

function closeIntro() {
  training.slide = -1;
  document.documentElement.classList.remove('explaining');
  $('#intro').hidden = true;
  $('#intro-slide').innerHTML = '';
}

// Leaving the explainer starts the exercise, and the tour of the training screen if it hasn't run.
function startExercise() {
  transition(() => loadLesson(training.level, { keep: true, intro: false })).then(() => { if (!toured()) startTour(); });
}
$('#intro-next').addEventListener('click', () => training.slide === slides.length - 1 ? startExercise() : showSlide(training.slide + 1));
$('#intro-back').addEventListener('click', () => showSlide(Math.max(0, training.slide - 1)));
$('#intro-skip').addEventListener('click', startExercise);
document.addEventListener('keydown', event => {
  if (training.slide < 0 || tourStep >= 0 || event.target.closest?.('textarea, input')) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); $('#intro-next').click(); }
  else if (event.key === 'ArrowLeft' && training.slide) { event.preventDefault(); showSlide(training.slide - 1); }
});

// Training opens at the first unsolved level after level 0, which the student finds for themselves.
const firstUnsolved = () => {
  const i = lessons.findIndex(lesson => !lesson.intro && !progress[lesson.id]);
  return i < 0 ? 1 : i;
};
function enterTraining(level = firstUnsolved()) {
  if (!training.active) training.viewer = $('#pipeline').value;
  training.active = true;
  document.documentElement.classList.add('training');
  $('#training').hidden = $('#target-panel').hidden = false;
  $('.example-rows').hidden = true;
  $('#training-button').setAttribute('aria-pressed', 'true');
  loadLesson(Math.min(level, lessons.length - 1));
}

function exitTraining() {
  if (tourStep >= 0) { tourStep = -1; $('#tour').hidden = true; $('#tour').classList.remove('open'); cancelAnimationFrame(tourFrame); }
  Object.assign(training, { active: false, model: null, differences: null, matched: false, coach: '' });
  closeIntro();
  clearTimeout(nudgeTimer);
  document.documentElement.classList.remove('training');
  $('#training').hidden = $('#target-panel').hidden = true;
  $('.example-rows').hidden = false;
  slideAll();
  $('#training-button').setAttribute('aria-pressed', 'false');
  $('#target-diagram').innerHTML = '';
  history.replaceState(null, '', location.pathname + location.search);
  $('#pipeline').value = training.viewer;
  fitEditor();
  render();
  $('#pipeline').focus({ preventScroll: true });
}

const nextLevel = () => { if (training.level < lessons.length - 1) loadLesson(training.level + 1, { keep: true }); };
// Training opens and closes with a crossfade where the browser has view transitions. The tour runs
// once the new page has faded in, the first time training opens.
const transition = change => document.startViewTransition ? document.startViewTransition(change).finished.catch(() => {}) : Promise.resolve(change());
const openTraining = level => transition(() => enterTraining(level)).then(() => { if (!toured() && training.slide < 0) startTour(); });
$('#training-button').addEventListener('click', () => training.active ? transition(exitTraining) : openTraining());
$('#exit-training').addEventListener('click', () => transition(exitTraining));
$('#levels').addEventListener('click', event => {
  const button = event.target.closest('[data-level]');
  if (button) loadLesson(Number(button.dataset.level));
});
$('#hint-buttons').addEventListener('click', event => {
  const button = event.target.closest('[data-hint]');
  const hint = Number(button?.dataset.hint);
  if (!button || training.matched || training.hints.includes(hint)) return;
  training.hints = [...training.hints, hint].sort();
  nudge();
  showTraining();
});
$('#restart').addEventListener('click', () => { loadLesson(training.level, { intro: false }); nudge(); });
$('#coach').addEventListener('click', event => {
  const action = event.target.closest('[data-coach]')?.dataset.coach;
  if (action === 'next') nextLevel();
  if (action === 'replay') loadLesson(1);
  if (action === 'viewer') exitTraining();
});
// Once the pictures match, Enter moves on rather than starting a new line.
$('#pipeline').addEventListener('keydown', event => {
  if (training.active && training.matched && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    nextLevel();
  }
});
// #training opens training at the first unsolved level, and #training/2 at level 2, so a link can
// send a colleague straight there.
const trainingLink = () => /^#training(?:\/(\d+))?$/.exec(location.hash);
addEventListener('hashchange', () => {
  const link = trainingLink();
  if (link) openTraining(link[1] ? Number(link[1]) : undefined);
  else if (training.active) exitTraining();
});
// The tour walks a first-time student through the training screen: everything dims but one part,
// which a spotlight picks out while a card beside it explains it. The spotlight glides from part to
// part and follows it while the page scrolls.
const tourSteps = [
  { at: '#training', title: 'Training mode engaged', text: () => `Each level shows a picture. Your job is to write the command that draws it. There are ${lessons.length} levels, each worth up to three stars.` },
  { at: '.editor-panel', title: 'Your command', text: () => `This is where you type. We’ve started you off with <code>${escape($('#pipeline').value.trim())}</code>.` },
  { at: '#results > .diagram-panel', title: 'Your picture', text: () => 'This draws your command, and redraws it as you type. If the picture makes no sense whatsoever then best to start on the <button type="button" class="tour-link lesson-label" data-n00b>n00b</button> level.' },
  { at: '#target-panel', title: 'Your goal', text: () => {
    const streams = training.differences?.filter(d => d.kind === 'stream') ?? [], first = streams[0];
    // A file is named without "(overwrite)", the usual way to open one for writing.
    const spot = first ? `, i.e., ${['input from', 'output to', 'errors to'][first.fd] ?? `fd ${first.fd} to`} ${escape(first.target.replace(/ \(overwrite\)$/, ''))}` : '';
    const rings = streams.length ? ` The ring${streams.length === 1 ? ' shows' : 's show'} where your command differs.` : '';
    return `Change your command until it looks like this${spot}.${rings}`;
  } },
  { at: '#hint-buttons', title: 'Stuck?', text: () => 'Hints are here. A level is worth three stars, and each hint costs one.' },
];
let tourStep = -1, tourFrame = 0;
const toured = () => { try { return localStorage.getItem('pipeviewer-tour') === 'done'; } catch { return true; } };

function showTourStep(n) {
  tourStep = n;
  const step = tourSteps[n], last = n === tourSteps.length - 1;
  $('#tour-count').textContent = `${n + 1} of ${tourSteps.length}`;
  $('#tour-title').textContent = step.title;
  $('#tour-text').innerHTML = step.text();
  $('#tour-back').hidden = !n;
  $('#tour-next').textContent = last ? 'Let’s go' : 'Next';
  $('#tour-card').classList.remove('arrived');
  void $('#tour-card').offsetWidth;
  $('#tour-card').classList.add('arrived');
  $(step.at).scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('#tour-next').focus({ preventScroll: true });
}

// Each frame puts the spotlight over the step's part and the card below it, or above it when the
// window has no room below.
function placeTour() {
  if (tourStep < 0) return;
  const spot = $(tourSteps[tourStep].at).getBoundingClientRect(), card = $('#tour-card'), pad = 8, gap = 14;
  const box = { left: spot.left - pad, top: spot.top - pad, width: spot.width + pad * 2, height: spot.height + pad * 2 };
  Object.assign($('#tour-spot').style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  const { offsetWidth: w, offsetHeight: h } = card;
  const below = box.top + box.height + gap, above = box.top - gap - h;
  const top = below + h < innerHeight - 8 || above < 8 ? Math.min(below, innerHeight - h - 8) : above;
  const left = Math.min(Math.max(8, box.left), innerWidth - w - 8);
  Object.assign(card.style, { left: `${left}px`, top: `${Math.max(8, top)}px` });
  tourFrame = requestAnimationFrame(placeTour);
}

function startTour() {
  if (!training.active) return;
  $('#tour').hidden = false;
  requestAnimationFrame(() => $('#tour').classList.add('open'));
  showTourStep(0);
  cancelAnimationFrame(tourFrame);
  placeTour();
}

function endTour() {
  if (tourStep < 0) return;
  tourStep = -1;
  try { localStorage.setItem('pipeviewer-tour', 'done'); } catch {}
  $('#tour').classList.remove('open');
  setTimeout(() => { if (tourStep < 0) { $('#tour').hidden = true; cancelAnimationFrame(tourFrame); } }, 300);
  const editor = $('#pipeline');
  editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(editor.value.length, editor.value.length);
}

const tourNext = () => tourStep === tourSteps.length - 1 ? endTour() : showTourStep(tourStep + 1);
$('#tour-next').addEventListener('click', tourNext);
$('#tour-back').addEventListener('click', () => showTourStep(Math.max(0, tourStep - 1)));
$('#tour-skip').addEventListener('click', endTour);
$('#tour-text').addEventListener('click', event => {
  if (!event.target.closest('[data-n00b]')) return;
  endTour();
  transition(() => loadLesson(n00bIndex)).then(() => $('#training').scrollIntoView({ block: 'start', behavior: 'smooth' }));
});
$('#tour-button').addEventListener('click', startTour);
document.addEventListener('keydown', event => {
  if (tourStep < 0) return;
  if (event.key === 'Escape') { event.preventDefault(); endTour(); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); tourNext(); }
  else if (event.key === 'ArrowLeft' && tourStep) { event.preventDefault(); showTourStep(tourStep - 1); }
  // Focus stays on the card's buttons while the rest of the page is dimmed.
  else if (event.key === 'Tab' && !$('#tour-card').contains(document.activeElement)) { event.preventDefault(); $('#tour-next').focus(); }
});
fitEditor();
// Wrapping changes once the web font loads or the window resizes.
document.fonts?.ready.then(() => { fitEditor(); slideAll(); });
addEventListener('resize', () => { fitEditor(); slideAll(); });
render();
if (trainingLink()) openTraining(trainingLink()[1] ? Number(trainingLink()[1]) : undefined);
