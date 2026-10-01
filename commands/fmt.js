import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD fmt: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/fmt/fmt.c
const macos = bsd('0123456789cd:hl:mnpst:w:');

export default {
  names: ['fmt'],
  infer(ctx) {
    // Obsolete width forms such as -72 are accepted as digit flags.
    // BSD fmt reads leading numbers as goal and maximum widths, as in fmt 65 75 file.
    const operands = ctx.args.findIndex(arg => !/^-/.test(arg.value));
    const args = ctx.platform !== 'macos' || operands === -1 ? ctx.args : ctx.args.filter((arg, i) => i < operands || !/^\d+$/.test(arg.value) || ctx.args.slice(operands, i).some(a => !/^\d+$/.test(a.value)));
    filterInput({ ...ctx, args }, ctx.platform === 'macos' ? macos : { flags: 'cstu0123456789', values: 'pwg', longFlags: ['--crown-margin', '--split-only', '--tagged-paragraph', '--uniform-spacing'],
      longValues: ['--prefix', '--width', '--goal'] }, { dashMeansStdin: ctx.platform !== 'macos', writes: 'fmt writes its input refilled into paragraphs of even width.' });
  },
};
