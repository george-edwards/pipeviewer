# Pipeviewer

A small, dependency-free web app that maps stdin (0), stdout (1), and stderr (2) through a Unix pipeline. Type or paste a command and follow the coloured connections. The diagram updates as you type. Nothing you paste is executed or sent to a server.

## Run

Requires Node.js 18 or newer.

```sh
npm start
```

Open http://localhost:5173. Use `npm run dev -- --port 3000` for a different port.

```sh
npm test       # Parser behaviour and redirect ordering
npm run build # Static files in dist/
```

Serve `dist/` with any static host. No build dependencies or backend are needed. The interface uses optional Google Fonts with local fallbacks.

The **Tips & Tricks** button plays a recorded talk from `video/`, which is not in git. Put the `.webm` file there before building, and `npm run build` copies it to `dist/video/`. Your static host must support HTTP range requests so the player can seek. The dev server supports them.

## Features

- **Training** mode, from the green button in the header, teaches redirects by picture. Each level shows the diagram of a command the student can't see, and they edit a starting command until their own diagram matches it. See [Training](#training).

- Light, dark and terminal themes. The terminal theme is phosphor green on black, all monospace. The page follows the system's light or dark theme until you pick one with the theme button, which shows the current theme, steps through the three, and remembers your choice. In the terminal theme the command editor is a black terminal too. The editor names the shell the **SHELL** switch picks, and a faint Tux or apple watermark behind the page shows which system is being mapped.
- Coloured stream diagram with zoom controls, middle-click drag to pan, per-command descriptor mappings, and SVG export. On wide windows the page uses the full width so long pipelines need less scrolling.
- Static stream-usage hints distinguish connections from actual command behaviour. Includes a `sleep 2 | echo "hello, world"` example and explanations of output timing.
- Clickable examples, each with its related spellings under **Variations**, and a quick reference. Clicking the chosen example again clears the editor. The **Redirects** switch shows any pipeline, an example or your own, in the common style (`< file`, `> file`, `>&2`), the default, or the explicit one (`0< file`, `1> file`, `1>&2`). Variations and Redirects show their buttons only when the pipeline has something for them.
- Lists of pipelines joined by `&&`, `||`, `;`, or new lines, stacked in the order they run, each labelled with when it runs.
- Left-to-right redirects, including descriptor snapshots and pipe overrides.
- `|`, `|&`, `<`, `>`, `>>`, `>|`, `n>&m`, `n<&m`, `&>`, `&>>`, and descriptor closing.
- Process substitution: `2> >(cmd)`, `< <(cmd)`, and `<(cmd)` or `>(cmd)` as arguments (passed as `/dev/fd/63`, `/dev/fd/62`, …). Substitutions can hold their own pipelines and redirects. One used as a redirect target inherits the owning command's descriptors at its position in the left-to-right redirect order; one used as an argument is expanded before any redirect, so it gets the pipeline's pipes but none of the command's redirects. For example, `cat` in `echo hi 2> >(cat) | xargs` writes to the same pipe as `echo`'s stdout.
- `xargs` running a shell script per item (`xargs -P 8 sh -c '… "$1" …' _`) is drawn the same way. Its jobs read `/dev/null` and write straight to `xargs`'s stdout and stderr, and the script follows Bash's rules even on macOS, since `sh` is not zsh.
- GNU `parallel` job commands that parse as pipelines are drawn as a stacked job template below `parallel`. It runs once per argument, with stdin from `/dev/null` (or blocks from `parallel` with `--pipe`), and `parallel` collects its stdout and stderr. With `-u`, jobs write straight to `parallel`'s stdout and stderr. Commands without a replacement string such as `{}` have the arguments appended, as `parallel` does.
- Redirects to `/dev/tty` reach the terminal: reads connect to terminal input, stderr to terminal stderr, and other writes to terminal output.
- `/dev/stdin`, `/dev/stdout`, and `/dev/stderr` redirect to the current destination of 0, 1, or 2, like a descriptor copy. When that destination is a file, the step notes that Bash opens it again with a separate offset.
- A stream to or from the terminal ends in a small **terminal** tag beside its port instead of a route to a shared box, much as circuit diagrams mark ground. The tag is coloured for the terminal stream it reaches, green for input, purple for output and amber for errors, so stdout sent to the terminal's stderr with `>&2` ends in an amber tag. A closed descriptor, as `2>&-` leaves stderr, ends in a grey **closed** tag.
- A file that only one stream uses ends in a small tag beside that port, naming the file. stderr's fits in the gap before the next card, and where a card sits beside stdin or stdout, their tag rises into the space above the pipe between the two, as `response.html` does in `curl https://example.com 2>&1 > response.html | grep "error"`. A file two streams share, as in `make 1> build.log 2>&1`, keeps its box so the drawing shows both reaching it. `/dev/null`, `/dev/zero`, `/dev/full` (Linux only), `/dev/random` and `/dev/urandom` get their own glyphs and a word on what a read or a write does, in tags and boxes alike. The **Tags** switch in the diagram toolbar brings back the routes for both.
- Each routed stream gets its own lane; hover a line to fade the others and trace it.
- The **Highlight** button in the diagram toolbar turns the linking between the command and the diagram on or off, in both directions.
- The diagram follows the editor caret, like a browser's element inspector: a command lights its card and streams, a redirect its port and destination, and `|` its pipe. Commands inside process substitutions and `parallel` jobs light up too. It works the other way too: hover part of the diagram to mark its text in the editor, and click to select it.
- Descriptors above 2 that stay open are drawn on their card. One left writing to the pipe to the next command, as `3>&1 1>&2 2>&3` leaves fd 3, gets a port on the card's bottom edge and a line into that command's stdin, since it keeps the pipe open. The others are listed in the card's lower-left corner with where they point. One used and then closed, as with `3>&-`, is listed as closed.
- Quoted arguments and destinations, escapes, and additional descriptor bookkeeping.

