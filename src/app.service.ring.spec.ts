import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
// See app.service.decline.spec.ts: the real services can't be resolved by jest and are faked
jest.mock('./openchat/openchat.service', () => ({
  OpenChatService: class {},
}));
jest.mock('./inprogress/inprogress.service', () => ({
  InProgressService: class {},
}));

import { AppService } from './app.service';
import { chatIdToRoomName } from './utils';

// open-chat #10398 invariants 11 and 21: what the ring's per-recipient token can do

const CALLER = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
const CALLEE = 'r7inp-6aaaa-aaaaa-aaabq-cai';
const LUI = 'rkp4c-7iaaa-aaaaa-aaaca-cai';
const MESSAGE_ID = '123456789012345678';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function sign(claims: Record<string, unknown>, expiresIn = 60): string {
  return jwt.sign(claims, privateKey, { algorithm: 'ES256', expiresIn });
}

function ringToken(expiresIn = 60, message_id = MESSAGE_ID) {
  return sign(
    {
      claim_type: 'DeclineVideoCall',
      user_id: CALLEE,
      chat_id: { Direct: CALLER },
      message_id,
      local_user_index: LUI,
    },
    expiresIn,
  );
}

const ROOM = chatIdToRoomName(CALLEE, { kind: 'direct_chat', userId: CALLER });

function setup(running = true, present: string[] = []) {
  const inprogress = {
    get: async (roomName: string) =>
      running && roomName === ROOM
        ? {
            roomName,
            messageId: MESSAGE_ID,
            startedBy: CALLER,
            callType: 'Default',
          }
        : undefined,
  };
  const config = {
    get: (key: string) => (key === 'OC_PUBLIC' ? PUBLIC_PEM : 'x'),
  };
  const openChat = {};
  const tokenRequests: string[] = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/presence')) {
      return {
        ok: true,
        json: async () => ({
          total_count: present.length,
          data: present.map((userId) => ({ userId })),
        }),
      } as Response;
    }
    tokenRequests.push(String(init?.body));
    return { ok: true, json: async () => ({ token: 'daily' }) } as Response;
  }) as unknown as typeof fetch;

  const service = new AppService(
    inprogress as any,
    config as any,
    openChat as any,
  );
  return { service, tokenRequests };
}

describe('a ring', () => {
  it('is ringing until the user is in the room or the call has gone', async () => {
    await expect(setup().service.ringStatus(ringToken())).resolves.toEqual({
      status: 'ringing',
    });
    await expect(
      setup(true, [CALLEE]).service.ringStatus(ringToken()),
    ).resolves.toEqual({ status: 'answered' });
    await expect(
      setup(false).service.ringStatus(ringToken()),
    ).resolves.toEqual({ status: 'ended' });
  });

  it('invariant 11: status answers only for the call its token names', async () => {
    await expect(
      setup().service.ringStatus(ringToken(60, '999')),
    ).resolves.toEqual({ status: 'ended' });
  });

  it('invariant 11: an expired token gets no status', async () => {
    await expect(setup().service.ringStatus(ringToken(-1))).rejects.toThrow();
  });

  it('invariant 11 and 21: another kind of token is refused', async () => {
    const join = sign({
      claim_type: 'JoinVideoCall',
      user_id: CALLEE,
      chat_id: { Direct: CALLER },
    });
    await expect(setup().service.ringStatus(join)).rejects.toThrow();
    await expect(setup().service.answerRing(join, 'bob')).rejects.toThrow();
  });

  it('invariant 21: answering gives that user a Daily token for that room', async () => {
    const { service, tokenRequests } = setup();
    await expect(service.answerRing(ringToken(), 'bob')).resolves.toEqual({
      token: 'daily',
      roomName: ROOM,
    });
    expect(tokenRequests).toHaveLength(1);
    const properties = JSON.parse(tokenRequests[0]).properties;
    expect(properties.room_name).toBe(ROOM);
    expect(properties.user_id).toBe(CALLEE);
  });

  it('invariant 24: a ring answer is never a Daily owner or admin', async () => {
    const { service, tokenRequests } = setup();
    await service.answerRing(ringToken(), 'bob');
    const properties = JSON.parse(tokenRequests[0]).properties;
    expect(properties.is_owner).toBeFalsy();
    expect(properties.permissions?.canAdmin).toBeFalsy();
  });

  it('invariant 21: an expired token or a call that has gone gets no Daily token', async () => {
    const expired = setup();
    await expect(
      expired.service.answerRing(ringToken(-1), 'bob'),
    ).rejects.toThrow();
    expect(expired.tokenRequests).toHaveLength(0);

    const gone = setup(false);
    await expect(
      gone.service.answerRing(ringToken(), 'bob'),
    ).rejects.toThrow();
    expect(gone.tokenRequests).toHaveLength(0);

    const other = setup();
    await expect(
      other.service.answerRing(ringToken(60, '999'), 'bob'),
    ).rejects.toThrow();
    expect(other.tokenRequests).toHaveLength(0);
  });
});
