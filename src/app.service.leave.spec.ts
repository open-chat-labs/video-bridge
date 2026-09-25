import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
// The real service pulls in the canister clients, which jest cannot resolve ('src/utils'
// absolute import). A fake is passed to the constructor below, so it is never needed.
jest.mock('./openchat/openchat.service', () => ({
  OpenChatService: class {},
}));
jest.mock('./inprogress/inprogress.service', () => ({
  InProgressService: class {},
}));

import { AppService } from './app.service';
import { CreateInProgressDto } from './inprogress/inprogress.dto';
import { chatIdToRoomName } from './utils';

// open-chat #9559 invariant 2, the bridge half: a phone killed mid-call is taken out of
// the room so the others do not see it frozen until Daily's timeout. A leave never ends
// the call.

const GROUP = 'rrkah-fqaaa-aaaaa-aaaaq-cai';
const PHONE = 'r7inp-6aaaa-aaaaa-aaabq-cai';
const OTHER = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
const MESSAGE_ID = '123456789012345678';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function sign(claims: Record<string, unknown>): string {
  return jwt.sign(claims, privateKey, { algorithm: 'ES256', expiresIn: 60 });
}

const joinToken = (user_id = PHONE) =>
  sign({ claim_type: 'JoinVideoCall', user_id, chat_id: { Group: GROUP } });
const endToken = () =>
  sign({
    claim_type: 'MarkVideoCallAsEnded',
    user_id: PHONE,
    chat_id: { Group: GROUP },
  });

function setup(present: Record<string, string>, ejectOk = true) {
  const records = new Map<string, CreateInProgressDto>();
  const inprogress = {
    get: async (roomName: string) => records.get(roomName),
    upsert: async (r: CreateInProgressDto) => {
      records.set(r.roomName, r);
      return true;
    },
    delete: async (roomName: string) => {
      records.delete(roomName);
      return true;
    },
  };
  const config = {
    get: (key: string) => (key === 'OC_PUBLIC' ? PUBLIC_PEM : 'x'),
  };
  const finished: unknown[] = [];
  const ejected: { room: string; ids: string[] }[] = [];
  const openChat = {
    meetingsFinished: async (meetings: unknown[]) => {
      finished.push(...meetings);
      return meetings;
    },
  };
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/presence')) {
      return {
        ok: true,
        json: async () => ({
          total_count: Object.keys(present).length,
          data: Object.entries(present).map(([userId, id]) => ({ userId, id })),
        }),
      } as Response;
    }
    if (url.endsWith('/eject')) {
      ejected.push({
        room: url.split('/').slice(-2)[0],
        ids: JSON.parse(init?.body as string).ids,
      });
      return { ok: ejectOk, status: ejectOk ? 200 : 500 } as Response;
    }
    return { ok: true } as Response;
  }) as unknown as typeof fetch;

  const service = new AppService(
    inprogress as any,
    config as any,
    openChat as any,
  );
  return { service, records, finished, ejected };
}

const ROOM = chatIdToRoomName(PHONE, { kind: 'group_chat', groupId: GROUP });

function record(): CreateInProgressDto {
  return {
    roomName: ROOM,
    messageId: MESSAGE_ID,
    confirmed: true,
    expiresAt: new Date(Date.now() + 60_000),
    startedBy: OTHER,
    callType: 'Default',
  } as CreateInProgressDto;
}

describe('leaving a call natively (open-chat #9559 invariant 2)', () => {
  test('invariant 2: the phone is ejected from the room and the call carries on', async () => {
    const { service, records, finished, ejected } = setup({
      [PHONE]: 'p-1',
      [OTHER]: 'p-2',
    });
    records.set(ROOM, record());

    await service.leaveMeeting(joinToken());

    expect(ejected).toEqual([{ room: ROOM, ids: ['p-1'] }]);
    expect(finished).toEqual([]);
    expect(records.has(ROOM)).toBe(true);
  });

  test('invariant 2: only a join token leaves, and only for a user who is in the room', async () => {
    const { service, records, ejected } = setup({ [OTHER]: 'p-2' });
    records.set(ROOM, record());

    await expect(service.leaveMeeting(endToken())).rejects.toThrow(
      'Unexpected auth token type',
    );
    await expect(service.leaveMeeting(joinToken())).rejects.toThrow(
      'Not in the call',
    );
    expect(ejected).toEqual([]);
  });

  test('invariant 2: no call in progress is a 404 and an eject the room refuses is reported', async () => {
    const empty = setup({ [PHONE]: 'p-1' });
    await expect(empty.service.leaveMeeting(joinToken())).rejects.toThrow(
      'No call in progress',
    );

    const refused = setup({ [PHONE]: 'p-1' }, false);
    refused.records.set(ROOM, record());
    await expect(refused.service.leaveMeeting(joinToken())).rejects.toThrow(
      'Unable to leave the call',
    );
  });
});
