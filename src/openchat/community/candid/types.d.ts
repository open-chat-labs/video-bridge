import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type OCError = [number, [] | [string]];
export type StartVideoCallResponse = { Error: OCError } | { Success: null };
export type EndVideoCallResponse = { Error: OCError } | { Success: null };

export type ChannelId = bigint;
export interface EndVideoCallArgs {
  channel_id: ChannelId;
  message_id: MessageId;
}
export type MessageId = bigint;
export type Milliseconds = bigint;
export interface StartVideoCallArgs {
  initiator_username: string;
  channel_id: ChannelId;
  initiator: UserId;
  max_duration: [] | [Milliseconds];
  initiator_display_name: [] | [string];
  message_id: MessageId;
  call_type: VideoCallType;
}

export type UserId = CanisterId;
export type VideoCallType = { Default: null } | { Broadcast: null };
export interface _SERVICE {
  end_video_call_v2: ActorMethod<[EndVideoCallArgs], EndVideoCallResponse>;
  start_video_call_v2: ActorMethod<
    [StartVideoCallArgs],
    StartVideoCallResponse
  >;
}
export declare const idlFactory: IDL.InterfaceFactory;
