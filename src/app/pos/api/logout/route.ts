import { posResponse, signOutPosSession } from "@/web/pos";

export function POST(): Promise<Response> {
  return posResponse(async () => {
    await signOutPosSession();
    return { signedOut: true };
  });
}
