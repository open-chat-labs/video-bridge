import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';
import type { Principal } from '@dfinity/principal';

export type OCError = [number, [] | [string]];
export type UnitResult = { Error: OCError } | { Success: null };
export type Chat =
  | { Direct: Principal }
  | { Group: Principal }
  | { Channel: [Principal, number] };
export interface VideoCallDeclinedArgs {
  user_id: Principal;
  chat_id: Chat;
  message_id: bigint;
}
export interface _SERVICE {
  video_call_declined: ActorMethod<[VideoCallDeclinedArgs], UnitResult>;
}
export declare const idlFactory: IDL.InterfaceFactory;
