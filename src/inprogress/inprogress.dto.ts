import { VideoCallType } from '../types';

export class CreateInProgressDto {
  readonly roomName: string;
  readonly messageId: string;
  readonly confirmed: boolean;
  readonly expiresAt?: Date;
  readonly startedBy: string;
  readonly callType?: VideoCallType;
}
