import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import GlobalToast from "@/components/GlobalToast";
import QueryProvider from "@/components/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "面试手记 · Interview Forge",
  description: "前端面试题库与标签管理 · 全栈 Next.js + Prisma + AI 出题",
  openGraph: {
    title: "面试手记 · Interview Forge",
    description: "前端面试题库与标签管理 · 全栈 Next.js + Prisma + AI 出题",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "面试手记 · Interview Forge",
    description: "前端面试题库与标签管理 · 全栈 Next.js + Prisma + AI 出题",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* 防闪白（FOUC）：绘制前按 localStorage 设 .dark，避免刷新瞬间浅色闪一下 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}",
          }}
        />
        {/* QueryProvider：把 TanStack Query 的缓存管理器挂到全站，
            下方所有组件才能用 useQuery / useMutation 共享同一份缓存 */}
        <QueryProvider>
          <NavBar />
          <div className="flex-1">{children}</div>
          {/* 全局跨页 Toast：读 ?toast= 参数弹提示（详情页删完跳回首页用） */}
          <GlobalToast />
        </QueryProvider>
      </body>
    </html>
  );
}
