import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";

// ⚠️ 用 www：jiuneng.space 会 308 跳到 www.jiuneng.space，
// canonical / sitemap 必须指向直接返回 200 的地址，否则爬虫每次都吃一次重定向。
const SITE_URL = "https://www.jiuneng.space";
const SITE_NAME = "JIUNENG logistics";

const plexSans = IBM_Plex_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  // 300 是官网标题的签名字重（轻量即自信），工具页仍在用 500-700
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const DESCRIPTION =
  "玖能国际面向中国企业的工程物流平台。在线预估中越运输费用、匹配专业车型，并管理询价到交付全过程。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "JIUNENG logistics | 工程物流平台 · 在线报价",
    template: "%s | JIUNENG logistics",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "工程物流",
    "中越物流",
    "越南运输",
    "进出口报关",
    "国际货运报价",
    "大件运输",
    "风电设备运输",
    "JIUNENG",
    "logistics Vietnam",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    // 三语切换是客户端 LocaleContext 实现的（同一 URL），所以不设 hreflang —— 设了反而指向同一页
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "JIUNENG logistics | 工程物流平台 · 在线报价",
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "zh_CN",
    alternateLocale: ["vi_VN", "en_US"],
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "玖能国际 — 面向中国企业的工程物流平台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JIUNENG logistics | 工程物流平台 · 在线报价",
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/assets/logo/logo-symbol.png",
  },
  formatDetection: { telephone: false },
};

/** Organization 结构化数据 —— 企业代码/税号/地址来自已核验的品牌基础信息表 */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "玖能国际有限责任公司",
  alternateName: ["JIUNENG International", "JIUNENG logistics", "CÔNG TY TNHH QUỐC TẾ JIUNENG"],
  url: SITE_URL,
  logo: `${SITE_URL}/assets/logo/logo-horizontal.webp`,
  image: `${SITE_URL}/og-image.png`,
  description: DESCRIPTION,
  foundingDate: "2024-03-20",
  identifier: "0202235124",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Số 82 phố Duy Tân, Phường Cầu Giấy",
    addressLocality: "Hà Nội",
    addressCountry: "VN",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      telephone: "+86-15687419919",
      contactType: "sales",
      availableLanguage: ["zh", "vi", "en"],
    },
    {
      "@type": "ContactPoint",
      email: "quoctejiuneng@gmail.com",
      contactType: "customer service",
    },
  ],
  subOrganization: {
    "@type": "Organization",
    name: "广西玖一进出口贸易有限公司",
    identifier: "91451481595108415C",
    address: { "@type": "PostalAddress", addressCountry: "CN" },
  },
  areaServed: [
    { "@type": "Country", name: "Vietnam" },
    { "@type": "Country", name: "China" },
  ],
  knowsAbout: ["工程物流", "进出口报关", "国际贸易", "大件运输", "中越跨境运输"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          // JSON-LD 是静态常量，无注入风险
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="flex h-full flex-col">
        <a className="skip-link" href="#main">Skip to content</a>
        <ErrorBoundary>
          <AppShell>{children}</AppShell>
        </ErrorBoundary>
      </body>
    </html>
  );
}
