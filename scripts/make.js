#!/usr/bin/env node

// Build one host's distributable.
//
//   node scripts/make.js                      # this machine's host
//   node scripts/make.js --host linux-x64     # a specific host
//
// Each host is a plain `bare-build` invocation in package.json#scripts, so the
// build itself stays readable and greppable. This script only picks the right
// one, appends the signing flags (which carry secrets and so can't live in
// package.json), and runs the post-steps bare-build doesn't cover — notarizing,
// stapling and the dmg on macOS.
//
// Artifacts land in out/make/<host>/ and are named after package.json#productName,
// which is what pear-build requires. A host directory holds the app and nothing
// else — that is what scripts/release.js hands pear-repo to collect — so the
// signing certificate goes to out/cer/<host>/ instead.

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readSync,
	rmSync,
	mkdtempSync,
	writeFileSync
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.productName;

// Load .env from the project root if present, without clobbering the real env.
{
	const envPath = join(ROOT, '.env');
	if (existsSync(envPath)) {
		for (const line of readFileSync(envPath, 'utf8').split('\n')) {
			const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
		}
	}
}

const HOSTS = {
	'darwin-arm64': { os: 'darwin', artifact: `${NAME}.app` },
	'darwin-x64': { os: 'darwin', artifact: `${NAME}.app` },
	'linux-arm64': { os: 'linux', artifact: `${NAME}.AppImage` },
	'linux-x64': { os: 'linux', artifact: `${NAME}.AppImage` },
	'win32-arm64': { os: 'win32', artifact: `${NAME}.msix` },
	'win32-x64': { os: 'win32', artifact: `${NAME}.msix` },
	'android-arm64': { os: 'android', artifact: `${NAME}.apk` }
};

// ── Args ──────────────────────────────────────────────────────────────────────

let host = `${process.platform}-${process.arch}`;
// Answer yes to the Windows certificate prompt rather than asking. pear-repo
// sets PEAR_MAKE_CONFIRM=0 when it spawns this step with nobody watching — an
// OTA rebuild, where the certificate was already created and trusted by the
// install that put the app there, and is only recreated if it has since expired
// or been removed. -y is the same answer, given by hand.
let yes = process.env.PEAR_MAKE_CONFIRM === '0';
const argv = process.argv.slice(2);

for (let i = 0; i < argv.length; i++) {
	const arg = argv[i];
	if (arg === '--host') host = argv[++i];
	else if (arg.startsWith('--host=')) host = arg.slice('--host='.length);
	else if (arg === '-y' || arg === '--yes') yes = true;
	else fail(`Unknown argument: ${arg}\nUsage: node scripts/make.js [--host <host>] [-y]`);
}

if (!HOSTS[host]) {
	fail(`Unsupported host: ${host}\nSupported: ${Object.keys(HOSTS).join(', ')}`);
}

const { os, artifact } = HOSTS[host];
const out = join(ROOT, 'out', 'make', host);
const certs = join(ROOT, 'out', 'cer', host);

// bare-build ships prebuilt runtimes for every host, so the JS side
// cross-builds fine. The packaging and signing tools do not, so three of the
// four families are pinned to their own runner.
const NATIVE = {
	darwin: process.platform === 'darwin',
	win32: process.platform === 'win32',
	linux: process.platform === 'linux',
	android: true
};

const WHY = {
	darwin: 'codesign and notarytool are macOS-only',
	win32: 'MSIX packaging needs makeappx from the Windows SDK',
	linux: 'AppImage packaging needs bare-app-image, which is a linux-only package'
};

if (!NATIVE[os]) {
	fail(`Cannot build ${host} on ${process.platform}: ${WHY[os]}.\nUse a matching CI runner.`);
}

// ── Signing flags, from the environment ───────────────────────────────────────

