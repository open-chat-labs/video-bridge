import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatIdentifier, Meeting } from '../types';
import { waitAll } from '../utils';
import { GroupClient } from './group/group.client';
import * as pemfile from 'pem-file';
import { Secp256k1KeyIdentity } from '@dfinity/identity-secp256k1';
import { Identity } from '@dfinity/agent';
import { UserClient } from './user/user.client';
import { CommunityClient } from './community/community.client';

@Injectable()
export class OpenChatService {
  _identity: Secp256k1KeyIdentity;

  constructor(private configService: ConfigService) {
    Logger.debug('Constructing the OpenChatService');
    this._identity = this.createIdentity();
    Logger.debug('Principal: ', this._identity.getPrincipal().toString());
  }

  sendVideoCallStartedMessage(
    userId: string,
    chatId: ChatIdentifier,
  ): Promise<bigint> {
    Logger.debug('Sending a video chat started message to OpenChat', chatId);

    switch (chatId.kind) {
      case 'channel':
        const communityClient = this.getCommunityClient(chatId.communityId);
        return communityClient.sendVideoCallStartedMessage(
          chatId.channelId,
          userId,
        );
      case 'group_chat':
        const groupClient = this.getGroupClient(chatId.groupId);
        return groupClient.sendVideoCallStartedMessage(userId);
      case 'direct_chat':
        const userClient = this.getUserClient(chatId.userId);
        return userClient.sendVideoCallStartedMessage(userId);
      default:
        throw new Error('not implemented');
    }
  }

  async meetingsFinished(meetings: Meeting[]): Promise<void> {
    Logger.debug('Sending meeting finished messages to OpenChat: ', meetings);

    const results = await waitAll(
      meetings.map((meeting) => {
        if (meeting.chatId.kind === 'channel') {
          const client = this.getCommunityClient(meeting.chatId.communityId);
          return client.meetingFinished(
            meeting.chatId.channelId,
            meeting.messageId,
          );
        } else if (meeting.chatId.kind === 'direct_chat') {
          const client = this.getUserClient(meeting.chatId.userId);
          return client.meetingFinished(meeting.messageId);
        } else if (meeting.chatId.kind === 'group_chat') {
          const client = this.getGroupClient(meeting.chatId.groupId);
          return client.meetingFinished(meeting.messageId);
        }
      }),
    );

    Logger.debug('Meeting finished results: ', results);

    return Promise.resolve();
  }

  private getUserClient(userId: string): UserClient {
    return new UserClient(
      this._identity as unknown as Identity,
      userId,
      this.configService.get('IC_URL') ?? 'http://localhost:5001',
    );
  }

  private getGroupClient(groupId: string): GroupClient {
    return new GroupClient(
      this._identity as unknown as Identity,
      groupId,
      this.configService.get('IC_URL') ?? 'http://localhost:5001',
    );
  }

  private getCommunityClient(communityId: string): CommunityClient {
    return new CommunityClient(
      this._identity as unknown as Identity,
      communityId,
      this.configService.get('IC_URL') ?? 'http://localhost:5001',
    );
  }

  private createIdentity() {
    const rawKey = this.configService.get('OC_IDENTITY');
    const privateKey = rawKey.replace(/\\n/g, '\n');
    Logger.debug('Key via env: ', privateKey, rawKey);
    try {
      const buf: Buffer = pemfile.decode(privateKey);
      if (buf.length != 118) {
        throw 'expecting byte length 118 but got ' + buf.length;
      }
      return Secp256k1KeyIdentity.fromSecretKey(buf.subarray(7, 39));
    } catch (err) {
      Logger.error(err);
    }
  }
}
