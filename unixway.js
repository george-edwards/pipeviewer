// The Unix Way: why the shell works the way it does. Levels run in the sandbox like Toolbox's, on
// the files below and the pretend system's /dev, /proc and /etc, and are solved when what reaches
// the terminal matches what the target prints.
//
// The fields are Toolbox's (see cases.js), plus:
// mac      fields that differ on macOS, such as a target for a Mac that has no /proc.
// memory   the most any one command may hold, in bytes, as well as matching the output.

import { BUFFER } from './sandbox.js';

const memo = `Hi all,
The tea room fridge gets cleaned out on Friday. Please lable anything you want to keep.
Unlabelled food goes in the bin, no exeptions.
The new coffee machine should arive next week.
Thanks for your pateince.
Facilities
`;

// A small dictionary: every word in the memo spelt right, and some others. Sorted byte by byte, as
// comm expects.
const dictionary = `a about after again all and any anything are arrive as at back be been bin biscuit biscuits
  but by can cleaned coffee cup cups day dishes do each exceptions facilities feel food for free friday
  fridge from gets go goes has have hi in is it keep kettle kitchen label last machine milk monday
  name need new next no not of on one or our out patience please put room should so some sugar take tea
  thank thanks that the this time to unlabelled up use want we week will with you your`.split(/\s+/);

export const files = {
  'memo.txt': memo,
  'words.txt': `${[...new Set(dictionary)].sort().join('\n')}\n`,
};

