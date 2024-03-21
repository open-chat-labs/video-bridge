import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DailyController } from './daily/daily.controller';
import { DailyService } from './daily/daily.service';
import { ScheduleModule } from '@nestjs/schedule';
import { OpenChatService } from './openchat/openchat.service';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { InProgressModule } from './inprogress/inprogress.module';
import { HuddleController } from './huddle/huddle.controller';
import { HuddleService } from './huddle/huddle.service';
import { RoomMapModule } from './roommap/roommap.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),
    ScheduleModule.forRoot(),
    HttpModule,
    InProgressModule,
    RoomMapModule,
  ],
  controllers: [DailyController, HuddleController],
  providers: [DailyService, HuddleService, OpenChatService],
})
export class AppModule {}
