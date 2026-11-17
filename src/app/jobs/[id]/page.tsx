import { notFound } from "next/navigation";
import { connection } from "next/server";
import JobView from "@/components/JobView";
import { getJob, listArtifacts, publicJob } from "@/lib/db";

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  await connection();
  const { id } = await params;
  const job = getJob(id);
  if (!job) notFound();
  const artifacts = listArtifacts(id, job.version).map((a) => ({ name: a.name, bytes: a.bytes, version: a.version }));
  return <JobView initial={{ job: publicJob(job), artifacts }} />;
}
