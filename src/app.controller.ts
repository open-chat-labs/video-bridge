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
    const secret = this.configService.get<string>('DAILY_HOOK_HMAC');
    const signature = timestamp + '.' + JSON.stringify(body);
    const base64DecodedSecret = Buffer.from(secret, 'base64');
    const hmac = crypto.createHmac('sha256', base64DecodedSecret);
    const computed = hmac.update(signature).digest('base64');
    return computed === signatureHeader;
  }

  @Post('hook')
  @HttpCode(200)
  meetingEndedEvent(
    @Headers('X-Webhook-Timestamp') timestamp: string,
    @Headers('X-Webhook-Signature') signature: string,
    @Body() payload: MeetingEndedEvent,
  ) {
    if (this.isValid(timestamp, signature, payload)) {
      this.appService.meetingEndedEvent(payload);
    } else {
      Logger.error('Hook received from daily js does not pass validation');
    }
  }
}
