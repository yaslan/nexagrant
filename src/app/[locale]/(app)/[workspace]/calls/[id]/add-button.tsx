'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { createOpportunity } from '../../pipeline/actions';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';

export default function AddToPipelineButton({
  workspace,
  locale,
  title,
  topicId,
  buttonLabel,
  addingLabel,
  errorLabel,
}: {
  workspace: string;
  locale: string;
  title: string;
  topicId: string;
  buttonLabel: string;
  addingLabel: string;
  errorLabel: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const errorText = useActionErrorText();

  const handleAddToPipeline = async () => {
    setIsPending(true);
    setAddError(null);
    try {
      await createOpportunity({ workspaceSlug: workspace, title, topicId });
      router.push(`/${locale}/${workspace}/firsatlar`);
    } catch (e) {
      console.error(e);
      setAddError(errorText(e, errorLabel));
      setIsPending(false);
    }
  };

  return (
    <div>
      {addError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 mb-4"
        >
          {addError}
        </div>
      )}
      <button
        disabled={isPending}
        onClick={handleAddToPipeline}
        className="bg-accent hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition shadow-2xs shrink-0 text-xs sm:text-sm"
      >
        {isPending ? addingLabel : buttonLabel}
      </button>
    </div>
  );
}
