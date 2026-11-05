'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import ThemeToggle from '@/components/ThemeToggle';
import { Badge, Status } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Table, Td, Th } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';

const SAMPLE_TOTAL_PAGES = 3;

function Section({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="space-y-3">
      <h2 className="font-heading text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemPreview({ locale }: { locale: string }) {
  const t = useTranslations('adminDesignSystem');
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedChip, setSelectedChip] = useState(true);
  const [removableChip, setRemovableChip] = useState(true);

  return (
    <div className="mx-auto max-w-4xl space-y-8" data-testid="design-system-preview">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('intro')}</p>
        </div>
        <ThemeToggle variant="segmented" locale={locale} />
      </header>

      <Section title={t('buttons')} testId="ds-buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t('primary')}</Button>
          <Button variant="secondary">{t('secondary')}</Button>
          <Button variant="danger">{t('danger')}</Button>
          <Button variant="ghost">{t('ghost')}</Button>
          <Button size="sm">{t('small')}</Button>
          <Button disabled>{t('disabled')}</Button>
        </div>
      </Section>

      <Section title={t('inputs')} testId="ds-inputs">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('inputLabel')} hint={t('inputHint')} placeholder={t('inputPlaceholder')} />
          <Input label={t('inputErrorLabel')} error={t('inputError')} />
        </div>
      </Section>

      <Section title={t('cards')} testId="ds-cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-ink">{t('cardTitle')}</h3>
            <p className="mt-1 text-sm text-muted">{t('cardBody')}</p>
          </Card>
          <Card>
            <Status tone="ok">{t('statusOk')}</Status>
            <p className="mt-1 text-sm text-muted">{t('cardBody')}</p>
          </Card>
        </div>
      </Section>

      <Section title={t('table')} testId="ds-table">
        <Table caption={t('tableCaption')}>
          <thead>
            <tr>
              <Th>{t('tableName')}</Th>
              <Th>{t('tableOwner')}</Th>
              <Th>{t('tableStatus')}</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>{t('rowA')}</Td>
              <Td>{t('rowOwner')}</Td>
              <Td>
                <Status tone="ok">{t('statusOk')}</Status>
              </Td>
            </tr>
            <tr>
              <Td>{t('rowB')}</Td>
              <Td>{t('rowOwner')}</Td>
              <Td>
                <Status tone="warn">{t('statusWarn')}</Status>
              </Td>
            </tr>
            <tr>
              <Td>{t('rowC')}</Td>
              <Td>{t('rowOwner')}</Td>
              <Td>
                <Status tone="bad">{t('statusBad')}</Status>
              </Td>
            </tr>
          </tbody>
        </Table>
      </Section>

      <Section title={t('chips')} testId="ds-chips">
        <div className="flex flex-wrap items-center gap-2">
          <Chip selected={selectedChip} onClick={() => setSelectedChip((value) => !value)}>
            {t('chipToggle')}
          </Chip>
          <Chip>{t('chipStatic')}</Chip>
          {removableChip && (
            <Chip onRemove={() => setRemovableChip(false)} removeLabel={t('chipRemove')}>
              {t('chipRemovable')}
            </Chip>
          )}
        </div>
      </Section>

      <Section title={t('badges')} testId="ds-badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{t('badgeNeutral')}</Badge>
          <Badge tone="accent">{t('badgeAccent')}</Badge>
          <Badge tone="ok">{t('statusOk')}</Badge>
          <Badge tone="warn">{t('statusWarn')}</Badge>
          <Badge tone="bad">{t('statusBad')}</Badge>
        </div>
      </Section>

      <Section title={t('status')} testId="ds-status">
        <div className="flex flex-wrap items-center gap-6">
          <Status tone="ok">{t('statusOk')}</Status>
          <Status tone="warn">{t('statusWarn')}</Status>
          <Status tone="bad">{t('statusBad')}</Status>
        </div>
      </Section>

      <Section title={t('modal')} testId="ds-modal">
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          {t('modalOpen')}
        </Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={t('modalTitle')}
          closeLabel={t('modalClose')}
          footer={<Button onClick={() => setModalOpen(false)}>{t('modalConfirm')}</Button>}
        >
          {t('modalBody')}
        </Modal>
      </Section>

      <Section title={t('tabs')} testId="ds-tabs">
        <Tabs
          label={t('tabs')}
          items={[
            { id: 'one', label: t('tabOne'), content: t('tabOneBody') },
            { id: 'two', label: t('tabTwo'), content: t('tabTwoBody') },
            { id: 'three', label: t('tabThree'), content: t('tabThreeBody') },
          ]}
        />
      </Section>

      <Section title={t('pagination')} testId="ds-pagination">
        <Pagination
          page={page}
          totalPages={SAMPLE_TOTAL_PAGES}
          onPageChange={setPage}
          label={t('pagination')}
          previousLabel={t('previous')}
          nextLabel={t('next')}
        />
      </Section>
    </div>
  );
}
