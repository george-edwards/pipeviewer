import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline } from '../parser.js';
import { pipeActivity, portUsage } from '../usage.js';

test('sleep to echo remains connected but neither end uses the pipe', () => {
  const model = parsePipeline('sleep 2 | echo "hello, world"');
  const [sleep, echo] = model.commands;
  assert.equal(sleep.fds[1], echo.fds[0]);
  assert.equal(sleep.usage.fds[0].state, 'unused');
  assert.equal(sleep.usage.fds[1].state, 'unused');
  assert.equal(echo.usage.fds[0].state, 'unused');
  assert.equal(echo.usage.fds[1].state, 'possible');
  const activity = pipeActivity(model.commands, model.pipes[0]);
  assert.equal(activity.noWrites, true);
  assert.equal(activity.notRead, true);
  assert.equal(activity.label, 'pipe · no writes');
});

test('cat can read and wait for EOF even if its producer writes nothing', () => {
  const model = parsePipeline('sleep .2 | cat');
  assert.equal(portUsage(model.commands[1], 0).state, 'possible');
  const activity = pipeActivity(model.commands, model.pipes[0]);
  assert.equal(activity.noWrites, true);
  assert.equal(activity.notRead, false);
});

test('ignored input never implies the producer writes zero bytes', () => {
  const model = parsePipeline('echo data | echo result');
  const activity = pipeActivity(model.commands, model.pipes[0]);
  assert.equal(activity.noWrites, false);
  assert.equal(activity.notRead, true);
  assert.equal(activity.label, 'pipe · not read');
});

test('sleep help, version, missing, invalid and dynamic arguments are not silent delays', () => {
  for (const source of ['sleep --help', 'sleep --version', 'sleep', 'sleep invalid', 'sleep "$DURATION"', 'sleep -1', 'sleep 2 --help']) {
    assert.notEqual(parsePipeline(source).commands[0].usage.fds[1].state, 'unused', source);
  }
  for (const source of ['sleep 2', 'sleep .5', 'sleep 1m 2s', 'sleep -- 2']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[1].state, 'unused', source);
  }
});

test('merging possible diagnostics prevents a no-writes claim', () => {
  for (const source of ['sleep 2 |& echo hello', 'sleep 2 2>&1 | echo hello']) {
    const model = parsePipeline(source);
    assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, false, source);
  }
});

test('redirect order preserves usage of the descriptor copied to a pipe', () => {
  const model = parsePipeline('sleep 2 2>&1 > output | echo hello');
  assert.equal(model.commands[0].fds[2], model.commands[1].fds[0]);
  assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, false);
  const silent = parsePipeline('sleep 2 2>/dev/null |& echo hello');
  assert.equal(pipeActivity(silent.commands, silent.pipes[0]).noWrites, false);
});

test('cat file arguments and explicit stdin operands affect only stdin usage', () => {
  for (const source of ['cat', 'cat -n', 'cat -', 'cat file -', 'cat -- -']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'possible', source);
  }
  for (const source of ['cat input.txt', 'cat -n input.txt', 'cat -- -filename', 'cat "two words"', 'cat --help']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  for (const source of ['cat "$FILE"', 'cat *.txt', 'cat --unknown', 'cat /dev/stdin', 'cat /proc/self/fd/0']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unknown', source);
  }
});

test('unknown commands and wrappers are not guessed from their names', () => {
  for (const source of ['custom', './sleep 2', 'doas echo hello', '"$COMMAND" 2', 'VAR=value sleep 2']) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.recognised, false, source);
    for (const fd of [0, 1, 2]) assert.equal(cmd.usage.fds[fd].state, 'unknown', source);
  }
});

test('quoted command names work and unmodelled extra descriptors stay unknown', () => {
  const model = parsePipeline('"sleep" 2 3>&1 | echo hello');
  assert.equal(model.commands[0].usage.fds[1].state, 'unused');
  assert.equal(portUsage(model.commands[0], 3).state, 'unknown');
  assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, false);
});

test('closed descriptors are marked closed regardless of command intent', () => {
  const cmd = parsePipeline('echo hello 1>&-').commands[0];
  assert.equal(cmd.usage.fds[1].state, 'possible');
  assert.equal(portUsage(cmd, 1).state, 'closed');
});

