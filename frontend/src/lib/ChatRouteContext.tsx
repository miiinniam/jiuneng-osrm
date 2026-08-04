"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ChatRouteCoords } from "@/hooks/useAIChat";

interface ChatRouteContextValue {
  onRouteFound: ((coords: ChatRouteCoords) => void) | null;
}

const ChatRouteContext = createContext<ChatRouteContextValue>({ onRouteFound: null });

export function ChatRouteProvider({
  children,
  onRouteFound,
}: {
  children: ReactNode;
  onRouteFound: (coords: ChatRouteCoords) => void;
}) {
  return (
    <ChatRouteContext.Provider value={{ onRouteFound }}>
      {children}
    </ChatRouteContext.Provider>
  );
}

export function useChatRoute() {
  return useContext(ChatRouteContext);
}
