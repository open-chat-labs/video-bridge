import { mapTokenPayload, videoCallTypeToApi } from './types';
import { callTypeForToken, meetingTokenParams } from './utils';

const ROOM = 'room';
const STARTER = 'starter-id';
const JOINER = 'joiner-id';

describe('audio calls (open-chat #9455)', () => {
  // invariant 7: every token issued for an audio call, to the starter and to every joiner, has
  // canSend equal to ['audio'] and start_video_off true
  describe('invariant 7: an audio call token can only send audio', () => {
    test.each([
      ['starter', false, STARTER],
      ['joiner', true, JOINER],
    ])('%s', (_, joining, userId) => {
      const params: any = meetingTokenParams(
        joining,
        'Audio',
        ROOM,
        userId,
        'name',
        STARTER,
      );
      expect(params.properties.permissions.canSend).toEqual(['audio']);
      expect(params.properties.start_video_off).toEqual(true);
    });

    test('a joiner gets the type on the call record, whatever the room says', () => {
      expect(callTypeForToken('Default', { callType: 'Audio' })).toEqual(
        'Audio',
      );
      // and a second start request for a running audio call cannot turn it into video
      expect(
        callTypeForToken('Default', { callType: 'Audio' }, 'Default'),
      ).toEqual('Audio');
    });

    test('a start request decides the type of a new call', () => {
      expect(callTypeForToken('Default', undefined, 'Audio')).toEqual('Audio');
      expect(callTypeForToken('Default', undefined, 'Default')).toEqual(
        'Default',
      );
    });

    test('a broadcast room never becomes an audio call', () => {
      expect(callTypeForToken('Broadcast', undefined, 'Audio')).toEqual(
        'Broadcast',
      );
    });

    test('a call record written before audio calls existed falls back to the room', () => {
      expect(callTypeForToken('Broadcast', {})).toEqual('Broadcast');
      expect(callTypeForToken('Default', {})).toEqual('Default');
    });
  });

  // invariant 8: every token issued for a video call or a broadcast is identical to the one
  // issued before audio calls existed. The expected values are copied from that code.
  describe('invariant 8: video and broadcast tokens are unchanged', () => {
    const base = (joining: boolean, userId: string) => ({
      room_name: ROOM,
      user_name: 'name',
      user_id: userId,
      is_owner: !joining,
    });

    test('video call', () => {
      expect(
        meetingTokenParams(false, 'Default', ROOM, STARTER, 'name', STARTER),
      ).toEqual({
        properties: {
          ...base(false, STARTER),
          permissions: { canSend: true, hasPresence: true, canAdmin: true },
        },
      });
      expect(
        meetingTokenParams(true, 'Default', ROOM, JOINER, 'name', STARTER),
      ).toEqual({
        properties: {
          ...base(true, JOINER),
          permissions: { canSend: true, hasPresence: true, canAdmin: false },
        },
      });
    });

    test('broadcast', () => {
      expect(
        meetingTokenParams(false, 'Broadcast', ROOM, STARTER, 'name', STARTER),
      ).toEqual({
        properties: {
          ...base(false, STARTER),
          start_video_off: false,
          start_audio_off: false,
          permissions: { canSend: true, hasPresence: true, canAdmin: true },
        },
      });
      expect(
        meetingTokenParams(true, 'Broadcast', ROOM, JOINER, 'name', STARTER),
      ).toEqual({
        properties: {
          ...base(true, JOINER),
          start_video_off: true,
          start_audio_off: true,
          permissions: { canSend: false, hasPresence: false, canAdmin: false },
        },
      });
      // the starter rejoining their own broadcast is still the presenter
      expect(
        meetingTokenParams(true, 'Broadcast', ROOM, STARTER, 'name', STARTER),
      ).toEqual({
        properties: {
          ...base(true, STARTER),
          start_video_off: false,
          start_audio_off: false,
          permissions: { canSend: true, hasPresence: true, canAdmin: true },
        },
      });
    });
  });

  // invariants 1 and 2, bridge side: the bridge never holds or sends an audio only broadcast
  describe('the wire pair', () => {
    const claims = (call_type: 'Default' | 'Broadcast', audio_only?: boolean) =>
      mapTokenPayload({
        claim_type: 'StartVideoCall',
        call_type,
        audio_only,
        user_id: 'aaaaa-aa',
        chat_id: { Group: 'aaaaa-aa' },
        is_diamond: false,
        exp: 0,
      });

    test('a token from a local user index that predates audio calls is a video call', () => {
      expect(claims('Default')).toMatchObject({ callType: 'Default' });
    });

    test('audio only makes a default call an audio call and leaves a broadcast alone', () => {
      expect(claims('Default', true)).toMatchObject({ callType: 'Audio' });
      expect(claims('Broadcast', true)).toMatchObject({
        callType: 'Broadcast',
      });
    });

    test('nothing is sent to a canister as an audio only broadcast', () => {
      expect(videoCallTypeToApi('Audio')).toEqual({
        call_type: { Default: null },
        audio_only: [true],
      });
      expect(videoCallTypeToApi('Default')).toEqual({
        call_type: { Default: null },
        audio_only: [],
      });
      expect(videoCallTypeToApi('Broadcast')).toEqual({
        call_type: { Broadcast: null },
        audio_only: [],
      });
    });
  });
});
