import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { createPostgres } from "../db/connection.js";
import { users } from "../db/schema.js";
import { isPublicId } from "../utils/publicId.js";
import type { AuthIdentity, UserProfile, UserStore } from "./userStore.js";

const profileColumns = {
  publicId: users.publicId,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  company: users.company,
  companyPresent: users.companyPresent,
};
const identityColumns = {
  publicId: users.publicId,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
};

type ProfileRow = Pick<typeof users.$inferSelect,
  "publicId" | "firstName" | "lastName" | "email" | "company" | "companyPresent">;

function profile(row: ProfileRow): UserProfile {
  return {
    publicId: row.publicId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    ...(row.companyPresent ? { company: row.company } : {}),
  };
}

function identity(row: Pick<ProfileRow, "publicId" | "firstName" | "lastName" | "email">): AuthIdentity {
  return { _id: row.publicId, firstName: row.firstName, lastName: row.lastName, email: row.email };
}

// Importing this module opens no connection. The caller owns the supplied database.
export function createPostgresUserStore(db: ReturnType<typeof createPostgres>["db"]): UserStore {
  return {
    async findByEmail(email) {
      const [row] = await db.select(profileColumns).from(users).where(eq(users.email, email)).limit(1);
      return row ? profile(row) : null;
    },

    async findCredentialsByEmail(email) {
      const [row] = await db.select({ ...profileColumns, passwordHash: users.passwordHash })
        .from(users).where(eq(users.email, email)).limit(1);
      return row ? { ...profile(row), passwordHash: row.passwordHash } : null;
    },

    async create(input) {
      const [row] = await db.insert(users).values({
        publicId: randomBytes(12).toString("hex"),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        passwordHash: input.passwordHash,
        company: input.company ?? null,
        companyPresent: input.company !== undefined,
      }).returning(profileColumns);
      return profile(row);
    },

    async findIdentityByPublicId(publicId, { includeLegacyName = false } = {}) {
      // Mongo findById(null/undefined) finds no user; malformed strings reject.
      // Keep those distinct so required auth preserves its existing 401 messages.
      if (publicId == null) return null;
      if (!isPublicId(publicId)) throw new Error("Invalid user public ID");
      const canonicalId = publicId.toLowerCase();
      if (includeLegacyName) {
        const [row] = await db.select({ ...identityColumns,
          legacyName: users.legacyName, legacyNamePresent: users.legacyNamePresent,
        }).from(users).where(eq(users.publicId, canonicalId)).limit(1);
        return row ? { ...identity(row), name: row.legacyNamePresent ? row.legacyName : undefined } : null;
      }
      const [row] = await db.select(identityColumns).from(users).where(eq(users.publicId, canonicalId)).limit(1);
      return row ? identity(row) : null;
    },
  };
}
