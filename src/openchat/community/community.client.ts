import { Logger } from '@nestjs/common';
import { CandidService } from '../candidService';
import { CommunityService, idlFactory } from './candid/idl';
import { Principal } from '@dfinity/principal';
import { Identity } from '@dfinity/agent';
import { ChannelMeeting } from '../../types';

export class CommunityClient extends CandidService {
  private communityService: CommunityService;

  constructor(
    identity: Identity,
    private communityId: string,
    host: string,
  ) {
    super(identity);
    this.communityService = this.createServiceClient<CommunityService>(
      idlFactory,
      communityId,
      host,
    );
  }

  sendVideoCallStartedMessage(
    msgId: bigint,
    channelId: string,
    userId: string,
  ): Promise<bigint> {
    return this.handleResponse(
      this.communityService.start_video_call({
        message_id: msgId,
        initiator: Principal.fromText(userId),
        channel_id: BigInt(channelId),
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

  meetingFinished(meeting: ChannelMeeting): Promise<ChannelMeeting> {
    Logger.debug(
      'Sending meeting finished on community ',
      this.communityId,
      meeting,
    );
    return this.handleResponse(
      this.communityService.end_video_call({
        channel_id: BigInt(meeting.chatId.channelId),
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