test('empty echo and printf are not conflated with guaranteed data transfer', () => {
  for (const source of ['echo -n', 'echo -n ""']) assert.equal(parsePipeline(source).commands[0].usage.fds[1].state, 'unused');
  for (const source of ['echo', 'echo -n "" ""', 'echo "$TEXT"', 'printf "%s" ""', 'printf -v value text']) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.fds[0].state, 'unused', source);
    assert.equal(cmd.usage.fds[1].state, 'possible', source);
  }
});

test('no-output exit commands are modelled only without arguments', () => {
  for (const name of ['true', 'false']) {
    const model = parsePipeline(`${name} | cat`);
    assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, true);
    assert.equal(parsePipeline(`${name} --help`).commands[0].usage.fds[1].state, 'unknown');
  }
});

test('all requested commands have recognised common invocations', () => {
  const cases = [
    ['wc -l', 'possible', 'possible'], ['base64 -d', 'possible', 'possible'],
    ['/usr/bin/time sleep 2', 'unused', 'unused'], ['true', 'unused', 'unused'],
    ['sleep 2', 'unused', 'unused'], ['printf "%s" hello', 'unused', 'possible'],
    ['cat', 'possible', 'possible'], ['xargs -n1 echo', 'possible', 'possible'],
    ['ls -la', 'unused', 'possible'], ['cut -d: -f1', 'possible', 'possible'],
    ['paste -d, - -', 'possible', 'possible'], ["awk '{print $1}'", 'possible', 'possible'],
    ["sed 's/hello/world/'", 'possible', 'possible'], ['rev', 'possible', 'possible'],
  ];
  for (const [source, stdin, stdout] of cases) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.recognised, true, source);
    assert.equal(cmd.usage.fds[0].state, stdin, source);
    assert.equal(cmd.usage.fds[1].state, stdout, source);
  }
});

test('option arguments are not mistaken for filenames', () => {
  for (const source of ['base64 -w 20', 'base64 --wrap=20', 'cut -d : -f 1', 'cut -sf1', 'paste -d -', 'paste --delimiters ,', 'wc -clw']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'possible', source);
  }
  for (const source of ['wc -l input', 'base64 -w20 input', 'cut -d- -f1 input', 'paste -sd, input', 'rev input', 'cat --number input']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  assert.equal(parsePipeline('rev -').commands[0].usage.fds[0].state, 'unused', 'util-linux rev treats - as a literal filename');
});

test('wc files0-from changes the source of file names', () => {
  assert.equal(parsePipeline('wc --files0-from=-').commands[0].usage.fds[0].state, 'possible');
  assert.equal(parsePipeline('wc --files0-from=list').commands[0].usage.fds[0].state, 'unused');
  assert.equal(parsePipeline('wc --files0-from="$LIST"').commands[0].usage.fds[0].state, 'unknown');
});

test('xargs alternate input accounts for the child inheriting stdin', () => {
  for (const source of ['xargs -a list', 'xargs --arg-file=list echo', 'xargs -a list -o cat']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  assert.equal(parsePipeline('xargs -a list cat').commands[0].usage.fds[0].state, 'possible');
  assert.equal(parsePipeline('xargs -a list custom').commands[0].usage.fds[0].state, 'unknown');
  assert.equal(parsePipeline('xargs -a /dev/stdin echo').commands[0].usage.fds[0].state, 'unknown');
  assert.equal(parsePipeline('xargs --help').commands[0].usage.fds[0].state, 'unused');
  assert.equal(parsePipeline('xargs echo --help').commands[0].usage.fds[0].state, 'possible', 'child options belong to the child');
});

test('time inherits child usage but can always write timing diagnostics', () => {
  for (const source of ['/usr/bin/time -v sleep 2', '/usr/bin/time -f "%e" sleep 2', '/usr/bin/time -o timings sleep 2']) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.fds[0].state, 'unused', source);
    assert.equal(cmd.usage.fds[1].state, 'unused', source);
    assert.equal(cmd.usage.fds[2].state, 'possible', source);
  }
  const model = parsePipeline('/usr/bin/time sleep 2 |& wc -l');
  assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, false);
  assert.equal(parsePipeline('/usr/bin/time cat').commands[0].usage.fds[0].state, 'possible');
  assert.equal(parsePipeline('/usr/bin/time custom').commands[0].usage.fds[0].state, 'unknown');
  assert.equal(parsePipeline('/usr/bin/time -V').commands[0].usage.fds[0].state, 'unused');
  assert.equal(parsePipeline('/usr/bin/time -o /dev/stdout sleep 2').commands[0].usage.fds[1].state, 'possible');
});

