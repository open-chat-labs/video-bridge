import { Logger } from '@nestjs/common';
import { CandidService } from '../candidService';
import { GroupService, idlFactory } from './candid/idl';
import { Principal } from '@dfinity/principal';
import { generateUint64, newMessageId } from '../../utils';
import { Identity } from '@dfinity/agent';
import { GroupMeeting } from '../../types';

export class GroupClient extends CandidService {
  private groupService: GroupService;

  constructor(
    identity: Identity,
    private groupId: string,
    host: string,
  ) {
    super(identity);
    this.groupService = this.createServiceClient<GroupService>(
      idlFactory,
      groupId,
      host,
    );
  }

  sendVideoCallStartedMessage(userId: string): Promise<bigint> {
    const msgId = newMessageId();
    return this.handleResponse(
      this.groupService.send_message_v2({
        content: {
          VideoCall: {
            initiator: Principal.fromText(userId),
          },
        },
        message_id: msgId,
        sender_name: 'video_bridge_operator',
        sender_display_name: [],
        rules_accepted: [],
        replies_to: [],
        mentioned: [],
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

  meetingFinished(meeting: GroupMeeting): Promise<GroupMeeting> {
    Logger.debug('Sending meeting finished on group ', this.groupId, meeting);
    return this.handleResponse(
      this.groupService.end_video_call({
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
