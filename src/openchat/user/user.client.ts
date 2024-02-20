import { Logger } from '@nestjs/common';
import { CandidService } from '../candidService';
import { UserService, idlFactory } from './candid/idl';
import { Principal } from '@dfinity/principal';
import { generateUint64, newMessageId } from '../../utils';
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

  sendVideoCallStartedMessage(userId: string): Promise<bigint> {
    const msgId = newMessageId();
    return this.handleResponse(
      this.userService.send_message_v2({
        content: {
          VideoCall: {
            initiator: Principal.fromText(userId),
          },
        },
        recipient: Principal.fromText(this.userId),
        message_id: msgId,
        replies_to: [],
        forwarding: false,
        thread_root_message_index: [],
        message_filter_failed: [],
        correlation_id: generateUint64(),
      }),
      (res) => {
        if ('Success' in res) {
          return msgId;
        } else {
          Logger.error('Unable to send message to start video call: ', res);
          throw new Error(`Unable to send message to start video call: ${res}`);
        }
      },
    );
  }

  meetingFinished(meeting: DirectMeeting): Promise<DirectMeeting> {
    Logger.debug('Sending meeting finished for userId ', this.userId, meeting);
    return this.handleResponse(
      this.userService.end_video_call({
        user_id: Principal.fromText(this.userId),
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
