# Pipeviewer

A small, dependency-free web app that maps stdin (0), stdout (1), and stderr (2) through a Unix pipeline. Paste a command, choose **Visualise**, and follow the coloured connections. Nothing you paste is executed or sent to a server.

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

## Features

- Light and dark themes with higher-contrast text and stream colours. Follows the system theme until you choose a mode, then remembers your choice.
- Coloured stream diagram with zoom controls, per-command descriptor mappings, and SVG export.
- Static stream-usage hints distinguish connections from actual command behaviour. Includes a `sleep 2 | echo "hello, world"` example and explanations of output timing.
- Clickable examples, quick reference, and local persistence of the last pipeline.
- Left-to-right redirects, including descriptor snapshots and pipe overrides.
- `|`, `|&`, `<`, `>`, `>>`, `>|`, `n>&m`, `n<&m`, `&>`, `&>>`, and descriptor closing.
- Process substitution: `2> >(cmd)`, `< <(cmd)`, and `<(cmd)` or `>(cmd)` as arguments (passed as `/dev/fd/63`, `/dev/fd/62`, …). Substitutions can hold their own pipelines and redirects. They inherit the owning command's descriptors at their position in the left-to-right redirect order. For example, `cat` in `echo hi 2> >(cat) | xargs` writes to the same pipe as `echo`'s stdout.
- Redirects to `/dev/tty` reach the terminal: reads connect to terminal input, stderr to terminal stderr, and other writes to terminal output.
- `/dev/stdin`, `/dev/stdout`, and `/dev/stderr` redirect to the current destination of 0, 1, or 2, like a descriptor copy. When that destination is a file, the step notes that Bash opens it again with a separate offset.
- Each routed stream gets its own lane; hover a line to fade the others and trace it.
- Quoted arguments and destinations, escapes, and additional descriptor bookkeeping.

## Scope

This is a static descriptor map of simple Bash-style pipelines, assuming the usual initial descriptors 0–2 are open. It recognises `wc`, `base64`, `/usr/bin/time`, `true`, `false`, `sleep`, `echo`, `printf`, `cat`, `xargs`, `ls`, `cut`, `paste`, `awk`, `sed`, and `rev`. Common GNU/Linux options and file operands affect stream-usage hints. The `time` wrapper follows the usage of its child command. Advanced scripts, unseen script files, unknown options, and dynamic arguments retain conservative hints where needed. It does not inspect files, check permissions, or execute input. Other commands and unsupported argument forms remain conservative; filenames opened by commands themselves (for example, `tee`) are not mapped. Usage assumes standard commands without aliases or replacement functions. “No writes” is an inference, never a measured byte count. Diagnostics remain possible, including when stderr is merged into a pipe. Additional descriptors are listed in the cards; the diagram focuses on 0–2. Unsupported control operators, command substitutions, here-documents, and dynamic redirect filenames produce an error. Process substitutions must be separate words (`2> >(cmd)`, not `2>(cmd)`), and Bash's descriptor numbering is assumed to start at 63. It does not model aliases, functions, shell options, or inherited descriptors beyond 0–2.

Semantics follow the Bash manual sections on [redirections](https://www.gnu.org/s/bash/manual/html_node/Redirections.html) and [pipelines](https://www.gnu.org/software/bash/manual/html_node/Pipelines).

Command usage references: [GNU Coreutils](https://www.gnu.org/software/coreutils/manual/coreutils.html), [GNU time](https://www.gnu.org/software/time/manual/html_node/Invoking-time.html), [GNU xargs](https://www.gnu.org/software/findutils/manual/html_node/find_html/xargs-options.html), [GNU awk](https://www.gnu.org/software/gawk/manual/html_node/Invoking-Summary.html), [GNU sed](https://www.gnu.org/software/sed/manual/sed.html), and [util-linux rev](https://github.com/util-linux/util-linux/blob/master/text-utils/rev.1.adoc).
