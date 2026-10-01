import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD tail: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/tail/tail.c
const macos = bsd('+Fb:c:fn:qrv', ['--blocks=', '--bytes=', '--lines=', '--quiet', '--silent', '--verbose']);

export default {
  names: ['tail'],
  infer(ctx) {
    // The obsolete count forms, tail -5 and tail +5, when at most one file follows.
    const { args } = ctx;
    const counted = args.length <= 2 && !args[0]?.dynamic && /^[-+]\d+[bcl]?f?$/.test(args[0]?.value || '');
    filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'fFqvz', values: 'cns', longFlags: ['--follow', '--retry', '--quiet', '--silent', '--verbose', '--zero-terminated'],
      longValues: ['--bytes', '--lines', '--follow', '--sleep-interval', '--pid', '--max-unchanged-stats'] }, { skip: counted ? 1 : 0, dashMeansStdin: ctx.platform !== 'macos' });
  },
};
