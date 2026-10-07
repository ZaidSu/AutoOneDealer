"use client";
import { createContext, useContext } from "react";
import type { Data } from "@/lib/types";

// Tells shared pieces (file links, CSV buttons) whether the page is running in preview mode, and gives them the data.
export const PreviewContext = createContext<{ enabled: boolean; data: Data | null }>({ enabled: false, data: null });
export const usePreview = () => useContext(PreviewContext);
