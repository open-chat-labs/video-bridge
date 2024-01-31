import {
  Controller,
  Get,
  Headers,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { AppService } from './app.service';

@Controller('room')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  hello() {
    return 'Hello';
  }

  @Get('meeting_access_token')
  getAccessToken(
    @Headers('x-auth-jwt') auth: string | undefined,
  ): Promise<string> {
    if (auth === undefined) {
      throw new UnauthorizedException(
        'You must provide an OpenChat authorisation jwt to show that you are permitted to access the room',
      );
    }
    return this.appService.getAccessToken(auth);
  }

  /**
   * This is the bit that should be moved to the OC backend once this is all working
   */
  @Get('access_jwt/:userId/:username/:chatId')
  getAccessJwt(
    @Param('userId') userId: string,
    @Param('username') username: string,
    @Param('chatId') chatId: string,
  ): string {
    return this.appService.getAccessJwt(userId, username, chatId);
  }
}
