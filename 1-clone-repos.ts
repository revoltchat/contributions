import "jsr:@std/dotenv/load";

import { exists, ensureDir } from "jsr:@std/fs";
import { resolve } from "jsr:@std/path/resolve";
import { simpleGit } from "npm:simple-git";

const ORGS = ["revoltchat", "authifier"];

const IGNORE_REPO = [
  "mutiny",
  "themes",
  "translations",
  "backend-ghsa-v23v-m5mf-74jg",
];

if (import.meta.main) {
  for (const org of ORGS) {
    const list = await fetch(
      `https://api.github.com/orgs/${org}/repos?type=sources&per_page=100`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${Deno.env.get("GH_TOKEN")}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    )
      .then((res) => res.json() as Promise<{ name: string }[]>)
      .then((list) =>
        list.map(({ name }) => ({
          name,
          cwd: resolve("repos", org),
          path: resolve("repos", org, name),
        }))
      );

    for (const { name, cwd, path } of list) {
      if (IGNORE_REPO.includes(name)) continue;
      console.info("Cloning repository", name);

      if (await exists(path)) {
        await simpleGit(path).pull();
      } else {
        await ensureDir(cwd);
        await simpleGit(cwd).clone(`https://github.com/${org}/${name}.git`);
      }
    }
  }
}
