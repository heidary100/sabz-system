import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { TorobProductsResponse } from '@sabz/types';
import { TorobAuthGuard } from './torob-auth.guard';
import { parseTorobProductsRequest } from './torob-request';
import { TorobService } from './torob.service';

/**
 * Torob Product API v3 endpoint (SS-239, master plan §5.11).
 *
 * `POST /torob/products` is the single sync route Torob crawls: signed
 * requests (Ed25519 JWT, verified by TorobAuthGuard) carrying exactly one
 * of the four request shapes. The body is parsed by hand
 * (`parseTorobProductsRequest`) so 400s keep the spec's `{error}` envelope.
 * The global ThrottlerGuard (100 req/min) is skipped here — Torob pages
 * through the whole catalog in one sweep and the JWT already gates abuse.
 */
@SkipThrottle()
@Controller('torob')
export class TorobController {
  constructor(private readonly torobService: TorobService) {}

  @Post('products')
  // 200, not Nest's POST-default 201 — the v3 spec reads the body of every
  // sync response as a feed page, never a "created" resource.
  @HttpCode(HttpStatus.OK)
  @UseGuards(TorobAuthGuard)
  async products(@Body() body: unknown): Promise<TorobProductsResponse> {
    return this.torobService.getProducts(parseTorobProductsRequest(body));
  }
}
