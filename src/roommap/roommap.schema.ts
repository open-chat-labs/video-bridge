import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoomMapDocument = HydratedDocument<RoomMap>;

@Schema()
export class RoomMap {
  @Prop()
  roomId: string;
}

export const RoomMapSchema = SchemaFactory.createForClass(RoomMap);
