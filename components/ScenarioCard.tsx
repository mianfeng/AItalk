import React from 'react';
import { Scenario } from '../types';
import { ArrowRight } from 'lucide-react';

interface ScenarioCardProps {
  scenario: Scenario;
  isSelected: boolean;
  onSelect: (scenario: Scenario) => void;
}

export const ScenarioCard: React.FC<ScenarioCardProps> = ({ scenario, isSelected, onSelect }) => {
  return (
    <button
      onClick={() => onSelect(scenario)}
      className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group relative overflow-hidden ${
        isSelected
          ? 'bg-blue-600/20 border-blue-500/50 ring-1 ring-blue-500'
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          <div className="text-2xl p-2 bg-slate-900/50 rounded-lg">{scenario.icon}</div>
          <div>
            <h3 className={`font-semibold ${isSelected ? 'text-blue-200' : 'text-slate-200'}`}>
              {scenario.title}
            </h3>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
              {scenario.description}
            </p>
          </div>
        </div>
      </div>
      
      {isSelected && (
        <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-500" />
      )}
    </button>
  );
};
