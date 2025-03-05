import gitlog from "npm:gitlog";
import { resolve } from "@std/path";
import { ensureDir } from "jsr:@std/fs";

for await (const org of Deno.readDir("repos")) {
  if (!org.isDirectory) continue;

  for await (const repo of Deno.readDir(resolve("repos", org.name))) {
    if (!org.isDirectory) continue;

    console.info("Processing repository", repo.name);

    const path = resolve("repos", org.name, repo.name);
    const glog = await gitlog({
      repo: path,
      number: 1_000_000, // as many as we can
      fields: [
        // "abbrevHash",
        "hash",
        // "subject",
        // "authorName",
        "authorDate",
        "authorEmail",
      ],
      all: true,
    });

    type AugmentedGlog = ((typeof glog)[number] & { contributions: number })[];

    for (const commit of glog) {
      const contributions = await new Deno.Command("git", {
        args: ["show", "--stat", commit.hash],
        cwd: path,
      })
        .output()
        .then(({ stdout }) => {
          const text = new TextDecoder().decode(stdout);
          const result = /(\d+) insertion/.exec(text);
          if (!result) {
            return 0;
          }

          return parseInt(result[1]);
        });

      (commit as AugmentedGlog[number]).contributions = contributions;
    }

    await ensureDir(resolve("glogs", org.name));
    await Deno.writeTextFile(
      resolve("glogs", org.name, repo.name + ".json"),
      JSON.stringify(glog, null, 2)
    );
  }
}
