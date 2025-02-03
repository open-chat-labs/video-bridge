import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InProgressDocument = HydratedDocument<InProgress>;

@Schema()
export class InProgress {
  @Prop({ type: Date, expires: 0 })
  expiresAt?: Date;

  @Prop()
  roomName: string;

  @Prop()
  messageId: string;

  @Prop()
  confirmed: boolean;

  @Prop()
  startedBy: string;
}

export const InProgressSchema = SchemaFactory.createForClass(InProgress).index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);
