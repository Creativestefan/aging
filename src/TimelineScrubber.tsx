import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  MotionValue,
} from 'motion/react';
import { useDialKitController } from 'dialkit';
import { WeightMorphViewer } from './WeightMorphViewer';
export { WeightMorphViewer };
import './TimelineScrubber.css';

const STORAGE_KEY = 'aging_timeline_scrubber_day';

const getStoredDay = (fallback: number, max: number): number => {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val >= 1 && val <= max) {
        return val;
      }
    }
  } catch {
    // ignore
  }
  return fallback;
};

export interface TimelineScrubberProps {
  totalDays?: number;
  initialDay?: number;
  startWeight?: number;
  endWeight?: number;
  startDate?: string;
  endDate?: string;
  season?: string;
  onDayChange?: (day: number) => void;
  onWeightChange?: (weight: number) => void;
}

interface TickProps {
  relativePointerX: MotionValue<number>;
  dayIndex: number;
  totalDays: number;
  trackWidth: number;
  baseHeight: number;
  peakHeight: number;
  waveRadius: number;
  stiffness: number;
  damping: number;
  activeColor: string;
  mutedColor: string;
  onClick: (day: number) => void;
}

function TimelineTick({
  relativePointerX,
  dayIndex,
  totalDays,
  trackWidth,
  baseHeight,
  peakHeight,
  waveRadius,
  stiffness,
  damping,
  activeColor,
  mutedColor,
  onClick,
}: TickProps) {
  const tickX = trackWidth > 0 ? (dayIndex / (totalDays - 1)) * trackWidth : 0;

  const distance = useTransform(relativePointerX, (currX) => {
    return currX - tickX;
  });

  const isEdge = dayIndex === 0 || dayIndex === totalDays - 1;
  const nominalBaseHeight = isEdge ? baseHeight + 4 : baseHeight;

  const heightTransform = useTransform(
    distance,
    [
      -waveRadius,
      -waveRadius * 0.65,
      -waveRadius * 0.35,
      0,
      waveRadius * 0.35,
      waveRadius * 0.65,
      waveRadius,
    ],
    [
      nominalBaseHeight,
      nominalBaseHeight + 4,
      peakHeight - 1,
      peakHeight,
      peakHeight - 1,
      nominalBaseHeight + 4,
      nominalBaseHeight,
    ]
  );

  const height = useSpring(heightTransform, {
    mass: 0.08,
    stiffness,
    damping,
  });

  const colorTransform = useTransform(
    distance,
    [
      -waveRadius * 0.8,
      -waveRadius * 0.6,
      -waveRadius * 0.3,
      0,
      waveRadius * 0.3,
      waveRadius * 0.6,
      waveRadius * 0.8,
    ],
    [mutedColor, '#2E2A27', activeColor, activeColor, activeColor, '#2E2A27', mutedColor]
  );

  const widthTransform = useTransform(
    distance,
    [-waveRadius * 0.5, 0, waveRadius * 0.5],
    [1.5, 2.0, 1.5]
  );

  return (
    <motion.div
      style={{
        height,
        backgroundColor: colorTransform,
        width: widthTransform,
      }}
      className="timeline-tick"
      onClick={(e) => {
        e.stopPropagation();
        onClick(dayIndex + 1);
      }}
    />
  );
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function parseDateString(str: string): Date {
  if (!str) return new Date(2026, 0, 1);
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) {
    const mStr = parts[0].slice(0, 3).toLowerCase();
    const monthIndex = MONTH_NAMES.findIndex(
      (m) => m.toLowerCase() === mStr
    );
    const day = parseInt(parts[1], 10);
    if (monthIndex !== -1 && !isNaN(day)) {
      return new Date(2026, monthIndex, day);
    }
  }
  return new Date(2026, 0, 1);
}

function formatTimelineDate(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  const day = String(date.getDate()).padStart(2, '0');
  return `${month} ${day}`;
}

