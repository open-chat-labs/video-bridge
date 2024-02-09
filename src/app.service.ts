import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import { ChatIdentifier, TokenPayload } from './types';
import { ConfigService } from '@nestjs/config';
import { DailyRoomInfo } from '@daily-co/daily-js';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpenChatService } from './openchat.service';

@Injectable()
export class AppService {
  private _presence: Set<string>;

  constructor(
    private configService: ConfigService,
    private openChat: OpenChatService,
  ) {
    Logger.debug('Constructing the app service');
    this._presence = new Set();
  }

  private getAuthHeaders(): Headers {
    const apiKey = this.configService.get('DAILY_API_KEY');
    const headers = new Headers();
    headers.append('Authorization', `Bearer ${apiKey}`);
    return headers;
  }

  private roomExists(roomId: string): Promise<boolean> {
    return fetch(`https://api.daily.co/v1/rooms/${roomId}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    }).then((res) => res.ok);
  }

  private getRoomParams(chatId: string): unknown {
    return {
      name: chatId,
      privacy: 'private',
      properties: {
        nbf: Date.now() / 1000,
        enable_people_ui: true,
        enable_pip_ui: true,
        enable_emoji_reactions: false,
        enable_hand_raising: false,
        enable_prejoin_ui: false,
        enable_network_ui: false,
        enable_noise_cancellation_ui: true,
        enable_breakout_rooms: false,
        enable_knocking: false,
        enable_screenshare: true,
        eject_at_room_exp: true,
        eject_after_elapsed: 60 * 60,
        permissions: {
          hasPresence: true,
          canSend: true,
          canAdmin: false,
        },
      },
    };
  }

  private createRoom(roomId: string): Promise<DailyRoomInfo> {
    const headers = this.getAuthHeaders();
    headers.append('Content-Type', 'application/json');
    const init = {
      method: 'POST',
      headers,
      body: JSON.stringify(this.getRoomParams(roomId)),
    };
    Logger.debug('Attempting to create a room with: ', init);
    return fetch(`https://api.daily.co/v1/rooms`, init).then((res) => {
      if (res.ok) {
        return res.json();
      } else {
        res.text().then((err) => {
          Logger.error('Error creating room: ', err);
        });

        const err = `Unable to create daily room for chat: ${roomId}. Status: ${res.status} - ${res.statusText}`;
        Logger.error(err);
        throw new InternalServerErrorException(err);
      }
    });
  }

  private getMeetingTokenParams(
    roomId: string,
    userId: string,
    username: string,
  ): unknown {
    return {
      properties: {
        room_name: roomId,
        user_name: username,
        user_id: userId,
      },
    };
  }

  private getMeetingToken(
    roomId: string,
    userId: string,
    username: string,
  ): Promise<string> {
    const headers = this.getAuthHeaders();
    headers.append('Content-Type', 'application/json');
    return fetch(`https://api.daily.co/v1/meeting-tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        this.getMeetingTokenParams(roomId, userId, username),
      ),
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          res.text().then((err) => {
            Logger.error('Error getting meeting token: ', err);
          });
          const error = `Unable to create daily room for chat: ${roomId}. Status: ${res.status} - ${res.statusText}`;
          Logger.error(error);
          throw new InternalServerErrorException(error);
        }
      })
      .then((res) => {
        return res.token;
      });
  }

  private async getRoomParticipantsCount(chatId: string): Promise<number> {
    try {
      const resp = await fetch(
        `https://api.daily.co/v1/rooms/${chatId}/presence`,
        {
          method: 'GET',
          headers: this.getAuthHeaders(),
        },
      );
      if (!resp.ok) {
        Logger.error(
          'Error getting room participant count: ',
          chatId,
          resp.status,
        );
        return 0;
      }

      const data = await resp.json();
      Logger.debug('Room presence data returned: ', data);
      return data.total_count;
    } catch (err) {
      Logger.error('Error getting room participant count: ', chatId, err);
      return 0;
    }
  }

  private async sendStartMessageToOpenChat(
    roomId: string,
    chatId: ChatIdentifier,
  ): Promise<void> {
    Logger.debug('Checking the participants for roomId', roomId);
    const participantsCount = await this.getRoomParticipantsCount(roomId);
    if (participantsCount === 0) {
      this.openChat.sendVideoCallStartedMessage(chatId);
    }
  }

  private chatIdToRoomId(chatId: ChatIdentifier): string {
    switch (chatId.kind) {
      case 'channel':
        return `channel_${chatId.communityId}_${chatId.channelId}`;
      case 'direct_chat':
        return `direct_${chatId.userId}`;
      case 'group_chat':
        return `group_${chatId.groupId}`;
    }
  }

  private roomIdToChatId(roomId: string): ChatIdentifier | undefined {
    const channelRegex = /^channel_([^_]+)_([^_]+)$/;
    const directRegex = /^direct_(.+)$/;
    const groupRegex = /^group_(.+)$/;

    let match: RegExpMatchArray | null;

    if ((match = roomId.match(channelRegex)) !== null) {
      return {
        kind: 'channel',
        communityId: match[1],
        channelId: match[2],
      };
    } else if ((match = roomId.match(directRegex)) !== null) {
      return {
        kind: 'direct_chat',
        userId: match[1],
      };
    } else if ((match = roomId.match(groupRegex)) !== null) {
      return {
        kind: 'group_chat',
        groupId: match[1],
      };
    } else {
      return undefined;
    }
  }

  async getAccessToken(authToken: string): Promise<string> {
    try {
      Logger.debug('AuthToken: ', authToken);
      const publicKeyPath = path.join(process.cwd(), './public_key.pem');
      const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      const decoded = jwt.verify(authToken, publicKey, {
        algorithms: ['ES256'],
      }) as TokenPayload;

      if (Date.now() > decoded.exp) {
        throw new UnauthorizedException('The supplied jwt token has expired');
      }
      Logger.debug('Auth token has been decoded: ', decoded);

      const roomId = this.chatIdToRoomId(decoded.chatId);

      const exists = await this.roomExists(roomId);
      if (!exists) {
        Logger.debug('There is no existing room for chatId: ', roomId);
        Logger.debug("Let's try to create one");
        const room = await this.createRoom(roomId);
        Logger.debug('We created the room: ', room);
      } else {
        Logger.debug('Room already exists - no need to create it');
      }

      await this.sendStartMessageToOpenChat(roomId, decoded.chatId);

      Logger.debug('About to get the meeting token');
      const token = await this.getMeetingToken(
        roomId,
        decoded.userId,
        decoded.username,
      );

      Logger.debug('Returning meeting token to the UI: ', token);

      return token;
    } catch (err) {
      throw new UnauthorizedException('Error obtaining room access token', err);
    }
  }

  /**
   * This is the bit that should be moved to the OC backend once this is all working
   */
  getAccessJwt(
    userId: string,
    username: string,
    chatId: ChatIdentifier,
  ): string {
    const privateKeyPath = path.join(process.cwd(), './private_key.pem');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const payload: TokenPayload = {
      username,
      userId,
      chatId,
      exp: Date.now() + 1000 * 60 * 5, // expires in 5 minutes
    };
    return jwt.sign(payload, privateKey, { algorithm: 'ES256' });
  }

  private getGlobalPresence(): Promise<unknown> {
    return fetch(`https://api.daily.co/v1/presence`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) {
          res.text().then((err) => {
            Logger.error('Error getting global presence: ', err);
          });
        }
        return res;
      })
      .then((res) => res.json())
      .catch((err) => {
        Logger.error('Unable to obtain global presence data: ', err);
      });
  }

  @Cron(CronExpression.EVERY_30_SECONDS, { disabled: true })
  handleCron() {
    Logger.debug('Getting global presence data');

    this.getGlobalPresence().then((data) => {
      const occupiedRooms = new Set<string>([...Object.keys(data)]);

      const finished = [...this._presence].reduce((finished, id) => {
        if (!occupiedRooms.has(id)) {
          finished.push(id);
        }
        return finished;
      }, []);

      this.openChat.meetingsFinished(
        finished.reduce((chatIds, f) => {
          const chatId = this.roomIdToChatId(f);
          if (chatId !== undefined) {
            chatIds.push(chatId);
          }
          return chatIds;
        }, []),
      );

      this._presence = new Set(occupiedRooms);
    });
  }
}