## Training

Training opens with a crossfade. The first time, a short tour dims the page and moves a spotlight from the command, to its picture, to the target, to the hints, with a card explaining each. **Show me around** runs it again.

Each level shows a target picture and a starting command, typed and drawn. The student edits the command until their picture matches the target's. On windows 64em wide or more the two pictures sit side by side under the editor: the student's on the left, just under where they type, and the target's on the right. Both are cropped to one shared frame so they are drawn at the same scale. On narrower windows the target sits above the editor. The training screen leaves out the viewer's key, insights, descriptor details and toolbar switches, and the caret doesn't fade parts of the picture, so nothing gets in the way of comparing the two. A ring marks each port whose stream goes somewhere else in the target, in both pictures, and a dashed outline marks a card whose words differ. The toolbar counts the differences.

Pictures are compared, not spellings. Two command lines match when they draw the same cards, with the same words after quote removal, and send every descriptor to the same place. So `sort <in >out`, `sort 0< in 1> out` and `>out sort <in` all solve the same level. Once a level is solved, the target's own command is shown above its picture, and the student's spelling is compared with it if the two differ.

A level is worth three stars. There are three hints: **What's different?** lists each difference in words, **Show me how** gives the syntax, and **Answer** shows the target command. Each hint costs a star, but a solved level always earns at least one. When the pictures match, the streams start to flow, and Enter or the button moves on to the next level, keeping the student's command as its starting point. Best stars per level are kept in the browser's local storage.

Link to `/#training` to open training at the first unsolved level, or to `/#training/2` for level 2.

### Adding a level

Levels are listed in `lessons.js`, in the order they're played. Each has an `id` (keep it fixed once published, since progress is saved under it), a `title`, a `brief`, a `target`, a `how` hint and a `learned` note shown once it's solved. `start` is the command in the editor when the level opens; leave it out to start from the previous level's target. Text in backticks is set as code. `npm test` checks that every target parses under both shells and that no level starts out already solved.

## macOS and zsh

The **SHELL** switch above the editor, Tux for Linux and Bash and an apple for macOS and zsh, maps a command line as macOS runs it: under zsh, the default macOS shell, with the BSD and Apple versions of the tools. It starts on macOS on Apple devices and on Linux elsewhere, and remembers your choice once you pick one.

- zsh's MULTIOS option is on by default, so a redirect adds a destination instead of replacing the pipe or an earlier redirect. `cmd > out | grep x` sends output to both, and `cmd 2>&1 > /dev/null | grep x` gives grep both streams. The diagram draws a line to each target.
- Process substitutions are numbered from `/dev/fd/11`. One used as an argument gets the shell's own descriptors; one used as a redirect target sees the pipeline's pipes but not the command's redirects.
- A line of only redirects runs `cat`, or `more` for input. `#` does not start a comment at an interactive prompt, and only single digits name descriptors.
- Tools follow the macOS 15 builds: option strings come from Apple's sources (github.com/apple-oss-distributions), and the BSD tools stop reading options at the first file name. Many treat `-` as a file, `sed -i` takes a backup suffix, `base64` reads `-i FILE`, `date -f` is a parse format, and `zcat` wants `.Z` files (use `gzcat`). Commands macOS lacks, such as `tac`, `timeout` and `nproc`, show as unknown with the usual replacement. Mac tools such as `pbcopy`, `pbpaste`, `say`, `open`, `caffeinate`, `md5` and `sw_vers` are modelled.

