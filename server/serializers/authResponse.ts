import type { UserProfile } from "../users/userStore.js";

export function serializeAuthResponse(user: UserProfile, token: string) {
  return {
    user: {
      id: user.publicId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      ...(user.company === undefined ? {} : { company: user.company }),
    },
    token,
  };
}
