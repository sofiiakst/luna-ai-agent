"use client";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { NavigationProvider } from "@/lib/NavigationProvider";
import { Authenticated } from "convex/react";

export default function DashBoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NavigationProvider>
      <div className="flex h-screen bg-black ">
        <Authenticated>
          <Sidebar />
        </Authenticated>
        <div className="flex-1 flex flex-col w-full">
          <Header />
          <main className="flex-1 overflow-auto bg-black">{children}</main>
        </div>
      </div>
    </NavigationProvider>
  );
}
