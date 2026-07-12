// The tutorial's table of contents — pure metadata driving the Tutorial landing page's chapter cards.
// A chapter's guided walkthrough (the step script) lives in src/tutorial/, keyed by the same `id`, so
// this file has no dependency on the tutorial machinery (and stays trivially testable). Add a chapter
// by appending here + adding its script in src/tutorial/script.ts (and flipping `available` on).

export type TutorialChapterMeta = {
  id: string
  title: string
  // A one-line teaser shown on the card.
  blurb: string
  // Available chapters link into their walkthrough; not-yet-built ones show as a disabled "coming soon".
  available: boolean
}

export const TUTORIAL_CHAPTERS: ReadonlyArray<TutorialChapterMeta> = [
  {
    id: 'basic-traverser',
    title: 'Basic traverser',
    blurb: 'Build your first walker, place it on the plane, and watch it split and grow.',
    available: true,
  },
  {
    id: 'colorings',
    title: 'Colorings',
    blurb: 'Turn a pattern’s data into colour with ramps, rules, and the palette that made those rings.',
    available: false,
  },
]
