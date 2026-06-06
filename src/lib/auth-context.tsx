'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const supabase = await getSupabaseBrowserClientWithRetry();
        const { data: { user: initialUser } } = await supabase.auth.getUser();
        setUser(initialUser);
        setLoading(false);

        // 监听认证状态变化
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            setUser(session?.user ?? null);
            
            if (event === 'SIGNED_OUT') {
              router.push('/login');
            }
          }
        );

        return () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error('Auth init error:', error);
        setLoading(false);
      }
    };

    initAuth();
  }, [router]);

  // 路由守卫
  useEffect(() => {
    if (!loading) {
      const isLoginPage = pathname === '/login';
      const isRootPage = pathname === '/';
      
      if (!user && !isLoginPage && !isRootPage) {
        router.push('/login');
      } else if (user && isLoginPage) {
        router.push('/dashboard');
      } else if (user && isRootPage) {
        router.push('/dashboard');
      }
    }
  }, [user, loading, pathname, router]);

  const signOut = async () => {
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      await supabase.auth.signOut();
      setUser(null);
      router.push('/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
