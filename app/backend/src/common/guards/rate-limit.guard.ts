import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { Request, Response } from 'express';

export interface RateLimitOptions {
  endpoint: string;
  windowMs?: number;
  maxRequests?: number;
}

export const RATE_LIMIT_KEY = 'rate_limit';

export const RateLimit = (options: RateLimitOptions) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor.value);
    return descriptor;
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const rateLimitOptions = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      handler,
    );

    if (!rateLimitOptions) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Extract identifier (API key or IP)
    const identifier = this.getIdentifier(request);

    const { allowed, remaining, resetTime } =
      await this.rateLimitService.checkRateLimit(
        identifier,
        rateLimitOptions.endpoint,
        {
          windowMs: rateLimitOptions.windowMs,
          maxRequests: rateLimitOptions.maxRequests,
        },
      );

    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader(
      'X-RateLimit-Limit',
      rateLimitOptions.maxRequests?.toString() || '10',
    );
    response.setHeader('X-RateLimit-Remaining', remaining.toString());
    response.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(resetTime.getTime() / 1000).toString(),
    );

    if (!allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          error: 'Too Many Requests',
          retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.rateLimitService.recordRequest(
      identifier,
      rateLimitOptions.endpoint,
      {
        windowMs: rateLimitOptions.windowMs,
        maxRequests: rateLimitOptions.maxRequests,
      },
    );

    return true;
  }

  private getIdentifier(request: Request): string {
    // First try to get API key from headers
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey && apiKey !== 'undefined' && apiKey !== 'null') {
      return `api_key:${apiKey.substring(0, 8)}`;
    }
    // Fallback to IP address
    const ip =
      request.ip || (request.headers['x-forwarded-for'] as string) || 'unknown';
    return `ip:${ip}`;
  }
}
