import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { AuthUser } from '../types/qaaga';

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Stored strictly in memory (never localStorage) per security guidelines
  const tokenRef = useRef<string | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const setSession = (nextToken: string | null, nextUser: AuthUser | null) => {
    tokenRef.current = nextToken;
    setTokenState(nextToken);
    setUser(nextUser);
  };

  const authFetch = useCallback(async (input: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers || {});
    if (tokenRef.current) {
      headers.set('Authorization', `Bearer ${tokenRef.current}`);
    }
    if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(input, { ...init, headers });
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Sign-in failed.');
    }
    setSession(data.token, data.user);
  };

  const registerWithEmail = async (
    fullName: string,
    email: string,
    password: string
  ) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed.');
    }
    setSession(data.token, data.user);
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    tokenRef.current = idToken;
    setTokenState(idToken);

    const res = await fetch('/api/workspace', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      tokenRef.current = null;
      setTokenState(null);
      throw new Error(data.error || 'Failed to sync Google account.');
    }
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore if not signed into Firebase popup
    }
    setSession(null, null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        setUser,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logout,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