function signingFlags() {
	if (os === 'darwin') {
		const identity = process.env.MAC_CODESIGN_IDENTITY;
		if (!identity) {
			warn('MAC_CODESIGN_IDENTITY unset — building unsigned (other Macs need right-click → Open)');
			return [];
		}
		return [
			'--sign',
			'--identity',
			identity,
			'--entitlements',
			join(ROOT, 'entitlements.plist'),
			'--hardened-runtime'
		];
	}

	if (os === 'win32') {
		if (process.env.WINDOWS_NO_SIGN) {
			warn('WINDOWS_NO_SIGN set — unsigned MSIX, which Windows will refuse to install');
			return ['--subject', process.env.WINDOWS_SUBJECT || `CN=${NAME}`];
		}

		// Publisher in the generated AppxManifest is the certificate's own
		// subject, not an independent value: Windows refuses an update whose
		// Publisher differs from the installed package's, and deriving it from the
		// cert is what stops the two from drifting apart across releases.
		const { subject, thumbprint } = ensureCertificate();
		return ['--sign', '--subject', subject, '--thumbprint', thumbprint];
	}

	if (os === 'android') {
		const keystore = process.env.ANDROID_KEYSTORE;
		const key = process.env.ANDROID_KEYSTORE_KEY;
		const password = process.env.ANDROID_KEYSTORE_PASSWORD;
		if (!(keystore && key && password)) {
			warn('ANDROID_KEYSTORE / _KEY / _PASSWORD unset — building unsigned');
			return [];
		}
		return [
			'--sign',
			'--keystore',
			keystore,
			'--keystore-key',
			key,
			'--keystore-password',
			password
		];
	}

	// AppImage signing is GPG-based and optional.
	const key = process.env.LINUX_GPG_KEY;
	return key ? ['--sign', '--key', key] : [];
}

// ── Run ───────────────────────────────────────────────────────────────────────

const t0 = Date.now();

section(`vite build`);
run('npm', ['run', 'build']);

section(`bare-build ${host}`);
const script = `make:${host}`;
if (!pkg.scripts[script]) fail(`Missing package.json script: ${script}`);
run('npm', ['run', script, '--', ...signingFlags()]);

if (os === 'darwin') notarize();
if (os === 'win32' && !process.env.WINDOWS_NO_SIGN) trustCertificate(exportCertificate());

const built = join(out, artifact);
if (!existsSync(built)) fail(`Expected artifact missing: ${built}`);

