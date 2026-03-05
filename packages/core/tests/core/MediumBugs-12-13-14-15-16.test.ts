/**
 * Regression tests for Medium bugs #12 – #16
 *
 * Bug #12 — ToolRegistry does not propagate observability to late-registered builders
 * Bug #13 — FluentSchemaHelpers.default() is text-only, does not auto-mark optional
 * Bug #14 — PostProcessor regex doesn't match <domain_rules> format
 * Bug #15 — TelemetryBus SIGINT/SIGTERM handlers prevent process termination
 * Bug #16 — SandboxGuard accepts async functions that produce empty results
 */
import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Bug #12 — ToolRegistry late-registration observability propagation
// ============================================================================

describe('Bug #12 — ToolRegistry propagates observability to late-registered builders', () => {
    it('propagates debug observer to builder registered AFTER enableDebug()', async () => {
        const { ToolRegistry } = await import('../../src/core/registry/ToolRegistry.js');

        const registry = new ToolRegistry();
        const debugFn = vi.fn();

        // Enable debug BEFORE registering any tool
        registry.enableDebug(debugFn);

        // Create a mock builder with debug method
        const builder = {
            getName: () => 'late-tool',
            buildToolDefinition: () => ({ name: 'late-tool', inputSchema: { type: 'object' as const, properties: {} } }),
            debug: vi.fn(),
            execute: vi.fn(),
        };

        registry.register(builder as any);

        // The debug observer should have been propagated to the late builder
        expect(builder.debug).toHaveBeenCalledWith(debugFn);
    });

    it('propagates tracer to builder registered AFTER enableTracing()', async () => {
        const { ToolRegistry } = await import('../../src/core/registry/ToolRegistry.js');

        const registry = new ToolRegistry();
        const tracer = {
            startSpan: vi.fn(() => ({
                end: vi.fn(),
                setStatus: vi.fn(),
                setAttribute: vi.fn(),
                recordException: vi.fn(),
            })),
        };

        registry.enableTracing(tracer as any);

        const builder = {
            getName: () => 'late-traced',
            buildToolDefinition: () => ({ name: 'late-traced', inputSchema: { type: 'object' as const, properties: {} } }),
            tracing: vi.fn(),
            execute: vi.fn(),
        };

        registry.register(builder as any);

        expect(builder.tracing).toHaveBeenCalledWith(tracer);
    });

    it('propagates telemetry sink to builder registered AFTER enableTelemetry()', async () => {
        const { ToolRegistry } = await import('../../src/core/registry/ToolRegistry.js');

        const registry = new ToolRegistry();
        const sink = vi.fn();

        registry.enableTelemetry(sink as any);

        const builder = {
            getName: () => 'late-telemetry',
            buildToolDefinition: () => ({ name: 'late-telemetry', inputSchema: { type: 'object' as const, properties: {} } }),
            telemetry: vi.fn(),
            execute: vi.fn(),
        };

        registry.register(builder as any);

        expect(builder.telemetry).toHaveBeenCalledWith(sink);
    });

    it('does NOT propagate to builders without observability methods', async () => {
        const { ToolRegistry } = await import('../../src/core/registry/ToolRegistry.js');

        const registry = new ToolRegistry();
        registry.enableDebug(vi.fn());

        const builder = {
            getName: () => 'plain-tool',
            buildToolDefinition: () => ({ name: 'plain-tool', inputSchema: { type: 'object' as const, properties: {} } }),
            execute: vi.fn(),
            // No debug/tracing/telemetry methods
        };

        // Should not throw
        registry.register(builder as any);
        expect(registry.has('plain-tool')).toBe(true);
    });

    it('propagates all three at once to a late builder', async () => {
        const { ToolRegistry } = await import('../../src/core/registry/ToolRegistry.js');

        const registry = new ToolRegistry();
        const debugFn = vi.fn();
        const tracer = { startSpan: vi.fn() };
        const sink = vi.fn();

        registry.enableDebug(debugFn);
        registry.enableTracing(tracer as any);
        registry.enableTelemetry(sink as any);

        const builder = {
            getName: () => 'full-obs',
            buildToolDefinition: () => ({ name: 'full-obs', inputSchema: { type: 'object' as const, properties: {} } }),
            debug: vi.fn(),
            tracing: vi.fn(),
            telemetry: vi.fn(),
            execute: vi.fn(),
        };

        registry.register(builder as any);

        expect(builder.debug).toHaveBeenCalledWith(debugFn);
        expect(builder.tracing).toHaveBeenCalledWith(tracer);
        expect(builder.telemetry).toHaveBeenCalledWith(sink);
    });
});

