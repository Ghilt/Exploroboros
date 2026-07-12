import './Tutorial.css'
import { useSyncExternalStore } from 'react'
import { chapterIdFromHash, hrefFor, tutorialChapterHref } from '../router/useHashRoute'
import { TUTORIAL_CHAPTERS } from '../data/tutorialChapters'
import { useTutorialProgress } from '../state/tutorialProgress'
import { TutorialChapter } from '../tutorial/TutorialChapter'

// The chapter id lives in the hash as #/tutorial/<id> (a sub-route of the tutorial route, like the
// gallery spotlight). Read via useSyncExternalStore so navigating between the landing and a chapter
// re-renders even though the top-level route stays 'tutorial'.
function useChapterId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb)
      return () => window.removeEventListener('hashchange', cb)
    },
    () => chapterIdFromHash(window.location.hash),
    () => null,
  )
}

export function Tutorial() {
  const chapterId = useChapterId()
  if (chapterId) return <TutorialChapter chapterId={chapterId} />
  return <TutorialLanding />
}

function TutorialLanding() {
  const progress = useTutorialProgress()
  return (
    <div className="tutorial-landing container">
      <header className="page-head">
        <p className="page-eyebrow">Learn</p>
        <h1 className="page-title">Tutorial</h1>
        <p className="page-lead">
          Short, hands-on chapters that build up the ideas behind Exploroboros, one small skill at a time,
          right inside the real canvas. Start with the basics and work your way up.
        </p>
      </header>

      <ul className="tut-chapter-list">
        {TUTORIAL_CHAPTERS.map((chapter, i) => {
          const done = progress.isComplete(chapter.id)
          return (
            <li key={chapter.id} className={`tut-chapter-card${chapter.available ? '' : ' is-soon'}`}>
              <div className="tut-chapter-num" aria-hidden="true">
                {done ? <span className="tut-chapter-check" title="Completed">✓</span> : i + 1}
              </div>
              <div className="tut-chapter-body">
                <h2 className="tut-chapter-title">
                  {chapter.title}
                  {done && <span className="tut-chapter-done-tag">Completed</span>}
                </h2>
                <p className="tut-chapter-blurb">{chapter.blurb}</p>
              </div>
              <div className="tut-chapter-action">
                {chapter.available ? (
                  <a className="btn btn-primary" href={tutorialChapterHref(chapter.id)}>
                    {done ? 'Replay' : 'Start'}
                  </a>
                ) : (
                  <span className="tut-chapter-soon">Coming soon</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <p className="tut-back">
        <a className="btn btn-ghost" href={hrefFor('canvas')}>
          Skip to the Canvas →
        </a>
      </p>
    </div>
  )
}
