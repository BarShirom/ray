// Application records: no database documents, IDs or query types cross this boundary.
export interface UserProfile {
  publicId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  company?: string | null;
}

export interface UserCredentials extends UserProfile {
  passwordHash: string;
}

export interface AuthIdentity {
  _id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  name?: string | null;
}

export interface CreateUser {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  company?: string | null;
}

export interface UserStore {
  findByEmail(email: string): Promise<UserProfile | null>;
  findCredentialsByEmail(email: string): Promise<UserCredentials | null>;
  create(input: CreateUser): Promise<UserProfile>;
  findIdentityByPublicId(
    publicId: string,
    options?: { includeLegacyName?: boolean }
  ): Promise<AuthIdentity | null>;
}
