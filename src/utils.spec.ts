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
  roomNameToMeeting,
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
  communityId: 'd6g4o-amaaa-aaaaa-qaaoq-cai',
  channelId: '1576343893',
};

describe('create room name from chat identifier', () => {
  describe('channel identifiers', () => {
    test('create room name from channel id', () => {
      const roomName = chatIdToRoomName(requestingUserId, channelId);
      expect(roomName).toEqual('CgAAAAAAQAB0BAQAAAAAAAAAAAAAAAAXfUZVQ');
    });

    test('roundtrip a channel identifier', () => {
      const roomName = chatIdToRoomName(requestingUserId, channelId);
      const meeting = roomNameToMeeting(roomName, '123');
      expect(meeting).toMatchObject({
        kind: 'channel_meeting',
        roomName: 'CgAAAAAAQAB0BAQAAAAAAAAAAAAAAAAXfUZVQ',
        messageId: 123n,
        chatId: {
          kind: 'channel',
          communityId: 'd6g4o-amaaa-aaaaa-qaaoq-cai',
          channelId: '1576343893',
        },
      });
    });
  });

  describe('direct chat identifiers', () => {
    test('create room name from direct chat id', () => {
      const roomName = chatIdToRoomName(requestingUserId, directId);
      expect(roomName).toEqual('DgAAAAAAQABkBAQgAAAAAAQABgBAQ');
    });

    test('roundtrip a direct identifier', () => {
      const roomName = chatIdToRoomName(requestingUserId, directId);
      const meeting = roomNameToMeeting(roomName, '123');
      expect(meeting).toMatchObject({
        kind: 'direct_meeting',
        roomName: 'DgAAAAAAQABkBAQgAAAAAAQABgBAQ',
        messageId: 123n,
        userA: 'dccg7-xmaaa-aaaaa-qaamq-cai',
        userB: 'dfdal-2uaaa-aaaaa-qaama-cai',
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
      const meeting = roomNameToMeeting(roomName, '123');
      expect(meeting).toMatchObject({
        kind: 'group_meeting',
        roomName: 'GgAAAAAAQABYBAQ',
        messageId: 123n,
        chatId: { kind: 'group_chat', groupId: 'cpmcr-yeaaa-aaaaa-qaala-cai' },
      });
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
