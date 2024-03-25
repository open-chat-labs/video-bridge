import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateInProgressDto } from './inprogress.dto';
import { InProgress } from './inprogress.schema';

@Injectable()
export class InProgressService {
  constructor(
    @InjectModel('InProgress')
    private readonly inProgressModel: Model<InProgress>,
  ) {}

  async upsert(inprog: CreateInProgressDto): Promise<boolean> {
    const upserted = await this.inProgressModel
      .updateOne({ roomName: inprog.roomName }, inprog, {
        upsert: true,
      })
      .exec();
    return upserted.acknowledged;
  }

  getAll(): Promise<InProgress[]> {
    return this.inProgressModel.find().exec();
  }

  get(roomName: string): Promise<InProgress | undefined> {
    return this.inProgressModel.findOne({ roomName }).exec();
  }

  async delete(roomName: string): Promise<boolean> {
    const deleted = await this.inProgressModel.deleteOne({ roomName }).exec();
    return deleted.acknowledged;
  }
}
