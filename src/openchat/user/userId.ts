import { Principal } from '@dfinity/principal';

// Mirrors `UserId` in open-chat's backend/libraries/types/src/user.rs (and `userCanisterId` in its
// frontend). A user with a User canister of their own is identified by that canister's id. A user
// held in a MultiUser canister alongside others is identified by that canister's leading 8 bytes
// followed by their index within it, the index taking the place of the canister id's two trailing
// tag bytes.

// The IC's canister ids are a big-endian u64 followed by two class tag bytes, so they are always
// exactly this long and always end in exactly these bytes.
const CANISTER_ID_LENGTH = 10;
const CANISTER_ID_TAG = [0x01, 0x01];
// Set in a UserId's final byte to mark it as carrying the user's index within their canister. No
// class tag the IC defines has the top bit set, so a byte which does cannot be one.
const INDEXED_TAG = 0x80;

// The id of the canister which holds the user's data, which is the user's own id unless they are
// one of many in a MultiUser canister.
export function userCanisterId(userId: string): string {
  const bytes = Principal.fromText(userId).toUint8Array();
  const isIndexed =
    bytes.length === CANISTER_ID_LENGTH &&
    (bytes[CANISTER_ID_LENGTH - 1] & INDEXED_TAG) !== 0;
  if (!isIndexed) {
    return userId;
  }

  // Rebuilding the canister id means restoring the two tag bytes the index displaced
  const canisterId = new Uint8Array(CANISTER_ID_LENGTH);
  canisterId.set(bytes.subarray(0, 8));
  canisterId.set(CANISTER_ID_TAG, 8);
  return Principal.fromUint8Array(canisterId).toText();
}
