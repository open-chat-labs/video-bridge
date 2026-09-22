import { isFresh, parseAvatarId } from './app.controller';

describe('webhook replay window', () => {
  const now = 1_700_000_000;

  test('a timestamp inside the window is fresh', () => {
    expect(isFresh(String(now - 60), now)).toBe(true);
    expect(isFresh(String(now + 60), now)).toBe(true);
  });

  test('a timestamp outside the window is not, however valid its signature', () => {
    expect(isFresh(String(now - 6 * 60), now)).toBe(false);
    expect(isFresh(String(now + 6 * 60), now)).toBe(false);
  });

  test('a missing or malformed timestamp is not fresh', () => {
    expect(isFresh(undefined as unknown as string, now)).toBe(false);
    expect(isFresh('', now)).toBe(false);
    expect(isFresh('yesterday', now)).toBe(false);
    expect(isFresh('1.5', now)).toBe(false);
  });
});

describe('avatar id query parameter', () => {
  test('a decimal id is parsed', () => {
    expect(parseAvatarId('12345')).toBe(BigInt(12345));
  });

  test('anything that is not a decimal id is ignored rather than thrown', () => {
    expect(parseAvatarId(undefined)).toBeUndefined();
    expect(parseAvatarId('')).toBeUndefined();
    expect(parseAvatarId('abc')).toBeUndefined();
    expect(parseAvatarId('-1')).toBeUndefined();
    expect(parseAvatarId('1'.repeat(40))).toBeUndefined();
  });
});
