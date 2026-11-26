import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListPageSkeleton } from '@/components/shared/list-page-skeleton';
import { TemplateDetail } from '@/features/catalogue/components/template-detail';

export const metadata: Metadata = { title: 'Specification template' };

export default function Page({
  params,
}: PageProps<'/catalogue/specifications/[id]'>) {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      {params.then(({ id }) => (
        <TemplateDetail id={id} />
      ))}
    </Suspense>
  );
}
