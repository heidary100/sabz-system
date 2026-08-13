-- DropIndex
DROP INDEX "UserProfile_userType_idx";

-- AlterTable
ALTER TABLE "UserProfile" DROP COLUMN "userType";

-- DropEnum
DROP TYPE "UserType";
