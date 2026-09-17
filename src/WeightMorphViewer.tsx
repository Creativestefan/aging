import React, { useEffect, useMemo, useState } from 'react';
import { motion, MotionValue, useTransform, useMotionValueEvent } from 'motion/react';
import './WeightMorphViewer.css';

import img300 from './assets/weights/web/300lbs.png';
import img280 from './assets/weights/web/280lbs.png';
import img260 from './assets/weights/web/260lbs.png';
import img240 from './assets/weights/web/240lbs.png';
import img220 from './assets/weights/web/220lbs.png';
import img200 from './assets/weights/web/200lbs.png';
import img180 from './assets/weights/web/180lbs.png';
import img155 from './assets/weights/web/155lbs.png';
import img130 from './assets/weights/web/130lbs.png';

export interface WeightMilestone {
  weight: number;
  src: string;
}

export const WEIGHT_MILESTONES: WeightMilestone[] = [
  { weight: 300, src: img300 },
  { weight: 280, src: img280 },
  { weight: 260, src: img260 },
  { weight: 240, src: img240 },
  { weight: 220, src: img220 },
  { weight: 200, src: img200 },
  { weight: 180, src: img180 },
  { weight: 155, src: img155 },
  { weight: 130, src: img130 },
];

export interface WeightMorphViewerProps {
  /** Continuous weight value (can be a MotionValue or number) */
  weight?: number;
  weightMotion?: MotionValue<number>;
  /** Optional custom stage height */
  stageHeight?: number;
  /** Morph scale effect intensity (default 0.015) */
  morphIntensity?: number;
  /** Maximum blur as an image fades out (px, default 8) */
  fadeBlur?: number;
}

interface ImageLayerProps {
  milestone: WeightMilestone;
  index: number;
  weightMotion?: MotionValue<number>;
  currentWeight?: number;
  morphIntensity: number;
  fadeBlur: number;
}

/**
 * Individual milestone image layer.
 * Uses MotionValue transforms if weightMotion is provided for 120fps hardware acceleration,
 * or direct reactive style calculation if a plain number is passed.
 */
const MilestoneLayer: React.FC<ImageLayerProps> = ({
  milestone,
  index,
  weightMotion,
  currentWeight,
  morphIntensity,
  fadeBlur,
}) => {
  const prevMilestone = index > 0 ? WEIGHT_MILESTONES[index - 1] : null;
  const nextMilestone = index < WEIGHT_MILESTONES.length - 1 ? WEIGHT_MILESTONES[index + 1] : null;

  // Calculate opacity, scale, and blur for a given continuous weight W
  const calculateLayerState = (w: number) => {
    const targetW = milestone.weight;

    // Above target weight: blending with previous (heavier) milestone
    if (prevMilestone && w > targetW && w <= prevMilestone.weight) {
      const span = prevMilestone.weight - targetW;
      const t = (prevMilestone.weight - w) / span; // 0 at prev, 1 at target
      // Equal power crossfade
      const opacity = Math.sin((t * Math.PI) / 2);
      // Subtle scale morph as weight decreases
      const scale = 1.0 + (1 - t) * morphIntensity;
      const blur = fadeBlur > 0 ? (1 - opacity) * fadeBlur : 0;
      return { opacity, scale, blur, visible: true };
    }

    // Below target weight: blending with next (lighter) milestone
    if (nextMilestone && w < targetW && w >= nextMilestone.weight) {
      const span = targetW - nextMilestone.weight;
      const t = (targetW - w) / span; // 0 at target, 1 at next
      // Equal power crossfade
      const opacity = Math.cos((t * Math.PI) / 2);
      const scale = 1.0 - t * morphIntensity;
      const blur = fadeBlur > 0 ? (1 - opacity) * fadeBlur : 0;
      return { opacity, scale, blur, visible: true };
    }

    // Exact match or beyond edges
    if (index === 0 && w >= targetW) {
      return { opacity: 1, scale: 1, blur: 0, visible: true };
    }
    if (index === WEIGHT_MILESTONES.length - 1 && w <= targetW) {
      return { opacity: 1, scale: 1, blur: 0, visible: true };
    }

    return { opacity: 0, scale: 1, blur: fadeBlur, visible: false };
  };

  // If using Framer Motion MotionValue
  const motionOpacity = useTransform(weightMotion || new MotionValue(300), (w) => {
    return calculateLayerState(w).opacity;
  });

  const motionScale = useTransform(weightMotion || new MotionValue(300), (w) => {
    return calculateLayerState(w).scale;
  });

  const motionFilter = useTransform(weightMotion || new MotionValue(300), (w) => {
    const b = calculateLayerState(w).blur;
    return b > 0.05 ? `blur(${b.toFixed(1)}px)` : 'none';
  });

  // If using direct numeric weight
  const numericState = useMemo(() => {
    if (currentWeight !== undefined) {
      return calculateLayerState(currentWeight);
    }
    return null;
  }, [currentWeight, index, morphIntensity, fadeBlur]);

  if (weightMotion) {
    return (
      <motion.img
        src={milestone.src}
        alt={`${milestone.weight} lbs milestone`}
        className="weight-morph-image"
        style={{
          opacity: motionOpacity,
          scale: motionScale,
          filter: motionFilter,
        }}
        draggable={false}
      />
    );
  }

  if (numericState) {
    return (
      <img
        src={milestone.src}
        alt={`${milestone.weight} lbs milestone`}
        className="weight-morph-image"
        style={{
          opacity: numericState.opacity,
          transform: `scale(${numericState.scale})`,
          filter: numericState.blur > 0.05 ? `blur(${numericState.blur.toFixed(1)}px)` : 'none',
          display: numericState.visible ? 'block' : 'none',
        }}
        draggable={false}
      />
    );
  }

  return null;
};

export const WeightMorphViewer: React.FC<WeightMorphViewerProps> = ({
  weight = 300,
  weightMotion,
  stageHeight = 420,
  morphIntensity = 0.004,
  fadeBlur = 1,
}) => {
  const [currentDisplayWeight, setCurrentDisplayWeight] = useState<number>(() => {
    if (weightMotion) {
      return Math.round(weightMotion.get());
    }
    return Math.round(weight);
  });

  useMotionValueEvent(weightMotion || new MotionValue(weight), 'change', (latest) => {
    setCurrentDisplayWeight(Math.round(latest));
  });

  useEffect(() => {
    if (!weightMotion) {
      setCurrentDisplayWeight(Math.round(weight));
    }
  }, [weight, weightMotion]);

  // Preload all 9 web-optimized images on mount for instant zero-lag scrubbing
  useEffect(() => {
    WEIGHT_MILESTONES.forEach((item) => {
      const img = new Image();
      img.src = item.src;
    });
  }, []);

  return (
    <section className="weight-morph-container" aria-label="Weight progression visualizer">
      <div
        className="weight-morph-stage"
        style={{ height: `${stageHeight}px`, maxHeight: `${stageHeight}px` }}
      >
        {WEIGHT_MILESTONES.map((milestone, idx) => (
          <MilestoneLayer
            key={milestone.weight}
            milestone={milestone}
            index={idx}
            weightMotion={weightMotion}
            currentWeight={weightMotion ? undefined : weight}
            morphIntensity={morphIntensity}
            fadeBlur={fadeBlur}
          />
        ))}
      </div>
      <div className="weight-display-label" aria-live="polite">
        {currentDisplayWeight} lbs
      </div>
    </section>
  );
};

export default WeightMorphViewer;
