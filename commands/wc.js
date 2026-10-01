import { namesFrom, filterInput, bsd } from './helpers.js';

// macOS ships the BSD wc: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/wc/wc.c
const macos = bsd('clmwL');

export default {
  names: ['wc'],
  infer(ctx) {
    // BSD wc takes libxo's --libxo=FORMAT before its own options; output still goes to stdout.
    const mac = ctx.platform === 'macos';
    const scan = filterInput(mac ? { ...ctx, args: ctx.args.filter(arg => !/^--libxo(?:=|$)/.test(arg.value)) } : ctx, mac ? macos : { flags: 'clmwL', longFlags: ['--bytes', '--chars', '--lines', '--words', '--max-line-length'], longValues: ['--files0-from', '--total'] }, { dashMeansStdin: !mac });
    if (scan.valid && scan.options.has('--files0-from')) ctx.set(0, namesFrom(ctx.name, scan.options.get('--files0-from')));
  },
};
