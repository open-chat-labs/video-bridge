import { Logger } from '@nestjs/common';
import { CandidService } from '../candidService';
import { UserService, idlFactory } from './candid/idl';
import { Principal } from '@dfinity/principal';
import { Identity } from '@dfinity/agent';
import { DirectMeeting } from '../../types';

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
    msgId: bigint,
    initiatorId: string,
    initiatorUsername: string,
    initiatorDisplayName?: string,
    initiatorAvatarId?: bigint,
  ): Promise<bigint> {
    return this.handleResponse(
      this.userService.start_video_call({
        message_id: msgId,
        initiator: Principal.fromText(initiatorId),
        initiator_username: initiatorUsername,
        initiator_avatar_id: initiatorAvatarId ? [initiatorAvatarId] : [],
        initiator_display_name: initiatorDisplayName
          ? [initiatorDisplayName]
          : [],
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
    );
  }

  meetingFinished(
    otherUser: string,
    meeting: DirectMeeting,
  ): Promise<DirectMeeting> {
    const msg = `Sending meeting finished from userA (${this.userId}) to userB (${otherUser})`;
    Logger.debug(msg);
    return this.handleResponse(
      this.userService.end_video_call({
        user_id: Principal.fromText(otherUser),
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
