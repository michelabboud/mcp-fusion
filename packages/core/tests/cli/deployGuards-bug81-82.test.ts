/**
 * Bugs #81/#82 — Deploy res.json() guard + fetch timeout
 *
 * Verifies that the deploy command:
 *   - Has a timeout signal on the fetch call (Bug #82)
 *   - Wraps res.json() in try/catch for non-JSON responses (Bug #81)
 *
 * Both were already fixed in v3.1.19 — these tests ensure no regression.
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

describe('Bug #81 — Deploy res.json() try/catch guard', () => {
    it('should wrap the success-path res.json() in try/catch', () => {
        // The success path (after !res.ok check) must have try/catch around json()
        const jsonTryCatch = /try\s*\{[^}]*await\s+res\.json\(\)/s;
        expect(deploySource).toMatch(jsonTryCatch);
    });

    it('should report a user-friendly error when JSON parsing fails', () => {
        expect(deploySource).toContain('unexpected non-JSON response');
    });
});

describe('Bug #82 — Deploy fetch() timeout', () => {
    it('should include AbortSignal.timeout on the fetch call', () => {
        expect(deploySource).toContain('AbortSignal.timeout(');
    });

    it('should handle timeout errors in the catch block', () => {
        expect(deploySource).toContain('ETIMEDOUT');
        expect(deploySource).toContain('timeout');
    });
});
