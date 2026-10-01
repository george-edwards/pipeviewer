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

- Light and dark themes with higher-contrast text and stream colours. Follows the system theme until you choose a mode, then remembers your choice.
- Coloured stream diagram with zoom controls, middle-click drag to pan, per-command descriptor mappings, and SVG export. On wide windows the page uses the full width so long pipelines need less scrolling.
- Static stream-usage hints distinguish connections from actual command behaviour. Includes a `sleep 2 | echo "hello, world"` example and explanations of output timing.
- Clickable examples, quick reference, and local persistence of the last pipeline.
- Lists of pipelines joined by `&&`, `||`, `;`, or new lines, stacked in the order they run, each labelled with when it runs.
- Left-to-right redirects, including descriptor snapshots and pipe overrides.
- `|`, `|&`, `<`, `>`, `>>`, `>|`, `n>&m`, `n<&m`, `&>`, `&>>`, and descriptor closing.
- Process substitution: `2> >(cmd)`, `< <(cmd)`, and `<(cmd)` or `>(cmd)` as arguments (passed as `/dev/fd/63`, `/dev/fd/62`, …). Substitutions can hold their own pipelines and redirects. They inherit the owning command's descriptors at their position in the left-to-right redirect order. For example, `cat` in `echo hi 2> >(cat) | xargs` writes to the same pipe as `echo`'s stdout.
- GNU `parallel` job commands that parse as pipelines are drawn as a stacked job template below `parallel`. It runs once per argument, with stdin from `/dev/null` (or blocks from `parallel` with `--pipe`), and `parallel` collects its stdout and stderr. With `-u`, jobs write straight to `parallel`'s stdout and stderr. Commands without a replacement string such as `{}` have the arguments appended, as `parallel` does.
- Redirects to `/dev/tty` reach the terminal: reads connect to terminal input, stderr to terminal stderr, and other writes to terminal output.
- `/dev/stdin`, `/dev/stdout`, and `/dev/stderr` redirect to the current destination of 0, 1, or 2, like a descriptor copy. When that destination is a file, the step notes that Bash opens it again with a separate offset.
- Each routed stream gets its own lane; hover a line to fade the others and trace it.
- The diagram follows the editor caret, like a browser's element inspector: a command lights its card and streams, a redirect its port and destination, and `|` its pipe. Commands inside process substitutions and `parallel` jobs light up too. It works the other way too: hover part of the diagram to mark its text in the editor, and click to select it.
- Quoted arguments and destinations, escapes, and additional descriptor bookkeeping.

## Adding a command

Each modelled command has a file in `commands/` that default-exports `{ names, infer(ctx) }`. `infer` reads the arguments in `ctx` and records what the command does with stdin, stdout, and stderr. `commands/index.js` describes `ctx` and lists every rule, and `commands/helpers.js` holds the shared option scanners and usage builders. To add a command, write its file, then import and list it in `commands/index.js`. The Quick reference picks the new name up from there, and `npm test` fails if a file in `commands/` is not listed.

## Scope

This is a static descriptor map of simple Bash-style pipelines, assuming the usual initial descriptors 0–2 are open. It recognises every GNU coreutils program, as installed by default on Ubuntu Server and most Linux distributions, from `[` to `yes`, plus `kill`, `uptime`, and `hostname`. It also recognises `awk` (with `mawk`, `gawk`, and `nawk`), `sed`, `grep` (with `egrep` and `fgrep`), `find`, `xargs`, `parallel`, `zcat`, `rev`, `curl`, `wget`, `pv`, and `/usr/bin/time`. Wrappers such as `env`, `nice`, `nohup`, `stdbuf`, `timeout`, and `chroot` follow the command they run. Option tables come from the coreutils 8.32 `--help` output, with coreutils 9 additions where they change stream use, such as `cksum --check`. Common GNU/Linux options and file operands affect stream-usage hints. Advanced scripts, unseen script files, unknown options, and dynamic arguments retain conservative hints where needed. It does not inspect files, check permissions, or execute input. Other commands and unsupported argument forms remain conservative; filenames opened by commands themselves (for example, `tee`) are not mapped. Usage assumes standard commands without aliases or replacement functions. “No writes” is an inference, never a measured byte count. Diagnostics remain possible, including when stderr is merged into a pipe. Additional descriptors are listed in the cards; the diagram focuses on 0–2. Pipelines can be joined into a list with `&&`, `||`, `;`, or new lines; they are drawn one above another, since each runs after the one before. Background jobs (`&`), control structures, command substitutions, here-documents, and dynamic redirect filenames produce an error. Process substitutions must be separate words (`2> >(cmd)`, not `2>(cmd)`), and Bash's descriptor numbering is assumed to start at 63. It does not model aliases, functions, shell options, or inherited descriptors beyond 0–2.

Semantics follow the Bash manual sections on [redirections](https://www.gnu.org/s/bash/manual/html_node/Redirections.html) and [pipelines](https://www.gnu.org/software/bash/manual/html_node/Pipelines).

Command usage references: [GNU Coreutils](https://www.gnu.org/software/coreutils/manual/html_node/index.html), [GNU time](https://www.gnu.org/software/time/manual/html_node/Invoking-time.html), [GNU xargs](https://www.gnu.org/software/findutils/manual/html_node/find_html/xargs-options.html), [GNU find](https://www.gnu.org/software/findutils/manual/html_node/find_html/index.html), [GNU grep](https://www.gnu.org/software/grep/manual/grep.html), [curl](https://curl.se/docs/manpage.html), [GNU Wget](https://www.gnu.org/software/wget/manual/wget.html), [GNU awk](https://www.gnu.org/software/gawk/manual/html_node/Invoking-Summary.html), [GNU sed](https://www.gnu.org/software/sed/manual/sed.html), [util-linux rev](https://github.com/util-linux/util-linux/blob/master/text-utils/rev.1.adoc), and [pv](https://www.ivarch.com/programs/pv.shtml).
