import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomMapService } from './roommap.service';
import { RoomMapSchema } from './roommap.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'RoomMap', schema: RoomMapSchema }]),
  ],
  providers: [RoomMapService],
  exports: [RoomMapService],
})
export class RoomMapModule {}
