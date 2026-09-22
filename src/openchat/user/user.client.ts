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

export class UserClient extends CandidService {
  private userService: UserService;

  constructor(
    identity: Identity,
    private userId: string,
    host: string,
  ) {
    super(identity);
    this.userService = this.createServiceClient<UserService>(
      idlFactory,
      userId,
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
        // open-chat #9401 added the target user to every User canister endpoint that is not
        // owner only. A user canister from before that change ignores the extra field.
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
        // open-chat #9401 renamed the other user from `user_id` to `them` and made `user_id`
        // the target user. User canisters upgrade over days, so this has to work on both
        // sides of that change: a canister from before it reads the other user from
        // `user_id`, and one from after it reads `them` and does not read `user_id` at all.
        // Once every user canister is past #9401 `user_id` should become this.userId.
        user_id: Principal.fromText(otherUser),
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
