import { ProfileForm } from './components/ProfileForm';
import { UploadForm } from './components/UploadForm';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">MedBill Checker</h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">
          Upload your medical bill and your insurer&apos;s Explanation of Benefits (EOB). We&apos;ll point out charges
          worth a second look and help you ask about them.
        </p>
      </header>
      <ProfileForm />
      <UploadForm />
      <p className="text-sm text-neutral-500">Demo build. Uses synthetic sample documents only.</p>
    </main>
  );
}
