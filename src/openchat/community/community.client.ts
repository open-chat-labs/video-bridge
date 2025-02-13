import { Logger } from '@nestjs/common';
import { CandidService } from '../candidService';
import { CommunityService, idlFactory } from './candid/idl';
import { Principal } from '@dfinity/principal';
import { Identity } from '@dfinity/agent';
import { ChannelMeeting, VideoCallType } from '../../types';
import {
  DEFAULT_MAX_CALL_DURATION_MS,
  DIAMOND_MAX_CALL_DURATION_MS,
} from '../constants';
import { toBigInt32 } from 'src/utils';

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
    callType: VideoCallType,
    msgId: bigint,
    channelId: string,
    initiatorId: string,
    initiatorIsDiamond: boolean,
    initiatorUsername: string,
    initiatorDisplayName?: string,
  ): Promise<bigint> {
    return this.handleResponse(
      this.communityService.start_video_call_v2({
        message_id: msgId,
        channel_id: toBigInt32(channelId),
        initiator: Principal.fromText(initiatorId),
        initiator_username: initiatorUsername,
        initiator_display_name: initiatorDisplayName
          ? [initiatorDisplayName]
          : [],
        max_duration: [
          initiatorIsDiamond
            ? DIAMOND_MAX_CALL_DURATION_MS
            : DEFAULT_MAX_CALL_DURATION_MS,
        ],
        call_type:
          callType === 'Broadcast' ? { Broadcast: null } : { Default: null },
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

  meetingFinished(meeting: ChannelMeeting): Promise<ChannelMeeting> {
    const args = {
      channel_id: toBigInt32(meeting.chatId.channelId),
      message_id: meeting.messageId,
    };
    Logger.debug(
      'Sending meeting finished on community ',
      this.communityId,
      meeting,
      args,
    );

    return this.handleResponse(
      this.communityService.end_video_call_v2(args),
      () => {
        // if we get *any* response here we consider it success
        // only an exception is a problem
        return meeting;
      },
    );
  }
}