console.log(`\n✓ ${host} → ${built}  (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

// ── macOS post-steps ──────────────────────────────────────────────────────────

// bare-build signs the bundle but does not notarize it. An un-notarized app
// trips Gatekeeper on first launch, and the OTA swap copies whatever is in the
// drive — so the staple has to happen before the build is staged, not after.
function notarize() {
	if (!process.env.MAC_CODESIGN_IDENTITY) {
		warn('skipping notarization — unsigned build');
		return;
	}

	// A keychain profile is the convenient local path but does not exist on a
	// fresh CI runner, so Apple ID credentials win when they are present.
	const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env;
	const credentials =
		APPLE_ID && APPLE_PASSWORD && APPLE_TEAM_ID
			? ['--apple-id', APPLE_ID, '--password', APPLE_PASSWORD, '--team-id', APPLE_TEAM_ID]
			: ['--keychain-profile', process.env.KEYCHAIN_PROFILE || 'gear'];

	const bundle = join(out, artifact);
	const temp = mkdtempSync(join(tmpdir(), 'gear-notarize-'));
	const zip = join(temp, 'notarize.zip');

	section('notarize');
	run('ditto', ['-c', '-k', '--keepParent', bundle, zip]);
	run('xcrun', ['notarytool', 'submit', zip, ...credentials, '--wait']);
	rmSync(temp, { recursive: true, force: true });

	section('staple');
	run('xcrun', ['stapler', 'staple', bundle]);

	section('dmg');
	const dmg = join(ROOT, 'out', `${NAME}-${host}.dmg`);
	if (existsSync(dmg)) rmSync(dmg);
	run('hdiutil', ['create', '-volname', NAME, '-srcfolder', bundle, '-ov', '-format', 'UDZO', dmg]);
}

// ── Windows code signing ──────────────────────────────────────────────────────

// Windows will not install an MSIX whose signer it does not trust, so a Windows
// build needs a code-signing certificate — the one genuinely annoying part of
// shipping one, since getting hold of a certificate is a task in itself.
//
// Nothing here asks the user to do that. A source install builds on the machine
// that will run the app, so the build makes its own certificate the first time,
// leaves it in the user's store, and reuses it for every release after that. The
// reuse is the point: a stable certificate means a stable Publisher, and Windows
// refuses an update whose Publisher moved. WINDOWS_THUMBPRINT takes over when
// there is a real certificate to use instead.

let certificate = null;

function ensureCertificate() {
	if (certificate) return certificate;

	const given = process.env.WINDOWS_THUMBPRINT;

	// A caller-supplied certificate: subject is read back from it rather than
	// taken from WINDOWS_SUBJECT, so Publisher cannot be set to something the
	// signature will not match.
	const subject = given
		? powershell(
				`$c = Get-ChildItem Cert:\\CurrentUser\\My, Cert:\\LocalMachine\\My ` +
					`| Where-Object { $_.Thumbprint -eq ${ps(given)} } | Select-Object -First 1; ` +
					`if ($null -eq $c) { throw 'certificate ${given} not found' }; Write-Output $c.Subject`
			)
		: process.env.WINDOWS_SUBJECT || `CN=${NAME} Source Build`;

	// Any existing, unexpired code-signing certificate with this subject. The
	// private key has to be there too — an imported public cert cannot sign.
	let thumbprint =
		given ||
		powershell(
			`$c = Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { ` +
				`$_.Subject -eq ${ps(subject)} -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) ` +
				`} | Sort-Object NotAfter -Descending | Select-Object -First 1; ` +
				`if ($c) { Write-Output $c.Thumbprint } else { Write-Output 'none' }`
		);

	const creating = thumbprint === 'none';
	const trusting = !process.env.WINDOWS_NO_TRUST && (creating || !isTrusted(thumbprint));

	// Asked before the build rather than after it: both steps change the user's
	// machine, and neither is worth discovering at the end of a long build. If
	// the certificate is already there and already trusted — every release after
	// the first — nothing is asked at all.
	if (creating || trusting) consent({ creating, trusting, subject });

	if (creating) {
		section('create signing certificate');
		console.log(`  ${subject}`);
		console.log(
			'  self-signed, valid until 2049, kept in Cert:\\CurrentUser\\My for later releases'
		);
		// -Type Custom with these two extensions is Microsoft's own recipe for an
		// MSIX signing certificate: EKU code signing (1.3.6.1.5.5.7.3.3) plus an
		// empty basic-constraints extension. -Type CodeSigningCert omits the
		// latter, and the package then fails validation at install time.
		//
		// Expiry is the one thing that can make an update need administrator again
		// long after the install that agreed to it, so it is pushed as far out as
		// goes without changing how the date is encoded: RFC 5280 requires a
		// notAfter through 2049 to be a UTCTime and 2050 or later to be a
		// GeneralizedTime. Both are legal and Windows reads both, but the switch
		// is a compatibility cliff across signtool, AppX validation and anything
		// else that ever looks at this certificate, and there is no way to test
		// that from here. 2049 is 23 years off and this key outlives nothing.
		//
		// The usual reasons to keep a signing certificate short-lived — rotation,
		// revocation, limiting the damage from a leaked key — do not apply to one
		// that never leaves this machine and only signs this machine's builds.
		thumbprint = powershell(
			`$c = New-SelfSignedCertificate -Type Custom -Subject ${ps(subject)} ` +
				`-CertStoreLocation Cert:\\CurrentUser\\My -KeyUsage DigitalSignature ` +
				`-KeyAlgorithm RSA -KeyLength 2048 ` +
				`-NotAfter ([datetime]::new(2049, 12, 31, 23, 59, 59, [datetimekind]::Utc)) ` +
				`-FriendlyName ${ps(`${NAME} source build signing certificate`)} ` +
				`-TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3','2.5.29.19={text}'); ` +
				'Write-Output $c.Thumbprint'
		);
	}

	certificate = { subject, thumbprint };
	return certificate;
}

