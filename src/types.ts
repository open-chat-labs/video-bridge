export type TokenPayload = {
  userId: string;
  username: string;
  chatId: ChatIdentifier;
  exp: number;
};

export function createMeeting(
  chatId: ChatIdentifier,
  roomName: string,
  messageId: bigint,
): Meeting {
  switch (chatId.kind) {
    case 'channel':
      return { kind: 'channel_meeting', chatId, roomName, messageId };
    case 'direct_chat':
      return { kind: 'direct_meeting', chatId, roomName, messageId };
    case 'group_chat':
      return { kind: 'group_meeting', chatId, roomName, messageId };
  }
}

export type Meeting = GroupMeeting | DirectMeeting | ChannelMeeting;

type MeetingCommon = {
  roomName: string;
  messageId: bigint;
};

export type GroupMeeting = MeetingCommon & {
  kind: 'group_meeting';
  chatId: GroupChatIdentifier;
};

export type DirectMeeting = MeetingCommon & {
  kind: 'direct_meeting';
  chatId: DirectChatIdentifier;
};

export type ChannelMeeting = MeetingCommon & {
  kind: 'channel_meeting';
  chatId: ChannelIdentifier;
};

export type AccessTokenResponse = {
  token: string;
  roomName: string;
};

export type ChatIdentifier = MultiUserChatIdentifier | DirectChatIdentifier;
export type MultiUserChatIdentifier = ChannelIdentifier | GroupChatIdentifier;

export type DirectChatIdentifier = {
  kind: 'direct_chat';
  userId: string;
};

export type GroupChatIdentifier = {
  kind: 'group_chat';
  groupId: string;
};

export type ChannelIdentifier = {
  kind: 'channel';
  communityId: string;
  channelId: string;
};

export class AccessTokenRequest {
  userId: string;
  username: string;
  chatId: ChatIdentifier;
}
