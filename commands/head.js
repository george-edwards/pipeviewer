import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD head: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/head/head.c
const macos = bsd('+n:c:', ['--bytes=', '--lines=']);

export default {
  names: ['head'],
  infer(ctx) {
    // The obsolete count form, head -5, when at most one file follows.
    const { args } = ctx;
    const counted = args.length <= 2 && !args[0]?.dynamic && /^-\d+$/.test(args[0]?.value || '');
    filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'qvz', values: 'cn', longFlags: ['--quiet', '--silent', '--verbose', '--zero-terminated'], longValues: ['--bytes', '--lines'] }, { skip: counted ? 1 : 0, dashMeansStdin: ctx.platform !== 'macos' });
  },
};