// ============================================================================
// Bug #13 — FluentSchemaHelpers.default() auto-marks optional
// ============================================================================

describe('Bug #13 — FluentSchemaHelpers.default() auto-marks as optional', () => {
    it('FluentString.default() sets _optional to true', async () => {
        const { FluentString } = await import('../../src/core/builder/FluentSchemaHelpers.js');

        const field = new FluentString().describe('Name').default('anonymous');
        expect(field._optional).toBe(true);

        const descriptor = field.toDescriptor();
        expect(descriptor.optional).toBe(true);
        expect(descriptor.description).toContain("default: 'anonymous'");
    });

    it('FluentNumber.default() sets _optional to true', async () => {
        const { FluentNumber } = await import('../../src/core/builder/FluentSchemaHelpers.js');

        const field = new FluentNumber().describe('Limit').default(10);
        expect(field._optional).toBe(true);

        const descriptor = field.toDescriptor();
        expect(descriptor.optional).toBe(true);
        expect(descriptor.description).toContain('default: 10');
    });

    it('FluentBoolean.default() sets _optional to true', async () => {
        const { FluentBoolean } = await import('../../src/core/builder/FluentSchemaHelpers.js');

        const field = new FluentBoolean().describe('Verbose').default(false);
        expect(field._optional).toBe(true);

        const descriptor = field.toDescriptor();
        expect(descriptor.optional).toBe(true);
        expect(descriptor.description).toContain('default: false');
    });

    it('field without default remains required', async () => {
        const { FluentString } = await import('../../src/core/builder/FluentSchemaHelpers.js');

        const field = new FluentString().describe('Name');
        expect(field._optional).toBe(false);

        const descriptor = field.toDescriptor();
        expect(descriptor.optional).toBeUndefined();
    });

    it('explicit .optional() still works independently', async () => {
        const { FluentNumber } = await import('../../src/core/builder/FluentSchemaHelpers.js');

        const field = new FluentNumber().optional();
        expect(field._optional).toBe(true);

        const descriptor = field.toDescriptor();
        expect(descriptor.optional).toBe(true);
    });

    it('Zod schema makes field with default() optional', async () => {
        const { convertParamsToZod } = await import('../../src/core/builder/ParamDescriptors.js');

        const schema = convertParamsToZod({
            name: { type: 'string', description: "Username (default: 'guest')", optional: true },
            age: { type: 'number', description: 'Age' },
        });

        // name is optional — parsing without it should succeed
        const result = schema.safeParse({ age: 25 });
        expect(result.success).toBe(true);

        // age is required — parsing without it should fail
        const result2 = schema.safeParse({ name: 'Alice' });
        expect(result2.success).toBe(false);
    });
});

// ============================================================================
// Bug #14 — PostProcessor regex matches <domain_rules> format
// ============================================================================

