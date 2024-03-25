import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatIdentifier, Meeting } from '../types';
import { newMessageId, waitAll } from '../utils';
import { GroupClient } from './group/group.client';
import { Secp256k1KeyIdentity } from '@dfinity/identity-secp256k1';
import { Identity } from '@dfinity/agent';
import { UserClient } from './user/user.client';
import { CommunityClient } from './community/community.client';

@Injectable()
export class OpenChatService {
  _identity: Secp256k1KeyIdentity;

  constructor(private configService: ConfigService) {
    this._identity = this.createIdentity();
  }

  sendVideoCallStartedMessage(
    chatId: ChatIdentifier,
    initiatorId: string,
    initiatorUsername: string,
    initiatorDisplayname?: string,
    initiatorAvatarId?: bigint,
  ): bigint {
    Logger.debug('Sending a video chat started message to OpenChat', chatId);
    const msgId = newMessageId();

    // TODO - this is all fire and forget but we do need to add a retry
    switch (chatId.kind) {
      case 'channel':
        const communityClient = this.getCommunityClient(chatId.communityId);
        communityClient.sendVideoCallStartedMessage(
          msgId,
          chatId.channelId,
          initiatorId,
          initiatorUsername,
          initiatorDisplayname,
        );
        break;
      case 'group_chat':
        const groupClient = this.getGroupClient(chatId.groupId);
        groupClient.sendVideoCallStartedMessage(
          msgId,
          initiatorId,
          initiatorUsername,
          initiatorDisplayname,
        );
        break;
      case 'direct_chat':
        const otherUserClient = this.getUserClient(chatId.userId);
        otherUserClient.sendVideoCallStartedMessage(
          msgId,
          initiatorId,
          initiatorUsername,
          initiatorDisplayname,
          initiatorAvatarId,
        );
        break;
      default:
        throw new Error('not implemented');
    }
    return msgId;
  }

  async meetingsFinished(meetings: Meeting[]): Promise<Meeting[]> {
    Logger.debug('Sending meeting finished messages to OpenChat: ', meetings);

    const promises = meetings.reduce<Promise<Meeting>[]>((all, meeting) => {
      if (meeting.kind === 'channel_meeting') {
        all.push(
          this.getCommunityClient(meeting.chatId.communityId).meetingFinished(
            meeting,
          ),
        );
      } else if (meeting.kind === 'direct_meeting') {
        all.push(
          this.getUserClient(meeting.userA).meetingFinished(
            meeting.userB,
            meeting,
          ),
        );
        all.push(
          this.getUserClient(meeting.userB).meetingFinished(
            meeting.userA,
            meeting,
          ),
        );
      } else if (meeting.kind === 'group_meeting') {
        all.push(
          this.getGroupClient(meeting.chatId.groupId).meetingFinished(meeting),
        );
      }
      return all;
    }, []);

    const results = await waitAll<Meeting>(promises);

    Logger.debug('Meetings successfully finished: ', results.success);
    if (results.errors.length > 0) {
      Logger.error('Unable to finish all meetings: ', results.errors);
    }
    return results.success;
  }

  private getUserClient(userId: string): UserClient {
    return new UserClient(
      this._identity as unknown as Identity,
      userId,
      this.configService.get('IC_URL'),
    );
  }

  private getGroupClient(groupId: string): GroupClient {
    return new GroupClient(
      this._identity as unknown as Identity,
      groupId,
      this.configService.get('IC_URL'),
    );
  }

  private getCommunityClient(communityId: string): CommunityClient {
    return new CommunityClient(
      this._identity as unknown as Identity,
      communityId,
      this.configService.get('IC_URL'),
    );
  }

  private createIdentity() {
    const rawPem = this.configService.get('OC_IDENTITY');
    const privateKeyPem = rawPem.replace(/\\n/g, '\n');
    try {
      return Secp256k1KeyIdentity.fromPem(privateKeyPem);
    } catch (err) {
      Logger.error(err);
    }
  }
}
