'use client';

import React, { useMemo, type ReactNode } from 'react';
import { FirebaseProvider, useUser } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';
import { initiateAnonymousSignIn } from './non-blocking-login';
import { Skeleton } from '@/components/ui/skeleton';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

/**
 * This component handles the authentication flow. It ensures that an anonymous user
 * is signed in if no other user is present. It also displays a loading screen
 * while the authentication status is being determined, preventing race conditions
 * where data is fetched before authentication is complete.
 */
function AuthHandler({ children }: { children: ReactNode }) {
  const { user, isUserLoading, auth } = useUser({ onNotAuthenticated: 'signInAnonymously' });

  if (isUserLoading) {
    // Show a full-page loading skeleton while Firebase determines the auth state.
    // This is crucial to prevent child components from making authenticated requests
    // before the user is known.
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const firebaseServices = useMemo(() => {
    // Initialize Firebase on the client side, once per component mount.
    return initializeFirebase();
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
    >
      <AuthHandler>
        {children}
      </AuthHandler>
    </FirebaseProvider>
  );
}