The Wiki download and Wiki pageviews examples use GNU parallel, wget, pv and mawk, which stock macOS lacks, so in macOS mode they load versions built on `xargs -P`, `curl -Z`, `gzcat` and `dd status=progress`. Flipping the switch with one loaded swaps it for the other system's version.

The zsh rules were checked against zsh 5.8; macOS ships 5.9, whose changelog lists no changes to them.

## Adding a command

Each modelled command has a file in `commands/` that default-exports `{ names, infer(ctx) }`, plus optional `linux` and `macos` keys for where it ships. `ctx.platform` says which system is being mapped. `infer` reads the arguments in `ctx` and records what the command does with stdin, stdout, and stderr. `commands/index.js` describes `ctx` and lists every rule, and `commands/helpers.js` holds the shared option scanners and usage builders. To add a command, write its file, then import and list it in `commands/index.js`. The Quick reference picks the new name up from there, and `npm test` fails if a file in `commands/` is not listed.

## Scope

This is a static descriptor map of simple Bash-style pipelines, assuming the usual initial descriptors 0–2 are open. It recognises every GNU coreutils program, as installed by default on Ubuntu Server and most Linux distributions, from `[` to `yes`, plus `kill`, `uptime`, and `hostname`. It also recognises `awk` (with `mawk`, `gawk`, and `nawk`), `sed`, `grep` (with `egrep` and `fgrep`), `find`, `xargs`, `parallel`, `zcat`, `rev`, `curl`, `wget`, `pv`, and `/usr/bin/time`. Wrappers such as `env`, `nice`, `nohup`, `stdbuf`, `timeout`, and `chroot` follow the command they run. Option tables come from the coreutils 8.32 `--help` output, with coreutils 9 additions where they change stream use, such as `cksum --check`. Common GNU/Linux options and file operands affect stream-usage hints. Advanced scripts, unseen script files, unknown options, and dynamic arguments retain conservative hints where needed. It does not inspect files, check permissions, or execute input. Other commands and unsupported argument forms remain conservative; filenames opened by commands themselves (for example, `tee`) are not mapped. Usage assumes standard commands without aliases or replacement functions. “No writes” is an inference, never a measured byte count. Diagnostics remain possible, including when stderr is merged into a pipe. Descriptors above 2 are drawn on their cards and listed in Descriptor details; routes and boxes are for 0–2. Pipelines can be joined into a list with `&&`, `||`, `;`, or new lines; they are drawn one above another, since each runs after the one before. Background jobs (`&`), control structures, command substitutions, here-documents, and dynamic redirect filenames produce an error. Process substitutions must be separate words (`2> >(cmd)`, not `2>(cmd)`), and Bash's descriptor numbering is assumed to start at 63. It does not model aliases, functions, shell options, or inherited descriptors beyond 0–2.

Semantics follow the Bash manual sections on [redirections](https://www.gnu.org/s/bash/manual/html_node/Redirections.html) and [pipelines](https://www.gnu.org/software/bash/manual/html_node/Pipelines).

Command usage references: [GNU Coreutils](https://www.gnu.org/software/coreutils/manual/html_node/index.html), [GNU time](https://www.gnu.org/software/time/manual/html_node/Invoking-time.html), [GNU xargs](https://www.gnu.org/software/findutils/manual/html_node/find_html/xargs-options.html), [GNU find](https://www.gnu.org/software/findutils/manual/html_node/find_html/index.html), [GNU grep](https://www.gnu.org/software/grep/manual/grep.html), [curl](https://curl.se/docs/manpage.html), [GNU Wget](https://www.gnu.org/software/wget/manual/wget.html), [GNU awk](https://www.gnu.org/software/gawk/manual/html_node/Invoking-Summary.html), [GNU sed](https://www.gnu.org/software/sed/manual/sed.html), [util-linux rev](https://github.com/util-linux/util-linux/blob/master/text-utils/rev.1.adoc), and [pv](https://www.ivarch.com/programs/pv.shtml).
