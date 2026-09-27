import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AddressDto,
  AddressListResponse,
  RemoveAddressResponse,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';

const ADDRESS_SELECT = {
  id: true,
  label: true,
  fullName: true,
  phone: true,
  province: true,
  city: true,
  address: true,
  postalCode: true,
  isDefault: true,
  createdAt: true,
} as const;

type AddressRow = {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  province: string | null;
  city: string | null;
  address: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: Date;
};

/**
 * Customer address book (SS-233): many rows per user, exactly one default.
 *
 * All methods are self-scoped to the caller's userId (no cross-user access;
 * unknown/other-user ids are non-disclosure 404s). Orders snapshot the
 * chosen columns at creation and never read back (ORDER-003), so edits here
 * cannot rewrite order history.
 */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AddressListResponse> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      select: ADDRESS_SELECT,
      orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }],
    });
    return { items: rows.map((row) => this.toDto(row)) };
  }

  async create(userId: string, dto: CreateAddressDto): Promise<AddressDto> {
    const siblingCount = await this.prisma.address.count({ where: { userId } });
    // First address is always the default; explicit isDefault promotes.
    const isDefault = siblingCount === 0 || dto.isDefault === true;
    const created = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.create({
        data: {
          userId,
          label: dto.label ?? null,
          fullName: dto.fullName.trim(),
          phone: dto.phone,
          province: dto.province ?? null,
          city: dto.city ?? null,
          address: dto.address.trim(),
          postalCode: dto.postalCode ?? null,
          isDefault,
        },
        select: ADDRESS_SELECT,
      });
    });
    return this.toDto(created);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    const existing = await this.prisma.address.findFirst({
      where: { id, userId },
      select: { id: true, isDefault: true },
    });
    if (!existing) {
      throw new NotFoundException('نشانی یافت نشد.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true && !existing.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.update({
        where: { id: existing.id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.province !== undefined ? { province: dto.province } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
          ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
        select: ADDRESS_SELECT,
      });
    });
    return this.toDto(updated);
  }

  async remove(userId: string, id: string): Promise<RemoveAddressResponse> {
    const existing = await this.prisma.address.findFirst({
      where: { id, userId },
      select: { id: true, isDefault: true },
    });
    if (!existing) {
      // Idempotent per cart/wishlist remove precedent: unknown ids report
      // not-removed instead of leaking existence via 404.
      return { removed: false };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: existing.id } });
      if (existing.isDefault) {
        // Keep exactly one default: promote the oldest sibling, if any.
        const oldest = await tx.address.findFirst({
          where: { userId },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
        if (oldest) {
          await tx.address.update({
            where: { id: oldest.id },
            data: { isDefault: true },
          });
        }
      }
    });
    return { removed: true };
  }

  private toDto(row: AddressRow): AddressDto {
    return {
      id: row.id,
      label: row.label,
      fullName: row.fullName,
      phone: row.phone,
      province: row.province,
      city: row.city,
      address: row.address,
      postalCode: row.postalCode,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
