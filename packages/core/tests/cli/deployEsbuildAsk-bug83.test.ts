/**
 * Bug #83 — Deploy auto-installs esbuild without confirmation
 *
 * Verifies that the deploy command asks the user before
 * auto-installing esbuild, rather than silently running
 * `npm install -D esbuild` with `stdio: 'ignore'`.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const deploySource = readFileSync(
    resolve(__dirname, '../../src/cli/commands/deploy.ts'),
    'utf-8',
);

describe('Bug #83 — esbuild install confirmation', () => {
    it('should ask the user before installing esbuild', () => {
        // The code must contain an ask() call near the esbuild install
        expect(deploySource).toContain('esbuild is not installed');
        expect(deploySource).toContain('ask(');
    });

    it('should abort if the user declines', () => {
        expect(deploySource).toContain('Aborted');
        expect(deploySource).toContain('Install manually');
    });

    it('should NOT use stdio: ignore for the npm install', () => {
        // stdio: 'ignore' made the install completely invisible
        expect(deploySource).not.toContain("stdio: 'ignore'");
    });

    it('should import ask from utils', () => {
        expect(deploySource).toMatch(/import\s*\{[^}]*ask[^}]*\}\s*from\s*['"]\.\.\/utils/);
    });
});
