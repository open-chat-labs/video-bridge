import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InProgressDocument = HydratedDocument<InProgress>;

@Schema()
export class InProgress {
  @Prop()
  roomName: string;

  @Prop()
  messageId: string;

  @Prop()
  confirmed: boolean;
}

export const InProgressSchema = SchemaFactory.createForClass(InProgress);
