import { Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import AppFooter from "./AppFooter";
import AppHeader from "./AppHeader";

export default function Layout({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col w-full overflow-hidden">
      <AppHeader />
      <main className="flex-1 w-full max-w-7xl mx-auto md:px-6 lg:px-8">
        {children ?? <Outlet />}
      </main>
      <AppFooter />
    </div>
  );
}
