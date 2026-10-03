// The Quick reference's entries. Each row shows its syntax and a one-line summary, and opens to
// show more: a short explanation with at least one example.
//
// syntax   the spelling, set as code.
// summary  one line. Text in `backticks` is set as code.
// more     paragraphs separated by blank lines. A paragraph starting "# " is a heading, and one
//          fenced with ``` is a command, which the student can draw in the viewer.
export const reference = [
  {
    syntax: 'cmd | next',
    summary: 'Connect stdout to the next command’s stdin.',
    more: `\`|\` joins the stdout (1) of the command on its left to the stdin (0) of the command on its right. Both start at once, and \`next\` reads the output as \`cmd\` writes it, so nothing is saved along the way.

stderr isn’t part of the pipe: error messages from \`cmd\` still go to the terminal.

\`\`\`
ls | wc -l
\`\`\`

\`ls\` lists the files here, and \`wc -l\` counts the lines it’s given: the number of files.`,
  },
  {
    syntax: '< file',
    summary: 'Read stdin from a file.',
    more: `\`< file\` connects stdin to a file. The shell opens the file before the command starts, so the command reads it just as it would read your typing.

\`\`\`
wc -l < notes.txt
\`\`\`

Compare \`wc -l notes.txt\`, where \`wc\` opens the file itself and prints its name beside the count. With \`<\`, \`wc\` never learns the name, so it prints only the number.`,
  },
  {
    syntax: '> file',
    summary: 'Write stdout to a file.',
    more: `\`> file\` sends stdout to a file instead of the screen. The shell creates the file if it’s missing, and empties it if it isn’t, before the command starts.

\`\`\`
ls > files.txt
\`\`\`

That’s why \`sort data.txt > data.txt\` leaves you with an empty file: the shell empties \`data.txt\` before \`sort\` gets to read it.`,
  },
  {
    syntax: '>> file',
    summary: 'Append stdout to a file.',
    more: `Like \`>\`, but it adds to the end of the file instead of emptying it first. Good for logs that grow over time.

\`\`\`
date >> times.log
\`\`\`

Run it a few times and \`times.log\` gets one line per run.`,
  },
  {
    syntax: '2> errors.log',
    summary: 'Write stderr to a separate file.',
    more: `A number right before \`>\` picks the stream, and 2 is stderr. A bare \`>\` means \`1>\`. Results still reach the screen, and the complaints go to the file.

\`\`\`
find / -name "*.conf" 2> errors.log
\`\`\`

\`find\` lists what it finds on the screen, and its complaints about folders it can’t open go to \`errors.log\`. To throw them away instead, use \`2> /dev/null\`.`,
  },
  {
    syntax: '2>&1',
    summary: 'Copy stdout’s current destination to stderr.',
    more: `\`2>&1\` points stderr wherever stdout points right now. The \`&\` says 1 is a stream: without it, \`2>1\` would write to a file called \`1\`.

\`\`\`
make > build.log 2>&1
\`\`\`

Redirects are applied left to right, so order matters. Here stdout goes to \`build.log\` first, and then stderr copies it. Written \`2>&1 > build.log\`, stderr copies stdout while it still points at the terminal, and only stdout moves to the file.`,
  },
  {
    syntax: '&> file',
    summary: 'Write both output streams to a file.',
    more: `\`&> file\` sends stdout and stderr to the same file. It’s Bash and zsh shorthand for \`> file 2>&1\`, and plain \`sh\` doesn’t understand it.

\`\`\`
make &> build.log
\`\`\`

The log keeps every error next to the step that caused it.`,
  },
  {
    syntax: '&>> file',
    summary: 'Append both output streams to a file.',
    more: `Short for \`>> file 2>&1\`: stdout and stderr both go to the end of the file, and nothing already there is lost.

\`\`\`
make &>> build.log
\`\`\``,
  },
  {
    syntax: 'cmd |& next',
    summary: 'Pipe both output streams, applying the stderr copy after explicit redirects.',
    more: `\`|&\` pipes stderr along with stdout. It’s short for \`2>&1 |\`, added after any redirects you wrote on \`cmd\`, so \`cmd 2> err.log |& next\` still sends stderr down the pipe.

\`\`\`
make |& grep -i error
\`\`\`

\`grep\` searches \`make\`’s errors as well as its normal output.`,
  },
  {
    syntax: 'a && b',
    summary: 'Run `b` only if the last pipeline that ran succeeded.',
    more: `\`&&\` runs \`b\` only if \`a\` succeeded, which means it exited with status 0. Use it to chain steps that each depend on the one before.

\`\`\`
mkdir backup && cp notes.txt backup/
\`\`\`

If the folder can’t be made, nothing is copied.`,
  },
  {
    syntax: 'a || b',
    summary: 'Run `b` only if the last pipeline that ran failed.',
    more: `\`||\` runs \`b\` only if \`a\` failed. Handy for a fallback, or an error message.

\`\`\`
mkdir backup || echo "couldn't make backup" >&2
\`\`\``,
  },
  {
    syntax: 'a ; b',
    summary: 'Run `b` after `a` finishes, whatever its exit status. A new line does the same.',
    more: `\`;\` runs \`a\`, waits for it to finish, then runs \`b\`, whether \`a\` worked or not.

\`\`\`
date ; ls
\`\`\``,
  },
  {
    syntax: '2>&-',
    summary: 'Close a descriptor.',
    more: `\`2>&-\` closes stderr, so the command has nothing at all there. Writing to a closed stream fails, whereas writing to \`/dev/null\` quietly succeeds, so \`2> /dev/null\` is usually what you want.

\`\`\`
ls nope 2>&-
\`\`\``,
  },
  {
    syntax: '2> >(cmd)',
    summary: 'Send stderr to another command’s stdin. The command inherits the current descriptors, and Bash does not wait for it.',
    more: `This sends stderr into another command’s stdin, and leaves stdout where it was. A pipe can’t do that, since \`|\` only carries stdout.

\`\`\`
make 2> >(tee errors.log >&2)
\`\`\`

\`make\`’s errors are saved in \`errors.log\` and still shown on the terminal. The command inside runs alongside, and Bash doesn’t wait for it to finish, so its output can turn up after your prompt comes back.`,
  },
  {
    syntax: 'cmd <(other)',
    summary: 'Process Substitution: this feeds the output of `other` to `cmd` disguised as a file.',
    more: `When you run \`cmd <(other)\`, your shell runs \`other\` in the background, with its output going into a pipe, and hands \`cmd\` a file name for that pipe, such as \`/dev/fd/63\`.

As far as \`cmd\` knows, it got passed a normal file as an argument. Bash and zsh call this process substitution.

# Why not just use a pipe?

A standard pipe (\`other | cmd\`) dumps the output of \`other\` straight into the standard input of \`cmd\`.

But some tools only read files they’re given by name, or they need more than one input. The classic example is \`diff\`, which compares two files. You can’t pipe two separate streams into one stdin, so you might assume you’d have to make a mess with temporary files:

\`\`\`
ls /etc/nginx > temp1.txt
ls /etc/apache2 > temp2.txt
diff temp1.txt temp2.txt
rm temp1.txt temp2.txt
\`\`\`

Process substitution lets you skip the temporary files entirely:

\`\`\`
diff <(ls /etc/nginx) <(ls /etc/apache2)
\`\`\`

The shell handles the plumbing, routing the output of both commands to “files” that are handed to \`diff\`: \`/dev/fd/63\` and \`/dev/fd/62\` in Bash, or \`/dev/fd/11\` and up in zsh. It tears everything down when the job finishes. You get all the convenience of pipes, for commands that stubbornly require files.`,
  },
  {
    syntax: "parallel 'a {} | b' ::: x y",
    summary: 'Run the pipeline once per argument. Jobs read `/dev/null`, and `parallel` collects their output unless `-u` is given.',
    more: `GNU \`parallel\` runs a command once for each argument after \`:::\`, in parallel, with \`{}\` replaced by the argument. Each job reads \`/dev/null\` rather than your keyboard. \`parallel\` holds each job’s output and prints it in one piece, so lines from different jobs don’t get mixed; with \`-u\` they write straight out instead.

\`\`\`
parallel 'wc -l {}' ::: a.txt b.txt
\`\`\`

Counts the lines of \`a.txt\` and \`b.txt\` at the same time.`,
  },
];
