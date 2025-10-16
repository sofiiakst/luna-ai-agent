"use client";

import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-red-100 flex items-center justify-center">
      <div className="absolute inset-0 -z-10 h-full w-full bg-white bg-[size:6rem_4rem]"></div>
      <section className="w-full px-4 py-8 mx-auto max-w-7xl sm:px-6 lg:px-8 flex flex-col items-center space-y-10 text-center ">
        <header className="space-y-6">
          <motion.h1
            className="text-6xl font-bold tracking-tight sm:text-7xl bg-gradient-to-r from-red-50 via-red-100 to-gray-200 bg-clip-text text-transparent"
            initial={{ opacity: 0 }} // start fully transparent
            animate={{ opacity: 1 }} // animate to fully visible
            transition={{ duration: 4 }} // fade in over 2 seconds
          >
            Meet Luna
          </motion.h1>
          <p className="max-w-[600px] text-lg text-gray-300 md:text-xl xl:text-2xl">
            And just get things done
            <br />
            <span className="text-gray-400 text-sm">
              Powered by IBM's WxTools & Claude
            </span>
          </p>
        </header>

        <SignedIn>
          <Link href="/dashboard">
            <button className="group relative inline-flex items-center justify-center px-8 py-3.5 text-base font-medium text-white bg-gradient-to-r from-red-900 to-red-100 rounded-full hover:from-red-100 hover:to-red-900 transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5">
              Get Started
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              <p className="absolute inset-0 rounded-full bg-gradient-to-r from-gray-900/20 to-gray-800/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></p>
            </button>
          </Link>
        </SignedIn>

        <SignedOut>
          <SignInButton
            mode="modal"
            fallbackRedirectUrl="/dashboard"
            forceRedirectUrl="/dashboard"
          >
            <button className="group relative inline-flex items-center justify-center px-8 py-3.5 text-base font-medium text-white bg-gradient-to-r from-red-900 to-red-100 rounded-full hover:from-red-100 hover:to-red-900 transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5">
              Sign Up
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              <p className="absolute inset-0 rounded-full bg-gradient-to-r from-gray-900/20 to-gray-800/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></p>
            </button>
          </SignInButton>
        </SignedOut>
      </section>
    </main>
  );
}
