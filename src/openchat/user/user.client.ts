import { Identity } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { Logger } from '@nestjs/common';
import { DirectMeeting, VideoCallType, videoCallTypeToApi } from '../../types';
import { CandidService } from '../candidService';
import {
  DEFAULT_MAX_CALL_DURATION_MS,
  DIAMOND_MAX_CALL_DURATION_MS,
} from '../constants';
import { UserService, idlFactory } from './candid/idl';
import { userCanisterId } from './userId';

export class UserClient extends CandidService {
  private userService: UserService;

  constructor(
    identity: Identity,
    private userId: string,
    host: string,
  ) {
    super(identity);
    // The user may be one of many in a MultiUser canister, so their id isn't always their canister's
    this.userService = this.createServiceClient<UserService>(
      idlFactory,
      userCanisterId(userId),
      host,
    );
  }

  sendVideoCallStartedMessage(
    callType: VideoCallType,
    msgId: bigint,
    initiatorId: string,
    initiatorIsDiamond: boolean,
    initiatorUsername: string,
    initiatorDisplayName?: string,
    initiatorAvatarId?: bigint,
  ): Promise<bigint> {
    return this.handleResponse(
      this.userService.start_video_call_v2({
        // The user whose copy of the chat the call starts in, which a MultiUser canister needs
        user_id: Principal.fromText(this.userId),
        message_id: msgId,
        initiator: Principal.fromText(initiatorId),
        initiator_username: initiatorUsername,
        initiator_avatar_id: initiatorAvatarId ? [initiatorAvatarId] : [],
        initiator_display_name: initiatorDisplayName
          ? [initiatorDisplayName]
          : [],
        max_duration: [
          initiatorIsDiamond
            ? DIAMOND_MAX_CALL_DURATION_MS
            : DEFAULT_MAX_CALL_DURATION_MS,
        ],
        ...videoCallTypeToApi(callType),
      }),
      (res) => {
        if (!('Success' in res)) {
          Logger.error(
            'Unable to send message to start video call: ',
            JSON.stringify(res),
          );
        }
        return msgId;
      },
    ).catch((err) => {
      Logger.error(
        'Unable to send message to start video call: ',
        JSON.stringify(err),
      );
      return msgId;
    });
  }

  meetingFinished(
    otherUser: string,
    meeting: DirectMeeting,
  ): Promise<DirectMeeting> {
    const msg = `Sending meeting finished from userA (${this.userId}) to userB (${otherUser})`;
    Logger.debug(msg);
    return this.handleResponse(
      this.userService.end_video_call_v2({
        // The user whose copy of the chat the call ends in, which a MultiUser canister needs.
        // A User canister from before open-chat #9401 read the other user from `user_id`, so
        // this needs every User canister to be past it.
        user_id: Principal.fromText(this.userId),
        them: Principal.fromText(otherUser),
        message_id: meeting.messageId,
      }),
      () => {
        // if we get *any* response here we consider it success
        // only an exception is a problem
        return meeting;
      },
    );
  }
}
