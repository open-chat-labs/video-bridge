import { Logger } from '@nestjs/common';
import { CandidService } from '../candidService';
import { CommunityService, idlFactory } from './candid/idl';
import { Principal } from '@dfinity/principal';
import { newMessageId } from '../../utils';
import { Identity } from '@dfinity/agent';

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
    channelId: string,
    userId: string,
  ): Promise<bigint> {
    const msgId = newMessageId();
    return this.handleResponse(
      this.communityService.send_message({
        channel_id: BigInt(channelId),
        content: {
          VideoCall: {
            initiator: Principal.fromText(userId),
          },
        },
        message_id: msgId,
        sender_name: 'video_bridge_operator',
        sender_display_name: [],
        community_rules_accepted: [],
        channel_rules_accepted: [],
        replies_to: [],
        mentioned: [],
        forwarding: false,
        thread_root_message_index: [],
        message_filter_failed: [],
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

  meetingFinished(channelId: string, messageId: bigint): Promise<boolean> {
    Logger.debug(
      'Sending meeting finished on community ',
      this.communityId,
      channelId,
      messageId,
    );
    return this.handleResponse(
      this.communityService.end_video_call({
        // TODO this should be messageId
        // message_id: messageId,
        channel_id: BigInt(channelId),
        message_index: Number(messageId),
      }),
      () => {
        // if we get *any* response here we consider it success
        // only an exception is a problem
        return true;
      },
    );
  }
}
