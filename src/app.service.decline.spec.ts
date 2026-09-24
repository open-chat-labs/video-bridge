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

// open-chat #9534: declining a call. The bridge's part is invariants 2, 3, 6 and 7 of that
// issue, plus the pre-existing hole that end_meeting accepted any token type.

const GROUP = 'rrkah-fqaaa-aaaaa-aaaaq-cai';
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

const directChat = (userId: string) => ({ Direct: userId });
const groupChat = () => ({ Group: GROUP });

function declineToken(
  chat_id: unknown,
  user_id = CALLEE,
  message_id = MESSAGE_ID,
  expiresIn = 60,
) {
  return sign(
    {
      claim_type: 'DeclineVideoCall',
      user_id,
      chat_id,
      message_id,
      local_user_index: LUI,
    },
    expiresIn,
  );
}

function joinToken(chat_id: unknown, user_id = CALLEE, withLui = true) {
  return sign({
    claim_type: 'JoinVideoCall',
    user_id,
    chat_id,
    ...(withLui ? { local_user_index: LUI } : {}),
  });
}

function endToken(chat_id: unknown, user_id = CALLEE) {
  return sign({ claim_type: 'MarkVideoCallAsEnded', user_id, chat_id });
}

function setup() {
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
  const declined: unknown[] = [];
  const openChat = {
    meetingsFinished: async (meetings: unknown[]) => {
      finished.push(...meetings);
      return meetings;
    },
    callDeclined: async (
      lui: string,
      userId: string,
      chatId: unknown,
      messageId: bigint,
    ) => {
      declined.push({ lui, userId, chatId, messageId });
    },
  };
  // room deletion on the finish path
  global.fetch = jest.fn(async () => ({ ok: true }) as Response);

  const service = new AppService(
    inprogress as any,
    config as any,
    openChat as any,
  );
  return { service, records, finished, declined };
}

function record(roomName: string, startedBy: string): CreateInProgressDto {
  return {
    roomName,
    messageId: MESSAGE_ID,
    confirmed: true,
    expiresAt: new Date(Date.now() + 60_000),
    startedBy,
    callType: 'Default',
  } as CreateInProgressDto;
}

const DIRECT_ROOM = chatIdToRoomName(CALLEE, {
  kind: 'direct_chat',
  userId: CALLER,
});
const GROUP_ROOM = chatIdToRoomName(CALLEE, {
  kind: 'group_chat',
  groupId: GROUP,
});

describe('declining a call (open-chat #9534)', () => {
  test('invariant 2: a decline token verifies only as a decline; a start or end token is refused', async () => {
    const { service, records, finished, declined } = setup();
    records.set(DIRECT_ROOM, record(DIRECT_ROOM, CALLER));

    await expect(
      service.declineMeeting(endToken(directChat(CALLER))),
    ).rejects.toThrow('Unexpected auth token type');
    await expect(
      service.declineMeeting(
        sign({
          claim_type: 'StartVideoCall',
          user_id: CALLEE,
          chat_id: directChat(CALLER),
          call_type: 'Default',
          is_diamond: false,
        }),
      ),
    ).rejects.toThrow('Unexpected auth token type');
    // a decline token used as a join token is refused by the join path (which wraps its errors)
    await expect(
      service.getAccessToken(declineToken(directChat(CALLER)), 'callee'),
    ).rejects.toThrow('Error obtaining room access token');
    // and the end path takes only an end token
    await expect(
      service.endMeeting(declineToken(directChat(CALLER))),
    ).rejects.toThrow('Unexpected auth token type');
    await expect(
      service.endMeeting(joinToken(directChat(CALLER))),
    ).rejects.toThrow('Unexpected auth token type');

    expect(finished).toEqual([]);
    expect(declined).toEqual([]);
    expect(records.has(DIRECT_ROOM)).toBe(true);
  });

  test('invariant 2: a decline token signed by another key is refused', async () => {
    const { service, records, finished } = setup();
    records.set(DIRECT_ROOM, record(DIRECT_ROOM, CALLER));
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const forged = jwt.sign(
      {
        claim_type: 'DeclineVideoCall',
        user_id: CALLEE,
        chat_id: directChat(CALLER),
        message_id: MESSAGE_ID,
        local_user_index: LUI,
      },
      other.privateKey,
      { algorithm: 'ES256', expiresIn: 60 },
    );
    await expect(service.declineMeeting(forged)).rejects.toThrow();
    expect(finished).toEqual([]);
  });

  test('invariant 3: an expired decline token is refused', async () => {
    const { service, records, finished } = setup();
    records.set(DIRECT_ROOM, record(DIRECT_ROOM, CALLER));
    await expect(
      service.declineMeeting(
        declineToken(directChat(CALLER), CALLEE, MESSAGE_ID, -1),
      ),
    ).rejects.toThrow();
    expect(finished).toEqual([]);
    expect(records.has(DIRECT_ROOM)).toBe(true);
  });

  test('invariant 3: a decline token for another call in the same chat is refused', async () => {
    const { service, records, finished } = setup();
    records.set(DIRECT_ROOM, record(DIRECT_ROOM, CALLER));
    await expect(
      service.declineMeeting(declineToken(directChat(CALLER), CALLEE, '999')),
    ).rejects.toThrow('The token names another call');
    expect(finished).toEqual([]);
    expect(records.has(DIRECT_ROOM)).toBe(true);
  });

  test('invariant 6: declining a direct call ends it for both sides', async () => {
    const { service, records, finished, declined } = setup();
    records.set(DIRECT_ROOM, record(DIRECT_ROOM, CALLER));

    await service.declineMeeting(declineToken(directChat(CALLER)));

    expect(finished).toEqual([
      expect.objectContaining({
        kind: 'direct_meeting',
        messageId: BigInt(MESSAGE_ID),
        userA: CALLEE,
        userB: CALLER,
      }),
    ]);
    expect(declined).toEqual([]);
  });

  test('invariant 6: a running client declines a direct call with its join token', async () => {
    const { service, records, finished } = setup();
    records.set(DIRECT_ROOM, record(DIRECT_ROOM, CALLER));

    await service.declineMeeting(joinToken(directChat(CALLER), CALLEE, false));

    expect(finished).toHaveLength(1);
  });

  test('invariant 7: declining a group call does not end it; the local user index is told', async () => {
    const { service, records, finished, declined } = setup();
    records.set(GROUP_ROOM, record(GROUP_ROOM, CALLER));

    await service.declineMeeting(declineToken(groupChat()));

    expect(finished).toEqual([]);
    expect(records.has(GROUP_ROOM)).toBe(true);
    expect(declined).toEqual([
      {
        lui: LUI,
        userId: CALLEE,
        chatId: { kind: 'group_chat', groupId: GROUP },
        messageId: BigInt(MESSAGE_ID),
      },
    ]);
  });

  test('invariant 7: a group decline with a join token that names no local user index is refused', async () => {
    const { service, records, declined } = setup();
    records.set(GROUP_ROOM, record(GROUP_ROOM, CALLER));

    await expect(
      service.declineMeeting(joinToken(groupChat(), CALLEE, false)),
    ).rejects.toThrow('local user index');
    expect(declined).toEqual([]);
  });

  test('a decline for a call that is not running is a 404 and changes nothing', async () => {
    const { service, finished, declined } = setup();
    await expect(
      service.declineMeeting(declineToken(directChat(CALLER))),
    ).rejects.toThrow('No call in progress');
    expect(finished).toEqual([]);
    expect(declined).toEqual([]);
  });
});
