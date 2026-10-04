// The Toolbox track: a short whodunit solved with small tools joined by pipes. Each level runs the
// student's command in the sandbox on the case files below, and is solved when what reaches the
// terminal matches what the target command prints. So any command with the same output passes:
// `cat README` and `head -n 100 README` both solve level 2.
//
// id       stays fixed once published: progress is saved under it.
// title    a few words, shown with the level number.
// brief    what to do, shown above the output. Text in `backticks` is set as code.
// start    the command in the editor when the level opens. Leave it out to start from the previous
//          level's target.
// target   the command whose output the student has to match. Its output is shown blacked out,
//          line by line, until the student's own output matches it.
// tools    the tools the level uses, shown as cards by the first hint. Each is added to the toolbox
//          once a level that uses it is solved.
// how      the syntax hint, shown when the student asks for it.
// learned  shown once it is solved.

// The week's badge swipes are made up from a fixed seed, so every student gets the same log. The
// ten minutes that matter are written out by hand.
function swipes() {
  let seed = 20261002;
  const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = list => list[Math.floor(random() * list.length)];
  const people = staff.map(line => line.split(':')).map(([user, , , floor]) => ({ user, floor: Number(floor) }));
  const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
  const at = (day, minutes) => `${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(Math.floor(random() * 60)).padStart(2, '0')}`;
  const entries = [];
  for (const day of days) {
    for (const { user, floor } of people) {
      if (random() < .12) continue;
      const arrive = 470 + Math.floor(random() * 90);
      entries.push([at(day, arrive), pick(['front', 'front', 'carpark']), user]);
      const visits = floor === 3 ? 2 + Math.floor(random() * 3) : floor === 2 ? 1 + Math.floor(random() * 2) : Math.floor(random() * 2);
      for (let v = 0; v < visits; v++) entries.push([at(day, arrive + 40 + Math.floor(random() * 420)), 'kitchen-L3', user]);
      if (floor === 2) for (let v = Math.floor(random() * 3); v > 0; v--) entries.push([at(day, arrive + 20 + Math.floor(random() * 400)), 'lab-L2', user]);
      if (random() < .4) entries.push([at(day, arrive + 200 + Math.floor(random() * 60)), pick(['front', 'carpark']), user]);
    }
  }
  const window = ([time]) => time.startsWith('2026-10-02T15:0');
  const scene = [
    ['2026-10-02T15:00:41', 'lab-L2', 'hsato'],
    ['2026-10-02T15:01:12', 'kitchen-L3', 'jlee'],
    ['2026-10-02T15:02:30', 'kitchen-L3', 'tpham'],
    ['2026-10-02T15:03:05', 'kitchen-L3', 'jlee'],
    ['2026-10-02T15:04:18', 'front', 'skumar'],
    ['2026-10-02T15:05:52', 'kitchen-L3', 'amorgan'],
    ['2026-10-02T15:06:09', 'kitchen-L3', 'jlee'],
    ['2026-10-02T15:07:33', 'kitchen-L3', 'jleeson'],
    ['2026-10-02T15:08:47', 'kitchen-L3', 'jlee'],
  ];
  return [...entries.filter(entry => !window(entry)), ...scene].sort(([a], [b]) => a < b ? -1 : 1).map(entry => entry.join(' ')).join('\n') + '\n';
}

const staff = [
  'amorgan:Alex Morgan:Agronomy:3',
  'bnguyen:Bao Nguyen:Data Science:2',
  'cokafor:Chidi Okafor:Hydrology:3',
  'dsmith:Dana Smith:Facilities:1',
  'efischer:Ella Fischer:Genomics:2',
  'gwilliams:Gus Williams:Agronomy:3',
  'hsato:Hana Sato:Genomics:2',
  'jlee:Jo Lee:Hydrology:3',
  'jleeson:Jack Leeson:Data Science:2',
  'kmurray:Kirra Murray:Hydrology:3',
  'mrossi:Marco Rossi:Data Science:2',
  'pkaur:Preet Kaur:Agronomy:3',
  'skumar:Sanjay Kumar:Genomics:2',
  'tpham:Thanh Pham:Data Science:3',
  'zbrown:Zoe Brown:Facilities:1',
];

