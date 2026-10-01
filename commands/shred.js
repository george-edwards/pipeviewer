import { usage, possible, fileAction } from './helpers.js';

export default {
  names: ['shred'],
  macos: false,
  instead: { macos: { '*': 'on APFS and SSDs overwriting is not effective; rely on FileVault' } },
  infer(ctx) {
    const { set } = ctx;
    const scan = fileAction(ctx, { flags: 'fuvxz', values: 'ns', longFlags: ['--force', '--remove', '--verbose', '--exact', '--zero'],
      longValues: ['--iterations', '--random-source', '--size', '--remove'] });
    if (!scan.valid || scan.help) return;
    if (scan.options.has('-v') || scan.options.has('--verbose')) set(2, usage('possible', 'progress + errors', 'shred -v reports each pass on stderr, and may write diagnostics.'));
    // “shred -” overwrites whatever file stdout is open on.
    if (scan.files.some(file => file.value === '-')) set(1, possible(1, 'shred - overwrites the file that stdout is open on.'));
  },
};
