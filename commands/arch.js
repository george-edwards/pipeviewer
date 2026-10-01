import { unused, printer, runsCommand } from './helpers.js';

export default {
  names: ['arch'],
  infer(ctx) {
    if (ctx.platform !== 'macos') { printer(ctx, 'arch reports on the machine', 'arch writes the machine hardware name to stdout.'); return; }
    // Apple's arch runs a command under another architecture, as in arch -x86_64 make. Options
    // name architectures (-x86_64, -arm64, -arch NAME) or environment (-e NAME=VALUE, -d NAME).
    const { args, set, output, errors } = ctx;
    let i = 0;
    while (i < args.length && args[i].value.startsWith('-')) i += ['-arch', '-e', '-d'].includes(args[i].value) ? 2 : 1;
    if (i < args.length) { runsCommand(ctx, args.slice(i)); return; }
    if (args.length) return;
    set(0, unused(0, 'arch with no command reports the architecture; it does not read stdin.'));
    output('arch with no command writes the architecture, arm64 or i386.'); errors();
  },
};
