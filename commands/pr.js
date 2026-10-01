import { filterInput } from './helpers.js';

export default {
  names: ['pr'],
  infer(ctx) {
    // +PAGE selects pages rather than naming a file, and -COLUMN digits set the column count.
    const pages = ctx.args.filter(arg => !/^\+\d/.test(arg.value));
    filterInput({ ...ctx, args: pages }, { flags: 'acdeFfiJmnrsStTv0123456789', values: 'CDhlNowW', longFlags: ['--across', '--show-control-chars', '--double-space', '--expand-tabs', '--form-feed', '--output-tabs', '--join-lines', '--merge', '--number-lines', '--no-file-warnings', '--separator', '--sep-string', '--omit-header', '--omit-pagination', '--show-nonprinting'],
      longValues: ['--columns', '--date-format', '--expand-tabs', '--header', '--output-tabs', '--length', '--number-lines', '--first-line-number', '--indent', '--separator', '--sep-string', '--width', '--page-width'] }, { writes: 'pr writes its input paginated, with a header on each page.' });
  },
};
