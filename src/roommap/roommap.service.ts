import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateRoomMapDto } from './roommap.dto';
import { RoomMap } from './roommap.schema';

@Injectable()
export class RoomMapService {
  constructor(
    @InjectModel('RoomMap')
    private readonly roomMapModel: Model<RoomMap>,
  ) {}

  async upsert(roommap: CreateRoomMapDto): Promise<boolean> {
    const upserted = await this.roomMapModel
      .updateOne({ _id: roommap.roomName }, roommap, {
        upsert: true,
      })
      .exec();
    return upserted.acknowledged;
  }

  getAll(): Promise<RoomMap[]> {
    return this.roomMapModel.find();
  }

  // TODO this might be slow - we might need an index on roomId
  getMany(roomIds: Set<string>): Promise<RoomMap[]> {
    return this.roomMapModel.find({ roomId: { $in: [...roomIds] } });
  }

  get(roomName: string): Promise<RoomMap | null> {
    return this.roomMapModel.findById(roomName).exec();
  }

  async delete(roomName: string): Promise<boolean> {
    const deleted = await this.roomMapModel.deleteOne({ _id: roomName }).exec();
    return deleted.acknowledged;
  }
}
