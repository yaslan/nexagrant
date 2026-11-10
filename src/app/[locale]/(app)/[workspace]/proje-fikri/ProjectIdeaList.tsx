import { getLocale, getTranslations } from 'next-intl/server';
import type { ProjectIdeaView } from '@/lib/project-ideas/records';

/**
 * Saved project ideas, one row each (NG-14 item 4). The rows come from NG-38's
 * `listProjectIdeas`. The per-call score is NG-38's read path too, but NG-38 has no
 * score field yet: the score cell says so instead of showing a number.
 */
export default async function ProjectIdeaList({ ideas }: { ideas: ProjectIdeaView[] }) {
  const t = await getTranslations('projectIdea');
  const locale = await getLocale();
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <section aria-labelledby="project-idea-list-heading" className="space-y-3">
      <h2 id="project-idea-list-heading" className="text-lg font-semibold text-ink">
        {t('listHeading')}
      </h2>

      {ideas.length === 0 ? (
        <p className="text-xs text-ink-2">{t('listEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-ink">
                <th scope="col" className="py-2 pr-3 font-semibold">{t('listColTitle')}</th>
                <th scope="col" className="py-2 pr-3 font-semibold">{t('listColTrl')}</th>
                <th scope="col" className="py-2 pr-3 font-semibold">{t('listColPrograms')}</th>
                <th scope="col" className="py-2 pr-3 font-semibold">{t('listColCreated')}</th>
                <th scope="col" className="py-2 font-semibold">{t('listColScore')}</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((idea) => (
                <tr key={idea.id} className="border-b border-border align-top text-ink-2">
                  <td className="py-2 pr-3 text-ink">{idea.title}</td>
                  <td className="py-2 pr-3">{t('trlOption', { n: idea.trl })}</td>
                  <td className="py-2 pr-3">
                    {idea.targetPrograms.map((p) => t(`program_${p}`)).join(', ')}
                  </td>
                  <td className="py-2 pr-3">
                    <time dateTime={idea.createdAt.toISOString()}>
                      {dateFormat.format(idea.createdAt)}
                    </time>
                  </td>
                  <td className="py-2">{t('listScoreUnavailable')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
