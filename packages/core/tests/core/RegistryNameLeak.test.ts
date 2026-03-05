/**
 * RegistryNameLeak.test.ts
 *
 * Regression test: ToolRegistry.routeCall no longer leaks
 * all registered tool names in the "unknown tool" error response.
 *
 * Previously, the error included `availableActions: Array.from(this._builders.keys())`
 * which exposed tool names that should be hidden by tag-based filtering.
 */
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/core/registry/ToolRegistry.js';
import { defineTool } from '../../src/index.js';
import { success } from '../../src/core/response.js';

describe('ToolRegistry: Unknown tool error does not leak tool names', () => {
    it('should not include registered tool names in error response', async () => {
        const publicTool = defineTool('billing', {
            actions: { list: { readOnly: true, handler: async () => success('bills') } },
        });
        const secretTool = defineTool('admin-internal', {
            actions: { reset: { handler: async () => success('reset done') } },
        });

        const registry = new ToolRegistry();
        registry.register(publicTool);
        registry.register(secretTool);

        const result = await registry.routeCall(undefined, 'nonexistent', { action: 'list' });

        expect(result.isError).toBe(true);
        const errorText = result.content[0].text;
        expect(errorText).toContain('UNKNOWN_TOOL');
        // Must NOT leak any registered tool names
        expect(errorText).not.toContain('billing');
        expect(errorText).not.toContain('admin-internal');
    });

    it('should suggest using tools/list instead of leaking names', async () => {
        const tool = defineTool('projects', {
            actions: { list: { readOnly: true, handler: async () => success('proj') } },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const result = await registry.routeCall(undefined, 'bad-name', { action: 'list' });

        expect(result.isError).toBe(true);
        const errorText = result.content[0].text;
        expect(errorText).toContain('tools/list');
        expect(errorText).not.toContain('projects');
    });

    it('should still return the requested (invalid) tool name in the error', async () => {
        const tool = defineTool('items', {
            actions: { list: { readOnly: true, handler: async () => success('items') } },
        });

        const registry = new ToolRegistry();
        registry.register(tool);

        const result = await registry.routeCall(undefined, 'doesnt-exist', { action: 'list' });

        expect(result.isError).toBe(true);
        // The error should mention what was requested
        expect(result.content[0].text).toContain('doesnt-exist');
    });
});