// Permission to put a certificate on this machine and trust it.
//
// Two changes outside the build directory, so the user gets told what they are
// and gets to say no. -y answers yes, which is how an OTA rebuild gets through:
// by then the install has already done this once, and the only reason to be
// here again is a certificate that expired or went missing.
function consent({ creating, trusting, subject }) {
	console.log(
		`\n${NAME} needs a code-signing certificate — Windows will not install an\n` +
			'MSIX whose signer it does not trust. This will:\n' +
			(creating
				? `\n  • create a self-signed certificate (${subject}), valid until 2049,\n` +
					'    stored in your personal certificate store and reused by every\n' +
					`    later ${NAME} release\n`
				: `\n  • use the existing certificate ${subject}\n`) +
			(trusting
				? '  • add it to the machine-wide trusted store, which needs administrator\n' +
					'    permission — Windows will prompt, once, for this certificate\n'
				: '')
	);

	if (yes) return;

	if (!confirm('Continue?')) {
		fail(
			'Declined — no Windows build produced.\n' +
				'Alternatives:\n' +
				'  npm run make -- -y                     consent without being asked\n' +
				'  WINDOWS_THUMBPRINT=<thumbprint>        sign with a certificate you already have\n' +
				'  WINDOWS_NO_TRUST=1                     sign but leave the trust store alone\n' +
				'  WINDOWS_NO_SIGN=1                      build an unsigned MSIX (will not install)'
		);
	}
}

function isTrusted(thumbprint) {
	const store = `Cert:\\LocalMachine\\TrustedPeople\\${thumbprint}`;
	return powershell(`if (Test-Path ${ps(store)}) { 'yes' } else { 'no' }`) === 'yes';
}

// Export the public half of the signing certificate next to the MSIX.
//
// Taken from the package's own signature rather than from the store, so it is
// necessarily the certificate signtool used. release.js copies it into the
// deployment tree beside the MSIX: a source install trusts it here, at build
// time, but someone installing a prebuilt MSIX from a channel has no build to
// do it for them and needs the file.
function exportCertificate() {
	const cer = join(certs, `${NAME}.cer`);

	mkdirSync(certs, { recursive: true });

	section('export certificate');
	powershell(
		`$c = (Get-AuthenticodeSignature -LiteralPath ${ps(join(out, artifact))}).SignerCertificate; ` +
			`if ($null -eq $c) { throw 'package is unsigned' }; ` +
			`Export-Certificate -Cert $c -FilePath ${ps(cer)} | Out-Null`
	);
	console.log(`  ${cer}`);

	return cer;
}