export const levels = [
  {
    id: 'tty',
    title: 'The screen is a file',
    tools: ['echo'],
    start: 'echo hello > note.txt',
    brief: 'This writes `hello` into a file called `note.txt`, so nothing shows. To Unix your terminal is a file too, called `/dev/tty`. Send `hello` there instead.',
    target: 'echo hello > /dev/tty',
    how: 'Change `note.txt` to `/dev/tty`.',
    learned: 'Your terminal has a file name, and so do disks, serial ports and plenty more, under `/dev`. Any program that can write to a file can write to them, without knowing what they are. Type `tty` to see your terminal’s name, or `ls /dev` for some of the others.',
  },
  {
    id: 'null',
    title: 'The bin that never fills',
    tools: ['cat', 'wc'],
    start: '',
    brief: '`/dev/null` swallows whatever is written to it and gives back nothing. Throw `memo.txt` in with `cat` and `>`. Then, after a `;`, count the bytes left in `/dev/null` with `wc -c`.',
    target: 'cat memo.txt > /dev/null; wc -c /dev/null',
    how: 'Type `cat memo.txt > /dev/null; wc -c /dev/null`. The `;` runs one command after the other.',
    learned: 'Zero: whatever goes in is gone. That makes `/dev/null` the place to send output you don’t want, as in `2> /dev/null` to throw away error messages.',
  },
  {
    id: 'urandom',
    title: 'A tap that never runs dry',
    tools: ['head', 'base64'],
    start: 'head -c 12 /dev/urandom',
    brief: '`/dev/urandom` is an endless file of random bytes. This takes the first 12, but most bytes aren’t printable characters, so the terminal shows rubbish. Pipe them through `base64`, which turns any bytes into letters and digits.',
    target: 'head -c 12 /dev/urandom | base64',
    how: 'Add `| base64` to the end.',
    learned: 'That makes a decent password. A real `/dev/urandom` gives different bytes every time; this sandbox’s are always the same, so your answer can be checked. `/dev/zero` is its dull sibling: endless zero bytes.',
  },
  {
    id: 'proc',
    title: 'The machine is files',
    tools: ['grep'],
    start: 'cat /proc/cpuinfo',
    brief: 'Linux shows what’s going on inside the computer as files under `/proc`, written on the spot when you read them. `/proc/cpuinfo` has a block for each processor. Count the lines that say `processor`.',
    target: 'grep -c processor /proc/cpuinfo',
    how: 'Type `grep -c processor /proc/cpuinfo`. `-c` counts matching lines rather than printing them.',
    learned: 'Eight. No special tool needed: the ones you already know can read it all. `/proc/meminfo` has the memory, and `/proc/uptime` how long the machine has been up.',
    mac: {
      tools: ['sysctl'],
      start: 'ls /proc',
      brief: 'Linux shows what’s going on inside the computer as files under `/proc`. macOS has no `/proc`, as `ls` shows. Its kernel answers questions through `sysctl` instead. Ask for `hw.ncpu`, the number of processors, with `-n` for just the value.',
      target: 'sysctl -n hw.ncpu',
      how: 'Type `sysctl -n hw.ncpu`.',
      learned: 'Eight. Linux puts the same facts in files, such as `/proc/cpuinfo`, so `grep` and friends can read them. This is one of the places where macOS, though it is a Unix, does things its own way.',
    },
  },
  {
    id: 'passwd',
    title: 'Users are a file',
    tools: ['cut'],
    start: '',
    brief: '`/etc/passwd` has a line for each user on the system, with its fields split by colons, like `staff.txt` in the Toolbox case. List just the usernames: the first field.',
    target: 'cut -d: -f1 /etc/passwd',
    how: 'Type `cut -d: -f1 /etc/passwd`.',
    learned: 'Most of these aren’t people. `daemon`, `www-data` and `sshd` are accounts that programs run as, so each can touch only its own files. Despite the name, the passwords moved out long ago, into `/etc/shadow`, which only root can read.',
    mac: { learned: 'Most of these aren’t people: `daemon`, `_www` and `_sshd` are accounts that programs run as, so each can touch only its own files. Your own account isn’t here. As the comment at the top says, macOS keeps its users in a directory service and reads this file only in single-user mode.' },
  },
  {
    id: 'words',
    title: 'One word per line',
    tools: ['tr', 'sort'],
    start: "tr -cs A-Za-z '\\n' < memo.txt",
    brief: 'In Bell Labs’ 1982 film on the n00b slides, Brian Kernighan builds a spelling checker out of small tools. Step one is done for you: `tr -cs A-Za-z \'\\n\'` turns everything that isn’t a letter into a new line, so the memo comes out one word per line. Now make the words lower case, and keep one of each, sorted.',
    target: "tr -cs A-Za-z '\\n' < memo.txt | tr A-Z a-z | sort -u",
    how: 'Add `| tr A-Z a-z | sort -u`. `-u` keeps one of each.',
    learned: 'Each tool did one job: split, lower-case, sort. None of them knows what a word is for.',
  },
  {
    id: 'comm',
    title: 'Not in the dictionary',
    tools: ['comm'],
    brief: '`words.txt` is a sorted list of words spelt correctly. `comm` compares two sorted lists. Keep only the words from the memo that aren’t in `words.txt`.',
    target: "tr -cs A-Za-z '\\n' < memo.txt | tr A-Z a-z | sort -u | comm -23 - words.txt",
    how: 'Add `| comm -23 - words.txt`. The `-` stands for stdin, the list coming down the pipe. `-2` hides the words only in `words.txt`, and `-3` the words in both, which leaves the ones only in yours.',
    learned: 'Four typos, found by four small programs that know nothing about spelling. Doug McIlroy, who came up with the pipe, summed it up: “Write programs that do one thing and do it well. Write programs to work together. Write programs to handle text streams, because that is a universal interface.”',
  },
  {
    id: 'stream',
    title: 'Through a straw',
    tools: ['base64', 'wc'],
    start: '',
    brief: 'Push a million random bytes through `base64` and count the characters that come out. Then look at the gauges under the output: how much is each command holding?',
    target: 'head -c 1000000 /dev/urandom | base64 | wc -c',
    how: 'Type `head -c 1000000 /dev/urandom | base64 | wc -c`.',
    learned: 'A megabyte went through, and no command held more than a pipe’s buffer, 64 KiB. Each reads a little, passes it on, and reads the next bit, so the same pipeline would handle a terabyte in the same memory. Python’s `base64.b85encode(sys.stdin.buffer.read())` works the other way: it reads the whole input first, then builds the whole result, all in memory. Give it enough input and the machine runs out.',
  },
  {
    id: 'brontosaurus',
    title: 'Don’t hold everything',
    tools: ['tail'],
    start: 'seq 100000 | sort -rn | head -n 1',
    memory: BUFFER,
    brief: '`seq` counts from 1 to 100,000, and this finds the biggest number. It works, but look at `sort`’s gauge: it can’t print its first line until it has read the last, so it holds the lot. Get the same answer without any command holding more than a buffer’s worth.',
    target: 'seq 100000 | tail -n 1',
    how: 'The numbers arrive in order, so the biggest is the last line, and `tail -n 1` keeps only the last line as they go by.',
    learned: 'Most tools stream; a few, such as `sort` and `tac`, can’t. When a pipeline runs out of memory, look for the command that must see everything before it can answer, and ask whether it really has to. (GNU `sort` copes better than most: when memory runs short, it spills to temporary files.)',
  },
  {
    id: 'silence',
    title: 'Silence is golden',
    tools: ['cp', 'diff'],
    start: 'cp memo.txt backup.txt',
    brief: '`cp` printed nothing. That’s how a Unix tool says it worked: no news, and an exit status of 0, the green light under the output. Prove the copy matches: if `cp` works, `diff` the two files, and if that’s quiet too, `echo same`.',
    target: 'cp memo.txt backup.txt && diff memo.txt backup.txt && echo same',
    how: 'Type `cp memo.txt backup.txt && diff memo.txt backup.txt && echo same`. `&&` runs the next command only if the one before exited with 0.',
    learned: 'When a program has nothing surprising to say, it says nothing, so whatever it does print is worth reading, or worth piping into the next tool. Success and failure travel separately, in the exit status, which is what `&&` and `||` read.',
  },
  {
    id: 'registry',
    title: 'No registry',
    tools: ['grep'],
    start: '',
    brief: 'Can root log in to this machine over SSH? The answer is a line in `/etc/ssh/sshd_config`, the SSH server’s settings. Find the line with `PermitRootLogin` in it.',
    target: 'grep PermitRootLogin /etc/ssh/sshd_config',
    how: 'Type `grep PermitRootLogin /etc/ssh/sshd_config`.',
    learned: 'Windows keeps most settings in the Registry, one central database edited with its own tool. Unix has no centre: each program keeps its settings in its own text file, the system’s under `/etc` and yours in dotfiles in your home directory. Every program picks its own format, which is untidy, but nothing stands between you and your settings. You can read, search, compare and back them up with the tools you already know, and keep them in git.',
    mac: { learned: 'Windows keeps most settings in the Registry, one central database edited with its own tool. Unix has no centre: each program keeps its settings in its own text file, the system’s under `/etc` and yours in dotfiles in your home directory. Mac apps add property lists to that, but they’re files too. Nothing stands between you and your settings: you can read, search, compare and back them up with the tools you already know, and keep them in git.' },
  },
  {
    id: 'install',
    title: 'One place for software',
    tools: ['sudo', 'apt'],
    start: 'cowsay moo',
    brief: '`cowsay` isn’t installed. Instead of hunting the web for an installer, ask your distribution’s package manager, `apt`, to fetch it from the repository. Installing for everyone needs root, so start with `sudo`. If that works, have the cow say moo.',
    target: 'sudo apt install cowsay && cowsay moo',
    how: 'Type `sudo apt install cowsay && cowsay moo`. Try it without `sudo` first, to watch `apt` refuse.',
    learned: 'The repository holds tens of thousands of programs, built and signed by the people who make your distribution. One command installs, updates or removes any of them along with whatever they need, and `sudo apt upgrade` updates the lot at once. No setup wizards, and no wondering where a download came from. (Windows has caught up a little with `winget`.) That’s The Unix Way: everything is a file, small tools that do one thing well, streams that hold only what they must, quiet success, settings in plain text, and one place to get software.',
    mac: {
      tools: ['brew'],
      brief: '`cowsay` isn’t installed. Instead of hunting the web for an installer, ask Homebrew, the Mac’s community package manager, to fetch it. If that works, have the cow say moo.',
      target: 'brew install cowsay && cowsay moo',
      how: 'Type `brew install cowsay && cowsay moo`. Homebrew installs into a folder you own, so it doesn’t need `sudo`. Try it with `sudo` to watch it refuse.',
      learned: 'Homebrew holds thousands of programs, and one command installs, updates or removes any of them along with whatever they need; `brew upgrade` updates the lot at once. No setup wizards, and no wondering where a download came from. (Windows has caught up a little with `winget`.) That’s The Unix Way: everything is a file, small tools that do one thing well, streams that hold only what they must, quiet success, settings in plain text, and one place to get software.',
    },
  },
];
