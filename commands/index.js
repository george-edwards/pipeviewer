// The registry of command rules. Each file default-exports { names, infer(ctx) }:
//   names  the command names it models, such as ['grep', 'egrep', 'fgrep'].
//   infer  sets what the command does with each stream. Before it runs, stdin is “usage unknown”,
//          and stdout and stderr are unknown. ctx holds:
//     name, args     the command name as typed and its argument words ({ value, raw, dynamic, … })
//     literalArgs    true when no argument holds an expansion
//     set(fd, usage) records a stream's usage, built with the helpers in helpers.js
//     output(reason) marks stdout as “may write”; errors() marks stderr as “on error”
//     infer(argv)    infers another command, for wrappers such as xargs and /usr/bin/time
//     setJob(job)    hands parallel's job command to the parser, to draw as a pipeline
// To add a command, add its file and list it here. The Quick reference lists these names in order.
import sleep from './sleep.js';
import echo from './echo.js';
import cat from './cat.js';
import zcat from './zcat.js';
import wc from './wc.js';
import base64 from './base64.js';
import cut from './cut.js';
import paste from './paste.js';
import rev from './rev.js';
import head from './head.js';
import tail from './tail.js';
import ls from './ls.js';
import xargs from './xargs.js';
import time from './time.js';
import awk from './awk.js';
import sed from './sed.js';
import grep from './grep.js';
import sort from './sort.js';
import uniq from './uniq.js';
import curl from './curl.js';
import wget from './wget.js';
import pv from './pv.js';
import parallel from './parallel.js';
import find from './find.js';
import truth from './true.js';

export default [wc, base64, time, truth, sleep, echo, cat, zcat, xargs, parallel, ls, cut, paste, awk, sed, rev, head, tail, grep, sort, uniq, find, curl, wget, pv];
