// The registry of command rules. Each file default-exports { names, infer(ctx) }:
//   names  the command names it models, such as ['grep', 'egrep', 'fgrep'].
//   infer  sets what the command does with each stream. Before it runs, stdin is “usage unknown”,
//          and stdout and stderr are unknown. ctx holds:
//     name, args     the command name as typed and its argument words ({ value, raw, dynamic, … })
//     platform       'linux' for GNU tools under Bash, or 'macos' for BSD and Apple tools under zsh
//     literalArgs    true when no argument holds an expansion
//     set(fd, usage) records a stream's usage, built with the helpers in helpers.js
//     output(reason) marks stdout as “may write”; errors() marks stderr as “on error”
//     infer(argv)    infers another command, for wrappers such as xargs and /usr/bin/time
//     setJob(job)    hands parallel's job command to the parser, to draw as a pipeline
//     note(text)     adds a note under the diagram, for a pitfall the stream map cannot show
// Optional keys say where a rule's programs ship by default:
//   linux, macos   false when none ship there, or the list of names that do; omitted means all
//   instead        per platform, what to use where a name is missing: { macos: { tac: 'use tail -r' } },
//                  with '*' for every name in the rule
// To add a command, add its file and list it here. The Quick reference lists the names alphabetically.
import apt from './apt.js';
import arch from './arch.js';
import awk from './awk.js';
import base64 from './base64.js';
import basename from './basename.js';
import brew from './brew.js';
import caffeinate from './caffeinate.js';
import cat from './cat.js';
import chcon from './chcon.js';
import chgrp from './chgrp.js';
import chmod from './chmod.js';
import chown from './chown.js';
import chroot from './chroot.js';
import cksum from './cksum.js';
import comm from './comm.js';
import cp from './cp.js';
import csplit from './csplit.js';
import curl from './curl.js';
import cut from './cut.js';
import date from './date.js';
import dd from './dd.js';
import df from './df.js';
import diff from './diff.js';
import dircolors from './dircolors.js';
import dirname from './dirname.js';
import du from './du.js';
import echo from './echo.js';
import env from './env.js';
import expand from './expand.js';
import expr from './expr.js';
import factor from './factor.js';
import find from './find.js';
import fmt from './fmt.js';
import fold from './fold.js';
import grep from './grep.js';
import groups from './groups.js';
import head from './head.js';
import hostid from './hostid.js';
import hostname from './hostname.js';
import id from './id.js';
import install from './install.js';
import join from './join.js';
import kill from './kill.js';
import less from './less.js';
import link from './link.js';
import ln from './ln.js';
import logname from './logname.js';
import ls from './ls.js';
import make from './make.js';
import md5 from './md5.js';
import md5sum from './md5sum.js';
import mkdir from './mkdir.js';
import mkfifo from './mkfifo.js';
import mknod from './mknod.js';
import mktemp from './mktemp.js';
import mv from './mv.js';
import nice from './nice.js';
import nl from './nl.js';
import nohup from './nohup.js';
import nproc from './nproc.js';
import numfmt from './numfmt.js';
import od from './od.js';
import open from './open.js';
import parallel from './parallel.js';
import paste from './paste.js';
import pathchk from './pathchk.js';
import pbcopy from './pbcopy.js';
import pbpaste from './pbpaste.js';
import pinky from './pinky.js';
import pr from './pr.js';
import printenv from './printenv.js';
import ptx from './ptx.js';
import pv from './pv.js';
import pwd from './pwd.js';
import readlink from './readlink.js';
import realpath from './realpath.js';
import rev from './rev.js';
import rm from './rm.js';
import rmdir from './rmdir.js';
import runcon from './runcon.js';
import say from './say.js';
import sed from './sed.js';
import seq from './seq.js';
import shasum from './shasum.js';
import shred from './shred.js';
import shuf from './shuf.js';
import sleep from './sleep.js';
import softwareupdate from './softwareupdate.js';
import sort from './sort.js';
import split from './split.js';
import stat from './stat.js';
import stdbuf from './stdbuf.js';
import stty from './stty.js';
import sudo from './sudo.js';
import sum from './sum.js';
import sw_vers from './sw_vers.js';
import sync from './sync.js';
import tac from './tac.js';
import tail from './tail.js';
import tee from './tee.js';
import test from './test.js';
import time from './time.js';
import timeout from './timeout.js';
import touch from './touch.js';
import tr from './tr.js';
import truth from './true.js';
import truncate from './truncate.js';
import tsort from './tsort.js';
import tty from './tty.js';
import uname from './uname.js';
import unexpand from './unexpand.js';
import uniq from './uniq.js';
import unlink from './unlink.js';
import uptime from './uptime.js';
import users from './users.js';
import wc from './wc.js';
import wget from './wget.js';
import who from './who.js';
import whoami from './whoami.js';
import xargs from './xargs.js';
import yes from './yes.js';
import zcat from './zcat.js';

export default [
  apt, arch, awk, base64, basename, brew, caffeinate, cat, chcon, chgrp, chmod, chown, chroot, cksum, comm,
  cp, csplit, curl, cut, date, dd, df, diff, dircolors, dirname, du, echo, env, expand, expr, factor,
  find, fmt, fold, grep, groups, head, hostid, hostname, id, install, join, kill, less, link, ln,
  logname, ls, make, md5, md5sum, mkdir, mkfifo, mknod, mktemp, mv, nice, nl, nohup, nproc, numfmt,
  od, open, parallel, paste, pathchk, pbcopy, pbpaste, pinky, pr, printenv, ptx, pv, pwd, readlink,
  realpath, rev, rm, rmdir, runcon, say, sed, seq, shasum, shred, shuf, sleep, softwareupdate, sort, split, stat,
  stdbuf, stty, sudo, sum, sw_vers, sync, tac, tail, tee, test, time, timeout, touch, tr, truth,
  truncate, tsort, tty, uname, unexpand, uniq, unlink, uptime, users, wc, wget, who, whoami, xargs,
  yes, zcat,
];
