/**
 * Bug #74 Regression: isCLI detection must handle Windows shims
 *
 * BUG: The guard checked `process.argv[1]?.endsWith('fusion')` or
 * `endsWith('fusion.js')`, missing Windows-specific extensions like
 * `.cmd`, `.ps1`, `.cjs`, `.mjs`, `.exe` created by npm/pnpm/yarn.
 * On Windows via npx, `argv[1]` is typically `…\node_modules\.bin\fusion.cmd`
 * or `fusion.ps1`. The guard silently failed — `main()` was never called,
 * producing zero output.
 *
 * FIX: Extract basename, strip any extension, compare against `'fusion'`.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

// Replicate the fixed detection logic to test it in isolation
// (importing fusion.ts directly would trigger the CLI guard)
function detectCLI(argv1: string | undefined): boolean {
    if (!argv1) return false;
    const base = argv1.replace(/\\/g, '/').split('/').pop() ?? '';
    const name = base.replace(/\.[a-z0-9]+$/i, '');
    return name === 'fusion';
}

describe('Bug #74: isCLI detection for Windows shims', () => {

    it('detects bare "fusion" (POSIX)', () => {
        expect(detectCLI('/usr/local/bin/fusion')).toBe(true);
    });

    it('detects fusion.js', () => {
        expect(detectCLI('/project/node_modules/.bin/fusion.js')).toBe(true);
    });

    it('detects fusion.cmd (Windows npm)', () => {
        expect(detectCLI('C:\\Users\\dev\\node_modules\\.bin\\fusion.cmd')).toBe(true);
    });

    it('detects fusion.ps1 (Windows PowerShell)', () => {
        expect(detectCLI('C:\\Users\\dev\\node_modules\\.bin\\fusion.ps1')).toBe(true);
    });

    it('detects fusion.cjs (pnpm)', () => {
        expect(detectCLI('/home/user/.pnpm/fusion.cjs')).toBe(true);
    });

    it('detects fusion.mjs (ESM shim)', () => {
        expect(detectCLI('/usr/local/bin/fusion.mjs')).toBe(true);
    });

    it('detects fusion.exe (Windows compiled)', () => {
        expect(detectCLI('C:\\Program Files\\fusion.exe')).toBe(true);
    });

    it('rejects unrelated binary', () => {
        expect(detectCLI('/usr/local/bin/node')).toBe(false);
    });

    it('rejects undefined argv[1]', () => {
        expect(detectCLI(undefined)).toBe(false);
    });

    it('rejects names containing "fusion" as substring', () => {
        expect(detectCLI('/usr/local/bin/fusion-extra')).toBe(false);
        expect(detectCLI('/usr/local/bin/myfusion')).toBe(false);
    });
});