test('awk accounts for scripts, data files and BEGIN-only programs', () => {
  for (const source of ["awk -F: '{print $1}'", "awk -v label=x '{print label}'", 'awk -f script', 'awk -f - data']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'possible', source);
  }
  for (const source of ["awk '{print $1}' data", "awk 'BEGIN {print 1}'", "awk -F: '{print $1}' data"]) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  for (const source of ["awk '{getline; print}' data", "awk '{print}' /dev/stdin", 'awk -f script data', "awk 'BEGIN {system(\"cat\")}'"]) {
    assert.notEqual(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
});

test('sed preserves input dependencies from every script', () => {
  for (const source of ["sed -n 'p'", "sed -e 's/a/b/'", 'sed -f script', 'sed -f - data']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'possible', source);
  }
  for (const source of ["sed 's/a/b/' data", "sed -n 'p' data", "sed -e 's/a/b/' -e 's/c/d/' data"]) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  for (const source of ["sed -e 'e cat' -e 's/a/b/' data", "sed 's/a/b/e' data", "sed 's/a/b/' /dev/stdin", 'sed -f script data']) {
    assert.notEqual(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  assert.equal(parsePipeline("sed -i.bak 's/a/b/' data").commands[0].usage.fds[1].state, 'unused');
});

test('unresolved file arguments and options remain conservative for known commands', () => {
  for (const source of ['wc "$FILE"', 'base64 --unsupported', 'cut -f', 'paste *.txt', 'rev /dev/stdin', 'true "$OPTION"']) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.recognised, true, source);
    assert.notEqual(cmd.usage.fds[source.startsWith('true') ? 1 : 0].state, 'unused', source);
  }
});

