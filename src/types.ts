import { IsNotEmpty, IsObject } from 'class-validator';

// The part of a Daily room, as returned by the REST API, that the bridge reads
export type DailyRoomInfo = {
  id: string;
  name: string;
  url: string;
  config: {
    enable_hidden_participants?: boolean;
    [key: string]: unknown;
  };
};

export type ApiStartClaims = {
  claim_type: 'StartVideoCall';
  call_type: ApiVideoCallType;
  // absent in a token from a local user index that predates audio calls
  audio_only?: boolean;
  user_id: string;
  chat_id: ApiChatIdentifier;
  is_diamond: boolean;
};

export type ApiJoinClaims = {
  claim_type: 'JoinVideoCall';
  user_id: string;
  chat_id: ApiChatIdentifier;
  // the local user index that signed the token; absent from one that predates declines
  local_user_index?: string;
};

// Carried in a ring push so a phone whose app is not running can decline without an
// identity. Signed by the local user index, per call and per recipient, expiring with the
// ring window.
export type ApiDeclineClaims = {
  claim_type: 'DeclineVideoCall';
  user_id: string;
  chat_id: ApiChatIdentifier;
  message_id: string;
  local_user_index: string;
};

export type ApiMarkCallEndedClaims = {
  claim_type: 'MarkVideoCallAsEnded';
  user_id: string;
  chat_id: ApiChatIdentifier;
};

export type ApiClaims =
  ApiStartClaims | ApiJoinClaims | ApiMarkCallEndedClaims | ApiDeclineClaims;

export type ApiTokenPayload = ApiClaims & {
  exp: number;
};

// How OpenChat names a call's type on the wire. An audio call travels as 'Default' with a
// separate audio only flag, so that clients which predate audio calls still decode it.
export type ApiVideoCallType = 'Default' | 'Broadcast';

// 'Default' is a video call. The wire pair can say "audio only broadcast", which does not
// exist, so it is converted to this type as it arrives and only this type is passed around.
export type VideoCallType = ApiVideoCallType | 'Audio';

export function videoCallTypeFromApi(
  callType: ApiVideoCallType,
  audioOnly?: boolean,
): VideoCallType {
  return callType === 'Default' && audioOnly === true ? 'Audio' : callType;
}

export function videoCallTypeToApi(callType: VideoCallType): {
  call_type: { Default: null } | { Broadcast: null };
  audio_only: [] | [boolean];
} {
  return {
    call_type:
      callType === 'Broadcast' ? { Broadcast: null } : { Default: null },
    audio_only: callType === 'Audio' ? [true] : [],
  };
}

export type TokenPayload =
  StartClaims | JoinClaims | EndCallClaims | DeclineClaims;

export type EndCallClaims = {
  claimType: 'MarkVideoCallAsEnded';
  userId: string;
  chatId: ChatIdentifier;
};

export type StartClaims = {
  claimType: 'StartVideoCall';
  callType: VideoCallType;
  userId: string;
  chatId: ChatIdentifier;
  isDiamond: boolean;
};

export type JoinClaims = {
  claimType: 'JoinVideoCall';
  userId: string;
  chatId: ChatIdentifier;
  localUserIndex?: string;
};

export type DeclineClaims = {
  claimType: 'DeclineVideoCall';
  userId: string;
  chatId: ChatIdentifier;
  messageId: bigint;
  localUserIndex: string;
};

export type ApiChatIdentifier =
  ApiGroupChatIdentifier | ApiDirectChatIdentifier | ApiChannelIdentifier;

export type ApiGroupChatIdentifier = {
  Group: string;
};

export type ApiDirectChatIdentifier = {
  Direct: string;
};

export type ApiChannelIdentifier = {
  Channel: [string, string];
};

export function mapTokenPayload(token: ApiTokenPayload): TokenPayload {
  switch (token.claim_type) {
    case 'MarkVideoCallAsEnded':
      return {
        claimType: token.claim_type,
        userId: token.user_id,
        chatId: mapChatId(token.chat_id),
      };
    case 'StartVideoCall':
      return {
        claimType: token.claim_type,
        userId: token.user_id,
        chatId: mapChatId(token.chat_id),
        callType: videoCallTypeFromApi(token.call_type, token.audio_only),
        isDiamond: token.is_diamond,
      };
    case 'JoinVideoCall':
      return {
        claimType: token.claim_type,
        userId: token.user_id,
        chatId: mapChatId(token.chat_id),
        localUserIndex: token.local_user_index,
      };
    case 'DeclineVideoCall':
      return {
        claimType: token.claim_type,
        userId: token.user_id,
        chatId: mapChatId(token.chat_id),
        messageId: BigInt(token.message_id),
        localUserIndex: token.local_user_index,
      };
  }
}

export function mapChatId(chatId: ApiChatIdentifier): ChatIdentifier {
  if ('Direct' in chatId) {
    return { kind: 'direct_chat', userId: chatId.Direct };
  }
  if ('Group' in chatId) {
    return { kind: 'group_chat', groupId: chatId.Group };
  }
  if ('Channel' in chatId) {
    const [communityId, channelId] = chatId.Channel;
    return {
      kind: 'channel',
      communityId: communityId.toString(),
      channelId: channelId.toString(),
    };
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
  userA: string;
  userB: string;
};

export type ChannelMeeting = MeetingCommon & {
  kind: 'channel_meeting';
  chatId: ChannelIdentifier;
};

export type AccessTokenResponse = {
  token: string;
  roomName: string;
  messageId: bigint;
  joining: boolean;
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

export class MeetingEndedEvent {
  version: string;
  type: 'meeting.ended';
  id: string;
  event_ts: number;

  @IsObject()
  @IsNotEmpty()
  payload: {
    start_ts: number;
    end_ts: number;
    meeting_id: string;
    room: string;
  };
}
