import { Identity } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { CandidService } from '../candidService';
import { UserClient } from './user.client';

// A user is addressed in the canister which holds them, which for a user in a MultiUser canister
// is not their own id, and named in `user_id`, which tells a MultiUser canister which of its users
// the call is for.

const MULTI_USER_CANISTER = 'dfdal-2uaaa-aaaaa-qaama-cai';
// Index 1 in MULTI_USER_CANISTER, from `UserId::new_indexed` in open-chat
const MULTI_USER_USER = 'qp43m-xeaaa-aaaaa-qaama-daa';
const USER_CANISTER_USER = 'ryjl3-tyaaa-aaaaa-aaaba-cai';

type Call = {
  canisterId: string;
  method: string;
  args: Record<string, unknown>;
};

function fakeCanisters(): Call[] {
  const calls: Call[] = [];
  jest
    .spyOn(CandidService.prototype as any, 'createServiceClient')
    .mockImplementation((...params: unknown[]) => {
      const canisterId = params[1] as string;
      const record =
        (method: string) => async (args: Record<string, unknown>) => {
          calls.push({ canisterId, method, args });
          return { Success: null };
        };
      return {
        start_video_call_v2: record('start_video_call_v2'),
        end_video_call_v2: record('end_video_call_v2'),
      };
    });
  return calls;
}

function client(userId: string): UserClient {
  return new UserClient({} as Identity, userId, 'http://localhost');
}

function text(principal: unknown): string {
  return (principal as Principal).toText();
}

afterEach(() => jest.restoreAllMocks());

describe('UserClient', () => {
  it.each([
    [
      'in a MultiUser canister',
      MULTI_USER_USER,
      MULTI_USER_CANISTER,
      USER_CANISTER_USER,
    ],
    [
      'with a User canister of their own',
      USER_CANISTER_USER,
      USER_CANISTER_USER,
      MULTI_USER_USER,
    ],
  ])(
    'starts a call in the canister of the callee %s, naming them and the initiator',
    async (_, callee, canister, initiator) => {
      const calls = fakeCanisters();

      await client(callee).sendVideoCallStartedMessage(
        'Default',
        1n,
        initiator,
        false,
        'initiator',
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].canisterId).toBe(canister);
      expect(calls[0].method).toBe('start_video_call_v2');
      expect(text(calls[0].args.user_id)).toBe(callee);
      expect(text(calls[0].args.initiator)).toBe(initiator);
    },
  );

  it.each([
    [
      'in a MultiUser canister',
      MULTI_USER_USER,
      MULTI_USER_CANISTER,
      USER_CANISTER_USER,
    ],
    [
      'with a User canister of their own',
      USER_CANISTER_USER,
      USER_CANISTER_USER,
      MULTI_USER_USER,
    ],
  ])(
    'ends a call in the canister of a user %s, naming them and the other user',
    async (_, user, canister, otherUser) => {
      const calls = fakeCanisters();
      const meeting = {
        kind: 'direct_meeting' as const,
        roomName: 'room',
        messageId: 1n,
        userA: user,
        userB: otherUser,
      };

      await client(user).meetingFinished(otherUser, meeting);

      expect(calls).toHaveLength(1);
      expect(calls[0].canisterId).toBe(canister);
      expect(calls[0].method).toBe('end_video_call_v2');
      expect(text(calls[0].args.user_id)).toBe(user);
      expect(text(calls[0].args.them)).toBe(otherUser);
    },
  );
});
