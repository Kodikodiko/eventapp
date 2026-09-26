'use client';

import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/** Anmelde-Client für den Browser (spricht mit /api/auth). */
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});
