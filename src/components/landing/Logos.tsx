import { useTranslation } from 'react-i18next';

export function Logos() {
  const { t } = useTranslation();

  const logos = ['Agencia Digital', 'Marketing Pro', 'Growth Labs', 'WebStudio', 'Pyme Digital'];

  return (
    <div className="py-12 px-10 text-center border-t border-white/5">
      <p className="text-xs text-slate tracking-[1.5px] uppercase mb-7">{t('logos.label')}</p>
      <div className="flex gap-10 justify-center items-center flex-wrap">
        {logos.map((logo) => (
          <span key={logo} className="text-sm font-semibold text-white/20 tracking-wider uppercase">
            {logo}
          </span>
        ))}
      </div>
    </div>
  );
}