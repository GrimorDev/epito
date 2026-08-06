import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel supervisora",
  robots: { index: false, follow: false },
};

export default function SupervisorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
