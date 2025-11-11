'use client';

import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";

interface Measure {
  chord: string;
}

interface Section {
  id: string;
  label: string;
  measures: Measure[];
  user: string;
  userImage?: string;
  color: string;
}

interface SheetMusicProps {
  sections: Section[];
  currentSectionIndex?: number;
  currentMeasure?: number;
  measureProgress?: number;
  sectionProgress?: number;
}

export default function SheetMusic({
  sections,
  currentSectionIndex = 0,
  currentMeasure = 0,
  measureProgress = 0,
  sectionProgress = 0,
}: SheetMusicProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentSectionRef = useRef<HTMLDivElement>(null);

  const [likes, setLikes] = useState<Record<string, boolean>>({
    "section-A": false,
    "section-B": false,
    "section-C": false,
    "section-D": false,
  });

  const toggleLike = (sectionId: string) => {
    setLikes((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  useEffect(() => {
    if (currentSectionRef.current && containerRef.current) {
      const container = containerRef.current;
      const currentSection = currentSectionRef.current;

      const containerHeight = container.clientHeight;
      const sectionTop = currentSection.offsetTop;
      const sectionHeight = currentSection.clientHeight;

      const scrollPosition = sectionTop - containerHeight / 2 + sectionHeight / 2;

      container.scrollTo({
        top: scrollPosition,
        behavior: "smooth",
      });
    }
  }, [currentSectionIndex]);

  const renderSection = (section: Section, sectionIdx: number) => {
    const isCurrentSection = sectionIdx === currentSectionIndex;
    const sectionColor = section.color;
    const sectionOpacity = isCurrentSection ? 1 : 0.5;

    const measures = section.measures;
    const hasMultipleRows = measures.length > 4;
    const firstRow = measures.slice(0, 4);
    const secondRow = hasMultipleRows ? measures.slice(4, 8) : [];

    return (
      <div key={section.id} className="mb-8" ref={isCurrentSection ? currentSectionRef : null}>
        <div
          className="flex items-center transition-all duration-500"
          style={{
            opacity: sectionOpacity,
            height: isCurrentSection ? "4.5rem" : "3.5rem",
          }}
        >
          <div
            className="mr-2 flex w-28 flex-col items-center justify-center self-stretch gap-2 border-r-2 pr-2 transition-all duration-300"
            style={{
              borderColor: sectionColor,
              backgroundColor: `${sectionColor}15`,
            }}
          >
            {section.userImage || section.id.includes("section-") ? (
              <>
                <div className="flex w-full items-center justify-between px-1">
                  <div
                    className="flex items-center justify-center rounded-full text-[10px] font-medium transition-all duration-300"
                    style={{
                      width: isCurrentSection ? "2rem" : "1.5rem",
                      height: isCurrentSection ? "2rem" : "1.5rem",
                      border: `2px solid ${sectionColor}60`,
                      backgroundColor: `${sectionColor}30`,
                      color: sectionColor,
                    }}
                  >
                    {section.user.charAt(0).toUpperCase()}
                  </div>

                  <button
                    onClick={() => toggleLike(section.id)}
                    className="transition-all duration-300 hover:scale-110 active:scale-95"
                  >
                    <Heart
                      size={isCurrentSection ? 18 : 16}
                      fill={likes[section.id] ? sectionColor : "none"}
                      stroke={sectionColor}
                      strokeWidth={2}
                    />
                  </button>
                </div>

                <div
                  className="w-full truncate px-1 text-center transition-all duration-300"
                  style={{
                    color: "#E0E0E0",
                    fontSize: isCurrentSection ? "0.75rem" : "0.6875rem",
                  }}
                >
                  {section.user}
                </div>
              </>
            ) : (
              <div className="text-center text-[11px] text-[#9B9B9B]">{section.user}</div>
            )}
          </div>

          <div className="relative flex flex-1 items-center">
            <div
              className="absolute left-0 z-10 rounded-t-md px-1.5 transition-all duration-300"
              style={{
                bottom: "100%",
                backgroundColor: sectionColor,
                fontSize: isCurrentSection ? "0.625rem" : "0.5625rem",
                fontWeight: isCurrentSection ? 600 : 500,
                color: "#FFFFFF",
                boxShadow: `0 2px 4px ${sectionColor}40`,
                lineHeight: "1.2",
                paddingTop: "0.25rem",
                paddingBottom: "0.125rem",
              }}
            >
              {section.label}
            </div>

            {isCurrentSection && currentMeasure < 4 && (
              <div
                className="absolute top-0 bottom-0 z-30 w-1"
                style={{
                  left: `${(currentMeasure + measureProgress) * 25}%`,
                  backgroundColor: sectionColor,
                  boxShadow: `0 0 10px ${sectionColor}, 0 0 20px ${sectionColor}99`,
                }}
              />
            )}

            <div
              className="absolute left-0 right-0 z-10 h-px"
              style={{
                top: "50%",
                backgroundColor: `${sectionColor}40`,
              }}
            />

            <div className="relative z-20 flex h-full w-full">
              {firstRow.map((measure, measureIndex) => {
                const isActiveMeasure = isCurrentSection && measureIndex === currentMeasure;

                return (
                  <div key={measureIndex} className="relative flex flex-1 items-center justify-start">
                    <div
                      className="absolute left-0 top-0 bottom-0 w-px"
                      style={{
                        backgroundColor: `${sectionColor}40`,
                      }}
                    />

                    <div
                      className="px-3 transition-all duration-300"
                      style={{
                        color: isActiveMeasure ? sectionColor : "#E0E0E0",
                        fontSize: isActiveMeasure ? "1rem" : "0.875rem",
                        fontWeight: isActiveMeasure ? 600 : 400,
                        textShadow: isActiveMeasure ? `0 0 8px ${sectionColor}99` : "none",
                      }}
                    >
                      {measure.chord}
                    </div>
                  </div>
                );
              })}

              <div
                className="absolute right-0 top-0 bottom-0 w-px"
                style={{
                  backgroundColor: `${sectionColor}40`,
                }}
              />
            </div>
          </div>
        </div>

        {hasMultipleRows && (
          <div
            className="mt-2 flex items-center transition-all duration-500"
            style={{
              opacity: sectionOpacity,
              height: isCurrentSection ? "4.5rem" : "3.5rem",
            }}
          >
            <div className="mr-2 w-28"></div>

            <div className="relative flex flex-1 items-center">
              {isCurrentSection && currentMeasure >= 4 && (
                <div
                  className="absolute top-0 bottom-0 z-30 w-1"
                  style={{
                    left: `${(currentMeasure - 4 + measureProgress) * 25}%`,
                    backgroundColor: sectionColor,
                    boxShadow: `0 0 10px ${sectionColor}, 0 0 20px ${sectionColor}99`,
                  }}
                />
              )}

              <div
                className="absolute left-0 right-0 z-10 h-px"
                style={{
                  top: "50%",
                  backgroundColor: `${sectionColor}40`,
                }}
              />

              <div className="relative z-20 flex h-full w-full">
                {secondRow.map((measure, measureIndex) => {
                  const actualMeasureIndex = measureIndex + 4;
                  const isActiveMeasure = isCurrentSection && actualMeasureIndex === currentMeasure;

                  return (
                    <div key={actualMeasureIndex} className="relative flex flex-1 items-center justify-start">
                      <div
                        className="absolute left-0 top-0 bottom-0 w-px"
                        style={{
                          backgroundColor: `${sectionColor}40`,
                        }}
                      />

                      <div
                        className="px-3 transition-all duration-300"
                        style={{
                          color: isActiveMeasure ? sectionColor : "#E0E0E0",
                          fontSize: isActiveMeasure ? "1rem" : "0.875rem",
                          fontWeight: isActiveMeasure ? 600 : 400,
                          textShadow: isActiveMeasure ? `0 0 8px ${sectionColor}99` : "none",
                        }}
                      >
                        {measure.chord}
                      </div>
                    </div>
                  );
                })}

                <div
                  className="absolute right-0 top-0 bottom-0 w-px"
                  style={{
                    backgroundColor: `${sectionColor}40`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="h-full space-y-2 overflow-y-auto px-2 pt-5">
      {sections.map((section, index) => renderSection(section, index))}
    </div>
  );
}

