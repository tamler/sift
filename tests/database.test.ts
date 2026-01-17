import { describe, it, expect } from 'vitest';
import { Database } from '../src/core/database.js';

describe('Database', () => {
  describe('constructor validation', () => {
    it('should accept valid dimension', () => {
      expect(() => new Database('~/.sift/test.db', 384)).not.toThrow();
      expect(() => new Database('~/.sift/test.db', 1024)).not.toThrow();
      expect(() => new Database('~/.sift/test.db', 1)).not.toThrow();
      expect(() => new Database('~/.sift/test.db', 8192)).not.toThrow();
    });

    it('should reject non-integer dimension', () => {
      expect(() => new Database('~/.sift/test.db', 384.5)).toThrow(
        'Invalid embedding dimension'
      );
    });

    it('should reject negative dimension', () => {
      expect(() => new Database('~/.sift/test.db', -1)).toThrow(
        'Invalid embedding dimension'
      );
    });

    it('should reject zero dimension', () => {
      expect(() => new Database('~/.sift/test.db', 0)).toThrow(
        'Invalid embedding dimension'
      );
    });

    it('should reject dimension above max', () => {
      expect(() => new Database('~/.sift/test.db', 10000)).toThrow(
        'Invalid embedding dimension'
      );
    });

    it('should reject non-number dimension', () => {
      expect(() => new Database('~/.sift/test.db', '384' as any)).toThrow(
        'Invalid embedding dimension'
      );
    });

    it('should reject NaN dimension', () => {
      expect(() => new Database('~/.sift/test.db', NaN)).toThrow(
        'Invalid embedding dimension'
      );
    });
  });
});
