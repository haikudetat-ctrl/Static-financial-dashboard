import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
      <section className="relative hidden overflow-hidden bg-[#20241f] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:32px_32px] opacity-20" />
        <div className="relative">
          <BrandMark inverse />
        </div>
        <div className="relative max-w-xl">
          <p className="mb-5 font-mono text-[11px] tracking-[0.16em] text-[#e5a36d] uppercase">
            Operational truth, one source
          </p>
          <h1 className="max-w-lg text-5xl leading-[0.98] font-semibold tracking-[-0.055em]">
            Know what the bar costs to run.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[#c7cbc4]">
            Purchasing, inventory, recipes, and financial health connected from
            source document to final number.
          </p>
        </div>
        <p className="relative font-mono text-[10px] tracking-[0.14em] text-[#858c82] uppercase">
          Built for floor-first hospitality teams
        </p>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:bg-[var(--surface)]">
        <div className="w-full max-w-[420px]">
          <div className="mb-12 lg:hidden">
            <BrandMark />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
