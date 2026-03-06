/**
 * Bug #77 Regression: FSM gate must clone per-request even without fsmStore
 *
 * BUG: The `tools/list` and `tools/call` handlers only cloned the FSM when
 * `hCtx.fsmStore` was present. Without an external store, all concurrent
 * SSE/stdio clients shared the same mutable FSM instance. Client A's
 * transition mutated the FSM for Client B — cross-session state corruption.
 *
 * FIX: Always clone the FSM per-request. When no `fsmStore` is configured,
 * use an in-memory `Map<sessionId, snapshot>` to persist per-session state.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { StateMachineGate } from '../../src/fsm/StateMachineGate.js';
import type { FsmConfig, FsmSnapshot } from '../../src/fsm/StateMachineGate.js';

const workflowConfig: FsmConfig = {
    id: 'workflow',
    initial: 'draft',
    states: {
        draft:     { on: { SUBMIT: 'review' } },
        review:    { on: { APPROVE: 'approved', REJECT: 'draft' } },
        approved:  { type: 'final' },
    },
};

describe('Bug #77: FSM isolation without fsmStore (in-memory snapshots)', () => {

    it('two sessions do not share FSM state when both clones exist', async () => {
        const gate = new StateMachineGate(workflowConfig);

        // Simulate the fixed logic: always clone per-request
        const sessionSnapshots = new Map<string, FsmSnapshot>();

        // Session A: draft → review
        const fsmA = gate.clone();
        const snapA = sessionSnapshots.get('session-A');
        if (snapA) fsmA.restore(snapA);
        await fsmA.transition('SUBMIT');
        sessionSnapshots.set('session-A', fsmA.snapshot());

        // Session B should still be in 'draft'
        const fsmB = gate.clone();
        const snapB = sessionSnapshots.get('session-B');
        if (snapB) fsmB.restore(snapB);
        expect(fsmB.currentState).toBe('draft');

        // Session A should be in 'review'
        const fsmA2 = gate.clone();
        const snapA2 = sessionSnapshots.get('session-A');
        if (snapA2) fsmA2.restore(snapA2);
        expect(fsmA2.currentState).toBe('review');
    });

    it('concurrent transitions on cloned FSMs do not interfere', async () => {
        const gate = new StateMachineGate(workflowConfig);
        const sessionSnapshots = new Map<string, FsmSnapshot>();

        // Both sessions start from draft
        const run = async (sessionId: string, event: string, delayMs: number) => {
            const fsm = gate.clone();
            const snap = sessionSnapshots.get(sessionId);
            if (snap) fsm.restore(snap);
            // Simulate async work
            await new Promise(r => setTimeout(r, delayMs));
            await fsm.transition(event);
            sessionSnapshots.set(sessionId, fsm.snapshot());
            return fsm.currentState;
        };

        // Session A submits (slow), Session B submits (fast)
        const [stateA, stateB] = await Promise.all([
            run('session-A', 'SUBMIT', 20),
            run('session-B', 'SUBMIT', 5),
        ]);

        expect(stateA).toBe('review');
        expect(stateB).toBe('review');

        // Session A approves, Session B rejects
        const [stateA2, stateB2] = await Promise.all([
            run('session-A', 'APPROVE', 5),
            run('session-B', 'REJECT', 10),
        ]);

        expect(stateA2).toBe('approved');
        expect(stateB2).toBe('draft');

        // Original gate should be untouched
        expect(gate.currentState).toBe('draft');
    });

    it('without clone, shared gate produces wrong results (demonstrates the bug)', async () => {
        const sharedGate = new StateMachineGate(workflowConfig);

        // Session A transitions: draft → review
        await sharedGate.transition('SUBMIT');
        expect(sharedGate.currentState).toBe('review');

        // Session B (on the SAME gate) sees 'review' instead of 'draft'
        // This is the BUG — new sessions should start from 'draft'
        expect(sharedGate.currentState).toBe('review'); // Bug: not 'draft'

        // With clone(), Session B would get its own copy starting from 'draft'
        const freshClone = new StateMachineGate(workflowConfig);
        expect(freshClone.currentState).toBe('draft'); // Correct
    });
});
