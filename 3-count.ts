import { resolve } from "@std/path";

import type gitlog from "npm:gitlog";

import contributors from "./contributors.json" with { type: "json" };

type AugmentedGlog = (Awaited<
  ReturnType<typeof gitlog<"hash" | "authorDate" | "authorEmail">>
>[number] & {
  contributions: number;
})[];

// data we want to extract
let total = 0;
const contribsByEmail: Record<string, AugmentedGlog> = {};

// load all data and map to structures
for await (const org of Deno.readDir("glogs")) {
  if (!org.isDirectory) continue;

  for await (const repoGlog of Deno.readDir(resolve("glogs", org.name))) {
    if (!repoGlog.isFile) continue;

    const data = await Deno.readTextFile(
      resolve("glogs", org.name, repoGlog.name)
    ).then((d) => JSON.parse(d) as AugmentedGlog);

    for (const commit of data) {
      if (contributors.ignore.includes(commit.authorEmail)) continue;

      // contribsByEmail[commit.authorEmail] =
      //   (contribsByEmail[commit.authorEmail] || 0) + commit.contributions;

      if (!contribsByEmail[commit.authorEmail])
        contribsByEmail[commit.authorEmail] = [];

      contribsByEmail[commit.authorEmail].push(commit);
      total += commit.contributions;
    }
  }
}

// collect into email addresses
const entries = Object.keys(contribsByEmail)
  .map((email) => ({
    email,
    contributions: contribsByEmail[email].reduce(
      (acc, v) => acc + v.contributions,
      0
    ),
    commits: contribsByEmail[email],
  }))
  .sort((a, b) => b.contributions - a.contributions);

// map to Revolt IDs
const unclaimed: string[] = [],
  mapped: Record<string, number> = {},
  entriesById: Record<string, AugmentedGlog> = {};

entries
  .map(({ email, contributions, commits }) => ({
    email,
    id: contributors.ids[email as never],
    contributions,
    commits,
  }))
  .forEach(({ email, id, contributions, commits }) => {
    if (id) {
      if (!mapped[id]) mapped[id] = 0;
      mapped[id] += contributions;

      entriesById[id] = [...(entriesById[id] ?? []), ...commits];
    } else {
      unclaimed.push(email);
    }
  });

// sort again
const output_claimed = Object.keys(mapped)
  .map((id) => ({
    id,
    contributions: mapped[id],
    commits: entriesById[id],
    info: contributors.info[id as never] as {
      name: string;
      github: string;
      link?: string;
    },
    team: contributors.team.includes(id as never),
  }))
  .filter(({ info }) => info)
  .sort((a, b) => b.contributions - a.contributions);

// write data to files
await Promise.all([
  Deno.writeTextFile(
    "generated_contrib.json",
    JSON.stringify(output_claimed, null, "\t")
  ),
  Deno.writeTextFile(
    "generated_unclaimed.json",
    JSON.stringify(unclaimed, null, "\t")
  ),
]);

// generate README
const FILE = `# Contributors

Below is a table of contributions by users.

| Name | Contributions |   |   |
|------|:-------------:|:-:|---|
${output_claimed
  .map(
    ({ info, contributions, team }) =>
      `|${team ? "**" : ""}${
        info.link ? `[${info.name}](${info.link})` : info.name
      }${team ? "**" : ""}|${contributions}|(${((contributions / total) * 100).toFixed(2)}%)|${
        info.github ? `[GitHub](https://github.com/${info.github})` : ""
      }`
  )
  .join("\n")}

If you would like to list your contributions, please edit [contributors.json](https://github.com/revoltchat/contributions/blob/master/contributors.json) and add the corresponding information.
`;

await Deno.writeTextFile("README.md", FILE);

// generate HISTORY

let FILE_HISTORY = `# Historical Contributions

Below is a table of contributions split by yearly quarter.
`;

let startDate = new Date("2021-04-01");
while (startDate < new Date()) {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 3);

  const applicable = output_claimed
    .map(({ id, info, team, commits }) => ({
      id,
      info,
      team,
      contributions: commits
        .filter(
          (commit) =>
            new Date(commit.authorDate) >= startDate &&
            new Date(commit.authorDate) < endDate
        )
        .reduce((acc, c) => acc + c.contributions, 0),
    }))
    .filter(({ contributions }) => contributions);

  const total = applicable.reduce((acc, c) => acc + c.contributions, 0);
  const totalTeamOnly = applicable
    .filter((entry) => entry.team)
    .reduce((acc, c) => acc + c.contributions, 0);

  FILE_HISTORY += `
## ${startDate.getFullYear()}-${(1 + startDate.getMonth()).toString().padStart(2, "0")} to ${endDate > new Date() ? "Present" : endDate.getFullYear() + "-" + (1 + endDate.getMonth()).toString().padStart(2, "0")}

${applicable.map((x) => x.info.name).join("|")}
${applicable.map((_) => ":-:").join("|")}
${applicable.map((x) => x.contributions).join("|")}
${applicable.map((x) => ((x.contributions / total) * 100).toFixed(2) + "%").join("|")}
${applicable.map((x) => (x.team ? ((x.contributions / totalTeamOnly) * 100).toFixed(2) + "%" : "")).join("|")}
`;

  startDate = endDate;
}

await Deno.writeTextFile("HISTORY.md", FILE_HISTORY);
