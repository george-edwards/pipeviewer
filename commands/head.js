import { filterInput } from './helpers.js';

export default {
  names: ['head'],
  infer(ctx) {
    // The obsolete count form, head -5, when at most one file follows.
    const { args } = ctx;
    const counted = args.length <= 2 && !args[0]?.dynamic && /^-\d+$/.test(args[0]?.value || '');
    filterInput(ctx, { flags: 'qvz', values: 'cn', longFlags: ['--quiet', '--silent', '--verbose', '--zero-terminated'], longValues: ['--bytes', '--lines'] }, { skip: counted ? 1 : 0 });
  },
};