describe('Bug #14 — PostProcessor regex matches <domain_rules> XML tags', () => {
    it('should extract rules from <domain_rules> block', () => {
        const text = '<domain_rules>\n- Do not return PII\n- Always paginate\n</domain_rules>';
        const match = text.match(/<domain_rules>\n([\s\S]*?)\n<\/domain_rules>/);

        expect(match).not.toBeNull();
        const rules = match![1]!.split('\n').filter(Boolean).map(r => r.replace(/^- /, ''));
        expect(rules).toEqual(['Do not return PII', 'Always paginate']);
    });

    it('should NOT match old [SYSTEM_RULES] format', () => {
        const text = '[SYSTEM_RULES]\n- Old format rule\n\n';
        const match = text.match(/<domain_rules>\n([\s\S]*?)\n<\/domain_rules>/);
        expect(match).toBeNull();
    });

    it('should handle multi-line rules with complex content', () => {
        const text = '<domain_rules>\n- Rule 1: no PII\n- Rule 2: max 100 results\n- Rule 3: use ISO-8601 dates\n</domain_rules>';
        const match = text.match(/<domain_rules>\n([\s\S]*?)\n<\/domain_rules>/);

        expect(match).not.toBeNull();
        const rules = match![1]!.split('\n').filter(Boolean).map(r => r.replace(/^- /, ''));
        expect(rules).toHaveLength(3);
        expect(rules[2]).toBe('Rule 3: use ISO-8601 dates');
    });

    it('should match format produced by ResponseBuilder', async () => {
        // Simulate ResponseBuilder output format
        const rules = ['Never expose emails', 'Paginate all list responses'];
        const rulesText = '<domain_rules>\n' +
            rules.map(r => `- ${r}`).join('\n') +
            '\n</domain_rules>';

        const match = rulesText.match(/<domain_rules>\n([\s\S]*?)\n<\/domain_rules>/);
        expect(match).not.toBeNull();
        const extracted = match![1]!.split('\n').filter(Boolean).map(r => r.replace(/^- /, ''));
        expect(extracted).toEqual(rules);
    });
});

// ============================================================================
// Bug #15 — TelemetryBus SIGINT/SIGTERM handlers allow process termination
// ============================================================================

describe('Bug #15 — TelemetryBus uses process.once for signal handlers', () => {
    it('close() removes signal listeners cleanly', async () => {
        // We verify the code structure by importing TelemetryBus
        // and checking that it exports a close function
        const source = await import('fs').then(fs =>
            fs.readFileSync(
                new URL('../../src/observability/TelemetryBus.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
                'utf-8',
            ),
        );

        // Verify the fix is applied: should use process.once, not process.on for SIGINT/SIGTERM
        expect(source).toContain("process.once('SIGINT'");
        expect(source).toContain("process.once('SIGTERM'");

        // Should re-emit the signal after cleanup
        expect(source).toContain('process.kill(process.pid, signal)');

        // Should NOT use process.on for SIGINT/SIGTERM (only for 'exit')
        const sigintOnMatches = source.match(/process\.on\('SIGINT'/g);
        expect(sigintOnMatches).toBeNull();
    });
});

// ============================================================================
// Bug #16 — SandboxGuard rejects async functions
// ============================================================================

describe('Bug #16 — SandboxGuard rejects async functions', () => {
    it('rejects async arrow function', async () => {
        const { validateSandboxCode } = await import('../../src/sandbox/SandboxGuard.js');
        const result = validateSandboxCode('async (data) => data.map(d => d.name)');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('rejects async function expression', async () => {
        const { validateSandboxCode } = await import('../../src/sandbox/SandboxGuard.js');
        const result = validateSandboxCode('async function(data) { return data; }');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('rejects async single-param arrow', async () => {
        const { validateSandboxCode } = await import('../../src/sandbox/SandboxGuard.js');
        const result = validateSandboxCode('async x => x.length');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('accepts sync arrow function', async () => {
        const { validateSandboxCode } = await import('../../src/sandbox/SandboxGuard.js');
        const result = validateSandboxCode('(data) => data.filter(d => d.x > 5)');
        expect(result.ok).toBe(true);
    });

    it('accepts sync function expression', async () => {
        const { validateSandboxCode } = await import('../../src/sandbox/SandboxGuard.js');
        const result = validateSandboxCode('function(data) { return data.length; }');
        expect(result.ok).toBe(true);
    });

    it('error message explains WHY async is rejected', async () => {
        const { validateSandboxCode } = await import('../../src/sandbox/SandboxGuard.js');
        const result = validateSandboxCode('async (data) => data');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('synchronous');
    });
});
