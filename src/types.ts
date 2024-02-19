export type TokenPayload = {
  userId: string;
  username: string;
  chatId: ChatIdentifier;
  exp: number;
};

export type Meeting = {
  chatId: ChatIdentifier;
  messageId: bigint;
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
