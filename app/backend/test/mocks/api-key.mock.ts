import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class MockApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // Always return true for tests
    request.user = { apiKeyId: 'test-key', roles: ['admin'] };
    return true;
  }
}
