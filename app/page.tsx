export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">MedBill Checker</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-400">
        Compare a medical bill with your insurer&apos;s Explanation of Benefits, spot charges worth
        questioning, and send a polite dispute letter.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-neutral-700 dark:text-neutral-300">
        <li>Upload your bill and EOB. Personal details are removed on your device.</li>
        <li>Review the items flagged for a second look.</li>
        <li>Edit and approve the letter. We mail it for you.</li>
      </ol>
      <p className="text-sm text-neutral-500">Demo build. Uses synthetic sample documents only.</p>
    </main>
  );
}
