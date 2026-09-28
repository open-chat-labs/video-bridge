import * as crypto from 'crypto';
import { isSignedByDaily, parseAvatarId } from './app.controller';

describe('daily webhook signature', () => {
  const secret = crypto.randomBytes(32).toString('base64');
  const body = { type: 'meeting.ended', payload: { room: 'room-1' } };

  // Daily's documented signing: base64(HMAC-SHA256(base64decode(secret), `${timestamp}.${body}`))
  function sign(timestamp: string, signedBody: unknown, key = secret): string {
    return crypto
      .createHmac('sha256', Buffer.from(key, 'base64'))
      .update(timestamp + '.' + JSON.stringify(signedBody))
      .digest('base64');
  }

  test('a correctly signed hook is accepted however old its timestamp, in seconds or milliseconds', () => {
    for (const timestamp of ['1700000000', '1700000000000', '1']) {
      expect(
        isSignedByDaily(secret, timestamp, sign(timestamp, body), body),
      ).toBe(true);
    }
  });

  test('a hook signed with another secret is refused', () => {
    const other = crypto.randomBytes(32).toString('base64');
    expect(
      isSignedByDaily(
        secret,
        '1700000000',
        sign('1700000000', body, other),
        body,
      ),
    ).toBe(false);
  });

  test('a hook whose body or timestamp differs from what was signed is refused', () => {
    const signature = sign('1700000000', body);
    const tampered = { ...body, payload: { room: 'room-2' } };
    expect(isSignedByDaily(secret, '1700000000', signature, tampered)).toBe(
      false,
    );
    expect(isSignedByDaily(secret, '1700000001', signature, body)).toBe(false);
  });

  test('a missing or malformed signature is refused', () => {
    expect(isSignedByDaily(secret, '1700000000', undefined, body)).toBe(false);
    expect(isSignedByDaily(secret, '1700000000', '', body)).toBe(false);
    expect(isSignedByDaily(secret, '1700000000', 'not-a-signature', body)).toBe(
      false,
    );
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
