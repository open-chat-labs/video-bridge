import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import {
  AccessTokenResponse,
  ApiTokenPayload,
  ChatIdentifier,
  Meeting,
  TokenPayload,
  createMeeting,
  mapTokenPayload,
} from './types';
import { ConfigService } from '@nestjs/config';
import { DailyRoomInfo } from '@daily-co/daily-js';
import { Interval } from '@nestjs/schedule';
import { OpenChatService } from './openchat/openchat.service';
import { chatIdToRoomName, roomNameToChatIds } from './utils';
import { InProgressService } from './inprogress/inprogress.service';
import { InProgress } from './inprogress/inprogress.schema';

@Injectable()
export class AppService {
  constructor(
    private inprogressService: InProgressService,
    private configService: ConfigService,
    private openChat: OpenChatService,
  ) {
    Logger.debug('Constructing the app service');

    inprogressService
      .findAll()
      .then((all) => {
        Logger.debug('Presence: ', all);
      })
      .catch((err) => {
        Logger.error('Error loading docs: ', err);
      });
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
    const rawKey = this.configService.get('OC_PUBLIC');
    const publicKey = rawKey.replace(/\\n/g, '\n');
    Logger.debug('Encoded: ', token, publicKey);
    let decoded: TokenPayload | undefined = undefined;
    try {
      decoded = mapTokenPayload(
        jwt.verify(token, publicKey, {
          algorithms: ['ES256'],
        }) as ApiTokenPayload,
      ) as TokenPayload;
      Logger.debug('Decoded: ', decoded);
    } catch (err) {
      Logger.error('Error verifying access token: ', err);
      throw new UnauthorizedException(
        `Unable to verify supplied access token: ${err}`,
      );
    }
    return decoded;
  }

  async getAccessToken(
    username: string,
    authToken: string,
  ): Promise<AccessTokenResponse> {
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
        // capture that we are tentatively starting a meeting with the associated meeting id

        this.inprogressService.upsert({
          roomName,
          messageId: messageId.toString(),
          confirmed: false,
        });
      }
      Logger.debug('Meeting start messageId ', messageId);

      Logger.debug('About to get the meeting token');
      const token = await this.getMeetingToken(
        roomName,
        decoded.userId,
        username,
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
        Logger.debug('Global Presence response: ', res);
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
    return this.inprogressService.findAll();
  }

  private toInProgressMap(inprog: InProgress[]): Map<string, InProgress> {
    return inprog.reduce((m, i) => {
      m.set(i.roomName, i);
      return m;
    }, new Map<string, InProgress>());
  }

  @Interval(15000)
  async checkGlobalPresence() {
    try {
      Logger.debug('Getting global presence data');

      const globalData = await this.getGlobalPresence();

      if (globalData == null) {
        Logger.debug('Null or undefined returned from global presence api');
        return;
      }

      const inProgressList = await this.inprogressService.findAll();
      Logger.debug('Database values: ', inProgressList);
      const inProgress = this.toInProgressMap(inProgressList);

      const occupiedRoomsNames = new Set<string>([...Object.keys(globalData)]);

      Logger.debug('Occupied room names: ', [...occupiedRoomsNames]);

      inProgressList.forEach(({ roomName, confirmed }) => {
        if (occupiedRoomsNames.has(roomName) && !confirmed) {
          const inprog = inProgress.get(roomName);
          if (inprog) {
            this.inprogressService.upsert({
              messageId: inprog.messageId,
              roomName: inprog.roomName,
              confirmed: true,
            });
          } else {
            Logger.warn(
              "A room name has come back from the presence api that we don't have a record of: ",
              roomName,
            );
          }
        }
      });

      const finishedMeetings = [...inProgress].reduce(
        (finished, [roomName, { confirmed, messageId }]) => {
          if (!occupiedRoomsNames.has(roomName) && confirmed) {
            const chatIds = this.roomNameToChatIds(roomName);
            chatIds.forEach((chatId) =>
              finished.push(createMeeting(chatId, roomName, messageId)),
            );
          }
          return finished;
        },
        [] as Meeting[],
      );

      if (finishedMeetings.length > 0) {
        this.openChat.meetingsFinished(finishedMeetings).then((finished) => {
          Logger.debug('Successfully finished: ', finished);
          // all the meetings that we successfully marked finished need to be removed from the db
          finished.forEach((meeting) => {
            this.inprogressService.delete(meeting.roomName);
          });
        });
      }
    } catch (err) {
      Logger.error('There was an error in the recuring presence job', err);
    }
  }
}
