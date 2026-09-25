import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { AppService } from './app.service';
import { AccessTokenResponse, MeetingEndedEvent } from './types';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

@Controller('room')
export class AppController {
  constructor(
    private configService: ConfigService,
    private readonly appService: AppService,
  ) {}

  /**
   * How many meetings the bridge currently thinks are in progress. A health check, nothing more:
   * this endpoint is unauthenticated and room names encode chat and user ids, so it never lists
   * them.
   */
  @Get('meetings')
  async getMeetings(): Promise<{ inProgress: number }> {
    const meetings = await this.appService.getMeetings();
    return { inProgress: meetings.length };
  }

  @Post('end_meeting')
  endMeeting(@Headers('x-auth-jwt') auth: string | undefined): Promise<void> {
    if (auth === undefined) {
      throw new UnauthorizedException(
        'You must provide an OpenChat authorisation jwt to show that you are permitted to end the meeting',
      );
    }
    return this.appService.endMeeting(auth);
  }

  @Post('leave')
  @HttpCode(204)
  leaveMeeting(@Headers('x-auth-jwt') auth: string | undefined): Promise<void> {
    if (auth === undefined) {
      throw new UnauthorizedException('Missing auth token');
    }
    return this.appService.leaveMeeting(auth);
  }

  @Post('decline')
  @HttpCode(204)
  declineMeeting(
    @Headers('x-auth-jwt') auth: string | undefined,
  ): Promise<void> {
    if (auth === undefined) {
      throw new UnauthorizedException(
        'You must provide an OpenChat authorisation jwt or a decline token to decline the call',
      );
    }
    return this.appService.declineMeeting(auth);
  }

  @Get('meeting_access_token')
  getAccessToken(
    @Headers('x-auth-jwt') auth: string | undefined,
    @Query('initiator-username') initiatorUsername: string,
    @Query('initiator-displayname') initiatorDisplayname: string,
    @Query('initiator-avatarid') initiatorAvatarId: string | undefined,
  ): Promise<AccessTokenResponse> {
    if (auth === undefined) {
      throw new UnauthorizedException(
        'You must provide an OpenChat authorisation jwt to show that you are permitted to access the room',
      );
    }
    Logger.debug('Input params: ', [
      initiatorUsername,
      initiatorDisplayname,
      initiatorAvatarId,
      initiatorAvatarId === undefined,
    ]);
    return this.appService.getAccessToken(
      auth,
      initiatorUsername,
      initiatorDisplayname,
      parseAvatarId(initiatorAvatarId),
    );
  }

  /**
   * Verify the event signature so we are sure it came from Daily. The comparison is constant
   * time, and a signature older than the replay window is refused however valid it is.
   */
  private isValid(
    timestamp: string,
    signatureHeader: string,
    body: MeetingEndedEvent,
  ): boolean {
    try {
      if (!isFresh(timestamp)) {
        return false;
      }
      const secret = this.configService.get<string>('DAILY_HOOK_HMAC');
      const signature = timestamp + '.' + JSON.stringify(body);
      const base64DecodedSecret = Buffer.from(secret, 'base64');
      const hmac = crypto.createHmac('sha256', base64DecodedSecret);
      const computed = hmac.update(signature).digest();
      const supplied = Buffer.from(signatureHeader ?? '', 'base64');
      return (
        computed.length === supplied.length &&
        crypto.timingSafeEqual(computed, supplied)
      );
    } catch (err) {
      Logger.error(
        'There was an error trying to verify the daily hook signature: ',
        err,
      );
      return false;
    }
  }

  @Post('hook')
  @HttpCode(200)
  async meetingEndedEvent(
    @Headers('X-Webhook-Timestamp') timestamp: string,
    @Headers('X-Webhook-Signature') signature: string,
    @Body() payload: MeetingEndedEvent,
  ) {
    if (this.isValid(timestamp, signature, payload)) {
      // When we reactivate a hook (after failure) we get a test message that looks like { "test": "test" }
      const errors = await validate(plainToClass(MeetingEndedEvent, payload));
      if (errors.length > 0) {
        Logger.warn(
          `Daily event received that does not conform to the expected type: ${errors}`,
        );
      } else {
        // we deliberately don't wait for this to run because we want the hook to be handled fast
        this.appService.meetingEndedEvent(payload).catch((err) => {
          Logger.error('Error process meeting.ended hook: ', err);
        });
      }
    } else {
      Logger.error('Hook received from daily js cannot be verified');
    }
  }
}

// Daily sends the webhook timestamp as seconds since the epoch
const HOOK_REPLAY_WINDOW_SECONDS = 5 * 60;

export function isFresh(
  timestamp: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const sent = Number(timestamp);
  return (
    Number.isInteger(sent) &&
    Math.abs(nowSeconds - sent) <= HOOK_REPLAY_WINDOW_SECONDS
  );
}

// An avatar id is an unsigned 128 bit integer written in decimal. Anything else is ignored
// rather than thrown at BigInt, which would turn a bad query string into a 500.
export function parseAvatarId(value: string | undefined): bigint | undefined {
  return value !== undefined && /^\d{1,39}$/.test(value)
    ? BigInt(value)
    : undefined;
}
