import { SectionLabel } from './SectionLabel'

// The exploded view. Each of the instrument's four gears is labelled with
// one of the model's factor groups (names and feature counts come from
// ml/model_meta.json via lib/site/modelFacts); the copy walks through them
// one beat at a time while the movement turns.

export interface MethodGroup {
  name: string
  description: string
  features: number
}

export function Method({ groups, featureCount }: { groups: MethodGroup[]; featureCount: number }) {
  return (
    <div id="method" data-mark="method" className="frame relative min-h-[230svh] scroll-mt-0 pb-[18svh] pt-[78svh] sm:pt-[16svh]">
      <div className="grid grid-cols-12 gap-x-[var(--gutter)]">
        <div className="col-span-12 -mx-[var(--gutter)] bg-background px-[var(--gutter)] py-6 sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 lg:col-span-5">
          <SectionLabel index="03" name="Method" aside={`${featureCount} features, ${groups.length} groups`} />
          <h2 data-lines className="t-headline mt-8 text-[clamp(2.7rem,5.2vw,5.75rem)] text-text">
            <span className="lm">
              <span>Four factor</span>
            </span>
            <span className="lm">
              <span style={{ ['--d' as string]: '70ms' }}>groups, straight</span>
            </span>
            <span className="lm">
              <span style={{ ['--d' as string]: '140ms' }}>from the model.</span>
            </span>
          </h2>
          <p data-reveal className="t-body mt-8 max-w-[40ch] text-muted">
            {featureCount} features, grouped exactly the way the model uses them. These are its
            actual feature groups, not marketing categories, and every score response breaks its
            result down along the same four lines.
          </p>

          <ol className="mt-[24svh] space-y-[13svh]">
            {groups.map((g, i) => (
              <li key={g.name} data-reveal className="relative pt-4">
                <span className="absolute inset-x-0 top-0 h-px bg-text/25" aria-hidden />
                <div className="flex items-baseline gap-4">
                  <span className="t-label text-accent">0{i + 1}</span>
                  <h3 className="t-headline text-[1.9rem] text-text">{g.name}</h3>
                  <span className="t-label ml-auto whitespace-nowrap text-muted">{g.features} features</span>
                </div>
                <p className="t-body mt-3 max-w-[42ch] text-muted">{g.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
