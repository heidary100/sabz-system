import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../products/products.module';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

/**
 * Customer wishlist (SS-231). Card hydration is borrowed from the
 * product domain (`PublicCatalogService`, exported by `ProductsModule`) so
 * wishlist rows share the listing's price/stock/media truth; there is no
 * reverse dependency, hence no module cycle.
 */
@Module({
  imports: [AuthModule, ProductsModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
