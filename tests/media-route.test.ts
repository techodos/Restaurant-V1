import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/media/[...path]/route";

const dir = path.join(process.cwd(), ".uploads", "test-restaurant");
const get = (...segments: string[]) => GET(new Request("http://x"), { params: Promise.resolve({ path: segments }) });

beforeAll(async () => {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "a.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await writeFile(path.join(dir, "notes.txt"), "secret");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("local media route", () => {
  it("serves a stored image with its type", async () => {
    const res = await get("test-restaurant", "a.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("never serves files outside .uploads or anything that is not an image", async () => {
    expect((await get("..", "package.json")).status).toBe(404);
    expect((await get("..", "..", "etc", "passwd.png")).status).toBe(404);
    expect((await get("test-restaurant", "notes.txt")).status).toBe(404);
    expect((await get("test-restaurant", "missing.png")).status).toBe(404);
  });
});
