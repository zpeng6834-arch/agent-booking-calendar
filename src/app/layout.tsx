import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { SupabaseConfigProvider } from '@/lib/supabase-config-inject';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: {
    default: 'AI Agent 预约日历',
    template: '%s | AI Agent 预约日历',
  },
  description:
    '为 AI Agent 设计的预约日历 SaaS 系统，支持创建日历、管理服务、预约管理，并提供标准 API 接口。',
  keywords: [
    '预约日历',
    'AI Agent',
    'SaaS',
    '预约管理',
    'API',
  ],
  authors: [{ name: 'Coze Code Team', url: 'https://code.coze.cn' }],
  generator: 'Coze Code',
  openGraph: {
    title: 'AI Agent 预约日历',
    description:
      '为 AI Agent 设计的预约日历 SaaS 系统。',
    url: 'https://code.coze.cn',
    siteName: 'AI Agent 预约日历',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        <SupabaseConfigProvider>
          <AuthProvider>
            {isDev && <Inspector />}
            {children}
          </AuthProvider>
        </SupabaseConfigProvider>
      </body>
    </html>
  );
}