const pantry = tims => `Arnott's Tim Tams     ${tims}
Anzac biscuits        0 packets
Milk, full cream      2 litres
Milk, oat             1 litre
Teabags               38
Instant coffee        1 jar
Vegemite              1 jar
`;

const rot13 = text => text.replace(/[a-z]/gi, c => String.fromCharCode((c <= 'Z' ? 65 : 97) + (c.toUpperCase().charCodeAt(0) - 52) % 26));

export const files = {
  'README': `CASE FILE: THE MISSING TIM TAMS

On Friday afternoon a brand new packet of Tim Tams vanished
from the level 3 kitchen. The whole packet. Nobody has owned up.

  pantry-1500.txt   what the smart pantry saw at 15:00
  pantry-1510.txt   what it saw at 15:10
  swipes.log        every badge swipe in the building this week
  staff.txt         who's who

Find out who did it. Use nothing but the shell.

  Facilities
`,
  'found-in-bin.txt': `${rot13(`Sorry. I had a grant deadline and no lunch.
I only meant to have one.
Two new packets on Monday, promise.
  J`)}\n`,
  'pantry-1500.txt': pantry('1 packet'),
  'pantry-1510.txt': pantry('0 packets'),
  'staff.txt': `${staff.join('\n')}\n`,
  'swipes.log': swipes(),
};

