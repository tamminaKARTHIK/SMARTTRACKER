import React from 'react';

export interface Bus {
  id: string;
  bus_number: string;
  route_name: string;
  start_location: string;
  destination: string;
  status: 'Running' | 'Idle' | string;
  location_available: boolean;
}

interface BusListProps {
  buses: Bus[];
  activeBusId: string | null;
  hasAccess: boolean;
  onSelectBus: (bus: Bus) => void;
  isConnecting: boolean;
}

export const BusList: React.FC<BusListProps> = ({
  buses,
  activeBusId,
  hasAccess,
  onSelectBus,
  isConnecting
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-[#1b1f3c] pb-3">
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest pb-0.5">
          Available Fleet
        </h3>
        <span className="bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold shadow-[0_0_6px_rgba(99,102,241,0.1)]">
          {buses.length} Vehicles
        </span>
      </div>

      {buses.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <p className="text-2xl mb-2">🚌</p>
          <p className="text-sm">No buses registered in the system.</p>
        </div>
      ) : (
        <div className="grid gap-4 max-h-[480px] overflow-y-auto pr-1">
          {buses.map((bus) => {
            const isActive = activeBusId === bus.id;
            const isRunning = bus.status.toLowerCase() === 'running';

            return (
              <div
                key={bus.id}
                className={`rounded-2xl p-4 transition-all duration-300 ${
                  isActive ? 'card-glass-active' : 'card-glass'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="bg-amber-400 text-slate-950 font-black font-mono text-[10px] px-2.5 py-1 rounded-lg shadow-[0_0_8px_rgba(251,191,36,0.15)] select-none">
                      BUS-{bus.bus_number}
                    </span>
                    <h4 className="text-slate-100 font-extrabold mt-3 text-sm tracking-tight">{bus.route_name}</h4>
                  </div>
                  
                  <div className={`flex items-center gap-1.5 border px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase select-none ${
                    isRunning 
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400' 
                      : 'bg-amber-950/40 border-amber-500/30 text-amber-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]' : 'bg-amber-400'}`}></span>
                    {bus.status}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mt-4 mb-4">
                  <div>
                    <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">START</span>
                    <p className="font-extrabold text-slate-50 mt-0.5 tracking-tight">{bus.start_location}</p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">DESTINATION</span>
                    <p className="font-extrabold text-slate-50 mt-0.5 tracking-tight">{bus.destination}</p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => onSelectBus(bus)}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    isActive && hasAccess
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-100 shadow-lg shadow-emerald-600/35 border border-emerald-500/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-slate-100 shadow-lg shadow-indigo-600/35 border border-indigo-500/30'
                  }`}
                >
                  {isActive && hasAccess ? (
                    <>
                      <span>📡</span> Live Tracking Active
                    </>
                  ) : (
                    <>
                      <span>🔑</span> Pay to Track
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
