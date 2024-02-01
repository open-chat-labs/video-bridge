import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import { TokenPayload } from './types';
import { ConfigService } from '@nestjs/config';
import { DailyRoomInfo } from '@daily-co/daily-js';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AppService {
  private _presence: Set<string>;

  constructor(private configService: ConfigService) {
    Logger.debug('Constructing the app service');
    this._presence = new Set();
  }

  private getAuthHeaders(): Headers {
    const apiKey = this.configService.get('DAILY_API_KEY');
    const headers = new Headers();
    headers.append('Authorization', `Bearer ${apiKey}`);
    return headers;
  }

  private roomExists(chatId: string): Promise<boolean> {
    return fetch(`https://api.daily.co/v1/rooms/${chatId}`, {
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

  private createRoom(chatId: string): Promise<DailyRoomInfo> {
    const headers = this.getAuthHeaders();
    headers.append('Content-Type', 'application/json');
    const init = {
      method: 'POST',
      headers,
      body: JSON.stringify(this.getRoomParams(chatId)),
    };
    Logger.debug('Attempting to create a room with: ', init);
    return fetch(`https://api.daily.co/v1/rooms`, init).then((res) => {
      if (res.ok) {
        return res.json();
      } else {
        res.text().then((err) => {
          Logger.error('Error creating room: ', err);
        });

        const err = `Unable to create daily room for chat: ${chatId}. Status: ${res.status} - ${res.statusText}`;
        Logger.error(err);
        throw new InternalServerErrorException(err);
      }
    });
  }

  private getMeetingTokenParams(
    chatId: string,
    userId: string,
    username: string,
  ): unknown {
    return {
      properties: {
        room_name: chatId,
        user_name: username,
        user_id: userId,
      },
    };
  }

  private getMeetingToken(
    chatId: string,
    userId: string,
    username: string,
  ): Promise<string> {
    const headers = this.getAuthHeaders();
    headers.append('Content-Type', 'application/json');
    return fetch(`https://api.daily.co/v1/meeting-tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        this.getMeetingTokenParams(chatId, userId, username),
      ),
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          res.text().then((err) => {
            Logger.error('Error getting meeting token: ', err);
          });
          const error = `Unable to create daily room for chat: ${chatId}. Status: ${res.status} - ${res.statusText}`;
          Logger.error(error);
          throw new InternalServerErrorException(error);
        }
      })
      .then((res) => {
        return res.token;
      });
  }

  async getAccessToken(authToken: string): Promise<string> {
    try {
      const publicKeyPath = path.join(process.cwd(), './public_key.pem');
      const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      const decoded = jwt.verify(authToken, publicKey, {
        algorithms: ['ES256'],
      }) as TokenPayload;

      if (Date.now() > decoded.exp) {
        throw new UnauthorizedException('The supplied jwt token has expired');
      }

      const exists = await this.roomExists(decoded.chatId);
      if (!exists) {
        Logger.debug('There is no existing room for chatId: ', decoded.chatId);
        Logger.debug("Let's try to create one");
        const room = await this.createRoom(decoded.chatId);
        Logger.debug('We created the room: ', room);
      } else {
        Logger.debug('Room already exists - no need to create it');
      }

      Logger.debug('About to get the meeting token');
      const meetingToken = await this.getMeetingToken(
        decoded.chatId,
        decoded.userId,
        decoded.username,
      );

      Logger.debug('Returning meeting token to the UI: ', meetingToken);

      return meetingToken;
    } catch (err) {
      throw new UnauthorizedException('Error obtaining room access token', err);
    }
  }

  /**
   * This is the bit that should be moved to the OC backend once this is all working
   */
  getAccessJwt(userId: string, username: string, chatId: string): string {
    const privateKeyPath = path.join(process.cwd(), './private_key.pem');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const payload = {
      username,
      userId,
      chatId,
      exp: Date.now() + 1000 * 60 * 5, // expires in 5 minutes
    };

    const token = jwt.sign(payload, privateKey, { algorithm: 'ES256' });

    return token;
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

  @Cron(CronExpression.EVERY_30_SECONDS)
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

      const started = [...occupiedRooms].reduce((started, id) => {
        if (!this._presence.has(id)) {
          started.push(id);
        }
        return started;
      }, []);

      Logger.debug('Changed presence: ', {
        started,
        finished,
      });

      this._presence = new Set(occupiedRooms);
    });
  }
}
