import { Identity } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { Logger } from '@nestjs/common';
import { ChatIdentifier } from '../../types';
import { CandidService } from '../candidService';
import { Chat } from './candid/types';
import { LocalUserIndexService, idlFactory } from './candid/idl';

// The local user index that signed a user's token. It stops the ring on that user's other
// devices when they decline a call (open-chat #9534).
export class LocalUserIndexClient extends CandidService {
  private service: LocalUserIndexService;

  constructor(identity: Identity, canisterId: string, host: string) {
    super(identity);
    this.service = this.createServiceClient<LocalUserIndexService>(
      idlFactory,
      canisterId,
      host,
    );
  }

  callDeclined(
    userId: string,
    chatId: ChatIdentifier,
    messageId: bigint,
  ): Promise<void> {
    Logger.debug(
      `Telling the local user index that ${userId} declined the call`,
    );
    return this.handleResponse(
      this.service.video_call_declined({
        user_id: Principal.fromText(userId),
        chat_id: toChat(chatId),
        message_id: messageId,
      }),
      (response) => {
        if ('Error' in response) {
          throw new Error(
            `video_call_declined failed: ${response.Error[0]} ${response.Error[1][0] ?? ''}`,
          );
        }
      },
    );
  }
}

export function toChat(chatId: ChatIdentifier): Chat {
  switch (chatId.kind) {
    case 'direct_chat':
      return { Direct: Principal.fromText(chatId.userId) };
    case 'group_chat':
      return { Group: Principal.fromText(chatId.groupId) };
    case 'channel':
      return {
        Channel: [
          Principal.fromText(chatId.communityId),
          Number(chatId.channelId),
        ],
      };
  }
}
