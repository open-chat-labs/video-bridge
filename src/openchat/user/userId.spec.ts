import { Principal } from '@dfinity/principal';
import { userCanisterId } from './userId';

const CANISTER_ID = 'dfdal-2uaaa-aaaaa-qaama-cai';

// Taken from `UserId::new_indexed(CANISTER_ID, index)` in open-chat's
// backend/libraries/types/src/user.rs, as are the website's tests of the same thing
const INDEXED_USER_IDS: [number, string][] = [
  [1, 'qp43m-xeaaa-aaaaa-qaama-daa'],
  [255, 'bhdhu-34aaa-aaaaa-qaamp-7aa'],
  [256, '5xs3p-c4aaa-aaaaa-qaama-bai'],
  [1000, 'svgk6-q4aaa-aaaaa-qaamo-ray'],
  [32767, 'zf6bn-quaaa-aaaaa-qaamp-77y'],
];

describe('userCanisterId', () => {
  it('is the id itself for a user with a User canister of their own', () => {
    expect(userCanisterId(CANISTER_ID)).toBe(CANISTER_ID);
  });

  it.each(INDEXED_USER_IDS)(
    'is the MultiUser canister for the user at index %i',
    (_index, userId) => {
      expect(userCanisterId(userId)).toBe(CANISTER_ID);
    },
  );

  it('is the id itself for a bot or webhook id, which is not canister id length', () => {
    const botId = Principal.fromUint8Array(
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 0x80]),
    ).toText();
    expect(userCanisterId(botId)).toBe(botId);
  });
});
