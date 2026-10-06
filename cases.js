// The Toolbox case: someone has emptied the Tim Tams in the level 3 kitchen. These are the files
// the student investigates in toolbox.html's pretend terminal, and the questions in their case
// notebook.

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

// The note in the bin, torn into ten numbered scraps and picked up out of order. Ten, so that plain
// `sort` puts 10 after 1 and `sort -n` is needed.
const scraps = ['Sorry.', 'I had a grant', 'deadline and', 'no lunch.', 'I only meant', 'to have one.', 'Two new packets', 'on Monday,', 'promise.', 'J'];
const pickedUp = [7, 2, 10, 5, 1, 8, 4, 9, 3, 6];

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
  'found-in-bin.txt': pickedUp.map(n => `${n} ${scraps[n - 1]}\n`).join(''),
  'pantry-1500.txt': pantry('1 packet'),
  'pantry-1510.txt': pantry('0 packets'),
  'staff.txt': `${staff.join('\n')}\n`,
  'swipes.log': swipes(),
};

// The case. Each clue is a question with a test of what reached the screen, the answer to note
// down once it has, an optional tip, and nudges, each with a command to try. The first is shown
// straight away; the rest are for a student who's stuck. The note in the bin turns up by mail once the student knows who went in most.
const inWindow = files['swipes.log'].trimEnd().split('\n').filter(line => line.startsWith('2026-10-02T15:0') && line.includes('kitchen'));
const suspects = [...new Set(inWindow.map(line => line.split(' ')[2]))];
const shown = text => text.split('\n').map(line => line.trim()).filter(Boolean);
export const clues = [
  {
    id: 'look', question: 'What’s in the case file?',
    found: (text, result) => result.commands.some(cmd => cmd.name === 'ls' && cmd.status === 0) && text.includes('swipes.log') && text.includes('staff.txt'),
    answer: 'A README, the pantry’s lists from 15:00 and 15:10, a week of badge swipes, and a staff list.',
    nudges: [{ text: 'Start by looking around. `ls` lists the files here: type it and press Enter.', try: 'ls' }],
  },
  {
    id: 'brief', question: 'What happened?',
    found: text => text.includes('CASE FILE: THE MISSING TIM TAMS') && text.includes('Find out who did it'),
    answer: 'A new packet of Tim Tams vanished from the level 3 kitchen on Friday afternoon.',
    nudges: [{ text: 'There’s a `README`. `cat` prints a file on the screen.', try: 'cat README' }],
  },
  {
    id: 'when', question: 'When did the packet go?',
    found: text => /Tim Tams\s+1 packet/.test(text) && /Tim Tams\s+0 packets/.test(text),
    answer: 'On Friday, between 15:00 and 15:10.',
    tip: '`diff` shows only the lines that changed between two files. It’s how `git` shows changes to code.',
    nudges: [{ text: 'The smart pantry listed its shelves at 15:00 and at 15:10. `diff` compares two files and prints only the lines that differ.', try: 'diff pantry-1500.txt pantry-1510.txt' }],
  },
  {
    id: 'kitchen', question: 'Who went into the kitchen in those ten minutes?',
    found: text => {
      const lines = shown(text), swipes = lines.filter(line => /^\d{4}-\d\d-\d\dT/.test(line));
      if (swipes.length) return inWindow.every(line => lines.includes(line)) && swipes.every(line => inWindow.includes(line));
      // Or just the names, alone or in a tally such as `4 jlee`.
      const names = lines.map(line => line.replace(/^\d+\s+/, ''));
      return names.length > 0 && names.every(name => suspects.includes(name)) && suspects.every(name => names.includes(name));
    },
    answer: `${suspects.join(', ')}. One name keeps coming up.`,
    tip: 'Each `|` sent one command’s output into the next. Click the stages above a pipeline’s output to see what each one passed on.',
    nudges: [
      { text: '`swipes.log` has every badge swipe this week. Print it with `cat`.', try: 'cat swipes.log' },
      { text: 'That’s too many lines to see properly. `head` prints just the first ten.', try: 'head swipes.log' },
      { text: 'Each swipe starts with its time, such as `2026-10-02T15:04:18`. `grep` keeps the lines that contain a pattern, so `2026-10-02T15:0` finds Friday, 15:00 to 15:09. Send `cat`’s output into `grep` with `|`.', try: 'cat swipes.log | grep 2026-10-02T15:0' },
      { text: 'Some of those were at other doors. Send the lines through a second `grep` with another `|`, to keep the kitchen’s.', try: 'cat swipes.log | grep 2026-10-02T15:0 | grep kitchen' },
    ],
  },
  {
    id: 'most', question: 'Who went in most often?',
    found: text => /(^|\n)\s*4\s+jlee\s*(\n|$)/.test(text) || /(^|\n)jlee\s+4\s*(\n|$)/.test(text),
    answer: 'jlee: four trips in eight minutes.',
    tip: '`sort | uniq -c` is the shell’s tally. Add `| sort -rn | head -n 1` and it keeps just the top line.',
    nudges: [
      { text: 'Keep only the names: `cut -d \' \' -f 3` splits each line at spaces and keeps the third field.', try: "cat swipes.log | grep 2026-10-02T15:0 | grep kitchen | cut -d ' ' -f 3" },
      { text: '`uniq -c` counts repeated lines, but only when they’re next to each other. So `sort` them first.', try: "cat swipes.log | grep 2026-10-02T15:0 | grep kitchen | cut -d ' ' -f 3 | sort | uniq -c" },
    ],
  },
  {
    id: 'whois', question: 'Who is jlee?',
    found: text => shown(text).includes('jlee:Jo Lee:Hydrology:3'),
    answer: 'Jo Lee, Hydrology, level 3.',
    tip: '`grep jlee` also finds jleeson, because it matches inside words. `grep -w jlee` matches whole words only.',
    nudges: [{ text: '`staff.txt` has a line for each person, as `username:name:team:floor`. Search it for jlee.', try: 'grep jlee staff.txt' }],
  },
  {
    id: 'note', question: 'What does the note say?', mail: true,
    // The scraps in order, with their numbers or without.
    found: text => {
      const lines = shown(text).map(line => line.replace(/^\d+\s+/, '')), start = lines.indexOf(scraps[0]);
      return start >= 0 && scraps.every((scrap, k) => lines[start + k] === scrap);
    },
    answer: 'A confession, and a promise of two new packets on Monday.',
    tip: '`sort` compares lines character by character, as a dictionary does, so `10` comes before `2`. `sort -n` reads the numbers as numbers. `cut -d \' \' -f 2-` would drop them, leaving just the words.',
    nudges: [
      { text: 'Have a look at it first.', try: 'cat found-in-bin.txt' },
      { text: 'The scraps are numbered, but they were picked up out of order. `sort` puts lines in order: pipe the note into it.', try: 'cat found-in-bin.txt | sort' },
      { text: 'Nearly: scrap 10 came out second, because `sort` compares character by character and `1` comes before `2`. `sort -n` sorts by number instead.', try: 'cat found-in-bin.txt | sort -n' },
    ],
  },
];
export const mail = 'Cleaners found a torn-up note in the kitchen bin and picked up the scraps. They’re in found-in-bin.txt now, but we can’t make head or tail of it.';
