import { unused, runsCommand } from './helpers.js';

export default {
  names: ['nohup'],
  infer(ctx) {
    const { args, set, output } = ctx;
    if (args.length === 1 && ['--help', '--version'].includes(args[0].value)) {
      set(0, unused(0, 'nohup prints help or version information without reading stdin.'));
      output('nohup prints help or version information to stdout.');
      return;
    }
    if (!args.length) return;
    runsCommand(ctx, args.slice(args[0].value === '--' ? 1 : 0), {
      0: 'When stdin is a terminal, nohup replaces it with an unreadable file.',
      1: 'When stdout is a terminal, nohup appends it to nohup.out instead.',
      2: 'nohup may also print a notice about nohup.out.',
    });
  },
};
