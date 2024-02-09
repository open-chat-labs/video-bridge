import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { OpenChatService } from './openchat.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [ConfigModule.forRoot(), ScheduleModule.forRoot(), HttpModule],
  controllers: [AppController],
  providers: [AppService, OpenChatService],
})
export class AppModule {}
