# Pipeviewer

A small, dependency-free web app that maps stdin (0), stdout (1), and stderr (2) through a Unix pipeline. Paste a command, choose **Visualize pipeline**, and follow the colored connections. Nothing you paste is executed or sent to a server.

## Run

Requires Node.js 18 or newer.

```sh
npm start
```

Open http://localhost:5173. Use `npm run dev -- --port 3000` for a different port.

```sh
npm test       # Parser behavior and redirect ordering
npm run build # Static files in dist/
```

Serve `dist/` with any static host. No build dependencies or backend are needed. The interface uses optional Google Fonts with local fallbacks.

## Features

- Colored stream diagram, exact per-command descriptor mappings, and SVG export.
- Clickable examples, quick reference, and local persistence of the last pipeline.
- Left-to-right redirects, including descriptor snapshots and pipe overrides.
- `|`, `|&`, `<`, `>`, `>>`, `>|`, `n>&m`, `n<&m`, `&>`, `&>>`, and descriptor closing.
- Quoted arguments and destinations, escapes, and additional descriptor bookkeeping.

## Scope

This is a static descriptor map of simple Bash-style pipelines, assuming the usual initial descriptors 0–2 are open. It does not infer what commands do with their arguments (for example, `tee` opening a file), inspect files, check permissions, or execute input. Additional descriptors are listed in the cards; the diagram focuses on 0–2. Unsupported control operators, substitutions, here-documents, and dynamic redirect filenames produce an error. It does not model aliases, functions, shell options, or inherited descriptors beyond 0–2.

Semantics follow the Bash manual sections on [redirections](https://www.gnu.org/s/bash/manual/html_node/Redirections.html) and [pipelines](https://www.gnu.org/software/bash/manual/html_node/Pipelines).
