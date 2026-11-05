import { Logo } from '@/components/Logo';
import { LeadForm } from '@/components/LeadForm';

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy-900 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5">
        <div className="mx-auto flex max-w-[440px] justify-center px-4">
          <Logo />
        </div>
      </header>

      <main className="relative flex-1">
        <div className="smartgrid pointer-events-none absolute inset-x-0 top-0 h-64" aria-hidden="true" />
        <div className="relative mx-auto max-w-[440px] px-4 pt-8 pb-10">
          <LeadForm />
        </div>
      </main>

      <footer className="bg-navy-900 px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
        <p className="text-balance text-[10px] font-bold tracking-[0.05em] text-white uppercase sm:text-[11px] sm:tracking-[0.12em]">
          Mattress | Chair | Recliner Bed | Recliner Sofa | Pillow
        </p>
        <p className="mt-1.5 text-xs text-aqua-200">thesleepcompany.in</p>
      </footer>
    </div>
  );
}
