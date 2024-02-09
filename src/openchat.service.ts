import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatIdentifier } from './types';

@Injectable()
export class OpenChatService {
  constructor(private configService: ConfigService) {
    Logger.debug('Constructing the OpenChatService');
  }

  sendVideoCallStartedMessage(chatId: ChatIdentifier): Promise<bigint> {
    Logger.debug('Sending a video chat started message to OpenChat', chatId);
    return new Promise<bigint>((resolve) => {
      setTimeout(() => resolve(0n), 1000);
    });
  }

  meetingsFinished(chatIds: ChatIdentifier[]): Promise<void> {
    Logger.debug('Sending meeting finished messages to OpenChat: ', chatIds);
    return Promise.resolve();
  }
}
