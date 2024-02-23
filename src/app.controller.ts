import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AppService } from './app.service';
import { AccessTokenResponse, DailyEvent } from './types';
import { AuthGuard } from './hookAuth';

@Controller('room')
export class AppController {
  constructor(private readonly appService: AppService) {}

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

  @Post('hook')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  dailyEvent(@Body() payload: DailyEvent) {
    this.appService.dailyEvent(payload);
  }
}