// Trust the signer, once, on this machine.
//
// LocalMachine\TrustedPeople is the only store Windows consults when validating
// a package signature, and writing to it needs administrator — so this is where
// the one unavoidable UAC prompt lives. Permission to do it was already given,
// either by consent() just now or by whoever passed -y: at install time that is
// the user at the terminal, and during an update it is the click that called
// applyUpdate. Both are moments where a permission dialog is expected.
//
// The certificate is good until 2049 and signs every later release, so this
// does nothing on any build after the first.
function trustCertificate(cer) {
	const tp = certificate.thumbprint;

	if (isTrusted(tp)) return;

	if (process.env.WINDOWS_NO_TRUST) {
		warn(`WINDOWS_NO_TRUST set — ${tp} left untrusted; this MSIX will not install here`);
		return;
	}

	section('trust signing certificate');

	const elevated =
		powershell(
			'$id = [Security.Principal.WindowsIdentity]::GetCurrent(); ' +
				'Write-Output (([Security.Principal.WindowsPrincipal]$id).IsInRole(' +
				'[Security.Principal.WindowsBuiltInRole]::Administrator))'
		) === 'True';

	const command = `Import-Certificate -FilePath ${ps(cer)} -CertStoreLocation Cert:\\LocalMachine\\TrustedPeople | Out-Null`;

	if (elevated) {
		// Already administrator — a CI runner, usually, where Start-Process
		// -Verb RunAs has no desktop to prompt on and simply fails.
		console.log('  already administrator — importing directly');
		powershell(command);
	} else {
		console.log('  Windows will ask for administrator permission (once, for this certificate)');
		// Written to a file rather than nested inside Start-Process's argument
		// list: quoting a command through two layers of PowerShell parsing is how
		// this breaks.
		const script = join(certs, 'trust-certificate.ps1');
		writeFileSync(script, `$ErrorActionPreference = 'Stop'\n${command}\n`);
		// Tolerant: declining the UAC dialog makes Start-Process throw, which is
		// a normal outcome here, not a broken build. The check below turns it
		// into something the user can act on.
		powershell(
			'Start-Process -FilePath powershell -Verb RunAs -Wait -PassThru -ArgumentList ' +
				`@('-NoProfile','-ExecutionPolicy','Bypass','-File',${ps(script)}) | ` +
				'ForEach-Object { exit $_.ExitCode }',
			{ tolerant: true }
		);
		rmSync(script, { force: true });
	}

	if (!isTrusted(tp)) {
		fail(
			`Certificate ${tp} was not trusted — the MSIX cannot be installed.\n` +
				`Import it by hand with:\n  Import-Certificate -FilePath ${cer} ` +
				'-CertStoreLocation Cert:\\LocalMachine\\TrustedPeople\n' +
				'(an elevated PowerShell), or set WINDOWS_NO_TRUST=1 to build anyway.'
		);
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// A yes/no question on stdin, synchronously, so the build stays a straight line.
//
// Anything other than a terminal answers no: no stdin to read means nobody is
// there to ask, and silently helping ourselves to the machine's trust store is
// not the right default. The caller says what to do instead — for an OTA
// rebuild that is PEAR_MAKE_CONFIRM=0, which never gets this far.
function confirm(question) {
	if (!process.stdin.isTTY) {
		console.log(`\n${question} — no terminal to ask on; pass -y to answer yes.`);
		return false;
	}

	process.stdout.write(`${question} [y/N] `);

	const buffer = Buffer.alloc(8);
	let read = 0;
	try {
		read = readSync(0, buffer, 0, buffer.length, null);
	} catch {
		return false; // EOF, or stdin closed under us
	}

	return /^\s*y/i.test(buffer.subarray(0, read).toString());
}

// PowerShell, with its output captured. Args are passed to the executable
// directly, so none of run()'s shell-joining quoting rules apply here.
//
// ErrorActionPreference is forced to Stop because the default lets a cmdlet
// fail, print to stderr, and still exit 0 — which here would mean reading a
// thumbprint off a certificate that was never created. `tolerant` opts out of
// failing the build, for a call whose outcome is checked afterwards anyway.
function powershell(script, { tolerant = false } = {}) {
	const result = spawnSync(
		'powershell',
		['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; ${script}`],
		{ cwd: ROOT, encoding: 'utf8' }
	);

	if (result.error) {
		if (tolerant) return '';
		fail(result.error.message);
	}

	if (result.status !== 0) {
		if (tolerant) return '';
		fail(`powershell failed (${result.status}): ${(result.stderr || '').trim()}\n${script}`);
	}

	// Progress and warning lines can precede the value, so take the last one.
	const lines = (result.stdout || '').split(/\r?\n/).filter((line) => line.trim() !== '');
	return lines.length === 0 ? '' : lines[lines.length - 1].trim();
}

// A PowerShell single-quoted string, which has exactly one escape: '' for '.
function ps(value) {
	return "'" + String(value).replace(/'/g, "''") + "'";
}

function run(command, args) {
	const isWindows = process.platform === 'win32';
	const result = isWindows
		? spawnSync([command, ...args].join(' '), { cwd: ROOT, stdio: 'inherit', shell: true })
		: spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });

	if (result.error) fail(result.error.message);
	if (result.status !== 0) process.exit(result.status || 1);
}

function section(label) {
	console.log(`\n━━━ ${label} ${'━'.repeat(Math.max(2, 52 - label.length))}`);
}

function warn(message) {
	console.log(`  ⚠ ${message}`);
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
