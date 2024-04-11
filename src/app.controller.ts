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
   * This returns the internal state of the video bridge and indicates which meetings it currently
   * thinks are in progress
   */
  @Get('meetings')
  getMeetings() {
    return this.appService.getMeetings();
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
      initiatorAvatarId ? BigInt(initiatorAvatarId) : undefined,
    );
  }

  /** Verify the event signature so we are sure it came from daily */
  private isValid(
    timestamp: string,
    signatureHeader: string,
    body: MeetingEndedEvent,
  ): boolean {
    try {
      const secret = this.configService.get<string>('DAILY_HOOK_HMAC');
      const signature = timestamp + '.' + JSON.stringify(body);
      const base64DecodedSecret = Buffer.from(secret, 'base64');
      const hmac = crypto.createHmac('sha256', base64DecodedSecret);
      const computed = hmac.update(signature).digest('base64');
      return computed === signatureHeader;
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