function calculateInterpolatedDate(fraction: number, startStr: string, endStr: string): string {
  try {
    const dStart = parseDateString(startStr);
    const dEnd = parseDateString(endStr);
    const tStart = dStart.getTime();
    const tEnd = dEnd.getTime();
    const currentT = tStart + fraction * (tEnd - tStart);
    return formatTimelineDate(new Date(currentT));
  } catch {
    return startStr;
  }
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  totalDays = 21,
  initialDay = 8,
  startWeight = 300,
  endWeight = 130,
  startDate = 'Jan 01',
  endDate = 'Jun 01',
  onDayChange,
  onWeightChange,
}) => {
  const [trackWidth, setTrackWidth] = useState<number>(640);
  const trackRef = useRef<HTMLDivElement>(null);
  const playbackAnimationRef = useRef<{ stop: () => void } | null>(null);

  const savedDay = getStoredDay(initialDay, totalDays);
  const [currentDay, setCurrentDay] = useState<number>(savedDay);
  const [displayDay, setDisplayDay] = useState<number>(savedDay);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const relativePointerX = useMotionValue<number>(
    ((savedDay - 1) / (totalDays - 1)) * 640
  );

  // DialKit Live Controls grouped into logical folders with persistence
  const dialController = useDialKitController(
    'Scrubber Animation',
    {
      thumb: {
        show: true, // Toggle Synthetic Circular Thumb grab handle
        size: [40, 24, 60, 2], // Thumb diameter (px)
        background: '#fffffff2', // Thumb background color
        borderColor: '#15131247', // Thumb border color
        borderWidth: [0.0, 0, 10, 0.5], // Thumb border width (px)
        blur: [11, 0, 30, 1], // Thumb backdrop blur (px)
        shadow: [8, 0, 40, 1], // Thumb shadow blur radius (px)
        shadowOpacity: [0.16, 0, 1, 0.02], // Thumb shadow opacity
      },
      needle: {
        height: [55, 20, 130, 1], // Vertical needle bar height (px)
        width: [1.75, 1, 4, 0.25], // Vertical needle bar thickness
        showLabel: true, // Toggle needle floating date badge pill
        activeColor: '#151312', // Needle and active tick color
        mutedColor: '#D8D2CD', // Idle tick color
      },
      wave: {
        peakHeight: [36, 20, 50, 1], // Maximum tick height near cursor
        baseHeight: [16, 10, 26, 1], // Default resting tick height
        waveRadius: [115, 40, 180, 5], // Influence radius of magnification wave
        stiffness: [190, 50, 500, 10], // Spring physics stiffness
        damping: [18, 5, 50, 1], // Spring physics damping
      },
      playback: {
        dragOnly: true, // true: Drag needle/thumb to scrub; false: Hover follow
        playDuration: [6.5, 1, 20, 0.5], // Playback duration in seconds
        showBottomLabels: true, // Toggle bottom date labels
        startDate: startDate, // Start date label (left)
        endDate: endDate, // End date label (right)
      },
      morph: {
        showVisual: true, // Toggle centered weight morphing image sequence
        stageHeight: [420, 240, 580, 10], // Visual image stage height (px)
        morphIntensity: [0.004, 0, 0.05, 0.001], // Scale breathing intensity during crossfade
        fadeBlur: [1, 0, 30, 1], // Blur amount as image fades out (px)
      },
      reset: { type: 'action' as const, label: 'Reset All Settings' },
    },
    {
      id: 'scrubber-animation',
      persist: true,
      onAction: (action) => {
        if (action === 'reset') {
          dialController.resetValues();
          try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('dialkit:scrubber-animation');
          } catch {
            // ignore
          }
          setCurrentDay(initialDay);
          setDisplayDay(initialDay);
          const targetX = ((initialDay - 1) / (totalDays - 1)) * (trackWidth || 640);
          relativePointerX.set(targetX);
          if (onDayChange) onDayChange(initialDay);
          if (onWeightChange) {
            const fraction = (initialDay - 1) / Math.max(1, totalDays - 1);
            onWeightChange(Math.round(startWeight - fraction * (startWeight - endWeight)));
          }
        }
      },
    }
  );

  const dial = dialController.values;

  const calculateWeight = useCallback(
    (day: number) => {
      const fraction = (day - 1) / Math.max(1, totalDays - 1);
      return Math.round(startWeight - fraction * (startWeight - endWeight));
    },
    [totalDays, startWeight, endWeight]
  );

  const displayWeight = calculateWeight(displayDay);
  const displayFraction = (displayDay - 1) / Math.max(1, totalDays - 1);
  const displayDate = calculateInterpolatedDate(
    displayFraction,
    dial.playback.startDate,
    dial.playback.endDate
  );

  const smoothNeedleX = useSpring(relativePointerX, {
    mass: 0.08,
    stiffness: dial.wave.stiffness,
    damping: dial.wave.damping,
  });

  const continuousWeight = useTransform(smoothNeedleX, (x) => {
    const width = trackWidth > 0 ? trackWidth : 640;
    const fraction = Math.max(0, Math.min(1, x / width));
    return startWeight - fraction * (startWeight - endWeight);
  });

  useEffect(() => {
    const updateWidth = () => {
      if (trackRef.current) {
        const width = trackRef.current.getBoundingClientRect().width;
        if (width > 0) {
          setTrackWidth(width);
          const targetX = ((currentDay - 1) / (totalDays - 1)) * width;
          relativePointerX.set(targetX);
        }
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [currentDay, totalDays, relativePointerX]);

  const updateDay = useCallback(
    (day: number) => {
      const clamped = Math.max(1, Math.min(totalDays, Math.round(day)));
      setCurrentDay(clamped);
      setDisplayDay(clamped);
      try {
        localStorage.setItem(STORAGE_KEY, clamped.toString());
      } catch {
        // ignore
      }
      if (onDayChange) {
        onDayChange(clamped);
      }
      if (onWeightChange) {
        const fraction = (clamped - 1) / Math.max(1, totalDays - 1);
        const weight = Math.round(startWeight - fraction * (startWeight - endWeight));
        onWeightChange(weight);
      }
    },
    [totalDays, onDayChange, onWeightChange, startWeight, endWeight]
  );

  // Keep needle anchored at currentDay when not dragging in dragOnly mode
  useEffect(() => {
    if ((dial.playback.dragOnly || !isHovered) && !isDragging && trackWidth > 0) {
      const targetX = ((currentDay - 1) / (totalDays - 1)) * trackWidth;
      relativePointerX.set(targetX);
      setDisplayDay(currentDay);
    }
  }, [dial.playback.dragOnly, currentDay, isHovered, isDragging, trackWidth, totalDays, relativePointerX]);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clampedRelX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = clampedRelX / rect.width;
    const day = Math.max(1, Math.min(totalDays, Math.round(1 + ratio * (totalDays - 1))));

    if (isDragging) {
      relativePointerX.set(clampedRelX);
      setDisplayDay(day);
      updateDay(day);
    } else if (!dial.playback.dragOnly) {
      // In hover follow mode, needle moves with mouse
      relativePointerX.set(clampedRelX);
      setDisplayDay(day);
    }
  };

  const handlePointerEnter = () => {
    setIsHovered(true);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    if (!isDragging && trackWidth > 0) {
      const targetX = ((currentDay - 1) / (totalDays - 1)) * trackWidth;
      relativePointerX.set(targetX);
      setDisplayDay(currentDay);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isPlaying) {
      setIsPlaying(false);
    }
    playbackAnimationRef.current?.stop();
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clampedRelX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    relativePointerX.set(clampedRelX);

    const ratio = clampedRelX / rect.width;
    const day = Math.max(1, Math.min(totalDays, Math.round(1 + ratio * (totalDays - 1))));
    updateDay(day);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // Safe fallback
      }
      if (!isHovered && trackWidth > 0) {
        const targetX = ((currentDay - 1) / (totalDays - 1)) * trackWidth;
        relativePointerX.set(targetX);
        setDisplayDay(currentDay);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      updateDay(currentDay - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      updateDay(currentDay + 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      updateDay(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      updateDay(totalDays);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      playbackAnimationRef.current?.stop();
    } else {
      if (currentDay >= totalDays) {
        updateDay(1);
        if (trackWidth > 0) {
          relativePointerX.set(0);
        }
      }
      setIsPlaying(true);
    }
  };

  // Continuous 60fps/120fps Framer Motion playback animation
  useEffect(() => {
    if (isPlaying) {
      if (trackWidth <= 0) return;

      let startX = relativePointerX.get();
      // If at or past end, wrap around to start
      if (startX >= trackWidth - 2) {
        startX = 0;
        relativePointerX.set(0);
        setCurrentDay(1);
        setDisplayDay(1);
      }

      const remainingFraction = Math.max(0, (trackWidth - startX) / trackWidth);
      const duration = Math.max(0.1, dial.playback.playDuration * remainingFraction);

      const anim = animate(relativePointerX, trackWidth, {
        duration,
        ease: 'linear',
        onUpdate: (latestX) => {
          if (trackWidth > 0) {
            const ratio = Math.max(0, Math.min(1, latestX / trackWidth));
            const day = Math.round(1 + ratio * (totalDays - 1));
            setDisplayDay(day);
            setCurrentDay(day);
            if (onDayChange) onDayChange(day);
          }
        },
        onComplete: () => {
          setIsPlaying(false);
          setCurrentDay(totalDays);
          setDisplayDay(totalDays);
          if (onDayChange) onDayChange(totalDays);
        },
      });

      playbackAnimationRef.current = anim;

      return () => {
        anim.stop();
      };
    } else {
      playbackAnimationRef.current?.stop();
      playbackAnimationRef.current = null;
    }
  }, [isPlaying, trackWidth, totalDays, dial.playback.playDuration, onDayChange, relativePointerX]);

  return (
    <div
      className="timeline-scrubber-container"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="slider"
      aria-label="Weight tracking timeline scrubber"
      aria-valuemin={endWeight}
      aria-valuemax={startWeight}
      aria-valuenow={displayWeight}
      aria-valuetext={`${displayWeight} lbs`}
    >
      {/* Centered Weight Image Morphing Stack */}
      {dial.morph.showVisual && (
        <WeightMorphViewer
          weight={displayWeight}
          weightMotion={continuousWeight}
          stageHeight={dial.morph.stageHeight}
          morphIntensity={dial.morph.morphIntensity}
          fadeBlur={dial.morph.fadeBlur}
        />
      )}

      {/* Main Interactive Track Area with macOS Scrubber Cursor */}
      <div
        className={`timeline-track-wrapper ${isHovered ? 'cursor-active' : ''}`}
        ref={trackRef}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* Needle Line & Synthetic Thumb Assembly */}
        <motion.div
          className={`timeline-needle-assembly ${isDragging ? 'is-dragging' : ''}`}
          style={{
            x: smoothNeedleX,
            height: `${dial.needle.height}px`,
          }}
        >
          {/* Floating Date Badge Pill directly anchored above needle top dot */}
          {dial.needle.showLabel && (
            <div className="day-indicator-badge">
              {displayDate}
            </div>
          )}

          {/* Top pin dot */}
          <div
            className="needle-dot"
            style={{ backgroundColor: dial.needle.activeColor }}
          />
          {/* Vertical needle bar */}
          <div
            className="needle-line"
            style={{
              backgroundColor: dial.needle.activeColor,
              width: `${dial.needle.width}px`,
            }}
          />
          {/* Synthetic Circular Thumb Element for easy grabbing and dragging */}
          {dial.thumb.show && (
            <div
              className="synthetic-circular-thumb"
              style={{
                width: `${dial.thumb.size}px`,
                height: `${dial.thumb.size}px`,
                backgroundColor: dial.thumb.background,
                border: `${dial.thumb.borderWidth}px solid ${dial.thumb.borderColor}`,
                boxShadow:
                  dial.thumb.shadow > 0
                    ? `0 2.5px ${dial.thumb.shadow}px rgba(0, 0, 0, ${dial.thumb.shadowOpacity})`
                    : 'none',
                backdropFilter: dial.thumb.blur > 0 ? `blur(${dial.thumb.blur}px)` : undefined,
                WebkitBackdropFilter:
                  dial.thumb.blur > 0 ? `blur(${dial.thumb.blur}px)` : undefined,
              }}
            >
              <svg
                className="thumb-arrows-svg"
                viewBox="0 0 20 14"
                width={dial.thumb.size * 0.46}
                height={dial.thumb.size * 0.32}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <polygon
                  points="3.5,7 8,3 8,11"
                  fill={dial.thumb.borderColor || dial.needle.activeColor}
                />
                <polygon
                  points="16.5,7 12,3 12,11"
                  fill={dial.thumb.borderColor || dial.needle.activeColor}
                />
              </svg>
            </div>
          )}
        </motion.div>

        {/* Ticks Row with live DialKit tuned wave animation */}
        <div className="timeline-ticks">
          {Array.from({ length: totalDays }, (_, i) => (
            <TimelineTick
              key={i + 1}
              dayIndex={i}
              totalDays={totalDays}
              trackWidth={trackWidth}
              relativePointerX={relativePointerX}
              baseHeight={dial.wave.baseHeight}
              peakHeight={dial.wave.peakHeight}
              waveRadius={dial.wave.waveRadius}
              stiffness={dial.wave.stiffness}
              damping={dial.wave.damping}
              activeColor={dial.needle.activeColor}
              mutedColor={dial.needle.mutedColor}
              onClick={(clickedDay) => updateDay(clickedDay)}
            />
          ))}
        </div>
      </div>

      {/* Labels Row */}
      {dial.playback.showBottomLabels && (
        <div className="timeline-labels">
          <span className="label-start">{dial.playback.startDate}</span>
          <span className="label-end">{dial.playback.endDate}</span>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div className="timeline-bottom-controls">
        <button
          type="button"
          className={`play-life-button ${isPlaying ? 'playing' : ''}`}
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg
              className="control-icon"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="currentColor"
            >
              <rect x="3.5" y="3" width="3" height="10" rx="1" />
              <rect x="9.5" y="3" width="3" height="10" rx="1" />
            </svg>
          ) : (
            <svg
              className="control-icon"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="currentColor"
            >
              <path d="M4.5 3.5V12.5L12.5 8L4.5 3.5Z" />
            </svg>
          )}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>
      </div>
    </div>
  );
};
