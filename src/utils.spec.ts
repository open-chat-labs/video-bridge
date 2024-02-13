import {
  ChannelIdentifier,
  DirectChatIdentifier,
  GroupChatIdentifier,
} from './types';
import {
  base64ToCanisterId,
  base64ToChannelId,
  canisterIdToBase64,
  channelIdToBase64,
  chatIdToRoomName,
  roomNameToChatIds,
} from './utils';

const requestingUserId = 'dfdal-2uaaa-aaaaa-qaama-cai';

const directId: DirectChatIdentifier = {
  kind: 'direct_chat',
  userId: 'dccg7-xmaaa-aaaaa-qaamq-cai',
};
const groupId: GroupChatIdentifier = {
  kind: 'group_chat',
  groupId: 'cpmcr-yeaaa-aaaaa-qaala-cai',
};
const channelId: ChannelIdentifier = {
  kind: 'channel',
  communityId: 'cinef-v4aaa-aaaaa-qaalq-cai',
  channelId: '283806532254715438641103320620325336219',
};

describe('create room name from chat identifier', () => {
  describe('channel identifiers', () => {
    test('create room name from channel id', () => {
      const roomName = chatIdToRoomName(requestingUserId, channelId);
      expect(roomName).toEqual('CgAAAAAAQABcBAQ1YMmXxLOH4FT_VUHapr0mw');
    });

    test('roundtrip a channel identifier', () => {
      const roomName = chatIdToRoomName(requestingUserId, channelId);
      const chatIds = roomNameToChatIds(roomName);
      expect(chatIds.length).toEqual(1);
      expect(chatIds[0]).toMatchObject(channelId);
    });
  });

  describe('direct chat identifiers', () => {
    test('create room name from direct chat id', () => {
      const roomName = chatIdToRoomName(requestingUserId, directId);
      expect(roomName).toEqual('DgAAAAAAQABkBAQgAAAAAAQABgBAQ');
    });

    test('roundtrip a direct identifier', () => {
      const roomName = chatIdToRoomName(requestingUserId, directId);
      const chatIds = roomNameToChatIds(roomName);
      expect(chatIds.length).toEqual(2);
      expect(chatIds[0]).toMatchObject(directId);
      expect(chatIds[1]).toMatchObject({
        kind: 'direct_chat',
        userId: requestingUserId,
      });
    });
  });

  describe('group chat identifiers', () => {
    test('create room name from group chat id', () => {
      const roomName = chatIdToRoomName(requestingUserId, groupId);
      expect(roomName).toEqual('GgAAAAAAQABYBAQ');
    });

    test('roundtrip a group identifier', () => {
      const roomName = chatIdToRoomName(requestingUserId, groupId);
      const chatIds = roomNameToChatIds(roomName);
      expect(chatIds.length).toEqual(1);
      expect(chatIds[0]).toMatchObject(groupId);
    });
  });
});

describe('encode or decode canisterId', () => {
  test('roundtrip', () => {
    const canisterId = 'cpmcr-yeaaa-aaaaa-qaala-cai';
    const encoded = canisterIdToBase64(canisterId);
    const decoded = base64ToCanisterId(encoded);
    expect(decoded).toEqual(canisterId);
  });
});

describe('encode or decode channelId', () => {
  test('roundtrip', () => {
    const encoded = channelIdToBase64(channelId.channelId);
    const decoded = base64ToChannelId(encoded);
    expect(decoded).toEqual(channelId.channelId);
  });
});
