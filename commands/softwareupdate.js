import { possible, unused, lenientOptions } from './helpers.js';

// macOS's system updater, the Mac counterpart of apt update and apt upgrade.
export default {
  names: ['softwareupdate'],
  linux: false,
  instead: { linux: { '*': 'use the distribution’s package manager, such as apt' } },
  infer({ args, set, output, errors }) {
    errors();
    if (args.some(arg => arg.dynamic)) return;
    const { has } = lenientOptions(args, { longValues: ['--full-installer-version', '--product-types', '--user'] });
    output('softwareupdate reports what it finds and does on stdout.');
    if (has('--stdinpass')) { set(0, possible(0, 'With --stdinpass, softwareupdate reads the password from stdin.')); return; }
    if (has('-i', '--install', '--fetch-full-installer') && !has('--agree-to-license')) {
      set(0, possible(0, 'Some updates ask you to agree to a licence before they install. --agree-to-license agrees without asking.'));
      return;
    }
    set(0, unused(0, 'softwareupdate does not read stdin here.'));
  },
};
