import process from 'process';
import { spawnSync } from 'child_process';
import { isAndroid, isIOS } from 'which-runtime';

// The git remote helper (git-remote-git+pear) and the gip CLI ship with the
// gip-transport npm package — without the helper on PATH, git can't clone
// the git+pear:// urls Gear hands out.
//
// GUI apps launch with launchd's minimal PATH (no homebrew, no nvm), so both
// detection and install run through a login shell to see the user's real
// environment.
export const INSTALL_COMMAND = 'npm install -g gip-transport';

const SHELL = process.env.SHELL || '/bin/zsh';

function sh(cmd: string, timeout: number) {
	const result = spawnSync(SHELL, ['-lc', cmd], { stdio: 'pipe', timeout });
	return {
		ok: result.status === 0,
		stdout: result.output?.[1]?.toString().trim() ?? '',
		stderr: result.output?.[2]?.toString().trim() ?? ''
	};
}

export type CliStatus = { installed: boolean; path: string | null; npm: boolean };

export function cliStatus(): CliStatus | null {
	if (isAndroid || isIOS) return null;

	const helper = sh("command -v 'git-remote-git+pear'", 10_000);
	const npm = sh('command -v npm', 10_000);
	return {
		installed: helper.ok,
		path: helper.ok ? (helper.stdout.split('\n').pop() ?? null) : null,
		npm: npm.ok
	};
}

export function installCli(): { ok: boolean; error?: string } {
	const result = sh(INSTALL_COMMAND, 180_000);
	if (result.ok && cliStatus()?.installed) return { ok: true };

	const detail = (result.stderr || result.stdout).split('\n').slice(-3).join('\n');
	return { ok: false, error: detail || 'install failed' };
}
