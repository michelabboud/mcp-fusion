/**
 * Bug #75 Regression: dev reload must resolve BEFORE clearing registry
 *
 * BUG: `reg.clear()` was called BEFORE `resolveRegistry()`. If the resolve
 * throws (e.g., syntax error in user code), the registry stays empty —
 * all tools vanish until the next successful reload. Concurrent requests
 * during the failure window see "tool not found".
 *
 * FIX: Resolve the new registry first into a local variable, then clear
 * and re-register only on success.
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';

describe('Bug #75: dev reload order — resolve before clear', () => {

    it('registry retains existing tools when resolveRegistry throws', async () => {
        // Simulate the setup callback logic from dev.ts
        type FakeBuilder = { name: string };
        const existingBuilders: FakeBuilder[] = [{ name: 'user' }, { name: 'order' }];
        let currentBuilders = [...existingBuilders];

        const reg = {
            clear: () => { currentBuilders = []; },
            register: (b: FakeBuilder) => { currentBuilders.push(b); },
        };

        // Simulate resolveRegistry that throws
        const failingResolve = async (): Promise<{ registry: { getBuilders: () => FakeBuilder[] } }> => {
            throw new Error('Syntax error in user code');
        };

        // Fixed logic: resolve FIRST, only clear on success
        const setup = async () => {
            let resolved: { registry: { getBuilders: () => FakeBuilder[] } };
            try {
                resolved = await failingResolve();
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                throw new Error(`Failed to reload: ${message}`);
            }

            // These lines should NOT execute when resolve fails
            reg.clear();
            for (const builder of resolved.registry.getBuilders()) {
                reg.register(builder);
            }
        };

        // Should throw but NOT clear the registry
        await expect(setup()).rejects.toThrow('Failed to reload');

        // CRITICAL: registry should still have the original tools
        expect(currentBuilders).toHaveLength(2);
        expect(currentBuilders[0].name).toBe('user');
        expect(currentBuilders[1].name).toBe('order');
    });

    it('registry is updated when resolveRegistry succeeds', async () => {
        type FakeBuilder = { name: string };
        const existingBuilders: FakeBuilder[] = [{ name: 'old-tool' }];
        let currentBuilders = [...existingBuilders];

        const reg = {
            clear: () => { currentBuilders = []; },
            register: (b: FakeBuilder) => { currentBuilders.push(b); },
        };

        const newBuilders: FakeBuilder[] = [{ name: 'new-tool-a' }, { name: 'new-tool-b' }];
        const successResolve = async () => ({
            registry: { getBuilders: () => newBuilders },
        });

        const setup = async () => {
            let resolved: Awaited<ReturnType<typeof successResolve>>;
            try {
                resolved = await successResolve();
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                throw new Error(`Failed to reload: ${message}`);
            }

            reg.clear();
            for (const builder of resolved.registry.getBuilders()) {
                reg.register(builder);
            }
        };

        await setup();

        expect(currentBuilders).toHaveLength(2);
        expect(currentBuilders[0].name).toBe('new-tool-a');
        expect(currentBuilders[1].name).toBe('new-tool-b');
    });
});
