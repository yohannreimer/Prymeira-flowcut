export type FlowcutStep = 1 | 2 | 3 | 4 | 5;

export function buildYoutubeOAuthReturnTo({
  pathname,
  search,
  hash,
  projectId
}: {
  pathname: string;
  search: string;
  hash: string;
  projectId: string | null;
}): string {
  const params = new URLSearchParams(search);
  params.delete("youtube");
  if (projectId) {
    params.set("projectId", projectId);
  }
  params.set("flowcutStep", "publish");

  const nextSearch = params.toString();
  return `${pathname || "/"}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
}

export function getPreferredFlowcutStepFromSearch(search: string): FlowcutStep | null {
  const step = new URLSearchParams(search).get("flowcutStep");
  return step === "publish" ? 5 : null;
}
