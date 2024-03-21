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
  MeetingEndedEvent,
  TokenPayload,
  mapTokenPayload,
} from '../types';
import { ConfigService } from '@nestjs/config';
import { DailyRoomInfo } from '@daily-co/daily-js';
import { Interval } from '@nestjs/schedule';
import { OpenChatService } from '../openchat/openchat.service';
import { chatIdToRoomName, roomNameToMeeting } from '../utils';
import { InProgressService } from '../inprogress/inprogress.service';
import { InProgress } from '../inprogress/inprogress.schema';
import { NoMeetingInProgress } from '../openchat/error';

@Injectable()
export class DailyService {
  constructor(
    private inprogressService: InProgressService,
    private configService: ConfigService,
    private openChat: OpenChatService,
  ) {}

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
    const now = Math.floor(Date.now() / 1000);
    return {
      name: chatId,
      privacy: 'private',
      properties: {
        nbf: now,
        exp: now + 60 * 60,
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
        max_participants: 20,
        permissions: {
          hasPresence: true,
          canSend: true,
          canAdmin: false,
        },
      },
    };
  }

  private deleteRoom(roomName: string): Promise<boolean> {
    Logger.debug(`Attempting to delete room: ${roomName}`);
    const headers = this.getAuthHeaders();
    headers.append('Content-Type', 'application/json');
    const init = {
      method: 'DELETE',
      headers,
    };
    Logger.debug('Attempting to delete a room with: ', init);
    return fetch(`https://api.daily.co/v1/rooms/${roomName}`, init).then(
      (res) => res.ok,
    );
  }

  private createRoom(roomName: string): Promise<DailyRoomInfo> {
    const headers = this.getAuthHeaders();
    headers.append('Content-Type', 'application/json');
    const init = {
      method: 'POST',
      headers,
      body: JSON.stringify(this.getRoomParams(roomName)),
    };
    Logger.debug('Attempting to create a room with: ', init);
    return fetch(`https://api.daily.co/v1/rooms`, init).then((res) => {
      if (res.ok) {
        return res.json();
      } else {
        res.text().then((err) => {
          Logger.error('Error creating room: ', err);
        });

        const err = `Unable to create daily room for chat: ${roomName}. Status: ${res.status} - ${res.statusText}`;
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
    roomName: string,
    joining: boolean,
    chatId: ChatIdentifier,
    initiatorId: string,
    initiatorUsername: string,
    initiatorDisplayname?: string,
    initiatorAvatarId?: bigint,
  ): Promise<[bigint, boolean]> {
    const inprog = await this.inprogressService.get(roomName);
    if (inprog) {
      Logger.debug(
        `Call in progress for room ${roomName} so we will be joining`,
      );
      return [BigInt(inprog.messageId), true];
    } else {
      if (joining) {
        Logger.debug(
          `Trying to join when there is no meeting in progress for room ${roomName}`,
        );
        throw new NoMeetingInProgress(roomName);
      } else {
        const msgId = this.openChat.sendVideoCallStartedMessage(
          chatId,
          initiatorId,
          initiatorUsername,
          initiatorDisplayname,
          initiatorAvatarId,
        );
        return [msgId, false];
      }
    }
  }

  private chatIdToRoomName(userId: string, chatId: ChatIdentifier): string {
    return chatIdToRoomName(userId, chatId);
  }

  private roomNameToMeeting(roomId: string, messageId: string): Meeting {
    return roomNameToMeeting(roomId, messageId);
  }

  private decodeJwt(token: string): TokenPayload {
    const rawKey = this.configService.get('OC_PUBLIC');
    const publicKey = rawKey.replace(/\\n/g, '\n');
    let decoded: TokenPayload | undefined = undefined;
    try {
      decoded = mapTokenPayload(
        jwt.verify(token, publicKey, {
          algorithms: ['ES256'],
        }) as ApiTokenPayload,
      ) as TokenPayload;
    } catch (err) {
      Logger.error('Error verifying access token: ', err);
      throw new UnauthorizedException(
        `Unable to verify supplied access token: ${err}`,
      );
    }
    return decoded;
  }

  async getAccessToken(
    authToken: string,
    initiatorUsername: string,
    initiatorDisplayName?: string,
    initiatorAvatarId?: bigint,
  ): Promise<AccessTokenResponse> {
    try {
      const decoded = this.decodeJwt(authToken);
      const roomName = this.chatIdToRoomName(decoded.userId, decoded.chatId);

      const exists = await this.roomExists(roomName);
      if (!exists) {
        const room = await this.createRoom(roomName);
        Logger.debug('We created the room: ', room);
      }

      const [messageId, joining] = await this.sendStartMessageToOpenChat(
        roomName,
        decoded.claimType === 'JoinVideoCall',
        decoded.chatId,
        decoded.userId,
        initiatorUsername,
        initiatorDisplayName,
        initiatorAvatarId,
      );
      if (!joining) {
        this.inprogressService.upsert({
          roomName,
          messageId: messageId.toString(),
          confirmed: false,
        });
      }
      Logger.debug('Meeting start messageId ', messageId);
      const token = await this.getMeetingToken(
        roomName,
        decoded.userId,
        initiatorUsername,
      );

      return {
        token,
        roomName,
        messageId,
        joining,
      };
    } catch (err) {
      if (err instanceof NoMeetingInProgress) {
        throw err;
      }
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
    return this.inprogressService.getAll();
  }

  private toInProgressMap(inprog: InProgress[]): Map<string, InProgress> {
    return new Map(inprog.map((m) => [m.roomName, m]));
  }

  @Interval(15000)
  async checkGlobalPresence() {
    try {
      const inProgressList = await this.inprogressService.getAll();
      if (inProgressList.length === 0) {
        // if we don't think there are any meetings in progress there is no point in calling the presence api
        Logger.debug('No meetings in progress - doing nothing');
        return;
      }

      const inProgress = this.toInProgressMap(inProgressList);
      const globalData = await this.getGlobalPresence();
      if (globalData == null) {
        Logger.debug('Null or undefined returned from global presence api');
        return;
      }

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
            finished.push(this.roomNameToMeeting(roomName, messageId));
          }
          return finished;
        },
        [] as Meeting[],
      );

      this.processFinishedMeetings(finishedMeetings);
    } catch (err) {
      Logger.error('There was an error in the recuring presence job', err);
    }
  }

  async meetingEndedEvent({ payload }: MeetingEndedEvent) {
    Logger.debug('Received an event from Daily.js: ', payload);
    const inProgressList = await this.inprogressService.getAll();
    const meeting = inProgressList.find((p) => p.roomName === payload.room);
    if (meeting !== undefined) {
      this.processFinishedMeetings([
        this.roomNameToMeeting(meeting.roomName, meeting.messageId),
      ]);
    }
  }

  private processFinishedMeetings(finishedMeetings: Meeting[]) {
    if (finishedMeetings.length > 0) {
      this.openChat.meetingsFinished(finishedMeetings).then((finished) => {
        Logger.debug('Successfully finished: ', finished);
        // all the meetings that we successfully marked finished need to be removed from the db
        finished.forEach(async (meeting) => {
          await this.deleteRoom(meeting.roomName);
          await this.inprogressService.delete(meeting.roomName);
        });
      });
    }
  }
}
