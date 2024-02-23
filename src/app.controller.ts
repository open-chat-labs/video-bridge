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
import { AccessTokenResponse, DailyEvent } from './types';
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
    @Query('username') username: string,
  ): Promise<AccessTokenResponse> {
    if (auth === undefined) {
      throw new UnauthorizedException(
        'You must provide an OpenChat authorisation jwt to show that you are permitted to access the room',
      );
    }
    return this.appService.getAccessToken(username, auth);
  }

  private isValid(
    timestamp: string,
    signatureHeader: string,
    body: DailyEvent,
  ): boolean {
    const secret = this.configService.get<string>('DAILY_HOOK_HMAC');

    Logger.debug(
      'Hook auth params: ',
      timestamp,
      signatureHeader,
      secret,
      body,
    );
    const signature = timestamp + '.' + JSON.stringify(body);
    const base64DecodedSecret = Buffer.from(secret, 'base64');
    const hmac = crypto.createHmac('sha256', base64DecodedSecret);
    const computed = hmac.update(signature).digest('base64');
    return computed === signatureHeader;
  }

  @Post('hook')
  @HttpCode(200)
  dailyEvent(
    @Headers('X-Webhook-Timestamp') timestamp: string,
    @Headers('X-Webhook-Signature') signature: string,
    @Body() payload: DailyEvent,
  ) {
    if (this.isValid(timestamp, signature, payload)) {
      this.appService.dailyEvent(payload);
    } else {
      Logger.debug('Hook received from daily js does not pass validation');
    }
  }
}
