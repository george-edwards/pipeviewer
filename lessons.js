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
];
