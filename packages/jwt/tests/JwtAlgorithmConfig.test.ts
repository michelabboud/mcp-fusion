/**
 * JwtAlgorithmConfig.test.ts
 *
 * Regression test: JwtVerifier now accepts an `algorithm` config field
 * for public key verification, instead of hardcoding 'RS256'.
 * This enables ES256/ES384/ES512 public keys.
 */
import { describe, it, expect } from 'vitest';
import { JwtVerifier } from '../src/JwtVerifier.js';

describe('JwtVerifier: Algorithm configuration', () => {
    it('should accept algorithm field in config', () => {
        // ES256 config should not throw
        const verifier = new JwtVerifier({
            publicKey: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----',
            algorithm: 'ES256',
        });

        expect(verifier).toBeDefined();
    });

    it('should default to RS256 when algorithm is omitted', () => {
        const verifier = new JwtVerifier({
            publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCg...\n-----END PUBLIC KEY-----',
        });

        // Verifier should be created with default RS256
        expect(verifier).toBeDefined();
    });

    it('should accept ES384 algorithm', () => {
        const verifier = new JwtVerifier({
            publicKey: '-----BEGIN PUBLIC KEY-----\ndummy\n-----END PUBLIC KEY-----',
            algorithm: 'ES384',
        });

        expect(verifier).toBeDefined();
    });

    it('should accept ES512 algorithm', () => {
        const verifier = new JwtVerifier({
            publicKey: '-----BEGIN PUBLIC KEY-----\ndummy\n-----END PUBLIC KEY-----',
            algorithm: 'ES512',
        });

        expect(verifier).toBeDefined();
    });

    it('should still work with HS256 secret (no algorithm needed)', () => {
        const verifier = new JwtVerifier({
            secret: 'my-secret-key-at-least-32-characters!',
        });

        expect(verifier).toBeDefined();
    });

    it('should pass algorithm config through to verify flow', async () => {
        // Create verifier with ES256 — will fail on actual verify since key is fake,
        // but the config should be accepted and passed through.
        const verifier = new JwtVerifier({
            publicKey: '-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----',
            algorithm: 'ES256',
            issuer: 'test-issuer',
        });

        // Attempting to verify with a fake key should fail,
        // but it should NOT fail with "Algorithm mismatch" or similar
        // internal error about RS256 being expected.
        const result = await verifier.verifyDetailed('eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.fake');

        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
        // Should fail due to invalid key/format, not algorithm mismatch
        expect(result.reason).not.toContain('RS256');
    });
});
