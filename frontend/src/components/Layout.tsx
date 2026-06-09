import { Outlet } from "react-router-dom";
import AppFooter from "./AppFooter";
import AppHeader from "./AppHeader";

export default function Layout() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <main style={{ flex: 1, maxWidth: 1200, width: "100%", margin: "0 auto", padding: "2rem" }}>
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
}
