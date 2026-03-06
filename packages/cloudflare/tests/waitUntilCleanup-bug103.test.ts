/**
 * Bug #103 — Cloudflare adapter uses ctx.waitUntil for cleanup
 *
 * Verifies that the adapter calls ctx.waitUntil() for server.close()
 * instead of blocking the response with `finally { await server.close() }`.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('Bug #103 — Cloudflare adapter waitUntil cleanup', () => {
    const adapterSource = readFileSync(
        resolve(__dirname, '../src/adapter.ts'),
        'utf-8',
    );

    it('uses ctx.waitUntil for server.close instead of blocking finally', () => {
        // The adapter should call ctx.waitUntil(server.close(...))
        expect(adapterSource).toContain('ctx.waitUntil(server.close()');
    });

    it('does NOT have a blocking finally { await server.close() } pattern', () => {
        // The old pattern was: finally { await server.close(); }
        expect(adapterSource).not.toMatch(/finally\s*\{[^}]*await\s+server\.close/);
    });

    it('calls waitUntil with error suppression', () => {
        // Should catch errors from server.close to avoid unhandled rejections
        expect(adapterSource).toContain('server.close().catch(() => {})');
    });
});
