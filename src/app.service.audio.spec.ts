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
import { ApiVideoCallType } from './types';

// open-chat #9455 invariants 7 and 8, end to end through getAccessToken. The token rules are
// tested on their own in callType.spec.ts. That does not fail if getAccessToken stops using
// them, or stops writing the call type to the in-progress record, and in the second case
// every joiner of an audio call would be handed a full video token.

const GROUP = 'rrkah-fqaaa-aaaaa-aaaaq-cai';
const STARTER = 'ryjl3-tyaaa-aaaaa-aaaba-cai';
const JOINER = 'r7inp-6aaaa-aaaaa-aaabq-cai';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function sign(claims: Record<string, unknown>): string {
  return jwt.sign(claims, privateKey, { algorithm: 'ES256', expiresIn: 60 });
}

function startToken(call_type: ApiVideoCallType, audio_only?: boolean) {
  return sign({
    claim_type: 'StartVideoCall',
    call_type,
    audio_only,
    user_id: STARTER,
    chat_id: { Group: GROUP },
    is_diamond: false,
  });
}

function joinToken(user_id: string) {
  return sign({
    claim_type: 'JoinVideoCall',
    user_id,
    chat_id: { Group: GROUP },
  });
}

function setup() {
  const records = new Map<string, CreateInProgressDto>();
  const inprogress = {
    get: async (roomName: string) => records.get(roomName),
    upsert: async (r: CreateInProgressDto) => {
      records.set(r.roomName, r);
      return true;
    },
  };
  const config = {
    get: (key: string) => (key === 'OC_PUBLIC' ? PUBLIC_PEM : 'x'),
  };
  const started: string[] = [];
  const openChat = {
    sendVideoCallStartedMessage: (_chat: unknown, callType: string) => {
      started.push(callType);
      return BigInt(1);
    },
  };

  let room: { config: Record<string, unknown> } | undefined = undefined;

  const tokenRequests: any[] = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const ok = (body: unknown) =>
      ({ ok: true, json: async () => body }) as Response;
    if (url.endsWith('/meeting-tokens')) {
      tokenRequests.push(JSON.parse(init.body as string));
      return ok({ token: 'daily-token' });
    }
    if (url.endsWith('/rooms')) {
      const params = JSON.parse(init.body as string);
      room = { config: params.properties };
      return ok(room);
    }
    // does the room exist
    return room === undefined ? ({ ok: false } as Response) : ok(room);
  }) as unknown as typeof fetch;

  const service = new AppService(
    inprogress as any,

    config as any,

    openChat as any,
  );
  return { service, records, started, tokenRequests };
}

describe('audio calls through getAccessToken (open-chat #9455)', () => {
  test('invariant 7: the starter and every joiner of an audio call get an audio only token', async () => {
    const { service, records, started, tokenRequests } = setup();

    await service.getAccessToken(startToken('Default', true), 'starter');
    expect(started).toEqual(['Audio']);
    expect([...records.values()][0].callType).toEqual('Audio');

    await service.getAccessToken(joinToken(JOINER), 'joiner');
    // a second start request for the running call is a join and cannot make it a video call
    await service.getAccessToken(startToken('Default'), 'starter');

    expect(tokenRequests).toHaveLength(3);
    for (const request of tokenRequests) {
      expect(request.properties.permissions.canSend).toEqual(['audio']);
      expect(request.properties.start_video_off).toEqual(true);
    }
    expect(started).toEqual(['Audio']);
  });

  test('invariant 8: a video call is started and joined exactly as before', async () => {
    const { service, records, started, tokenRequests } = setup();

    // no audio_only claim at all, as from a local user index that predates audio calls
    await service.getAccessToken(startToken('Default'), 'starter');
    await service.getAccessToken(joinToken(JOINER), 'joiner');

    expect(started).toEqual(['Default']);
    expect([...records.values()][0].callType).toEqual('Default');
    expect(tokenRequests.map((r) => r.properties.permissions)).toEqual([
      { canSend: true, hasPresence: true, canAdmin: true },
      { canSend: true, hasPresence: true, canAdmin: false },
    ]);
    expect(tokenRequests[0].properties.start_video_off).toBeUndefined();
  });

  test('invariant 8: a broadcast marked audio only is still a broadcast', async () => {
    const { service, started, tokenRequests } = setup();

    await service.getAccessToken(startToken('Broadcast', true), 'starter');
    await service.getAccessToken(joinToken(JOINER), 'joiner');

    expect(started).toEqual(['Broadcast']);
    expect(tokenRequests.map((r) => r.properties.permissions)).toEqual([
      { canSend: true, hasPresence: true, canAdmin: true },
      { canSend: false, hasPresence: false, canAdmin: false },
    ]);
  });
});
