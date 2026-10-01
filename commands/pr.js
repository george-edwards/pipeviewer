import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD pr, which uses its own option parser: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/pr/pr.c
const macos = { flags: 'adFfmrtpeins0123456789', values: 'hLlow', stopAtOperand: true };

export default {
  names: ['pr'],
  infer(ctx) {
    // +PAGE selects pages rather than naming a file, and -COLUMN digits set the column count.
    const pages = ctx.args.filter(arg => !/^\+\d/.test(arg.value));
    filterInput({ ...ctx, args: pages }, ctx.platform === 'macos' ? macos : { flags: 'acdeFfiJmnrsStTv0123456789', values: 'CDhlNowW', longFlags: ['--across', '--show-control-chars', '--double-space', '--expand-tabs', '--form-feed', '--output-tabs', '--join-lines', '--merge', '--number-lines', '--no-file-warnings', '--separator', '--sep-string', '--omit-header', '--omit-pagination', '--show-nonprinting'],
      longValues: ['--columns', '--date-format', '--expand-tabs', '--header', '--output-tabs', '--length', '--number-lines', '--first-line-number', '--indent', '--separator', '--sep-string', '--width', '--page-width'] }, { writes: 'pr writes its input paginated, with a header on each page.' });
  },
};
