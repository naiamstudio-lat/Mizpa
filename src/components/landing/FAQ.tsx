import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function FAQ() {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const items = t('faq.items', { returnObjects: true }) as Array<{question: string; answer: string}>;

  return (
    <section className="py-24 px-10 max-w-[1100px] mx-auto" id="faq">
      <p className="text-[11px] font-medium tracking-[2px] uppercase text-mint mb-3">{t('faq.label')}</p>
      <h2 className="font-display text-[clamp(28px,4vw,44px)] font-extrabold tracking-tight leading-[1.1] mb-4">{t('faq.title')}</h2>

      <div className="mt-12 max-w-[700px]">
        {items.map((item, i) => (
          <div key={i} className="border-b border-white/[0.06] py-5">
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full text-left text-base font-medium cursor-pointer flex justify-between items-center gap-4 bg-transparent border-none text-cream"
            >
              {item.question}
              <span className="text-mint text-xl shrink-0">{openIndex === i ? '−' : '+'}</span>
            </button>
            {openIndex === i && (
              <p className="text-sm text-slate leading-relaxed mt-3">{item.answer}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}