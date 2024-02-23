import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Observable } from 'rxjs';
import crypto from 'crypto';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    return this.validateRequest(request);
  }

  private validateRequest(request: Request): boolean {
    const timestamp = request.headers['X-Webhook-Timestamp'];
    const signatureHeader = request.headers['X-Webhook-Signature'];
    const secret = this.configService.get<string>('DAILY_HOOK_HMAC');
    const signature = timestamp + '.' + JSON.stringify(request.body);
    const base64DecodedSecret = Buffer.from(secret, 'base64');
    const hmac = crypto.createHmac('sha256', base64DecodedSecret);
    const computed = hmac.update(signature).digest('base64');
    return computed === signatureHeader;
  }
}