test('head and tail read named files or stdin and may write stdout', () => {
  for (const source of ['head', 'head -n 5', 'head -5', 'head -c 10M -', 'tail', 'tail -n +2', 'tail -2', 'tail +2', 'tail -f', 'tail --follow=name -n 1 -']) {
    const [cmd] = parsePipeline(source).commands;
    assert.equal(cmd.usage.recognised, true, source);
    assert.equal(cmd.usage.fds[0].state, 'possible', source);
    assert.equal(cmd.usage.fds[1].state, 'possible', source);
    assert.equal(cmd.usage.fds[2].label, 'on error', source);
  }
  for (const source of ['head -c 10M /dev/urandom', 'head -5 notes.txt', 'tail -n 3 a b', 'tail +2 notes.txt', 'tail -F app.log']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  // With more than one operand, GNU tail reads +2 as a file name.
  assert.equal(parsePipeline('tail +2 a b').commands[0].usage.fds[0].state, 'unused');
  for (const source of ['head --unknown', 'tail -n', 'head "$FILE"', 'head /dev/stdin']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unknown', source);
  }
  const time = parsePipeline('/usr/bin/time -f %M head -c 10M /dev/urandom').commands[0];
  assert.equal(time.usage.fds[1].state, 'possible');
});

const states = source => { const { usage } = parsePipeline(source).commands[0]; return [usage.recognised, ...[0, 1, 2].map(fd => usage.fds[fd].state)]; };
const stdin = source => states(source)[1], stdout = source => states(source)[2];

test('grep reads stdin only without file operands, and -q never writes stdout', () => {
  for (const source of ['grep 404', 'grep -E ".{5,}"', 'grep -e x -e y', 'grep -f - a.log', 'grep -v x -', 'grep -c x']) assert.equal(stdin(source), 'possible', source);
  for (const source of ['grep 404 a.log', 'grep -e x a b', 'grep -r TODO', 'grep -rn TODO src', 'grep -f patterns a.log', 'grep --help']) assert.equal(stdin(source), 'unused', source);
  for (const source of ['grep', 'grep "$PATTERN"', 'grep -5 x', 'grep x /dev/stdin']) assert.equal(stdin(source), 'unknown', source);
  assert.equal(stdout('grep -q 404'), 'unused');
  assert.equal(stdout('grep --quiet 404 a.log'), 'unused');
  assert.equal(stdout('grep -l 404 a.log'), 'possible');
});

test('sort and uniq read files or stdin; -o, check mode and uniq output files leave stdout unused', () => {
  for (const source of ['sort', 'sort -n -k 2 -t,', 'sort -', 'sort --files0-from=-', 'uniq', 'uniq -c', 'uniq -', 'uniq - out', 'uniq --group=append']) assert.equal(stdin(source), 'possible', source);
  for (const source of ['sort names.txt', 'sort -o out.txt names.txt', 'sort --files0-from=list', 'uniq in', 'uniq -c in out']) assert.equal(stdin(source), 'unused', source);
  for (const source of ['sort -o out.txt', 'sort -c names', 'sort --check=quiet names', 'uniq in out', 'uniq - out']) assert.equal(stdout(source), 'unused', source);
  for (const source of ['sort', 'sort -o /dev/stdout names', 'uniq in', 'uniq in -']) assert.equal(stdout(source), 'possible', source);
  assert.equal(stdin('uniq a b c'), 'unknown', 'uniq takes at most two operands');
});

test('curl reads stdin only for “-” values and writes stdout unless every response is saved', () => {
  for (const source of ['curl https://example.com', 'curl -sSL https://example.com', 'curl -d x=1 https://example.com', 'curl -o - https://example.com']) assert.equal(stdin(source), 'unused', source);
  for (const source of ['curl -d @- https://example.com', 'curl --data-binary @- https://example.com', 'curl -T - ftp://example.com', 'curl -F "f=@-" https://example.com', 'curl -K -']) assert.equal(stdin(source), 'possible', source);
  for (const source of ['curl "$URL"', 'curl -d @/dev/stdin https://example.com', 'curl -K config']) assert.equal(stdin(source), 'unknown', source);
  for (const source of ['curl -o page.html https://example.com', 'curl -sSLo page.html https://example.com', 'curl -O https://example.com/a https://example.com/b']) assert.equal(stdout(source), 'unused', source);
  for (const source of ['curl https://example.com', 'curl -o - https://example.com', 'curl -o a https://example.com/a https://example.com/b', 'curl -o a -w "%{http_code}" https://example.com']) assert.equal(stdout(source), 'possible', source);
  assert.equal(parsePipeline('curl https://example.com').commands[0].usage.fds[2].label, 'progress + errors');
  assert.equal(parsePipeline('curl -s https://example.com').commands[0].usage.fds[2].label, 'on error');
});

test('wget saves to files unless -O - sends the document to stdout', () => {
  for (const source of ['wget https://example.com', 'wget -i urls.txt', 'wget -q -O page.html https://example.com']) {
    assert.equal(stdin(source), 'unused', source);
    assert.equal(stdout(source), 'unused', source);
  }
  for (const source of ['wget -qO- https://example.com', 'wget -O - https://example.com', 'wget --output-document=- https://example.com', 'wget --help']) assert.equal(stdout(source), 'possible', source);
  assert.equal(stdin('wget -i -'), 'possible');
  assert.equal(stdin('wget "$URL"'), 'unknown');
  assert.equal(parsePipeline('wget https://example.com').commands[0].usage.fds[2].label, 'log + errors');
});

test('find ignores stdin and prints by default, unless its actions or commands say otherwise', () => {
  for (const source of ['find .', 'find . -name "*.log" -delete', 'find . -exec wc -l {} +', 'find src -type f -print0']) assert.equal(stdin(source), 'unused', source);
  // rm may prompt when stdin is a terminal, so find -exec rm may read it too.
  for (const source of ['find . -ok rm {} \\;', 'find . -exec cat \\;', 'find -files0-from -', 'find . -exec rm {} \\;']) assert.equal(stdin(source), 'possible', source);
  for (const source of ['find . -exec custom {} \\;', 'find . -name *.log']) assert.equal(stdin(source), 'unknown', source);
  for (const source of ['find . -delete', 'find . -name "*.c" -exec grep -q main {} \\;', 'find . -fprint list', 'find . -exec rm {} \\;']) assert.equal(stdout(source), 'unused', source);
  for (const source of ['find .', 'find . -delete -print', 'find . -exec wc -l {} +', 'find . -fprint /dev/stdout']) assert.equal(stdout(source), 'possible', source);
  assert.equal(stdout('find . -exec custom {} \\;'), 'unknown');
});

test('basenc reads one file or stdin with any encoding option', () => {
  for (const source of ['basenc --base32', 'basenc --base64url -d', 'basenc --z85 -w 0 -', 'basenc --base16 --wrap=76']) {
    assert.deepEqual(states(source), [true, 'possible', 'possible', 'possible'], source);
  }
  for (const source of ['basenc --base32 input', 'basenc -d --base2msbf input']) assert.equal(stdin(source), 'unused', source);
  for (const source of ['basenc --base32 a b', 'basenc --base99', 'basenc --base32 "$FILE"']) assert.equal(stdin(source), 'unknown', source);
});

test('zcat reads named files or stdin, and -t writes nothing to stdout', () => {
  for (const source of ['zcat', 'zcat -f', 'zcat -', 'zcat -S .z a.gz -']) assert.deepEqual(states(source), [true, 'possible', 'possible', 'possible'], source);
  for (const source of ['zcat a.gz', 'zcat -v a.gz b.gz', 'zcat --suffix .z a', 'zcat -h', 'zcat --version']) assert.equal(stdin(source), 'unused', source);
  for (const source of ['zcat -r dir', 'zcat "$FILE"', 'zcat /dev/stdin']) assert.equal(stdin(source), 'unknown', source);
  for (const source of ['zcat -t a.gz', 'zcat --test -v a.gz']) assert.equal(stdout(source), 'unused', source);
  assert.equal(stdout('zcat -tl a.gz'), 'possible');
});

test('parallel reads stdin for arguments or --pipe blocks, but not with ::: arguments', () => {
  for (const source of ['parallel echo', 'parallel -j4 wget -q', 'parallel wc -l :::: -', 'parallel -a - echo', 'parallel --pipe --block 50M wc -l', 'parallel --pipe -k wc -l ::: a b']) {
    assert.equal(stdin(source), 'possible', source);
  }
  for (const source of ['parallel --bar count ::: *.gz', 'parallel -k --tag "zcat {} | wc -l" ::: a.gz b.gz', 'parallel cat ::: a b', 'parallel --pipepart -a big wc -l', 'parallel --help']) {
    assert.equal(stdin(source), 'unused', source);
  }
  for (const source of ['parallel -j "$N" echo ::: a', 'parallel --arg-sep ,,, echo ,,, a', 'parallel echo :::: "$LIST"', 'parallel -a /dev/stdin echo']) {
    assert.equal(stdin(source), 'unknown', source);
  }
  assert.equal(stdout('parallel --dry-run gzip ::: a'), 'possible');
  assert.equal(parsePipeline('parallel --bar echo ::: a').commands[0].usage.fds[2].label, 'progress + errors');
});

test('parallel passes stdin to the first job when arguments come from a file', () => {
  assert.equal(stdin('parallel -a list cat'), 'possible');
  assert.equal(stdin('parallel echo {} :::: list'), 'unused');
  assert.equal(stdin('parallel -a list wc -l {.}.txt'), 'unused', 'replacement strings are not shell globs');
  assert.equal(stdin('parallel -a list custom'), 'unknown');
});

test('leading locale and timezone assignments do not name the command', () => {
  assert.deepEqual(states('LC_ALL=C sort -k1,1'), [true, 'possible', 'possible', 'possible']);
  assert.equal(stdin('LC_ALL=C TZ=UTC sort input'), 'unused');
  assert.equal(parsePipeline('LC_ALL=C sort').commands[0].usage.name, 'sort');
  assert.equal(states('"LC_ALL=C" sort')[0], false, 'a quoted word is a command name');
  assert.equal(states('LC_ALL=C')[0], false);
  for (const source of ['PATH=/opt/bin sort', 'LD_PRELOAD=x.so sort', 'LC_ALL=C VAR=1 sort']) assert.equal(states(source)[0], false, source);
});

test('pv copies files or stdin to stdout and draws progress on stderr', () => {
  const label = source => parsePipeline(source).commands.at(-1).usage.fds[2].label;
  for (const source of ['pv', 'pv -', 'pv -pterb', 'pv -L 1m', 'pv -s 100M -N in', 'pv data.bin -', 'pv --rate-limit=1m']) assert.equal(stdin(source), 'possible', source);
  for (const source of ['pv data.bin', 'pv -L 1m data.bin', 'pv -s 100M a b', 'pv -d 1234', 'pv -R 1234 -L 2m', 'pv --help']) assert.equal(stdin(source), 'unused', source);
  for (const source of ['pv --frobnicate x', 'pv "$FILE"', 'pv /dev/stdin']) assert.equal(stdin(source), 'unknown', source);
  for (const source of ['pv -X data.bin', 'pv -o copy.bin data.bin', 'pv --output=copy.bin', 'pv -d 1234']) assert.equal(stdout(source), 'unused', source);
  for (const source of ['pv data.bin', 'pv -o - data.bin', 'pv -o /dev/stdout data.bin']) assert.equal(stdout(source), 'possible', source);
  assert.equal(label('pv data.bin'), 'progress + errors');
  assert.equal(label('pv -n data.bin'), 'progress + errors');
  assert.equal(label('pv -q data.bin'), 'on error');
  assert.equal(label('pv -R 1234 -L 2m'), 'on error');
  assert.equal(parsePipeline('cat data.bin | pv -L 1m').commands[1].usage.fds[0].state, 'possible');
});

test('coreutils wrappers follow the command they run', () => {
  for (const source of ['env sleep 2', 'env -i A=1 sleep 2', 'nice -n 5 sleep 2', 'nice -10 sleep 2', 'timeout 5 sleep 2', 'stdbuf -oL sleep 2', 'nohup sleep 2', 'chroot /srv sleep 2']) {
    assert.equal(stdin(source), 'unused', source);
    assert.equal(stdout(source), 'unused', source);
  }
  for (const source of ['timeout 5 cat', 'env grep x', 'stdbuf -oL tr a b']) assert.equal(stdin(source), 'possible', source);
  for (const source of ['env -S "sleep 2"', 'timeout 5 custom']) assert.equal(stdin(source), 'unknown', source);
  assert.equal(stdout('env'), 'possible');
  assert.equal(stdin('env'), 'unused');
});

test('coreutils filters, printers and file actions', () => {
  for (const source of ['tac', 'nl -ba', 'fold -w 40', 'fmt -72', 'od -c', 'sha256sum', 'b2sum -l 256', 'tr a-z A-Z', 'tee log', 'numfmt --to=si', 'factor', 'comm - b', 'diff - b', 'diff -u a -', 'diff --from-file=- a b', 'split -l 2', 'csplit - 3', 'dd bs=1M', 'date -f -', 'shuf', 'pr -2', 'tsort']) {
    assert.equal(stdin(source), 'possible', source);
  }
  for (const source of ['tac f', 'nl f', 'od -c f', 'sha256sum -c sums', 'tr --help', 'numfmt 2000', 'factor 12', 'comm a b', 'diff a b', 'diff -u a b', 'diff -C 3 a b', 'split big p', 'csplit f 3', 'dd if=f', 'date +%s', 'shuf -e a b', 'shuf -i 1-9', 'pr +2 f', 'seq 5', 'yes', 'pwd', 'whoami', 'df -h', 'du -sh .', 'stat f', 'tty', 'stty -a', 'test -f x', '[ -f x ]', 'cp a b', 'rm -f x', 'mv -f a b', 'chmod 644 f', 'mkdir -p d', 'kill 1']) {
    assert.equal(stdin(source), 'unused', source);
  }
  for (const source of ['od -c +16', 'du --files0-from=/dev/stdin']) assert.equal(stdin(source), 'unknown', source);
  for (const source of ['rm x', 'rm -i x', 'mv a b', 'cp -i a b', 'ln -i a b']) assert.equal(stdin(source), 'possible', source);
  for (const source of ['cp a b', 'rm -f x', 'chmod 644 f', 'mkdir d', 'touch f', 'test -f x', 'split big', 'dd of=out', 'shuf -o out', 'tty -s', 'stty -echo', 'kill 1', 'sha256sum -c --status sums', 'pathchk x']) {
    assert.equal(stdout(source), 'unused', source);
  }
  for (const source of ['cp -v a b', 'chmod -c 644 f', 'mkdir -v d', 'split --verbose big', 'csplit f 3', 'dd', 'stty', 'kill -l', 'seq 3']) assert.equal(stdout(source), 'possible', source);
});

test('curl -C - resumes rather than reading stdin', () => {
  assert.equal(stdin("curl -C - -O https://x/a.gz"), 'unused');
  assert.equal(stdin("curl -T - https://x/up"), 'possible');
});

test('make runs recipes that may read stdin, except in dry-run and question modes', () => {
  assert.equal(stdin('make'), 'unknown');
  assert.equal(stdin('make -j 4 all'), 'unknown');
  assert.equal(stdin('make -f - all'), 'possible');
  assert.equal(stdin('make -n install'), 'unused');
  assert.equal(stdin('make -q'), 'unused');
  assert.equal(stdout('make -q'), 'unused');
  assert.equal(stdout('make -s'), 'possible');
  assert.equal(parsePipeline('make').commands[0].usage.recognised, true);
  assert.match(parsePipeline('make', { platform: 'macos' }).notes.join(' '), /Command Line Tools/);
  const merged = parsePipeline('make &> build.log').commands[0];
  assert.equal(merged.fds[1], merged.fds[2]);
});

test('sudo follows the command it runs, and asks for a password on the terminal', () => {
  const [cmd] = parsePipeline('sudo -u admin sort names.txt').commands;
  assert.equal(cmd.usage.recognised, true);
  assert.equal(cmd.usage.fds[0].state, 'unused');
  assert.match(cmd.usage.fds[0].reason, /terminal itself/);
  assert.equal(parsePipeline('sudo sort').commands[0].usage.fds[0].state, 'possible');
  assert.equal(parsePipeline('sudo -S sort names.txt').commands[0].usage.fds[0].state, 'possible');
  assert.equal(parsePipeline('sudo -v').commands[0].usage.fds[1].state, 'unused');
});

test('apt reads stdin only when it may ask whether to continue', () => {
  const stdin = source => parsePipeline(source).commands[0].usage.fds[0].state;
  assert.equal(stdin('apt update'), 'unused');
  assert.equal(stdin('apt-get install curl'), 'possible');
  assert.equal(stdin('apt upgrade -y'), 'unknown');
  assert.equal(stdin('apt-get -qq install curl'), 'unknown');
  assert.equal(stdin('apt install -s curl'), 'unused');
  assert.equal(stdin('sudo apt upgrade'), 'possible');
  assert.equal(parsePipeline('apt update', { platform: 'macos' }).commands[0].usage.recognised, false);
});

test('softwareupdate reads stdin for a licence or --stdinpass', () => {
  const stdin = source => parsePipeline(source, { platform: 'macos' }).commands[0].usage.fds[0].state;
  assert.equal(stdin('softwareupdate --list'), 'unused');
  assert.equal(stdin('softwareupdate --install --all'), 'possible');
  assert.equal(stdin('softwareupdate -ia --agree-to-license'), 'unused');
  assert.equal(stdin('softwareupdate -ia --agree-to-license --stdinpass'), 'possible');
});

test('brew reads stdin only for a shell or a Brewfile from stdin', () => {
  const stdin = source => parsePipeline(source, { platform: 'macos' }).commands[0].usage.fds[0].state;
  assert.equal(stdin('brew update'), 'unused');
  assert.equal(stdin('brew upgrade'), 'unused');
  assert.equal(stdin('brew bundle --file=-'), 'possible');
  assert.equal(stdin('brew sh'), 'possible');
  assert.equal(stdin('brew frobnicate'), 'unknown');
  assert.equal(parsePipeline('brew update').commands[0].usage.recognised, true);
});
