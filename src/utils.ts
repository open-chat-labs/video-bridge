import { Principal } from '@dfinity/principal';
import {
  ChannelIdentifier,
  ChatIdentifier,
  DirectChatIdentifier,
  GroupChatIdentifier,
  Meeting,
} from './types';
import { toBigIntBE, toBufferBE } from 'bigint-buffer';
import { v1 as uuidv1 } from 'uuid';

const max32 = Math.pow(2, 32) - 1;

export function generateUint64(): bigint {
  const rand1 = Math.floor(Math.random() * max32);
  const rand2 = Math.floor(Math.random() * max32);

  return (BigInt(rand1) << BigInt(32)) + BigInt(rand2);
}

export function newMessageId(): bigint {
  return BigInt(parseInt(uuidv1().replace(/-/g, ''), 16));
}

export type WaitAllResult<T> = {
  success: T[];
  errors: unknown[];
};

export async function waitAll<T>(
  promises: Promise<T>[],
): Promise<WaitAllResult<T>> {
  const results = await Promise.allSettled(promises);

  const success: T[] = [];
  const errors = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      success.push(result.value);
    } else {
      errors.push(result.reason);
    }
  }

  return {
    success,
    errors,
  };
}

/**
 * This might look a bit eccentric but we need to encode the chat identifier
 * into 40 characters or fewer in a way that can be rountripped later and in
 * a way that satisfied the dailyjs rules for room names.
 * This basically means base64 encoding and replacing certain characters.
 */
export function chatIdToRoomName(
  requestingUserId: string,
  chatId: ChatIdentifier,
): string {
  if (chatId.kind === 'group_chat') {
    return groupIdToRoomName(chatId);
  } else if (chatId.kind === 'direct_chat') {
    return directIdToRoomName(requestingUserId, chatId);
  } else if (chatId.kind === 'channel') {
    return channelIdToRoomName(chatId);
  }
}

export function base64ToCanisterId(sanitised: string): string {
  const base64 = unsanitise(sanitised);
  const buffer = Buffer.from(base64, 'base64');
  const bytes = new Uint8Array(buffer);
  const p = Principal.fromUint8Array(bytes);
  return p.toText();
}

function unsanitise(base64: string): string {
  return base64.replace(/\_/g, '+').replace(/\-/g, '/');
}

function sanitise(base64: string): string {
  return base64.replace(/\+/g, '_').replace(/\//g, '-').replace(/=*$/, '');
}

export function channelIdToBase64(channelId: string): string {
  const bigintVal = BigInt(channelId);
  const buffer = toBufferBE(bigintVal, 16);
  const base64 = buffer.toString('base64');
  return sanitise(base64);
}

export function base64ToChannelId(sanitised: string): string {
  const base64 = unsanitise(sanitised);
  const buffer = Buffer.from(base64, 'base64');
  const bigintVal = toBigIntBE(buffer);
  return bigintVal.toString();
}

export function canisterIdToBase64(canisterId: string): string {
  const p = Principal.fromText(canisterId);
  const bytes = p.toUint8Array();
  const base64 = Buffer.from(bytes).toString('base64');
  return sanitise(base64);
}

export function groupIdToRoomName({ groupId }: GroupChatIdentifier): string {
  return `G${canisterIdToBase64(groupId)}`;
}

export function directIdToRoomName(
  requestingUserId: string,
  { userId }: DirectChatIdentifier,
): string {
  const users = [requestingUserId, userId];
  users.sort();
  return `D${canisterIdToBase64(users[0])}${canisterIdToBase64(users[1])}`;
}

export function channelIdToRoomName({
  communityId,
  channelId,
}: ChannelIdentifier): string {
  return `C${canisterIdToBase64(communityId)}${channelIdToBase64(channelId)}`;
}

export function roomNameToMeeting(
  roomName: string,
  messageId: string,
): Meeting {
  if (roomName.startsWith('G')) {
    return {
      kind: 'group_meeting',
      roomName,
      messageId: BigInt(messageId),
      chatId: {
        kind: 'group_chat',
        groupId: base64ToCanisterId(roomName.slice(1)),
      },
    };
  } else if (roomName.startsWith('D')) {
    const userA = roomName.slice(1, 15);
    const userB = roomName.slice(15);
    return {
      kind: 'direct_meeting',
      roomName,
      messageId: BigInt(messageId),
      userA: userA,
      userB: userB,
    };
  } else if (roomName.startsWith('C')) {
    const communityId = roomName.slice(1, 15);
    const channelId = roomName.slice(15);
    return {
      kind: 'channel_meeting',
      roomName,
      messageId: BigInt(messageId),
      chatId: {
        kind: 'channel',
        communityId: base64ToCanisterId(communityId),
        channelId: base64ToChannelId(channelId),
      },
    };
  }
}
