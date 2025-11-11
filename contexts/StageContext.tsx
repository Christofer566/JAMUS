'use client';

import { createContext, useContext, useState, ReactNode } from "react";

type StageContextValue = {
  currentPerformer: string;
  setCurrentPerformer: (performer: string) => void;
  stageColor: string;
  setStageColor: (color: string) => void;
};

const StageContext = createContext<StageContextValue | undefined>(undefined);

type StageProviderProps = {
  children: ReactNode;
};

export function StageProvider({ children }: StageProviderProps) {
  const [currentPerformer, setCurrentPerformer] = useState("JAMUS");
  const [stageColor, setStageColor] = useState("#7BA7FF");

  return (
    <StageContext.Provider
      value={{
        currentPerformer,
        setCurrentPerformer,
        stageColor,
        setStageColor,
      }}
    >
      {children}
    </StageContext.Provider>
  );
}

export function useStageContext() {
  const context = useContext(StageContext);

  if (!context) {
    throw new Error("useStageContext must be used within a StageProvider");
  }

  return context;
}

