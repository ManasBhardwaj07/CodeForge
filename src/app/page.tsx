"use client";
import { useEffect } from "react";
import { getToken } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    }
  }, [router]);
  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="bg-gradient-to-br from-blue-100/80 to-white rounded-3xl shadow-2xl p-12 w-full max-w-2xl text-center border border-blue-200 animate-slide-up">
        <h1 className="text-5xl font-extrabold mb-6 text-blue-700 tracking-tight drop-shadow animate-slide-down">Welcome to <span className="text-blue-500">CodeForge</span></h1>
        <p className="mb-8 text-xl text-gray-700 animate-fade-in">Asynchronous code execution platform for coding problems, submissions, and more.<br/>Use the navigation bar above to get started.</p>
        <div className="flex flex-wrap gap-6 justify-center mt-8 animate-pop">
          <a href="/problems" className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white px-8 py-3 rounded-xl shadow-lg transition-all duration-200 font-semibold text-lg transform hover:scale-105">Browse Problems</a>
          <a href="/submissions" className="bg-gray-200 hover:bg-gray-300 text-blue-700 px-8 py-3 rounded-xl shadow-lg transition-all duration-200 font-semibold text-lg transform hover:scale-105">View Submissions</a>
        </div>
      </div>
      <div className="mt-16 w-full max-w-2xl animate-scroll-fade">
        <div className="h-2 w-full bg-gradient-to-r from-blue-200 via-blue-100 to-white rounded-full animate-pulse"></div>
      </div>
    </main>
  );
}