import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import {
  AccessTokenResponse,
  ChatIdentifier,
  Meeting,
  TokenPayload,
  createMeeting,
} from './types';
import { ConfigService } from '@nestjs/config';
import { DailyRoomInfo } from '@daily-co/daily-js';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpenChatService } from './openchat/openchat.service';
import { chatIdToRoomName, roomNameToChatIds } from './utils';

@Injectable()
export class AppService {
  // TODO - this will need to be persisted eventually
  private _presence: Map<string, bigint>;

  constructor(
    private configService: ConfigService,
    private openChat: OpenChatService,
  ) {
    Logger.debug('Constructing the app service');
    this._presence = new Map();
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
    userId: string,
    chatId: ChatIdentifier,
  ): Promise<bigint | undefined> {
    Logger.debug('Checking the participants for roomId', roomId);
    const participantsCount = await this.getRoomParticipantsCount(roomId);
    if (participantsCount === 0) {
      return this.openChat.sendVideoCallStartedMessage(userId, chatId);
    }
  }

  private chatIdToRoomName(userId: string, chatId: ChatIdentifier): string {
    return chatIdToRoomName(userId, chatId);
  }

  private roomNameToChatIds(roomId: string): ChatIdentifier[] {
    return roomNameToChatIds(roomId);
  }

  private decodeJwt(token: string): TokenPayload {
    const publicKeyPath = path.join(process.cwd(), './oc-public.pem');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    Logger.debug('Encoded: ', token, publicKey);
    let decoded: TokenPayload | undefined = undefined;
    try {
      decoded = jwt.verify(token, publicKey, {
        algorithms: ['ES256'],
      }) as TokenPayload;
      Logger.debug('Decoded: ', decoded);
    } catch (err) {
      Logger.error('Error verifying access token: ', err);
      throw new UnauthorizedException(
        `Unable to verify supplied access token: ${err}`,
      );
    }

    if (Date.now() > decoded.exp) {
      throw new UnauthorizedException('The supplied jwt token has expired');
    }
    return decoded;
  }

  async getAccessToken(authToken: string): Promise<AccessTokenResponse> {
    try {
      const decoded = this.decodeJwt(authToken);
      Logger.debug('Auth token has been decoded: ', decoded);

      const roomName = this.chatIdToRoomName(decoded.userId, decoded.chatId);

      const exists = await this.roomExists(roomName);
      if (!exists) {
        Logger.debug('There is no existing room for chatId: ', roomName);
        Logger.debug("Let's try to create one");
        const room = await this.createRoom(roomName);
        Logger.debug('We created the room: ', room);
      } else {
        Logger.debug('Room already exists - no need to create it');
      }

      const messageId = await this.sendStartMessageToOpenChat(
        roomName,
        decoded.userId,
        decoded.chatId,
      );
      if (messageId) {
        // if we got back a message Id it means we are starting a new meeting and we should track it in the presence db
        // TODO - should we check if there is already a messageId in there?
        this._presence.set(roomName, messageId);
      }
      Logger.debug('Meeting start messageId ', messageId);

      Logger.debug('About to get the meeting token');
      const token = await this.getMeetingToken(
        roomName,
        decoded.userId,
        decoded.username,
      );

      Logger.debug('Returning meeting token to the UI: ', token);

      return {
        token,
        roomName,
      };
    } catch (err) {
      throw new UnauthorizedException('Error obtaining room access token', err);
    }
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

  getMeetings() {
    return this._presence;
  }

  @Cron(CronExpression.EVERY_30_SECONDS, { disabled: false })
  handleCron() {
    Logger.debug('Getting global presence data');

    this.getGlobalPresence().then((data) => {
      const occupiedRooms = new Set<string>([...Object.keys(data)]);

      const currentRooms = [...this._presence];

      const finishedMeetings = currentRooms.reduce(
        (finished, [roomName, messageId]) => {
          if (!occupiedRooms.has(roomName)) {
            const chatIds = this.roomNameToChatIds(roomName);
            chatIds.forEach((chatId) =>
              finished.push(createMeeting(chatId, roomName, messageId)),
            );
          }
          return finished;
        },
        [] as Meeting[],
      );

      this.openChat.meetingsFinished(finishedMeetings).then((finished) => {
        Logger.debug('Successfully finished: ', finished);
        // all the meetings that we successfully marked finished need to be removed from the db
        finished.forEach((meeting) => {
          this._presence.delete(meeting.roomName);
        });

        Logger.debug(
          'After ending meetings, video bridge presence state: ',
          this._presence,
        );
      });
    });
  }
}
