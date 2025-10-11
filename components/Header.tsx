"use client";
import React, { useContext } from "react";
import { Button } from "./ui/button";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import { UserButton } from "@clerk/nextjs";
import { NavigationContext } from "@/lib/NavigationProvider";

function Header() {
  const { setIsMobileNavOpen, isMobileNavOpen } = useContext(NavigationContext);

  return (
    <header className="border-b border-gray-200/50 bg-white/80 backdrop-blur-xl sticky top-0 z-50 ">
      <div className="flex items-center justify-between px-4 py-3 bg-black text-white">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-500 hover:text-gray-800 hover:bg-gray-100/50"
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          >
            <HamburgerMenuIcon className="h-5 w-5" />
          </Button>
          <div className="bg-gradient-to-r from-red-300 via-pink-200 to-white bg-clip-text text-transparent font-semibold text-2xl">
            Chat with Luna
          </div>
        </div>

        <div className="flex items-center">
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox:
                  "h-8 w-8 ring-2 ring-gray-200/50 ring-offset-2 rounded-full transition-shadow hover:ring-gray-300/50",
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}

export default Header;
