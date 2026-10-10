import React from 'react';
import { Building2, PhoneCall, MapPin, Navigation, AlertTriangle } from 'lucide-react';
import { useOnline } from '@/lib/useOffline';
import { areaLabel, mapsDirectionsUrl, mapsEmbedUrl, mapsOpenUrl, referralFor, telHref, type Hospital } from '@/lib/hospitals';
import { useI18n } from '@/lib/i18n';

function PhoneLines({ hospital, big }: { hospital: Hospital; big?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      {hospital.phones.map((p) => {
        const href = telHref(p);
        if (!href) {
          return (
            <div key={p} className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {t('The number on file ({phone}) looks incomplete and cannot be dialled. Use the Komfo Anokye Teaching Hospital line instead:', { phone: p })} <b>+233 556 490 029</b>.
              </span>
            </div>
          );
        }
        return big ? (
          <a key={p} href={href} className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-xl font-bold flex items-center justify-center space-x-3 shadow-lg shadow-red-600/30 active:scale-95 transition">
            <PhoneCall className="w-5 h-5" />
            <span>{t('Call now ({phone})', { phone: p })}</span>
          </a>
        ) : (
          <a key={p} href={href} className="inline-flex items-center space-x-1.5 text-xs font-bold text-brand hover:underline mr-3">
            <PhoneCall className="w-3.5 h-3.5" />
            <span>{p}</span>
          </a>
        );
      })}
    </div>
  );
}

export const ReferralCard: React.FC<{ areaId: string | null | undefined; childArea?: boolean }> = ({ areaId }) => {
  const { t } = useI18n();
  const { primary, reason, reasonVars, alternatives } = referralFor(areaId);
  const where = areaLabel(areaId);
  const online = useOnline();

  return (
    <div className="bg-white border-2 border-red-200 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-start space-x-3">
        <Building2 className="w-8 h-8 text-brand flex-shrink-0 mt-1" />
        <div>
          <span className="text-[10px] font-bold bg-blue-100 text-brand px-2 py-0.5 rounded-full uppercase">
            {t('Refer to')} · {t(reason, reasonVars)}
          </span>
          <h3 className="text-lg font-bold text-slate-900 leading-snug mt-1">{primary.name}</h3>
          <p className="text-xs text-slate-500">{primary.area}{where ? ` · ${t('child lives in {place}', { place: where })}` : ''}</p>
        </div>
      </div>

      <PhoneLines hospital={primary} big />

      {online ? (
        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
          <iframe
            title={t('Map of {name}', { name: primary.name })}
            src={mapsEmbedUrl(primary)}
            className="w-full h-48 border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs p-3">{t('The map needs internet. Use the phone number above, or tap Directions once you have signal.')}</div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a href={mapsOpenUrl(primary)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center space-x-1.5 border border-slate-300 rounded-xl py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50">
          <MapPin className="w-4 h-4" />
          <span>{t('Open in Maps')}</span>
        </a>
        <a href={mapsDirectionsUrl(primary)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center space-x-1.5 bg-brand hover:bg-brand-dark text-white rounded-xl py-2.5 text-sm font-bold">
          <Navigation className="w-4 h-4" />
          <span>{t('Directions')}</span>
        </a>
      </div>

      {alternatives.length > 0 && (
        <div className="pt-1 space-y-2">
          <p className="text-xs font-black text-slate-700 uppercase tracking-wide">{t('Other options')}</p>
          {alternatives.map((h) => (
            <div key={h.id} className="border border-slate-200 rounded-xl p-3 space-y-1.5">
              <p className="text-sm font-bold text-slate-900">{h.name}</p>
              <p className="text-xs text-slate-500">{h.area}{h.specialist ? ` · ${t('sickle cell centre')}` : ''}</p>
              <div className="flex flex-wrap items-center gap-y-1">
                <PhoneLines hospital={h} />
                <a href={mapsDirectionsUrl(h)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-700 hover:underline">
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{t('Directions')}</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
