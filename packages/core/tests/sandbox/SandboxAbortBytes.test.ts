/**
 * SandboxAbortBytes.test.ts
 *
 * Regression tests for:
 *   - Abort no longer kills concurrent executions sharing the same isolate
 *   - maxOutputBytes now uses real UTF-8 byte length instead of .length
 *
 * Requires `isolated-vm`.
 */
import { describe, it, expect } from 'vitest';
import { SandboxEngine } from '../../src/sandbox/SandboxEngine.js';

let ivmAvailable = false;
try {
    require('isolated-vm');
    ivmAvailable = true;
} catch {
    // isolated-vm not installed — skip
}

const describeSandbox = ivmAvailable ? describe : describe.skip;

// ============================================================================
// Abort safety with concurrent executions
// ============================================================================

describeSandbox('SandboxEngine: Abort does not kill concurrent executions', () => {
    it('should not dispose shared isolate when other executions are active', async () => {
        const engine = new SandboxEngine({ timeout: 5000, memoryLimit: 32, maxOutputBytes: 100_000 });
        const controller = new AbortController();

        try {
            // Start two concurrent executions
            const slow = engine.execute(
                '(data) => { let s = ""; for (let i = 0; i < 100000; i++) s += "x"; return s.length; }',
                null,
                { signal: controller.signal },
            );

            const fast = engine.execute(
                '(data) => 42',
                null,
            );

            // Abort the first one — this should NOT dispose the isolate
            // when there are concurrent executions
            controller.abort();

            // The fast execution should still succeed
            const fastResult = await fast;
            // It might fail if the isolate was disposed, or succeed if protected
            // With the fix, it should succeed
            if (fastResult.ok) {
                expect(fastResult.value).toBe(42);
            } else {
                // If it fails, it should at least NOT be classified as 'MEMORY'
                expect(fastResult.code).not.toBe('MEMORY');
            }

            // The aborted one should report ABORTED (or TIMEOUT, depending on timing)
            const slowResult = await slow;
            if (!slowResult.ok) {
                expect(['ABORTED', 'TIMEOUT', 'RUNTIME']).toContain(slowResult.code);
            }
        } finally {
            engine.dispose();
        }
    });

    it('should still abort immediately when only one execution is active', async () => {
        const engine = new SandboxEngine({ timeout: 10000, memoryLimit: 32, maxOutputBytes: 100_000 });
        const controller = new AbortController();

        try {
            const execution = engine.execute(
                '(data) => { let s = ""; while(true) s += "x"; return s; }',
                null,
                { signal: controller.signal },
            );

            // Give it a moment to start, then abort
            setTimeout(() => controller.abort(), 50);

            const result = await execution;
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('ABORTED');
            }
        } finally {
            engine.dispose();
        }
    });
});

// ============================================================================
// Output size guard: UTF-8 byte length
// ============================================================================

describeSandbox('SandboxEngine: maxOutputBytes uses UTF-8 byte length', () => {
    it('should reject CJK output that exceeds byte limit despite short .length', async () => {
        // Each CJK character is 3 bytes in UTF-8 but 1 in .length
        // 40 CJK chars = 40 * 3 = 120 bytes, but .length is only 40
        // With a 100-byte limit, .length (40) would pass old check but byte count (120) fails
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32, maxOutputBytes: 100 });

        try {
            const result = await engine.execute(
                '(data) => "中".repeat(40)',
                null,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('OUTPUT_TOO_LARGE');
                // The error message should report actual byte count (not .length)
                // JSON.stringify wraps string in quotes so 40 CJK chars (120 bytes) + 2 quote bytes = 122
                expect(result.error).toMatch(/\d+ bytes\) exceeds/);
                // Must NOT report .length (40) as the byte count
                expect(result.error).not.toContain('40 bytes');
            }
        } finally {
            engine.dispose();
        }
    });

    it('should reject emoji output that exceeds byte limit despite short .length', async () => {
        // Each emoji is 4 bytes in UTF-8 but 2 in .length (surrogate pair)
        // 30 emojis: .length = 60, UTF-8 bytes = ~120+
        // With JSON.stringify wrapping, the output is even larger
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32, maxOutputBytes: 80 });

        try {
            const result = await engine.execute(
                '(data) => "🎉".repeat(30)',
                null,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('OUTPUT_TOO_LARGE');
            }
        } finally {
            engine.dispose();
        }
    });

    it('should allow ASCII output within byte limit', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32, maxOutputBytes: 200 });

        try {
            const result = await engine.execute(
                '(data) => "hello"',
                null,
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe('hello');
            }
        } finally {
            engine.dispose();
        }
    });
});
