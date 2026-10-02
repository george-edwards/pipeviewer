import { usage, possible, unused, lenientOptions } from './helpers.js';

// Debian and Ubuntu's apt and apt-get. Subcommands that change packages ask “Do you want to
// continue? [Y/n]” and read the answer from stdin, unless -y answers it or -s only simulates.
const changes = ['install', 'remove', 'purge', 'upgrade', 'full-upgrade', 'dist-upgrade', 'autoremove', 'autopurge', 'reinstall', 'build-dep', 'satisfy', 'dselect-upgrade'];
const queries = ['update', 'list', 'search', 'show', 'showsrc', 'policy', 'depends', 'rdepends', 'changelog', 'download', 'source', 'clean', 'autoclean', 'check', 'indextargets', 'moo'];

export default {
  names: ['apt', 'apt-get'],
  macos: false,
  instead: { macos: { '*': 'use softwareupdate for system updates, or Homebrew’s brew for packages' } },
  infer({ name, args, set, output, errors }) {
    errors();
    if (args.some(arg => arg.dynamic)) return;
    const { operands, has, values } = lenientOptions(args, { shortValues: 'oct', longValues: ['--option', '--config-file', '--target-release', '--default-release'] });
    const command = operands[0];
    if (!command || has('-h', '--help', '-v', '--version')) {
      set(0, unused(0, `${name} prints its usage or version without reading stdin.`));
      output(`${name} prints its usage or version to stdout.`);
      return;
    }
    if (queries.includes(command)) {
      set(0, unused(0, `${name} ${command} does not ask anything, so it never reads stdin.`));
      output(`${name} ${command} reports its progress and results on stdout.`);
      return;
    }
    if (!changes.includes(command)) return;
    output(`${name} ${command} reports its progress on stdout.`);
    // -qq implies -y. --assume-no answers no without asking.
    const quiet = has('-qq') || values('-q', '--quiet').some(level => Number(level) >= 2) || args.filter(arg => /^-q+$/.test(arg.value)).reduce((n, arg) => n + arg.value.length - 1, 0) >= 2;
    if (has('-s', '--simulate', '--dry-run', '--just-print', '--recon', '--no-act')) {
      set(0, unused(0, `${name} ${command} -s only simulates the change, so it asks nothing.`));
    } else if (has('-y', '--yes', '--assume-yes', '--assume-no') || quiet) {
      set(0, usage('unknown', 'usage unknown', `With -y, ${name} answers its own “Do you want to continue?” question, but dpkg and debconf can still ask, such as whether to keep a changed configuration file, while packages are set up.`));
    } else {
      set(0, possible(0, `${name} ${command} asks “Do you want to continue? [Y/n]” and reads the answer from stdin. Give -y to answer yes without asking.`));
    }
  },
};