export const levels = [
  {
    id: 'ls',
    title: 'Open the case file',
    tools: ['ls'],
    start: '',
    brief: 'Someone has eaten the Tim Tams from the level 3 kitchen, and you’ve been handed the case. Type `ls` to list the files in it.',
    target: 'ls',
    how: 'Type `ls`, short for “list”, and nothing else.',
    learned: 'Six files. Unix tools have short names because people type them all day. If you forget what one does, `man` followed by its name shows its manual, here and on any real system. Try `man ls`.',
  },
  {
    id: 'cat',
    title: 'Read the brief',
    tools: ['cat'],
    start: '',
    brief: '`cat` prints a file on the screen. Read the `README`.',
    target: 'cat README',
    how: 'Type `cat README`. Capitals matter: `readme` would be a different file.',
    learned: '`cat` is short for concatenate. Give it several files and it prints one after another, as one stream.',
  },
  {
    id: 'head',
    title: 'Just the top',
    tools: ['head'],
    start: '',
    brief: '`swipes.log` is too long to read. Try `cat` on it if you like. `head` prints just the start of a file. Show the first 3 lines of `swipes.log`.',
    target: 'head -n 3 swipes.log',
    how: 'Type `head -n 3 swipes.log`. Without `-n`, `head` shows 10 lines.',
    learned: 'Each line is one swipe: when, which door, and whose badge. `tail` is `head`’s twin, so `tail -n 3 swipes.log` shows the last three swipes.',
  },
  {
    id: 'wc',
    title: 'How many?',
    tools: ['wc'],
    start: '',
    brief: 'How many swipes are in the log? `wc` counts lines, words and bytes. Ask it for lines only.',
    target: 'wc -l swipes.log',
    how: 'Type `wc -l swipes.log`. `-l` means lines. `-w` would count words and `-c` bytes.',
    learned: 'Hundreds of swipes in one week, too many to read one by one. From here on the tools do the reading.',
  },
  {
    id: 'diff',
    title: 'When did it happen?',
    tools: ['diff'],
    start: '',
    brief: 'The smart pantry listed its shelves at 15:00 and again at 15:10. `diff` compares two files and prints only the lines that changed. Compare the two lists.',
    target: 'diff pantry-1500.txt pantry-1510.txt',
    how: 'Type `diff pantry-1500.txt pantry-1510.txt`. Put the older file first.',
    learned: '`<` marks the line in the first file and `>` what replaced it in the second. So the packet went between 15:00 and 15:10 on Friday. `git diff` shows changes to code the same way.',
  },
  {
    id: 'grep',
    title: 'Ten minutes on Friday',
    tools: ['grep'],
    start: '',
    brief: '`grep` prints the lines that contain a pattern. Every swipe from Friday 15:00 to 15:09 starts with `2026-10-02T15:0`. Find them all in `swipes.log`.',
    target: 'grep 2026-10-02T15:0 swipes.log',
    how: 'Type `grep 2026-10-02T15:0 swipes.log`. The pattern comes first, then the file.',
    learned: 'You’ll use `grep` more than any other tool here. `-i` ignores case, `-v` keeps the lines that don’t match, and `-c` counts them instead of printing them.',
  },
  {
    id: 'pipe',
    title: 'Only the kitchen',
    tools: ['|'],
    brief: 'Some of those swipes were at other doors. Pipe the lines into a second `grep` that keeps only the kitchen’s.',
    target: 'grep 2026-10-02T15:0 swipes.log | grep kitchen',
    how: 'Add `| grep kitchen` to the end. The second `grep` has no file name, so it reads its stdin, which the pipe fills with the first one’s output.',
    learned: 'Two small filters, one after the other, and neither knows the other exists. The first writes lines and the second reads lines. That’s all a pipe does, and it works for any tools that read and write text.',
  },
  {
    id: 'cut',
    title: 'Names only',
    tools: ['cut'],
    brief: 'You only need the names. `cut` splits each line into fields and keeps the ones you ask for. Split at spaces, and keep field 3.',
    target: "grep 2026-10-02T15:0 swipes.log | grep kitchen | cut -d ' ' -f 3",
    how: 'Add `| cut -d \' \' -f 3`. `-d` sets the delimiter: a space, in quotes so the shell keeps it. `-f 3` keeps the third field.',
    learned: '`cut` works on anything with a separator: `-d ,` for CSV, or `-d :` for files like `staff.txt`. Fields count from 1.',
  },
  {
    id: 'tally',
    title: 'Count the trips',
    tools: ['sort', 'uniq'],
    brief: 'Count how many times each person went in. `uniq -c` counts repeated lines, but only when the repeats are next to each other, so `sort` the names first.',
    target: "grep 2026-10-02T15:0 swipes.log | grep kitchen | cut -d ' ' -f 3 | sort | uniq -c",
    how: 'Add `| sort | uniq -c` to the end.',
    learned: '`sort | uniq -c` is the shell’s tally. Four trips in eight minutes stands out.',
  },
  {
    id: 'top',
    title: 'Top of the list',
    tools: ['sort', 'head'],
    brief: 'With a bigger team the tally would run to pages. Put the most trips first with `sort -rn`, then keep only the top line.',
    target: "grep 2026-10-02T15:0 swipes.log | grep kitchen | cut -d ' ' -f 3 | sort | uniq -c | sort -rn | head -n 1",
    how: 'Add `| sort -rn | head -n 1`. `-n` sorts by number instead of alphabetically, and `-r` reverses the order, so the biggest comes first.',
    learned: 'In 1986 Donald Knuth wrote several pages of careful code to find the most common words in a text. Doug McIlroy replied with six commands joined by pipes, built like yours: `tr | tr | sort | uniq -c | sort -rn | sed`. You just wrote seven.',
  },
  {
    id: 'whole-word',
    title: 'Who is jlee?',
    tools: ['grep'],
    start: '',
    brief: '`staff.txt` has a line for each person: `username:name:team:floor`. Find jlee’s line, and only jlee’s.',
    target: 'grep -w jlee staff.txt',
    how: '`grep jlee staff.txt` finds `jleeson` too, because `grep` matches inside words. Add `-w` to match whole words only: `grep -w jlee staff.txt`.',
    learned: 'Jo Lee, Hydrology, level 3. This colon-separated layout is old Unix: `/etc/passwd`, the list of users on every Unix system, looks just like `staff.txt`.',
  },
  {
    id: 'tr',
    title: 'The note in the bin',
    tools: ['tr'],
    start: 'cat found-in-bin.txt',
    brief: 'Facilities found this note in the kitchen bin. It’s in ROT13, which swaps each letter for the one 13 further along the alphabet. `tr` translates characters from one set to another. Decode it.',
    target: 'tr A-Za-z N-ZA-Mn-za-m < found-in-bin.txt',
    how: '`tr` reads only stdin, so pipe the note in: `cat found-in-bin.txt | tr A-Za-z N-ZA-Mn-za-m`. Each letter of the first set becomes the letter in the same place in the second: A becomes N, and so on. `tr A-Za-z N-ZA-Mn-za-m < found-in-bin.txt` does the same without `cat`.',
    learned: 'Case closed. None of these tools knows anything about biscuits or badges. Each does one small job on lines of text, and the pipes joined them into an investigation.',
  },
];
