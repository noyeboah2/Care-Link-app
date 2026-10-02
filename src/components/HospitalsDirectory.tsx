import React, { useState } from 'react';
import { PhoneCall, MapPin, Navigation, AlertTriangle, Search } from 'lucide-react';
import { HOSPITALS, mapsDirectionsUrl, mapsOpenUrl, telHref } from '@/lib/hospitals';

export const HospitalsDirectory: React.FC = () => {
  const [q, setQ] = useState('');
  const list = HOSPITALS.filter((h) => `${h.name} ${h.area}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900">Referral hospitals</h1>
        <p className="text-sm text-slate-500">Call or get directions. High-risk screenings recommend the hospital that serves the child’s location.</p>
      </div>
      <div className="relative">
        <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by hospital or town..."
          className="w-full bg-white border border-slate-200 pl-11 pr-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none"
        />
      </div>

      {list.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No hospitals match your search.</p>}

      <ul className="space-y-3">
        {list.map((h) => (
          <li key={h.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
            <div>
              <p className="font-bold text-slate-900">
                {h.name}
                {h.specialist && <span className="ml-2 text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full align-middle">SICKLE CELL CENTRE</span>}
              </p>
              <p className="text-xs text-slate-500 flex items-center space-x-1"><MapPin className="w-3.5 h-3.5" /><span>{h.area}</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              {h.phones.map((p) => {
                const href = telHref(p);
                return href ? (
                  <a key={p} href={href} className="inline-flex items-center space-x-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-lg">
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>{p}</span>
                  </a>
                ) : (
                  <span key={p} className="inline-flex items-center space-x-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold px-3 py-2 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{p} (number looks incomplete; confirm before use)</span>
                  </span>
                );
              })}
              <a href={mapsOpenUrl(h)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1.5 border border-slate-300 text-slate-800 text-xs font-bold px-3 py-2 rounded-lg hover:bg-slate-50">
                <MapPin className="w-3.5 h-3.5" />
                <span>Map</span>
              </a>
              <a href={mapsDirectionsUrl(h)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold px-3 py-2 rounded-lg">
                <Navigation className="w-3.5 h-3.5" />
                <span>Directions</span>
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
