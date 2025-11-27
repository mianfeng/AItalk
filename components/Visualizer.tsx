import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  amplitude: number; // 0 to 1
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive, amplitude }) => {
  const bars = 5;
  
  return (
    <div className="flex items-center justify-center gap-2 h-32 w-full">
      {isActive ? (
        Array.from({ length: bars }).map((_, i) => (
          <Bar key={i} amplitude={amplitude} index={i} />
        ))
      ) : (
        <div className="text-slate-500 font-medium text-lg animate-pulse">
          准备连接...
        </div>
      )}
    </div>
  );
};

const Bar: React.FC<{ amplitude: number; index: number }> = ({ amplitude, index }) => {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (ref.current) {
        // Create a unique movement pattern for each bar based on the amplitude
        const minHeight = 20;
        const maxHeight = 120;
        // Randomize sensitivity slightly per bar for organic look
        const sensitivity = 0.5 + (index % 3) * 0.2; 
        const targetHeight = minHeight + (amplitude * 500 * sensitivity); // Amplify the small RMS value
        const clampedHeight = Math.min(maxHeight, Math.max(minHeight, targetHeight));
        
        ref.current.style.height = `${clampedHeight}px`;
    }
  }, [amplitude, index]);

  return (
    <div
      ref={ref}
      className="w-4 bg-gradient-to-t from-blue-500 to-cyan-400 rounded-full transition-[height] duration-75 ease-out shadow-[0_0_15px_rgba(56,189,248,0.5)]"
      style={{ height: '20px' }}
    />
  );
};