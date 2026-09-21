import User from "../models/UserModel.js";
import type { AuthIdentity, UserProfile, UserStore } from "./userStore.js";

type UserSource = {
  _id: { toString(): string };
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  company?: string | null;
  name?: string | null;
};

function profile(user: UserSource): UserProfile {
  const result: UserProfile = {
    publicId: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
  if (Object.prototype.hasOwnProperty.call(user, "company")) {
    result.company = user.company;
  }
  return result;
}

function identity(user: UserSource, includeLegacyName: boolean): AuthIdentity {
  const result: AuthIdentity = {
    _id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
  if (includeLegacyName) result.name = user.name;
  return result;
}

export const mongoUserStore: UserStore = {
  async findByEmail(email) {
    const user = await User.findOne({ email });
    return user ? profile(user.toObject()) : null;
  },

  async findCredentialsByEmail(email) {
    const user = await User.findOne({ email });
    return user ? { ...profile(user.toObject()), passwordHash: user.password } : null;
  },

  async create(input) {
    const user = await User.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      password: input.passwordHash,
      company: input.company,
    });
    return profile(user.toObject());
  },

  async findIdentityByPublicId(publicId, { includeLegacyName = false } = {}) {
    // Keep required auth hydrated and optional auth lean: only the latter reads
    // the legacy name field, which is not declared in the current User schema.
    if (includeLegacyName) {
      const user = await User.findById(publicId)
        .select("_id firstName lastName name email")
        .lean();
      return user ? identity(user, true) : null;
    }
    const user = await User.findById(publicId).select("_id firstName lastName email");
    return user ? identity(user, false) : null;
  },
};
