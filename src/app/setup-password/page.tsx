import { Suspense } from 'react';
import { SetupPasswordPage } from '@/components/SetupPasswordPage';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense>
      <SetupPasswordPage />
    </Suspense>
  );
}
