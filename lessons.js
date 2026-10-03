// Training levels, in the order they are played. The student sees the picture of target and edits
// a command until its picture matches. Any spelling that draws the same picture passes, so
// `sort unsorted.txt 1> sorted.txt` solves the first level as well as the target's own spelling.
//
// id       stays fixed once published: progress is saved under it.
// title    a few words, shown with the level number.
// brief    one or two sentences on what to change, shown above the pictures.
// start    the command in the editor when the level opens. Leave it out to start from the previous
//          level's target.
// target   the command whose picture the student has to match. It stays hidden until they solve
//          the level or ask for the answer.
// how      the syntax hint, shown when the student asks for it.
// learned  what the level shows, shown once it is solved.
//
// Text in `backticks` is set as code.
export const lessons = [
  {
    id: 'into-a-file',
    title: 'Into a file',
    brief: '`sort` prints its result on the terminal. Change the command so the sorted lines land in `sorted.txt` instead.',
    start: 'sort unsorted.txt',
    target: 'sort unsorted.txt >sorted.txt',
    how: 'Add `>sorted.txt` to the end. `>` points stdout (1) at a file, which the shell creates, or empties, before `sort` starts.',
    learned: '`> file` sends stdout to a file. The shell opens the file before the command starts, and the command never knows: it writes to stdout as it always does.',
  },
  {
    id: 'stdin-from-a-file',
    title: 'Feed it through stdin',
    brief: 'Same result, but this time `sort` doesn’t open `unsorted.txt` itself. The shell connects the file to its stdin.',
    target: 'sort <unsorted.txt >sorted.txt',
    how: 'Take the file name off `sort` and add `<unsorted.txt`. `<` points stdin (0) at a file.',
    learned: '`< file` connects stdin to a file. Compare the cards: given a file name, `sort` opens the file itself and ignores stdin. With `<`, the shell opens it, and `sort` reads stdin as it would read a pipe.',
  },
  {
    id: 'errors-aside',
    title: 'Errors to one side',
    brief: 'Keep the terminal quiet: anything `sort` complains about should go to `errors.txt`.',
    target: 'sort <unsorted.txt >sorted.txt 2>errors.txt',
    how: 'Add `2>errors.txt`. A number right before `>` picks the descriptor, and 2 is stderr. A bare `>` means `1>`.',
    learned: '`2> file` gives stderr its own file, so error messages never end up in `sorted.txt`. The order of these three redirects doesn’t matter, as each points a different descriptor somewhere.',
  },
  {
    id: 'keep-old-errors',
    title: 'Keep the old errors',
    brief: 'Each run empties `errors.txt` before `sort` writes to it, so you only ever see the last run’s complaints. Keep them all: add new ones to the end.',
    target: 'sort <unsorted.txt >sorted.txt 2>>errors.txt',
    how: 'Change `2>` to `2>>`. `>>` opens the file for appending: the shell creates it if it’s missing and never empties it.',
    learned: '`>>` appends where `>` overwrites. The picture marks the difference on the file, since the command itself writes the same way to either.',
  },
  {
    id: 'both-to-one-file',
    title: 'Everything in one log',
    brief: '`make` prints its progress on stdout and its warnings and errors on stderr. Send both to `build.log`, so the log keeps each error next to the step that caused it.',
    start: 'make',
    target: 'make &> build.log',
    how: 'Add `&>build.log`. `&>` points stdout and stderr at the same file. The longer spelling, `>build.log 2>&1`, does the same.',
    learned: '`&> file` sends stdout and stderr to one file, which the shell opens once. It is short for `> file 2>&1`, and there order matters: `2>&1` copies wherever stdout points at that moment, so `2>&1 >build.log` leaves stderr on the terminal.',
  },
  {
    id: 'top-three',
    title: 'Top three',
    brief: 'This counts how often each line of `words.txt` appears. Pipe the counts through `sort -rn`, then `head -n 3`, to keep the three most common.',
    start: 'sort words.txt | uniq -c',
    target: 'sort words.txt | uniq -c | sort -rn | head -n 3',
    how: 'Add `| sort -rn | head -n 3` to the end. Each `|` joins the stdout on its left to the stdin on its right.',
    learned: 'A pipeline can be as long as you like. All four commands start together, and each reads from the one before as its output arrives. Their stderrs don’t join the pipes: all four still go to the terminal.',
  },
  {
    id: 'errors-away',
    title: 'Throw the errors away',
    brief: 'This counts the `.js` files under the current directory. `find` complains on stderr about every directory it can’t read. Throw those complaints away, and keep the count.',
    start: 'find . -name "*.js" | wc -l',
    target: 'find . -name "*.js" 2> /dev/null | wc -l',
    how: 'Add `2>/dev/null` after `find`’s arguments, before the `|`. `/dev/null` discards whatever is written to it.',
    learned: 'A redirect belongs to the command it’s written with. Put at the end of the line, `2>/dev/null` silences `wc`, and `find`’s errors still reach the terminal. The pipe only carries stdout, so stderr was never part of the count.',
  },
  {
    id: 'errors-down-the-pipe',
    title: 'Errors down the pipe',
    brief: '`grep` searches its stdin, but `make` writes its errors to stderr, which skips the pipe. Send `make`’s stderr down the pipe too, so `grep` sees them.',
    start: 'make | grep -i error',
    target: 'make 2>&1 | grep -i error',
    how: 'Add `2>&1` after `make`, before the `|`. It points stderr wherever stdout points right now, and stdout already points at the pipe.',
    learned: 'The shell connects the pipe before it reads the command’s redirects, so `2>&1` copies the pipe. Bash and zsh also accept `make |& grep -i error`, which draws the same picture.',
  },
  {
    id: 'watch-and-keep',
    title: 'Watch it and keep it',
    brief: 'With `&>`, the whole build disappears into `build.log` and you stare at a blank screen. Keep the log, but watch the build scroll by as well.',
    start: 'make &> build.log',
    target: 'make 2>&1 | tee build.log',
    how: 'Send both streams down a pipe with `2>&1 |`, into `tee build.log`. `tee` copies its stdin to its stdout and to every file it’s given.',
    learned: '`tee` is the T-junction of the plumbing: one stream in, two out. `build.log` is opened by `tee`, not by the shell, so it’s drawn on `tee`’s card rather than at the end of a redirect.',
  },
  {
    id: 'only-if-it-worked',
    title: 'Only if it worked',
    brief: '`;` runs `make install` even when the build has failed. Run it only if `make` succeeds.',
    start: 'make; make install',
    target: 'make && make install',
    how: 'Replace `;` with `&&`.',
    learned: '`&&` runs the next pipeline only if the one before succeeded, which means it exited with status 0. `||` is the opposite: it runs the next one only after a failure. Each pipeline gets its own connections, so the picture stacks them.',
  },
  {
    id: 'complain-on-stderr',
    title: 'Complain on stderr',
    brief: 'If either step fails, `echo` says so, but on stdout, where anything reading the output will take it for data. Send the message to stderr, where errors belong.',
    start: 'make && make install || echo "install failed"',
    target: 'make && make install || echo "install failed" >&2',
    how: 'Add `>&2` after `echo`’s message. It’s short for `1>&2`: point stdout wherever stderr points.',
    learned: '`>&2` is how a script reports an error. The `&` matters: it says 2 is a descriptor. Without it, `>2` writes to a file called `2`.',
  },
  {
    id: 'sorted-on-the-way-in',
    title: 'Sorted on the way in',
    brief: '`comm -12` prints the lines two files share, but only if both are sorted, and these aren’t. Sort them on the way in, without temporary files.',
    start: 'comm -12 a.txt b.txt',
    target: 'comm -12 <(sort a.txt) <(sort b.txt)',
    how: 'Replace each file name with a process substitution: `<(sort a.txt)` and `<(sort b.txt)`. `<(cmd)` runs `cmd` and hands over a name such as `/dev/fd/63` to read its output from.',
    learned: '`<(cmd)` turns a command’s output into something that looks like a file name. A command has only one stdin, so a pipe couldn’t feed `comm` both lists; two substitutions can.',
  },
  {
    id: 'log-and-see-errors',
    title: 'Log the errors, and see them',
    brief: 'This saves `make`’s errors in `errors.log`, but you no longer see them as they happen. Keep the file, and get the errors back on the terminal as well.',
    start: 'make 2>errors.log',
    target: 'make 2> >(tee errors.log >&2)',
    how: 'Point stderr at a process substitution: `2> >(tee errors.log >&2)`. Inside it, `tee` writes to `errors.log` and to its stdout, and `>&2` sends that to stderr. Keep the space between `2>` and `>(`.',
    learned: '`>(cmd)` is somewhere to write that leads into another command’s stdin. As a redirect target it can take stderr alone, which `|` can’t, since a pipe carries only stdout. `make`’s stdout never goes near it.',
  },
];
