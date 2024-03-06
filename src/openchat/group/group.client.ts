import { Logger } from '@nestjs/common';
import { CandidService } from '../candidService';
import { GroupService, idlFactory } from './candid/idl';
import { Principal } from '@dfinity/principal';
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

  sendVideoCallStartedMessage(
    msgId: bigint,
    initiatorId: string,
    initiatorUsername: string,
    initiatorDisplayName?: string,
  ): Promise<bigint> {
    return this.handleResponse(
      this.groupService.start_video_call({
        message_id: msgId,
        initiator: Principal.fromText(initiatorId),
        initiator_username: initiatorUsername,
        initiator_display_name: initiatorDisplayName
          ? [initiatorDisplayName]
          : [],
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
